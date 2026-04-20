from __future__ import annotations

from datetime import datetime

from app.clients.vnstock_client import VnstockClient
from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.repositories.market_repo import MarketRepository
from app.services.normalization_service import NormalizationService

logger = get_logger(__name__)


class IndexCollector:
    def __init__(self) -> None:
        self.client = VnstockClient()
        self.normalizer = NormalizationService()
        self.indices = settings.index_symbol_list

    async def run_daily(self) -> None:
        started_at = datetime.now()
        total_saved = 0
        async with SessionLocal() as session:
            repo = MarketRepository(session)
            try:
                for index_symbol in self.indices:
                    result = self.client.get_history(index_symbol, interval="1D", months=12)
                    for row in result.rows:
                        payload = self.normalizer.normalize_index_daily_row(
                            index_symbol=index_symbol,
                            row=row,
                            captured_at=started_at,
                            source=settings.vnstock_source,
                        )
                        if not payload:
                            continue
                        await repo.upsert_index_daily_point(payload)
                        total_saved += 1

                await repo.create_sync_log(
                    job_name="collect_index_daily",
                    status="success",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=f"upserted index daily points: {total_saved}",
                )
                await session.commit()
                logger.info("collect_index_daily done | total_saved=%s", total_saved)
            except Exception as exc:
                await repo.create_sync_log(
                    job_name="collect_index_daily",
                    status="error",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=str(exc),
                )
                await session.commit()
                logger.exception("collect_index_daily failed")
