from __future__ import annotations

from datetime import datetime
from math import ceil

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
        self.source = settings.index_source or settings.vnstock_source

    def _resolve_index_batch(self, started_at: datetime) -> tuple[list[str], int, int]:
        if not self.indices:
            return [], 0, 0

        batch_size = max(1, int(settings.index_requests_per_run or 1))
        if not settings.index_rotate_batches:
            return self.indices[:batch_size], 0, max(1, ceil(len(self.indices) / batch_size))

        total_batches = max(1, ceil(len(self.indices) / batch_size))
        cycle = max(1, int(settings.index_daily_poll_seconds or 1))
        batch_index = int(started_at.timestamp() // cycle) % total_batches
        start = batch_index * batch_size
        end = start + batch_size
        return self.indices[start:end], batch_index, total_batches

    async def run_daily(self) -> None:
        started_at = datetime.now()
        total_saved = 0
        failed_symbols: list[dict[str, str]] = []
        async with SessionLocal() as session:
            repo = MarketRepository(session)
            try:
                batch_symbols, batch_index, total_batches = self._resolve_index_batch(started_at)
                if not batch_symbols:
                    await repo.create_sync_log(
                        job_name="collect_index_daily",
                        status="success",
                        started_at=started_at,
                        finished_at=datetime.now(),
                        message="skip index daily collection because no indices resolved",
                        extra_json={"source": self.source},
                    )
                    await session.commit()
                    return

                for index_symbol in batch_symbols:
                    try:
                        result = self.client.get_history(
                            index_symbol,
                            interval="1D",
                            months=12,
                            source=self.source,
                        )
                        for row in result.rows:
                            payload = self.normalizer.normalize_index_daily_row(
                                index_symbol=index_symbol,
                                row=row,
                                captured_at=started_at,
                                source=self.source,
                            )
                            if not payload:
                                continue
                            await repo.upsert_index_daily_point(payload)
                            total_saved += 1
                    except Exception as exc:
                        failed_symbols.append({"symbol": index_symbol, "error": str(exc)})
                        logger.warning("collect_index_daily skipped | index_symbol=%s error=%s", index_symbol, exc)

                await repo.create_sync_log(
                    job_name="collect_index_daily",
                    status="warning" if failed_symbols else "success",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=" | ".join(
                        [
                            f"upserted index daily points: {total_saved}",
                            f"batch {batch_index + 1}/{max(1, total_batches)}",
                            f"indices {len(batch_symbols)}/{len(self.indices)}",
                        ]
                    ),
                    extra_json={
                        "source": self.source,
                        "batch_index": batch_index,
                        "total_batches": total_batches,
                        "batch_symbols": len(batch_symbols),
                        "resolved_symbols": len(self.indices),
                        "failed_symbols": failed_symbols,
                    },
                )
                await session.commit()
                logger.info(
                    "collect_index_daily done | total_saved=%s | batch=%s/%s | indices=%s/%s | failed_symbols=%s",
                    total_saved,
                    batch_index + 1,
                    max(1, total_batches),
                    len(batch_symbols),
                    len(self.indices),
                    len(failed_symbols),
                )
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
