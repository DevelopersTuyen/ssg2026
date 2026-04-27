from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market import MarketDataQualityIssue, MarketIntradayPoint, MarketQuoteSnapshot


class DataQualityService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def scan(self, *, exchange: str | None = None, limit: int = 500) -> dict[str, Any]:
        exchange = exchange.upper().strip() if exchange else None
        now = datetime.now()
        issue_count = 0

        quote_stmt = select(MarketQuoteSnapshot).order_by(MarketQuoteSnapshot.captured_at.desc()).limit(limit)
        if exchange:
            quote_stmt = quote_stmt.where(MarketQuoteSnapshot.exchange == exchange)
        quotes = (await self.session.execute(quote_stmt)).scalars().all()

        for row in quotes:
            issues = self._quote_issues(row, now)
            for issue in issues:
                await self._upsert_issue(issue)
                issue_count += 1

        intraday_stmt = select(MarketIntradayPoint).order_by(MarketIntradayPoint.point_time.desc()).limit(limit)
        if exchange:
            intraday_stmt = intraday_stmt.where(MarketIntradayPoint.exchange == exchange)
        intraday_rows = (await self.session.execute(intraday_stmt)).scalars().all()

        for row in intraday_rows:
            issues = self._intraday_issues(row, now)
            for issue in issues:
                await self._upsert_issue(issue)
                issue_count += 1

        return {
            "exchange": exchange or "ALL",
            "quotes_checked": len(quotes),
            "intraday_checked": len(intraday_rows),
            "issues_upserted": issue_count,
            "scanned_at": now,
        }

    async def list_open(self, *, limit: int = 100) -> list[dict[str, Any]]:
        stmt = (
            select(MarketDataQualityIssue)
            .where(MarketDataQualityIssue.status == "open")
            .order_by(MarketDataQualityIssue.detected_at.desc())
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        return [self._to_dict(row) for row in rows]

    def _quote_issues(self, row: MarketQuoteSnapshot, now: datetime) -> list[dict[str, Any]]:
        issues: list[dict[str, Any]] = []
        symbol = row.symbol.upper()
        if row.price is not None and row.price <= 0:
            issues.append(self._issue("quote", symbol, row.exchange, "critical", "negative_price", "Gia quote khong hop le", row))
        if row.volume is not None and row.volume < 0:
            issues.append(self._issue("quote", symbol, row.exchange, "critical", "negative_volume", "Volume quote am", row))
        if row.quote_time is None:
            issues.append(self._issue("quote", symbol, row.exchange, "warning", "missing_quote_time", "Quote thieu timestamp", row))
        if row.captured_at and row.captured_at < now - timedelta(minutes=30):
            issues.append(self._issue("quote", symbol, row.exchange, "warning", "stale_quote", "Quote da cu qua 30 phut", row))
        if row.change_percent is not None and abs(float(row.change_percent)) > 30:
            issues.append(self._issue("quote", symbol, row.exchange, "warning", "large_change_percent", "Bien dong quote bat thuong", row))
        return issues

    def _intraday_issues(self, row: MarketIntradayPoint, now: datetime) -> list[dict[str, Any]]:
        issues: list[dict[str, Any]] = []
        symbol = row.symbol.upper()
        if row.point_time is None:
            issues.append(self._issue("intraday", symbol, row.exchange, "critical", "missing_point_time", "Intraday thieu timestamp", row))
        elif row.point_time > now + timedelta(minutes=5):
            issues.append(self._issue("intraday", symbol, row.exchange, "warning", "future_point_time", "Intraday timestamp vuot hien tai", row))
        if row.price is not None and row.price <= 0:
            issues.append(self._issue("intraday", symbol, row.exchange, "critical", "negative_price", "Gia intraday khong hop le", row))
        if row.volume is not None and row.volume < 0:
            issues.append(self._issue("intraday", symbol, row.exchange, "critical", "negative_volume", "Volume intraday am", row))
        return issues

    def _issue(
        self,
        scope: str,
        symbol: str,
        exchange: str | None,
        severity: str,
        code: str,
        message: str,
        row: MarketQuoteSnapshot | MarketIntradayPoint,
    ) -> dict[str, Any]:
        timestamp = getattr(row, "quote_time", None) or getattr(row, "point_time", None) or getattr(row, "captured_at", None)
        date_key = timestamp.date().isoformat() if timestamp else "unknown"
        return {
            "issue_key": f"{scope}:{code}:{exchange or 'NA'}:{symbol}:{date_key}",
            "scope": scope,
            "symbol": symbol,
            "exchange": exchange,
            "severity": severity,
            "status": "open",
            "message": message,
            "details_json": {
                "code": code,
                "price": getattr(row, "price", None),
                "volume": getattr(row, "volume", None),
                "change_percent": getattr(row, "change_percent", None),
                "timestamp": timestamp.isoformat() if timestamp else None,
            },
            "detected_at": datetime.now(),
            "resolved_at": None,
        }

    async def _upsert_issue(self, issue: dict[str, Any]) -> None:
        stmt = insert(MarketDataQualityIssue).values(**issue)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_market_data_quality_issue_key",
            set_={
                "severity": stmt.excluded.severity,
                "status": "open",
                "message": stmt.excluded.message,
                "details_json": stmt.excluded.details_json,
                "detected_at": stmt.excluded.detected_at,
                "resolved_at": None,
            },
        )
        await self.session.execute(stmt)

    def _to_dict(self, row: MarketDataQualityIssue) -> dict[str, Any]:
        return {
            "id": row.id,
            "issue_key": row.issue_key,
            "scope": row.scope,
            "symbol": row.symbol,
            "exchange": row.exchange,
            "severity": row.severity,
            "status": row.status,
            "message": row.message,
            "details": row.details_json or {},
            "detected_at": row.detected_at,
            "resolved_at": row.resolved_at,
        }
