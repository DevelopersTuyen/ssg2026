from __future__ import annotations

from collections import defaultdict
from datetime import datetime

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

        hsx = [x.strip().upper() for x in (settings.hsx_symbols or []) if x.strip()]
        hnx = [x.strip().upper() for x in (settings.hnx_symbols or []) if x.strip()]
        upcom = [x.strip().upper() for x in (settings.upcom_symbols or []) if x.strip()]

        if hsx:
            grouped["HSX"] = hsx
        if hnx:
            grouped["HNX"] = hnx
        if upcom:
            grouped["UPCOM"] = upcom

        return grouped

    async def _resolve_grouped_symbols(self, repo: MarketRepository) -> dict[str, list[str]]:
        watchlist_items = await repo.get_active_watchlist_items()

        if watchlist_items:
            grouped: dict[str, list[str]] = defaultdict(list)
            for item in watchlist_items:
                if item.exchange and item.symbol:
                    grouped[item.exchange.upper()].append(item.symbol.upper())
            if grouped:
                return dict(grouped)

        if settings.quote_use_all_symbols:
            grouped = await repo.get_all_active_symbols_by_exchange()
            if grouped:
                return grouped

        if settings.fallback_to_env_symbols:
            return self._env_grouped_symbols()

        return {}

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

                for exchange, symbols in grouped.items():
                    if not symbols:
                        continue

                    result = self.client.get_price_board(symbols)

                    if not result.rows:
                        logger.info("price_board empty | exchange=%s | symbols=%s", exchange, len(symbols))
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

                await repo.create_sync_log(
                    job_name="collect_quotes",
                    status="success",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=f"saved quote snapshots: {total_saved}",
                    extra_json={"source": source},
                )
                await session.commit()
                logger.info("collect_quotes done | total_saved=%s", total_saved)

            except BaseException as exc:
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