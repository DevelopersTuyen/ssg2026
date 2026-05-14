from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.json_utils import make_json_safe
from app.core.logging import get_logger
from app.models.market import MarketSyncLog
from app.services.alert_delivery_service import AlertDeliveryService
from app.services.candle_service import CandleService
from app.services.data_quality_service import DataQualityService
from app.services.sync_log_service import write_sync_log_safely

logger = get_logger(__name__)

FOUNDATION_EXCHANGES = ("HSX", "HNX", "UPCOM")


class FoundationWorker:
    def __init__(self) -> None:
        self._stop_event = asyncio.Event()

    def stop(self) -> None:
        self._stop_event.set()

    async def run(self) -> None:
        if not settings.foundation_worker_enabled:
            logger.info("foundation worker disabled")
            return

        await self._sleep_or_stop(max(0, settings.foundation_worker_initial_delay_seconds))
        while not self._stop_event.is_set():
            started = datetime.now()
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("foundation worker cycle failed")

            elapsed = (datetime.now() - started).total_seconds()
            wait_seconds = max(30, settings.foundation_worker_interval_seconds - int(elapsed))
            await self._sleep_or_stop(wait_seconds)

    async def run_once(self) -> None:
        candle_result = await self._run_job_safely("foundation_candles", self._run_candle_job)
        quality_result = await self._run_job_safely("foundation_data_quality", self._run_data_quality_job)
        alert_result = await self._run_job_safely("foundation_alert_delivery", self._run_alert_job)
        logger.info(
            "foundation worker completed | candles=%s quality=%s alerts=%s",
            candle_result,
            quality_result,
            alert_result,
        )

    async def _run_candle_job(self) -> dict[str, Any]:
        started_at = datetime.now()
        async with SessionLocal() as session:
            service = CandleService(session)
            timeframes = self._configured_timeframes()
            symbols = await service.list_recent_intraday_symbols(limit=max(1, settings.foundation_candle_symbols_per_run))
            upserted = 0
            for symbol in symbols:
                for timeframe in timeframes:
                    result = await service.resample_symbol(symbol=symbol, timeframe=timeframe)
                    upserted += int(result.get("candles_upserted") or 0)
            await self._sync_log(
                session,
                "foundation_candles",
                "success",
                started_at,
                f"resampled {len(symbols)} symbols / {len(timeframes)} timeframes",
                {"symbols": symbols, "timeframes": timeframes, "candles_upserted": upserted},
            )
            await session.commit()
        return {"symbols": len(symbols), "timeframes": len(timeframes), "candles_upserted": upserted}

    async def _run_data_quality_job(self) -> dict[str, Any]:
        started_at = datetime.now()
        async with SessionLocal() as session:
            service = DataQualityService(session)
            result = await service.scan(limit=max(100, settings.foundation_data_quality_limit))
            await self._sync_log(
                session,
                "foundation_data_quality",
                "success",
                started_at,
                f"checked {result['quotes_checked']} quotes and {result['intraday_checked']} intraday rows",
                result,
            )
            await session.commit()
        return result

    async def _run_alert_job(self) -> dict[str, Any]:
        started_at = datetime.now()
        async with SessionLocal() as session:
            service = AlertDeliveryService(session)
            materialized: list[dict[str, Any]] = []
            for exchange in FOUNDATION_EXCHANGES:
                materialized.append(await service.materialize_market_alerts(exchange=exchange))
            delivery = await service.deliver_pending()
            result = {"materialized": materialized, "delivery": delivery}
            await self._sync_log(
                session,
                "foundation_alert_delivery",
                "success",
                started_at,
                f"materialized {sum(int(item.get('events_created') or 0) for item in materialized)} events, delivered {delivery.get('sent', 0)}",
                result,
            )
            await session.commit()
        return result

    async def _sync_log(
        self,
        session,
        job_name: str,
        status: str,
        started_at: datetime,
        message: str,
        extra_json: dict[str, Any] | None = None,
    ) -> None:
        session.add(
            MarketSyncLog(
                job_name=job_name,
                status=status,
                started_at=started_at,
                finished_at=datetime.now(),
                message=message,
                extra_json=make_json_safe(extra_json),
            )
        )

    async def _run_job_safely(self, job_name: str, runner) -> dict[str, Any]:
        started_at = datetime.now()
        try:
            result = await runner()
            if isinstance(result, dict):
                return {"status": "success", **result}
            return {"status": "success", "result": result}
        except Exception as exc:
            logger.exception("foundation sub-job failed | job=%s | err=%s", job_name, exc)
            await write_sync_log_safely(
                job_name=job_name,
                status="error",
                started_at=started_at,
                finished_at=datetime.now(),
                message=str(exc),
            )
            return {"status": "error", "error": str(exc)}

    def _configured_timeframes(self) -> list[str]:
        values = [
            item.strip().lower()
            for item in (settings.foundation_candle_timeframes or "5m").split(",")
            if item.strip()
        ]
        return values or ["5m"]

    async def _sleep_or_stop(self, seconds: int) -> None:
        if seconds <= 0:
            return
        try:
            await asyncio.wait_for(self._stop_event.wait(), timeout=seconds)
        except asyncio.TimeoutError:
            return
