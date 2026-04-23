from __future__ import annotations

import asyncio
from datetime import datetime
from math import ceil

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
        return settings.intraday_symbol_list

    def _apply_intraday_limit(self, symbols: list[str]) -> list[str]:
        max_symbols = max(0, int(settings.max_intraday_symbols or 0))
        if max_symbols <= 0:
            return symbols
        return symbols[:max_symbols]

    def _resolve_intraday_batch(self, symbols: list[str], started_at: datetime) -> tuple[list[str], int, int]:
        if not symbols:
            return [], 0, 0

        batch_size = max(1, int(settings.intraday_requests_per_run or 1))
        if not settings.intraday_rotate_batches:
            return symbols[:batch_size], 0, max(1, ceil(len(symbols) / batch_size))

        total_batches = max(1, ceil(len(symbols) / batch_size))
        cycle = max(1, int(settings.intraday_poll_seconds or 1))
        batch_index = int(started_at.timestamp() // cycle) % total_batches
        start = batch_index * batch_size
        end = start + batch_size
        return symbols[start:end], batch_index, total_batches

    async def _resolve_intraday_symbols(self, repo: MarketRepository) -> list[str]:
        watchlist_symbols = await repo.get_active_watchlist_symbols()
        symbols: list[str] = []

        if settings.intraday_use_all_symbols:
            all_symbols = await repo.get_all_active_symbols()
            if all_symbols:
                symbols.extend(item.upper() for item in all_symbols if item)

        if watchlist_symbols:
            symbols.extend(item.upper() for item in watchlist_symbols if item)

        if not symbols and settings.fallback_to_env_symbols:
            symbols.extend(item.upper() for item in self._env_symbols() if item)

        unique_symbols = list(dict.fromkeys(symbols))
        return self._apply_intraday_limit(unique_symbols)

    async def run(self) -> None:
        started_at = datetime.now()
        total_saved = 0

        async with SessionLocal() as session:
            repo = MarketRepository(session)

            try:
                symbols = await self._resolve_intraday_symbols(repo)
                batch_symbols, batch_index, total_batches = self._resolve_intraday_batch(symbols, started_at)
                exchange_map = await repo.get_symbol_exchange_map(batch_symbols)

                if not batch_symbols:
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

                errors: list[str] = []
                rate_limited = False

                for symbol in batch_symbols:
                    try:
                        result = self.client.get_intraday(symbol)
                    except Exception as exc:
                        message = str(exc)
                        errors.append(f"{symbol}: {message}")
                        if "Rate limit exceeded" in message:
                            rate_limited = True
                            logger.warning("intraday rate limited | symbol=%s", symbol)
                            break
                        logger.warning("intraday fetch failed | symbol=%s | err=%s", symbol, message)
                        continue

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

                status = "success" if not errors else "partial"
                summary_parts = [
                    f"saved intraday points: {total_saved}",
                    f"batch {batch_index + 1}/{max(1, total_batches)}",
                    f"symbols {len(batch_symbols)}/{len(symbols)}",
                ]
                if rate_limited:
                    summary_parts.append("rate limited")

                await repo.create_sync_log(
                    job_name="collect_intraday",
                    status=status,
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=" | ".join(summary_parts),
                    extra_json={
                        "resolved_symbols": len(symbols),
                        "batch_symbols": len(batch_symbols),
                        "batch_index": batch_index,
                        "total_batches": total_batches,
                        "errors": errors[:10],
                    },
                )
                await session.commit()
                logger.info(
                    "collect_intraday done | total_saved=%s | batch=%s/%s | symbols=%s/%s",
                    total_saved,
                    batch_index + 1,
                    max(1, total_batches),
                    len(batch_symbols),
                    len(symbols),
                )

            except asyncio.CancelledError:
                await session.rollback()
                logger.info("collect_intraday cancelled")
                raise
            except Exception as exc:
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
