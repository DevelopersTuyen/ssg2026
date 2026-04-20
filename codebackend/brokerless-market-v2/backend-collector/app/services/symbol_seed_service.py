from __future__ import annotations

from datetime import datetime

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.repositories.market_repo import MarketRepository
from app.services.normalization_service import resolve_index_exchange

logger = get_logger(__name__)


class SymbolSeedService:
    async def run(self) -> None:
        now = datetime.now()
        symbols = {
            **{s: "HSX" for s in settings.hsx_symbol_list},
            **{s: "HNX" for s in settings.hnx_symbol_list},
            **{s: "UPCOM" for s in settings.upcom_symbol_list},
            **{s: resolve_index_exchange(s) for s in settings.index_symbol_list},
        }
        if not symbols:
            return

        async with SessionLocal() as session:
            repo = MarketRepository(session)
            for symbol, exchange in symbols.items():
                await repo.upsert_symbol(
                    symbol=symbol,
                    name=symbol,
                    exchange=exchange,
                    instrument_type="index" if symbol.endswith("INDEX") else "stock",
                    source="seed",
                    raw_json={"symbol": symbol, "exchange": exchange},
                    updated_at=now,
                )
            await session.commit()
            logger.info("seeded symbols: %s", len(symbols))
