from __future__ import annotations

import asyncio
from datetime import datetime
from math import ceil
from typing import Any

from app.clients.vnstock_client import VnstockClient
from app.core.config import get_runtime_sync_int, get_runtime_sync_str, settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.repositories.market_repo import MarketRepository
from app.services.normalization_service import NormalizationService
from app.services.sync_log_service import write_sync_log_safely

logger = get_logger(__name__)


class IntradayCollector:
    def __init__(self) -> None:
        self.client = VnstockClient()
        self.normalizer = NormalizationService()

    async def _fetch_intraday_async(self, symbol: str, source: str) -> Any:
        return await asyncio.to_thread(self.client.get_intraday, symbol, 10000, source=source)

    async def _fetch_intraday_batch(
        self,
        symbols: list[str],
        *,
        max_concurrency: int,
        source: str,
    ) -> list[tuple[str, Any | None, str | None]]:
        semaphore = asyncio.Semaphore(max(1, int(max_concurrency or 1)))

        async def worker(symbol: str) -> tuple[str, Any | None, str | None]:
            async with semaphore:
                try:
                    result = await self._fetch_intraday_async(symbol, source)
                    return symbol, result, None
                except Exception as exc:
                    return symbol, None, str(exc)

        return await asyncio.gather(*(worker(symbol) for symbol in symbols))

    def _env_symbols(self) -> list[str]:
        return settings.intraday_symbol_list

    def _apply_intraday_limit(self, symbols: list[str]) -> list[str]:
        max_symbols = max(0, int(settings.max_intraday_symbols or 0))
        if max_symbols <= 0:
            return symbols
        return symbols[:max_symbols]

    def _resolve_intraday_batch(
        self,
        symbols: list[str],
        started_at: datetime,
        *,
        backfill_mode: bool = False,
        requests_per_run_override: int | None = None,
    ) -> tuple[list[str], int, int]:
        if not symbols:
            return [], 0, 0

        batch_size = max(
            1,
            int(
                requests_per_run_override
                or (
                    get_runtime_sync_int("intradayBackfillRequestsPerRun", settings.intraday_backfill_requests_per_run)
                    if backfill_mode
                    else get_runtime_sync_int("intradayRequestsPerRun", settings.intraday_requests_per_run)
                )
                or 1
            ),
        )
        if backfill_mode:
            total_batches = max(1, ceil(len(symbols) / batch_size))
            cycle = get_runtime_sync_int(
                "intradayBackfillIntervalSeconds",
                settings.intraday_backfill_interval_seconds or settings.intraday_poll_seconds or 1,
            )
            batch_index = int(started_at.timestamp() // cycle) % total_batches
            start = batch_index * batch_size
            end = start + batch_size
            return symbols[start:end], batch_index, total_batches

        if not settings.intraday_rotate_batches:
            return symbols[:batch_size], 0, max(1, ceil(len(symbols) / batch_size))

        total_batches = max(1, ceil(len(symbols) / batch_size))
        cycle = get_runtime_sync_int("intradayPollSeconds", settings.intraday_poll_seconds or 1)
        batch_index = int(started_at.timestamp() // cycle) % total_batches
        start = batch_index * batch_size
        end = start + batch_size
        return symbols[start:end], batch_index, total_batches

    async def _resolve_intraday_symbols(self, repo: MarketRepository, *, prioritize_uncovered: bool = False) -> list[str]:
        watchlist_symbols = await repo.get_active_watchlist_symbols()
        symbols: list[str] = []

        if watchlist_symbols:
            symbols.extend(item.upper() for item in watchlist_symbols if item)

        if settings.intraday_use_all_symbols:
            all_symbols = await repo.get_all_active_symbols()
            if all_symbols:
                symbols.extend(item.upper() for item in all_symbols if item)

        if not symbols and settings.fallback_to_env_symbols:
            symbols.extend(item.upper() for item in self._env_symbols() if item)

        unique_symbols = list(dict.fromkeys(symbols))
        unique_symbols = self._apply_intraday_limit(unique_symbols)
        if not unique_symbols:
            return unique_symbols

        covered_today = await repo.get_symbols_with_intraday_coverage()
        watchlist_set = {item.upper() for item in watchlist_symbols if item}

        if prioritize_uncovered:
            unique_symbols.sort(
                key=lambda item: (
                    0 if item in watchlist_set else 1,
                    0 if item not in covered_today else 1,
                    item,
                )
            )
            return unique_symbols

        uncovered = [item for item in unique_symbols if item not in covered_today]
        covered = [item for item in unique_symbols if item in covered_today]
        return uncovered + covered

    async def run(
        self,
        *,
        backfill_mode: bool = False,
        job_name_override: str | None = None,
        requests_per_run_override: int | None = None,
    ) -> None:
        started_at = datetime.now()
        total_saved = 0
        job_name = job_name_override or ("collect_intraday_backfill" if backfill_mode else "collect_intraday")
        source = get_runtime_sync_str("intradaySource", str(settings.intraday_source or settings.vnstock_source or "VCI").strip().upper() or "VCI")
        max_concurrency = get_runtime_sync_int(
            "intradayMaxConcurrency",
            settings.intraday_backfill_max_concurrency if backfill_mode else settings.intraday_max_concurrency,
        )

        async with SessionLocal() as session:
            repo = MarketRepository(session)

            try:
                symbols = await self._resolve_intraday_symbols(repo, prioritize_uncovered=backfill_mode)
                batch_symbols, batch_index, total_batches = self._resolve_intraday_batch(
                    symbols,
                    started_at,
                    backfill_mode=backfill_mode,
                    requests_per_run_override=requests_per_run_override,
                )
                exchange_map = await repo.get_symbol_exchange_map(batch_symbols)

                if not batch_symbols:
                    logger.warning("no symbols resolved; skip stock intraday collection")
                    await repo.create_sync_log(
                        job_name=job_name,
                        status="success",
                        started_at=started_at,
                        finished_at=datetime.now(),
                        message="skip intraday collection because no symbols resolved",
                    )
                    await session.commit()
                    return

                errors: list[str] = []
                rate_limited = False

                for symbol, result, fetch_error in await self._fetch_intraday_batch(
                    batch_symbols,
                    max_concurrency=max_concurrency,
                    source=source,
                ):
                    if fetch_error:
                        message = str(fetch_error)
                        errors.append(f"{symbol}: {message}")
                        normalized_message = message.lower()
                        if (
                            "rate limit exceeded" in normalized_message
                            or "too many requests" in normalized_message
                            or "expecting value: line 1 column 1" in normalized_message
                            or "jsondecodeerror" in normalized_message
                        ):
                            rate_limited = True
                            logger.warning("intraday rate limited | symbol=%s", symbol)
                            break
                        logger.warning("intraday fetch failed | symbol=%s | err=%s", symbol, message)
                        continue

                    if result is None:
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
                            source=source,
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
                    job_name=job_name,
                    status=status,
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=" | ".join(summary_parts),
                    extra_json={
                        "source": source,
                        "resolved_symbols": len(symbols),
                        "batch_symbols": len(batch_symbols),
                        "max_concurrency": max_concurrency,
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
                await write_sync_log_safely(
                    job_name=job_name,
                    status="error",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=str(exc),
                )
                logger.exception("collect_intraday failed")

    async def run_backfill(self) -> None:
        if not settings.intraday_backfill_enabled:
            return
        await self.run(
            backfill_mode=True,
            job_name_override="collect_intraday_backfill",
            requests_per_run_override=get_runtime_sync_int(
                "intradayBackfillRequestsPerRun",
                settings.intraday_backfill_requests_per_run,
            ),
        )
