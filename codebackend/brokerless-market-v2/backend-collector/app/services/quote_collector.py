from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime
from math import ceil

from app.clients.vnstock_client import VnstockClient
from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.repositories.market_repo import MarketRepository
from app.services.normalization_service import NormalizationService

logger = get_logger(__name__)


class QuoteCollector:
    def __init__(self) -> None:
        self.client = VnstockClient()
        self.normalizer = NormalizationService()

    def _env_grouped_symbols(self) -> dict[str, list[str]]:
        grouped: dict[str, list[str]] = {}

        hsx = settings.hsx_symbol_list
        hnx = settings.hnx_symbol_list
        upcom = settings.upcom_symbol_list

        if hsx:
            grouped["HSX"] = hsx
        if hnx:
            grouped["HNX"] = hnx
        if upcom:
            grouped["UPCOM"] = upcom

        return grouped

    def _chunk_symbols(self, symbols: list[str]) -> list[list[str]]:
        batch_size = max(1, int(settings.quote_batch_size or 200))
        return [symbols[index : index + batch_size] for index in range(0, len(symbols), batch_size)]

    def _resolve_quote_batches(
        self,
        grouped: dict[str, list[str]],
        started_at: datetime,
    ) -> tuple[list[tuple[str, list[str]]], int, int]:
        all_batches: list[tuple[str, list[str]]] = []
        for exchange, symbols in grouped.items():
            if not symbols:
                continue
            for batch in self._chunk_symbols(symbols):
                all_batches.append((exchange, batch))

        if not all_batches:
            return [], 0, 0

        requests_per_run = max(1, int(settings.quote_requests_per_run or 1))
        if not settings.quote_rotate_batches:
            return all_batches[:requests_per_run], 0, len(all_batches)

        total_batches = len(all_batches)
        cycle = max(1, int(settings.quote_poll_seconds or 1))
        start_batch = (int(started_at.timestamp() // cycle) * requests_per_run) % total_batches

        selected: list[tuple[str, list[str]]] = []
        for offset in range(min(requests_per_run, total_batches)):
            selected.append(all_batches[(start_batch + offset) % total_batches])

        batch_number = (start_batch // requests_per_run) + 1
        total_windows = max(1, ceil(total_batches / requests_per_run))
        return selected, batch_number - 1, total_windows

    async def _resolve_grouped_symbols(self, repo: MarketRepository) -> dict[str, list[str]]:
        watchlist_items = await repo.get_active_watchlist_items()
        grouped: dict[str, list[str]] = defaultdict(list)

        if settings.quote_use_all_symbols:
            active_grouped = await repo.get_all_active_symbols_by_exchange()
            for exchange, symbols in (active_grouped or {}).items():
                grouped[exchange.upper()].extend(item.upper() for item in symbols if item)

        if watchlist_items:
            for item in watchlist_items:
                if item.exchange and item.symbol:
                    grouped[item.exchange.upper()].append(item.symbol.upper())

        if not grouped and settings.fallback_to_env_symbols:
            env_grouped = self._env_grouped_symbols()
            for exchange, symbols in env_grouped.items():
                grouped[exchange.upper()].extend(item.upper() for item in symbols if item)

        deduped: dict[str, list[str]] = {}
        for exchange, symbols in grouped.items():
            unique_symbols = sorted({symbol for symbol in symbols if symbol})
            if unique_symbols:
                deduped[exchange] = unique_symbols

        return deduped

    async def run(self) -> None:
        started_at = datetime.now()
        source = settings.vnstock_source
        total_saved = 0

        async with SessionLocal() as session:
            repo = MarketRepository(session)

            try:
                grouped = await self._resolve_grouped_symbols(repo)

                if not grouped:
                    logger.warning("no symbols resolved for quote collection; skip")
                    await repo.create_sync_log(
                        job_name="collect_quotes",
                        status="success",
                        started_at=started_at,
                        finished_at=datetime.now(),
                        message="skip quote collection because no symbols resolved",
                        extra_json={"source": source},
                    )
                    await session.commit()
                    return

                selected_batches, batch_index, total_batches = self._resolve_quote_batches(grouped, started_at)
                if not selected_batches:
                    await repo.create_sync_log(
                        job_name="collect_quotes",
                        status="success",
                        started_at=started_at,
                        finished_at=datetime.now(),
                        message="skip quote collection because no batches resolved",
                        extra_json={"source": source},
                    )
                    await session.commit()
                    return

                errors: list[str] = []

                for exchange, batch in selected_batches:
                    try:
                        result = self.client.get_price_board(batch)
                    except Exception as exc:
                        errors.append(f"{exchange}:{len(batch)} {exc}")
                        logger.warning("price_board failed | exchange=%s | symbols=%s | err=%s", exchange, len(batch), exc)
                        continue

                    if not result.rows:
                        logger.info("price_board empty | exchange=%s | symbols=%s", exchange, len(batch))
                        continue

                    for row in result.rows:
                        payload = self.normalizer.normalize_board_row(
                            row=row,
                            captured_at=started_at,
                            source=source,
                            default_exchange=exchange,
                        )
                        if not payload:
                            continue

                        await repo.add_quote_snapshot(payload)
                        await repo.upsert_symbol(
                            symbol=payload["symbol"],
                            name=row.get("name") or row.get("Name") or payload["symbol"],
                            exchange=payload.get("exchange") or exchange,
                            instrument_type=row.get("type") or row.get("Type") or "stock",
                            source="vnstock",
                            raw_json=row,
                            updated_at=started_at,
                        )
                        total_saved += 1

                total_resolved_batches = sum(len(self._chunk_symbols(symbols)) for symbols in grouped.values())
                status = "success" if not errors else "partial"
                summary_parts = [
                    f"saved quote snapshots: {total_saved}",
                    f"batch {batch_index + 1}/{max(1, total_batches)}",
                    f"requests {len(selected_batches)}/{total_resolved_batches}",
                ]

                await repo.create_sync_log(
                    job_name="collect_quotes",
                    status=status,
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=" | ".join(summary_parts),
                    extra_json={
                        "source": source,
                        "batch_index": batch_index,
                        "total_batches": total_batches,
                        "selected_requests": len(selected_batches),
                        "resolved_requests": total_resolved_batches,
                        "errors": errors[:10],
                    },
                )
                await session.commit()
                logger.info(
                    "collect_quotes done | total_saved=%s | batch=%s/%s | requests=%s/%s",
                    total_saved,
                    batch_index + 1,
                    max(1, total_batches),
                    len(selected_batches),
                    total_resolved_batches,
                )

            except asyncio.CancelledError:
                await session.rollback()
                logger.info("collect_quotes cancelled")
                raise
            except Exception as exc:
                await session.rollback()
                await repo.create_sync_log(
                    job_name="collect_quotes",
                    status="error",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=str(exc),
                    extra_json={"source": source},
                )
                await session.commit()
                logger.exception("collect_quotes failed")
