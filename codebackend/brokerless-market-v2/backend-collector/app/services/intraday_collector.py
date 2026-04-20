from __future__ import annotations

from datetime import datetime

from app.clients.vnstock_client import VnstockClient
from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.repositories.market_repo import MarketRepository
from app.services.normalization_service import NormalizationService

logger = get_logger(__name__)


class IntradayCollector:
    def __init__(self) -> None:
        self.client = VnstockClient()
        self.normalizer = NormalizationService()

    def _env_symbols(self) -> list[str]:
        return [x.strip().upper() for x in (settings.intraday_symbols or []) if x.strip()]

    async def _resolve_intraday_symbols(self, repo: MarketRepository) -> list[str]:
        watchlist_symbols = await repo.get_active_watchlist_symbols()
        if watchlist_symbols:
            return watchlist_symbols

        if settings.intraday_use_all_symbols:
            all_symbols = await repo.get_all_active_symbols()
            if all_symbols:
                return all_symbols[: settings.max_intraday_symbols]

        if settings.fallback_to_env_symbols:
            return self._env_symbols()[: settings.max_intraday_symbols]

        return []

    async def run(self) -> None:
        started_at = datetime.now()
        total_saved = 0

        async with SessionLocal() as session:
            repo = MarketRepository(session)

            try:
                symbols = await self._resolve_intraday_symbols(repo)
                exchange_map = await repo.get_symbol_exchange_map(symbols)

                if not symbols:
                    logger.warning("no symbols resolved; skip stock intraday collection")
                    await repo.create_sync_log(
                        job_name="collect_intraday",
                        status="success",
                        started_at=started_at,
                        finished_at=datetime.now(),
                        message="skip intraday collection because no symbols resolved",
                    )
                    await session.commit()
                    return

                for symbol in symbols:
                    result = self.client.get_intraday(symbol)

                    if not result.rows:
                        logger.info("intraday empty | symbol=%s", symbol)
                        continue

                    for row in result.rows:
                        payload = self.normalizer.normalize_intraday_row(
                            symbol=symbol,
                            exchange=exchange_map.get(symbol),
                            row=row,
                            captured_at=started_at,
                            source=settings.vnstock_source,
                        )

                        if not payload:
                            continue
                        if payload.get("point_time") is None:
                            continue
                        if payload.get("price") is None:
                            continue

                        await repo.add_intraday_point_if_not_exists(payload)
                        total_saved += 1

                await repo.create_sync_log(
                    job_name="collect_intraday",
                    status="success",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=f"saved intraday points: {total_saved}",
                )
                await session.commit()
                logger.info("collect_intraday done | total_saved=%s", total_saved)

            except BaseException as exc:
                await session.rollback()
                await repo.create_sync_log(
                    job_name="collect_intraday",
                    status="error",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=str(exc),
                )
                await session.commit()
                logger.exception("collect_intraday failed")