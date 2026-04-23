from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any

from app.models.market import AppUser
from app.repositories.auth_repo import AuthRepository
from app.repositories.market_read_repo import MarketReadRepository


DEFAULT_MARKET_SETTINGS: dict[str, Any] = {
    "language": "vi",
    "defaultExchange": "HSX",
    "defaultLandingPage": "market-watch",
    "defaultTimeRange": "1d",
    "startupPage": "dashboard",
    "theme": "light",
    "compactTable": True,
    "showSparkline": True,
    "flashPriceChange": True,
    "stickyHeader": True,
    "fontScale": "100",
    "pushAlerts": True,
    "emailAlerts": False,
    "soundAlerts": True,
    "alertStrength": "normal",
    "volumeSpikeThreshold": "50",
    "priceMoveThreshold": "3",
    "autoRefreshSeconds": "15",
    "preloadCharts": True,
    "cacheDays": "30",
    "syncMarketData": True,
    "syncNewsData": True,
    "syncCloud": True,
    "downloadOnWifiOnly": True,
    "aiEnabled": True,
    "aiModel": "gemini-2.5-flash",
    "aiSummaryAuto": True,
    "aiWatchlistMonitor": True,
    "aiExplainMove": True,
    "aiNewsDigest": True,
    "aiTaskSchedule": "08:30, 11:30, 14:45",
    "aiTone": "ngan gon",
    "safeMode": True,
    "biometricLogin": False,
    "sessionTimeout": "30",
    "deviceBinding": True,
}


class SettingsService:
    def __init__(self, repo: AuthRepository) -> None:
        self.repo = repo

    async def get_settings(self, user: AppUser) -> dict[str, Any]:
        row = await self.repo.get_user_settings(user.id)
        payload = deepcopy(DEFAULT_MARKET_SETTINGS)
        if row and isinstance(row.settings_json, dict):
            payload.update(row.settings_json)
        return payload

    async def save_settings(self, user: AppUser, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = deepcopy(DEFAULT_MARKET_SETTINGS)
        normalized.update({key: value for key, value in payload.items() if key in DEFAULT_MARKET_SETTINGS})
        await self.repo.upsert_user_settings(user.id, normalized)
        return normalized

    async def reset_settings(self, user: AppUser) -> dict[str, Any]:
        payload = deepcopy(DEFAULT_MARKET_SETTINGS)
        await self.repo.upsert_user_settings(user.id, payload)
        return payload


class SyncStatusService:
    def __init__(self, market_repo: MarketReadRepository) -> None:
        self.market_repo = market_repo

    async def get_status(self) -> dict[str, Any]:
        logs = await self.market_repo.get_latest_sync_logs(limit=50)
        latest_by_job: dict[str, Any] = {}
        for log in logs:
            if log.job_name not in latest_by_job:
                latest_by_job[log.job_name] = log

        latest_news = await self.market_repo.get_latest_news_articles(source="CafeF", limit=1)

        return {
            "quotes": self._to_job_payload(latest_by_job.get("collect_quotes")),
            "intraday": self._to_job_payload(latest_by_job.get("collect_intraday")),
            "indexDaily": self._to_job_payload(latest_by_job.get("collect_index_daily")),
            "financial": self._to_job_payload(latest_by_job.get("collect_financial_statements")),
            "seedSymbols": self._to_job_payload(latest_by_job.get("seed_symbols")),
            "news": {
                "status": "success" if latest_news else "idle",
                "startedAt": None,
                "finishedAt": latest_news[0].captured_at.isoformat() if latest_news else None,
                "message": latest_news[0].title if latest_news else "Chua co tin CafeF trong DB",
                "batchIndex": None,
                "totalBatches": None,
                "remainingBatches": None,
                "itemsInBatch": 1 if latest_news else 0,
                "itemsResolved": 1 if latest_news else 0,
            },
            "checkedAt": datetime.now().isoformat(),
        }

    def _to_job_payload(self, log: Any | None) -> dict[str, Any]:
        if not log:
            return {
                "status": "idle",
                "startedAt": None,
                "finishedAt": None,
                "message": "Chua co log dong bo",
                "batchIndex": None,
                "totalBatches": None,
                "remainingBatches": None,
                "itemsInBatch": None,
                "itemsResolved": None,
            }

        extra = log.extra_json if isinstance(log.extra_json, dict) else {}
        batch_index = extra.get("batch_index")
        total_batches = extra.get("total_batches")
        items_in_batch = extra.get("batch_symbols", extra.get("selected_requests"))
        items_resolved = extra.get("resolved_symbols", extra.get("resolved_requests"))
        remaining_batches = None
        if isinstance(batch_index, int) and isinstance(total_batches, int):
            remaining_batches = max(0, total_batches - (batch_index + 1))

        return {
            "status": log.status,
            "startedAt": log.started_at.isoformat() if log.started_at else None,
            "finishedAt": log.finished_at.isoformat() if log.finished_at else None,
            "message": log.message,
            "batchIndex": (batch_index + 1) if isinstance(batch_index, int) else None,
            "totalBatches": total_batches,
            "remainingBatches": remaining_batches,
            "itemsInBatch": items_in_batch,
            "itemsResolved": items_resolved,
        }
