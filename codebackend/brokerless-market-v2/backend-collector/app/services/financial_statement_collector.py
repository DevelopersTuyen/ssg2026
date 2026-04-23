from __future__ import annotations

import asyncio
import re
from datetime import date, datetime
from math import ceil
from typing import Any

from app.clients.cafef_financial_client import CafeFFinancialClient
from app.clients.vnstock_client import VnstockClient
from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.repositories.market_repo import MarketRepository

logger = get_logger(__name__)

STATEMENT_METHODS = [
    "balance_sheet",
    "income_statement",
    "cash_flow",
    "ratio",
    "note",
]


class FinancialStatementCollector:
    def __init__(self) -> None:
        self.client = VnstockClient()
        self.cafef_client = CafeFFinancialClient()

    async def _resolve_financial_symbols(self, repo: MarketRepository) -> list[str]:
        symbols: list[str] = []
        watchlist_symbols = await repo.get_active_watchlist_symbols()
        if watchlist_symbols:
            symbols.extend(item.upper() for item in watchlist_symbols if item)

        if settings.financial_use_all_symbols:
            all_symbols = await repo.get_all_active_symbols()
            symbols.extend(item.upper() for item in all_symbols if item)

        if not symbols and settings.fallback_to_env_symbols:
            symbols.extend(item.upper() for item in settings.hsx_symbol_list + settings.hnx_symbol_list + settings.upcom_symbol_list if item)

        return list(dict.fromkeys(symbols))

    def _resolve_symbol_batch(self, symbols: list[str], started_at: datetime) -> tuple[list[str], int, int]:
        if not symbols:
            return [], 0, 0

        batch_size = max(1, int(settings.financial_symbols_per_run or 1))
        if not settings.financial_rotate_batches:
            return symbols[:batch_size], 0, max(1, ceil(len(symbols) / batch_size))

        total_batches = max(1, ceil(len(symbols) / batch_size))
        cycle = max(1, int(settings.financial_poll_seconds or 1))
        batch_index = int(started_at.timestamp() // cycle) % total_batches
        start = batch_index * batch_size
        end = start + batch_size
        return symbols[start:end], batch_index, total_batches

    def _normalize_financial_payload(
        self,
        *,
        symbol: str,
        exchange: str | None,
        statement_type: str,
        period_type: str,
        row: dict[str, Any],
        row_index: int,
        captured_at: datetime,
        source: str,
    ) -> dict[str, Any]:
        fiscal_year = self._extract_int(
            row,
            ["yearReport", "year_report", "fiscal_year", "year", "report_year"],
        )
        fiscal_quarter = self._extract_int(
            row,
            ["quarterReport", "quarter_report", "fiscal_quarter", "quarter"],
        )
        if fiscal_quarter is None and period_type == "quarter":
            length_report = self._extract_int(row, ["lengthReport", "length_report"])
            if length_report and 1 <= length_report <= 4:
                fiscal_quarter = length_report

        statement_date = self._extract_date(
            row,
            ["reportDate", "report_date", "date", "statement_date", "published_at"],
        )

        metric_label = self._extract_first_text(
            row,
            ["itemName", "item_name", "metricName", "metric_name", "name", "title", "label"],
        ) or f"{statement_type}_{row_index + 1}"

        metric_key = self._extract_first_text(
            row,
            ["itemCode", "item_code", "metricCode", "metric_code", "code", "id"],
        )
        if not metric_key:
            metric_key = self._slugify(metric_label)
        if not metric_key:
            metric_key = f"{statement_type}_{row_index + 1}"

        explicit_report_period = self._extract_first_text(
            row,
            ["reportPeriod", "report_period", "period", "yearPeriod", "year_period"],
        )
        report_period = self._resolve_report_period(
            explicit=explicit_report_period,
            fiscal_year=fiscal_year,
            fiscal_quarter=fiscal_quarter,
            period_type=period_type,
            statement_date=statement_date,
        )

        value_number = self._extract_value_number(row)
        value_text = self._extract_value_text(row, value_number)

        return {
            "symbol": symbol,
            "exchange": exchange,
            "source": source,
            "period_type": period_type,
            "report_period": report_period,
            "fiscal_year": fiscal_year,
            "fiscal_quarter": fiscal_quarter,
            "statement_date": statement_date,
            "metric_key": metric_key[:120],
            "metric_label": metric_label[:255],
            "value_number": value_number,
            "value_text": value_text,
            "raw_json": row,
            "captured_at": captured_at,
            "updated_at": captured_at,
        }

    @staticmethod
    def _extract_first_text(row: dict[str, Any], keys: list[str]) -> str | None:
        for key in keys:
            value = row.get(key)
            if value in (None, ""):
                continue
            text = str(value).strip()
            if text:
                return text
        return None

    @staticmethod
    def _extract_int(row: dict[str, Any], keys: list[str]) -> int | None:
        for key in keys:
            value = row.get(key)
            if value in (None, ""):
                continue
            try:
                return int(float(str(value).replace(",", "").strip()))
            except Exception:
                continue
        return None

    @staticmethod
    def _extract_date(row: dict[str, Any], keys: list[str]) -> date | None:
        for key in keys:
            value = row.get(key)
            if value in (None, ""):
                continue
            try:
                if isinstance(value, datetime):
                    return value.date()
                if isinstance(value, date):
                    return value
                return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date()
            except Exception:
                continue
        return None

    @staticmethod
    def _extract_value_number(row: dict[str, Any]) -> float | None:
        priority_keys = [
            "value",
            "ratio",
            "amount",
            "metricValue",
            "metric_value",
            "figure",
            "current",
            "currentValue",
            "current_value",
        ]
        for key in priority_keys:
            value = row.get(key)
            parsed = FinancialStatementCollector._to_float(value)
            if parsed is not None:
                return parsed

        for key, value in row.items():
            if not key:
                continue
            lowered = str(key).lower()
            if any(token in lowered for token in ["year", "quarter", "period", "date", "code", "name", "title", "label"]):
                continue
            parsed = FinancialStatementCollector._to_float(value)
            if parsed is not None:
                return parsed

        return None

    @staticmethod
    def _extract_value_text(row: dict[str, Any], value_number: float | None) -> str | None:
        if value_number is not None:
            return None
        for key in ["value", "summary", "note", "description", "content"]:
            value = row.get(key)
            if value in (None, ""):
                continue
            text = str(value).strip()
            if text:
                return text[:5000]
        return None

    @staticmethod
    def _resolve_report_period(
        *,
        explicit: str | None,
        fiscal_year: int | None,
        fiscal_quarter: int | None,
        period_type: str,
        statement_date: date | None,
    ) -> str:
        if explicit:
            return explicit.strip()[:50]
        if fiscal_year is not None and fiscal_quarter is not None:
            return f"{fiscal_year}Q{fiscal_quarter}"
        if fiscal_year is not None:
            return str(fiscal_year)
        if statement_date is not None:
            return statement_date.isoformat()
        return f"{period_type}_latest"

    @staticmethod
    def _slugify(value: str) -> str:
        lowered = value.lower().strip()
        lowered = re.sub(r"[^a-z0-9]+", "_", lowered)
        return lowered.strip("_")

    @staticmethod
    def _to_float(value: Any) -> float | None:
        if value in (None, "", "-", "--"):
            return None
        try:
            text = str(value).replace(",", "").strip()
            return float(text)
        except Exception:
            return None

    def _normalize_fallback_payload(
        self,
        *,
        symbol: str,
        exchange: str | None,
        statement_type: str,
        period_type: str,
        row: dict[str, Any],
        captured_at: datetime,
        source: str,
    ) -> dict[str, Any]:
        return {
            "symbol": symbol,
            "exchange": exchange,
            "source": source,
            "period_type": str(row.get("periodType") or period_type),
            "report_period": str(row.get("reportPeriod") or f"{period_type}_latest")[:50],
            "fiscal_year": self._extract_int(row, ["fiscal_year", "year", "report_year"]),
            "fiscal_quarter": self._extract_int(row, ["fiscal_quarter", "quarter"]),
            "statement_date": self._extract_date(row, ["statement_date", "published_at", "date"]),
            "metric_key": (
                self._extract_first_text(row, ["metricCode", "metric_key", "code"])
                or f"{statement_type}_{self._slugify(str(row.get('metricName') or 'item'))}"
            )[:120],
            "metric_label": (
                self._extract_first_text(row, ["metricName", "metric_label", "name", "title"])
                or statement_type
            )[:255],
            "value_number": self._to_float(row.get("value")),
            "value_text": self._extract_value_text(
                {
                    "description": row.get("description"),
                    "content": row.get("content"),
                    "summary": row.get("summary"),
                    "note": row.get("note"),
                },
                self._to_float(row.get("value")),
            ),
            "raw_json": row.get("raw"),
            "captured_at": captured_at,
            "updated_at": captured_at,
        }

    async def run(self) -> None:
        started_at = datetime.now()
        source = str(settings.financial_source or settings.vnstock_source or "vnstock").strip() or "vnstock"
        total_saved = 0

        async with SessionLocal() as session:
            repo = MarketRepository(session)

            try:
                symbols = await self._resolve_financial_symbols(repo)
                batch_symbols, batch_index, total_batches = self._resolve_symbol_batch(symbols, started_at)
                exchange_map = await repo.get_symbol_exchange_map(batch_symbols)
                periods = settings.financial_period_list

                if not batch_symbols:
                    await repo.create_sync_log(
                        job_name="collect_financial_statements",
                        status="success",
                        started_at=started_at,
                        finished_at=datetime.now(),
                        message="skip financial collection because no symbols resolved",
                        extra_json={"source": source},
                    )
                    await session.commit()
                    return

                errors: list[str] = []
                statement_counts = {name: 0 for name in STATEMENT_METHODS}

                for symbol in batch_symbols:
                    for period_type in periods:
                        for statement_type in STATEMENT_METHODS:
                            if source.upper() == "CAFEF":
                                result = self.cafef_client.get_financial_statement(
                                    symbol=symbol,
                                    statement_type=statement_type,
                                    period=period_type,
                                )
                            else:
                                try:
                                    result = self.client.get_financial_statement(
                                        symbol=symbol,
                                        statement_type=statement_type,
                                        period=period_type,
                                        source=source,
                                    )
                                except Exception as exc:
                                    errors.append(f"{symbol}:{statement_type}:{period_type} {exc}")
                                    logger.warning(
                                        "financial fetch failed | symbol=%s | statement=%s | period=%s | err=%s",
                                        symbol,
                                        statement_type,
                                        period_type,
                                        exc,
                                    )
                                    continue

                            if result.errors:
                                errors.extend(
                                    f"{symbol}:{statement_type}:{period_type} {error}"
                                    for error in result.errors[:4]
                                )

                            if not result.rows:
                                cafef_result = self.cafef_client.get_financial_statement(
                                    symbol=symbol,
                                    statement_type=statement_type,
                                    period=period_type,
                                )
                                if cafef_result.errors:
                                    errors.extend(
                                        f"{symbol}:{statement_type}:{period_type} {error}"
                                        for error in cafef_result.errors[:4]
                                    )
                                if cafef_result.rows:
                                    result = cafef_result

                            if not result.rows:
                                continue

                            actual_source = str(result.source or source).upper()
                            selected_source = actual_source
                            for row_index, row in enumerate(result.rows):
                                if actual_source == "CAFEF":
                                    payload = self._normalize_fallback_payload(
                                        symbol=symbol,
                                        exchange=exchange_map.get(symbol),
                                        statement_type=statement_type,
                                        period_type=period_type,
                                        row=row,
                                        captured_at=started_at,
                                        source=actual_source,
                                    )
                                else:
                                    payload = self._normalize_financial_payload(
                                        symbol=symbol,
                                        exchange=exchange_map.get(symbol),
                                        statement_type=statement_type,
                                        period_type=period_type,
                                        row=row,
                                        row_index=row_index,
                                        captured_at=started_at,
                                        source=actual_source,
                                    )
                                await repo.upsert_financial_record(statement_type, payload)
                                total_saved += 1
                                statement_counts[statement_type] += 1

                if total_saved == 0 and errors:
                    status = "error"
                elif errors:
                    status = "partial"
                else:
                    status = "success"
                total_request_units = len(batch_symbols) * len(periods) * len(STATEMENT_METHODS)
                summary_parts = [
                    f"saved financial rows: {total_saved}",
                    f"batch {batch_index + 1}/{max(1, total_batches)}",
                    f"symbols {len(batch_symbols)}/{len(symbols)}",
                    f"request units {total_request_units}",
                ]
                await repo.create_sync_log(
                    job_name="collect_financial_statements",
                    status=status,
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=" | ".join(summary_parts),
                    extra_json={
                        "source": source,
                        "batch_index": batch_index,
                        "total_batches": total_batches,
                        "batch_symbols": len(batch_symbols),
                        "resolved_symbols": len(symbols),
                        "periods": periods,
                        "statement_counts": statement_counts,
                        "errors": errors[:10],
                    },
                )
                await session.commit()
                logger.info(
                    "collect_financial_statements done | rows=%s | batch=%s/%s | symbols=%s/%s",
                    total_saved,
                    batch_index + 1,
                    max(1, total_batches),
                    len(batch_symbols),
                    len(symbols),
                )
            except asyncio.CancelledError:
                await session.rollback()
                logger.info("collect_financial_statements cancelled")
                raise
            except Exception as exc:
                await session.rollback()
                await repo.create_sync_log(
                    job_name="collect_financial_statements",
                    status="error",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=str(exc),
                    extra_json={"source": source},
                )
                await session.commit()
                logger.exception("collect_financial_statements failed")
