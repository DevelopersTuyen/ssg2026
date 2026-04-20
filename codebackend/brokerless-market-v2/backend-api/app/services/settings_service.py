from __future__ import annotations

from copy import deepcopy
from typing import Any

from app.models.market import AppUser
from app.repositories.auth_repo import AuthRepository


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
