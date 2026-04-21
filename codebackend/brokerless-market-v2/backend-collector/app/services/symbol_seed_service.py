from __future__ import annotations

from datetime import datetime

from app.clients.vnstock_client import VnstockClient
from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.repositories.market_repo import MarketRepository
from app.services.normalization_service import resolve_index_exchange

logger = get_logger(__name__)


class SymbolSeedService:
    EXCHANGE_ALIASES = {
        "HOSE": "HSX",
        "HSX": "HSX",
        "HNX": "HNX",
        "UPCOM": "UPCOM",
        "UPX": "UPCOM",
    }

    STOCK_TYPES = {
        "stock",
        "stocks",
        "common stock",
        "co phieu",
        "equity",
    }

    def __init__(self) -> None:
        self.client = VnstockClient()

    async def run(self) -> None:
        now = datetime.now()
        async with SessionLocal() as session:
            repo = MarketRepository(session)
            started_at = now

            try:
                symbols = self._build_symbol_master()
                if not symbols:
                    logger.warning("symbol master empty; skip symbol seed")
                    await repo.create_sync_log(
                        job_name="seed_symbols",
                        status="success",
                        started_at=started_at,
                        finished_at=datetime.now(),
                        message="skip symbol seed because no symbol master resolved",
                    )
                    await session.commit()
                    return

                for payload in symbols.values():
                    await repo.upsert_symbol(
                        symbol=payload["symbol"],
                        name=payload.get("name") or payload["symbol"],
                        exchange=payload.get("exchange"),
                        instrument_type=payload.get("instrument_type") or "stock",
                        source=payload.get("source") or "seed",
                        raw_json=payload.get("raw_json"),
                        updated_at=now,
                    )

                await repo.create_sync_log(
                    job_name="seed_symbols",
                    status="success",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=f"seeded/upserted symbol master: {len(symbols)}",
                    extra_json={
                        "symbol_master_source": settings.symbol_master_source or settings.vnstock_source,
                        "total": len(symbols),
                    },
                )
                await session.commit()
                logger.info("seeded symbol master: %s", len(symbols))
            except Exception as exc:
                await session.rollback()
                await repo.create_sync_log(
                    job_name="seed_symbols",
                    status="error",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=str(exc),
                )
                await session.commit()
                logger.exception("seed_symbols failed")

    def _build_symbol_master(self) -> dict[str, dict]:
        merged: dict[str, dict] = {}
        preferred_source = str(settings.symbol_master_source or settings.vnstock_source or "kbs").strip().lower()
        fallback_sources = [source for source in ("kbs", "vci") if source != preferred_source]

        for source in [preferred_source, *fallback_sources]:
            result = self.client.get_listing_symbols(source=source)
            self._merge_listing_rows(merged, result.rows, source)

        for symbol in settings.hsx_symbol_list:
            self._upsert_symbol_payload(merged, symbol, "HSX", "stock", "env")
        for symbol in settings.hnx_symbol_list:
            self._upsert_symbol_payload(merged, symbol, "HNX", "stock", "env")
        for symbol in settings.upcom_symbol_list:
            self._upsert_symbol_payload(merged, symbol, "UPCOM", "stock", "env")
        for symbol in settings.index_symbol_list:
            self._upsert_symbol_payload(merged, symbol, resolve_index_exchange(symbol), "index", "seed-index")

        return merged

    def _merge_listing_rows(self, merged: dict[str, dict], rows: list[dict], source: str) -> None:
        for row in rows or []:
            symbol = str(
                row.get("symbol")
                or row.get("ticker")
                or row.get("code")
                or ""
            ).strip().upper()
            if not symbol:
                continue

            exchange = self._normalize_exchange(
                row.get("exchange")
                or row.get("board")
                or row.get("market")
                or row.get("product_grp_id")
            )
            instrument_type = self._normalize_instrument_type(row.get("type"))

            if not exchange:
                continue

            self._upsert_symbol_payload(
                merged,
                symbol=symbol,
                exchange=exchange,
                instrument_type=instrument_type,
                source=f"listing:{source}",
                name=row.get("organ_name") or row.get("name") or row.get("organ_short_name") or symbol,
                raw_json=row,
            )

    def _upsert_symbol_payload(
        self,
        merged: dict[str, dict],
        symbol: str,
        exchange: str | None,
        instrument_type: str,
        source: str,
        name: str | None = None,
        raw_json: dict | None = None,
    ) -> None:
        if not symbol:
            return

        existing = merged.get(symbol, {})

        merged[symbol] = {
            "symbol": symbol,
            "name": existing.get("name") or name or symbol,
            "exchange": existing.get("exchange") or exchange,
            "instrument_type": existing.get("instrument_type") or instrument_type,
            "source": existing.get("source") or source,
            "raw_json": existing.get("raw_json") or raw_json or {"symbol": symbol, "exchange": exchange},
        }

    def _normalize_exchange(self, value: object) -> str | None:
        text = str(value or "").strip().upper()
        return self.EXCHANGE_ALIASES.get(text)

    def _normalize_instrument_type(self, value: object) -> str:
        text = str(value or "").strip().lower()
        if not text:
            return "stock"
        if text in self.STOCK_TYPES:
            return "stock"
        if "index" in text:
            return "index"
        return text
