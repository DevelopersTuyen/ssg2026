from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import delete, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market import (
    MarketFinancialBalanceSheet,
    MarketFinancialCashFlow,
    MarketFinancialIncomeStatement,
    MarketFinancialNote,
    MarketFinancialRatio,
    MarketIndexDailyPoint,
    MarketIndexIntradayPoint,
    MarketIntradayPoint,
    MarketQuoteSnapshot,
    MarketSymbol,
    MarketSyncLog,
    MarketWatchlistItem,
)
from app.utils.json_safe import to_jsonable


FINANCIAL_TABLES = {
    "balance_sheet": MarketFinancialBalanceSheet,
    "income_statement": MarketFinancialIncomeStatement,
    "cash_flow": MarketFinancialCashFlow,
    "ratio": MarketFinancialRatio,
    "note": MarketFinancialNote,
}


class MarketRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def upsert_symbol(
        self,
        *,
        symbol: str,
        name: str | None,
        exchange: str | None,
        instrument_type: str | None,
        source: str,
        raw_json: dict | list | None,
        updated_at: datetime,
    ) -> None:
        raw_json = to_jsonable(raw_json)
        stmt = insert(MarketSymbol).values(
            symbol=symbol,
            name=name,
            exchange=exchange,
            instrument_type=instrument_type,
            source=source,
            raw_json=raw_json,
            updated_at=updated_at,
            is_active=True,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[MarketSymbol.symbol],
            set_={
                "name": name,
                "exchange": exchange,
                "instrument_type": instrument_type,
                "source": source,
                "raw_json": raw_json,
                "updated_at": updated_at,
                "is_active": True,
            },
        )
        await self.session.execute(stmt)

    async def add_quote_snapshot(self, payload: dict[str, Any]) -> None:
        payload = dict(payload)
        payload["raw_json"] = to_jsonable(payload.get("raw_json"))
        self.session.add(MarketQuoteSnapshot(**payload))

    async def add_intraday_point_if_not_exists(self, payload: dict[str, Any]) -> None:
        payload = dict(payload)
        payload["raw_json"] = to_jsonable(payload.get("raw_json"))
        stmt = insert(MarketIntradayPoint).values(**payload)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=[MarketIntradayPoint.symbol, MarketIntradayPoint.point_time, MarketIntradayPoint.source]
        )
        await self.session.execute(stmt)

    async def add_index_intraday_point_if_not_exists(self, payload: dict[str, Any]) -> None:
        payload = dict(payload)
        payload["raw_json"] = to_jsonable(payload.get("raw_json"))
        stmt = insert(MarketIndexIntradayPoint).values(**payload)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=[MarketIndexIntradayPoint.index_symbol, MarketIndexIntradayPoint.point_time, MarketIndexIntradayPoint.source]
        )
        await self.session.execute(stmt)

    async def upsert_financial_record(self, statement_type: str, payload: dict[str, Any]) -> None:
        table = FINANCIAL_TABLES[statement_type]
        payload = dict(payload)
        payload["raw_json"] = to_jsonable(payload.get("raw_json"))
        stmt = insert(table).values(**payload)
        stmt = stmt.on_conflict_do_update(
            index_elements=[
                table.symbol,
                table.period_type,
                table.report_period,
                table.metric_key,
                table.source,
            ],
            set_={
                "exchange": payload.get("exchange"),
                "fiscal_year": payload.get("fiscal_year"),
                "fiscal_quarter": payload.get("fiscal_quarter"),
                "statement_date": payload.get("statement_date"),
                "metric_label": payload.get("metric_label"),
                "value_number": payload.get("value_number"),
                "value_text": payload.get("value_text"),
                "raw_json": payload.get("raw_json"),
                "captured_at": payload.get("captured_at"),
                "updated_at": payload.get("updated_at"),
            },
        )
        await self.session.execute(stmt)

    async def upsert_index_daily_point(self, payload: dict[str, Any]) -> None:
        payload = dict(payload)
        payload["raw_json"] = to_jsonable(payload.get("raw_json"))
        stmt = insert(MarketIndexDailyPoint).values(**payload)
        stmt = stmt.on_conflict_do_update(
            index_elements=[MarketIndexDailyPoint.index_symbol, MarketIndexDailyPoint.point_date],
            set_={
                "exchange": payload.get("exchange"),
                "source": payload.get("source"),
                "open_price": payload.get("open_price"),
                "high_price": payload.get("high_price"),
                "low_price": payload.get("low_price"),
                "close_price": payload.get("close_price"),
                "volume": payload.get("volume"),
                "trading_value": payload.get("trading_value"),
                "raw_json": payload.get("raw_json"),
                "captured_at": payload.get("captured_at"),
            },
        )
        await self.session.execute(stmt)

    async def clear_quotes_today_for_source(self, source: str) -> None:
        today = datetime.now().date()
        start = datetime.combine(today, datetime.min.time())
        await self.session.execute(
            delete(MarketQuoteSnapshot).where(
                MarketQuoteSnapshot.source == source,
                MarketQuoteSnapshot.captured_at >= start,
            )
        )

    async def create_sync_log(
        self,
        *,
        job_name: str,
        status: str,
        started_at: datetime,
        finished_at: datetime | None,
        message: str | None,
        extra_json: dict | list | None = None,
    ) -> None:
        self.session.add(
            MarketSyncLog(
                job_name=job_name,
                status=status,
                started_at=started_at,
                finished_at=finished_at,
                message=message,
                extra_json=to_jsonable(extra_json),
            )
        )

    async def get_latest_quote_symbols(self, limit: int = 20) -> list[str]:
        result = await self.session.execute(
            select(MarketSymbol.symbol).where(MarketSymbol.is_active.is_(True)).limit(limit)
        )
        return list(result.scalars().all())

    async def get_active_watchlist_items(self) -> list[MarketWatchlistItem]:
        result = await self.session.execute(
            select(MarketWatchlistItem)
            .where(MarketWatchlistItem.is_active.is_(True))
            .order_by(MarketWatchlistItem.sort_order.asc(), MarketWatchlistItem.updated_at.desc())
        )
        return result.scalars().all()

    async def get_active_watchlist_symbols(self) -> list[str]:
        items = await self.get_active_watchlist_items()
        return [item.symbol.upper() for item in items if item.symbol]

    async def get_symbol_exchange_map(self, symbols: list[str]) -> dict[str, str | None]:
        if not symbols:
            return {}
        result = await self.session.execute(
            select(MarketSymbol.symbol, MarketSymbol.exchange).where(MarketSymbol.symbol.in_(symbols))
        )
        rows = result.all()
        return {symbol: exchange for symbol, exchange in rows}
    
    async def get_all_active_symbols(self) -> list[str]:
        result = await self.session.execute(
            select(MarketSymbol.symbol)
            .where(MarketSymbol.is_active.is_(True))
            .where(or_(MarketSymbol.instrument_type != "index", MarketSymbol.instrument_type.is_(None)))
            .order_by(MarketSymbol.exchange.asc(), MarketSymbol.symbol.asc())
        )
        return [x.upper() for x in result.scalars().all() if x]

    async def get_all_active_symbols_by_exchange(self) -> dict[str, list[str]]:
        result = await self.session.execute(
            select(MarketSymbol.symbol, MarketSymbol.exchange)
            .where(MarketSymbol.is_active.is_(True))
            .where(or_(MarketSymbol.instrument_type != "index", MarketSymbol.instrument_type.is_(None)))
            .order_by(MarketSymbol.exchange.asc(), MarketSymbol.symbol.asc())
        )

        grouped: dict[str, list[str]] = {}
        for symbol, exchange in result.all():
            ex = (exchange or "").upper()
            if not ex:
                continue
            grouped.setdefault(ex, []).append(symbol.upper())

        return grouped
