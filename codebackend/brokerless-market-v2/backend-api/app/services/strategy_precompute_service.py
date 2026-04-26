from __future__ import annotations

import asyncio
from datetime import datetime

from sqlalchemy import desc, select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.models.market import AppUser, StrategyProfile
from app.services.strategy_service import StrategyService


logger = get_logger(__name__)

STRATEGY_PRECOMPUTE_EXCHANGES = ("HSX", "HNX", "UPCOM")


class StrategyPrecomputeWorker:
    def __init__(self) -> None:
        self._stop_event = asyncio.Event()

    def stop(self) -> None:
        self._stop_event.set()

    async def run(self) -> None:
        if not settings.strategy_precompute_enabled:
            logger.info("strategy precompute worker disabled")
            return

        await self._sleep_or_stop(max(0, settings.strategy_precompute_initial_delay_seconds))
        while not self._stop_event.is_set():
            started = datetime.now()
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("strategy precompute cycle failed")

            elapsed = (datetime.now() - started).total_seconds()
            wait_seconds = max(30, settings.strategy_precompute_interval_seconds - int(elapsed))
            await self._sleep_or_stop(wait_seconds)

    async def run_once(self) -> None:
        profiles = await self._load_active_profiles()
        if not profiles:
            logger.info("strategy precompute skipped: no active profiles")
            return

        computed = 0
        for profile in profiles:
            for exchange in STRATEGY_PRECOMPUTE_EXCHANGES:
                computed += await self._precompute_profile_exchange(profile, exchange)

        logger.info("strategy precompute completed: profiles=%s exchange_runs=%s", len(profiles), computed)

    async def _load_active_profiles(self) -> list[StrategyProfile]:
        async with SessionLocal() as session:
            result = await session.execute(
                select(StrategyProfile)
                .where(StrategyProfile.is_active.is_(True))
                .order_by(
                    StrategyProfile.company_code.asc(),
                    desc(StrategyProfile.is_default),
                    StrategyProfile.id.asc(),
                )
            )
            return list(result.scalars().all())

    async def _precompute_profile_exchange(self, profile: StrategyProfile, exchange: str) -> int:
        async with SessionLocal() as session:
            service = StrategyService(session)
            actor = self._build_system_actor(profile.company_code)
            bundle = await service._build_profile_bundle(profile.id)
            await service._get_scored_universe_cached(
                actor,
                profile.id,
                bundle,
                exchange=exchange,
                watchlist_only=False,
            )
            await session.commit()
        return 1

    @staticmethod
    def _build_system_actor(company_code: str) -> AppUser:
        now = datetime.now()
        return AppUser(
            id=0,
            company_code=company_code,
            username="strategy.precompute",
            full_name="Strategy Precompute",
            email=None,
            department=None,
            password_hash="",
            role="system",
            permissions=["strategy-hub.view", "scoring.view", "screener.view", "risk.view"],
            is_active=True,
            created_at=now,
            updated_at=now,
        )

    async def _sleep_or_stop(self, seconds: int) -> None:
        if seconds <= 0:
            return
        try:
            await asyncio.wait_for(self._stop_event.wait(), timeout=seconds)
        except asyncio.TimeoutError:
            return
