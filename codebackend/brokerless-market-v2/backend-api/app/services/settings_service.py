from __future__ import annotations

import json
from copy import deepcopy
from datetime import datetime
from pathlib import Path
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
    "collectorQuotePollSeconds": "60",
    "collectorIntradayPollSeconds": "180",
    "collectorIndexDailyPollSeconds": "300",
    "collectorFinancialPollSeconds": "1800",
    "collectorNewsPollSeconds": "300",
    "collectorQuoteRequestsPerRun": "4",
    "collectorIntradayRequestsPerRun": "6",
    "collectorIntradayMaxConcurrency": "2",
    "collectorFinancialSymbolsPerRun": "20",
    "collectorIntradayBackfillIntervalSeconds": "300",
    "collectorIntradayBackfillRequestsPerRun": "12",
    "collectorFinancialBackfillIntervalSeconds": "600",
    "collectorFinancialBackfillSymbolsPerRun": "300",
    "collectorCashFlowBackfillIntervalSeconds": "900",
    "collectorCashFlowBackfillSymbolsPerRun": "60",
    "collectorQuoteSource": "VCI",
    "collectorIntradaySource": "VCI",
    "collectorIndexSource": "VCI",
    "collectorFinancialSource": "CAFEF",
    "collectorSymbolMasterSource": "VCI",
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
    "aiLocalAutoAnalysis": False,
    "aiLocalFinancialAnalysis": False,
    "aiLocalModel": "qwen3:8b",
    "workflowAutoEnabled": False,
    "workflowAutoExchangeScope": "ALL",
    "workflowAutoTakeProfit": True,
    "workflowAutoCutLoss": True,
    "workflowAutoRebalance": True,
    "workflowAutoReviewPortfolio": False,
    "workflowAutoProbeBuy": False,
    "workflowAutoAddPosition": False,
    "safeMode": True,
    "biometricLogin": False,
    "sessionTimeout": "30",
    "deviceBinding": True,
}

RUNTIME_SYNC_FILE = Path(__file__).resolve().parents[2].parent / "runtime" / "collector-sync-settings.json"
RUNTIME_SYNC_KEYS = {
    "collectorQuotePollSeconds": "quotePollSeconds",
    "collectorIntradayPollSeconds": "intradayPollSeconds",
    "collectorIndexDailyPollSeconds": "indexDailyPollSeconds",
    "collectorFinancialPollSeconds": "financialPollSeconds",
    "collectorNewsPollSeconds": "newsPollSeconds",
    "collectorQuoteRequestsPerRun": "quoteRequestsPerRun",
    "collectorIntradayRequestsPerRun": "intradayRequestsPerRun",
    "collectorIntradayMaxConcurrency": "intradayMaxConcurrency",
    "collectorFinancialSymbolsPerRun": "financialSymbolsPerRun",
    "collectorIntradayBackfillIntervalSeconds": "intradayBackfillIntervalSeconds",
    "collectorIntradayBackfillRequestsPerRun": "intradayBackfillRequestsPerRun",
    "collectorFinancialBackfillIntervalSeconds": "financialBackfillIntervalSeconds",
    "collectorFinancialBackfillSymbolsPerRun": "financialBackfillSymbolsPerRun",
    "collectorCashFlowBackfillIntervalSeconds": "cashFlowBackfillIntervalSeconds",
    "collectorCashFlowBackfillSymbolsPerRun": "cashFlowBackfillSymbolsPerRun",
    "collectorQuoteSource": "quoteSource",
    "collectorIntradaySource": "intradaySource",
    "collectorIndexSource": "indexSource",
    "collectorFinancialSource": "financialSource",
    "collectorSymbolMasterSource": "symbolMasterSource",
}


def _read_runtime_sync_settings() -> dict[str, Any]:
    try:
        if not RUNTIME_SYNC_FILE.exists():
            return {}
        payload = json.loads(RUNTIME_SYNC_FILE.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _write_runtime_sync_settings(payload: dict[str, Any]) -> None:
    RUNTIME_SYNC_FILE.parent.mkdir(parents=True, exist_ok=True)
    RUNTIME_SYNC_FILE.write_text(
        json.dumps(payload, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )


def _coerce_runtime_int(value: Any, fallback: str) -> str:
    try:
        number = max(1, int(value))
        return str(number)
    except Exception:
        return fallback


def _coerce_runtime_source(value: Any, fallback: str) -> str:
    try:
        normalized = str(value or fallback).strip().upper()
        return normalized or fallback
    except Exception:
        return fallback


class SettingsService:
    def __init__(self, repo: AuthRepository) -> None:
        self.repo = repo

    async def get_settings(self, user: AppUser) -> dict[str, Any]:
        row = await self.repo.get_user_settings(user.id)
        payload = deepcopy(DEFAULT_MARKET_SETTINGS)
        if row and isinstance(row.settings_json, dict):
            payload.update(row.settings_json)
        runtime_settings = _read_runtime_sync_settings()
        for settings_key, runtime_key in RUNTIME_SYNC_KEYS.items():
            if settings_key.endswith("Source"):
                payload[settings_key] = _coerce_runtime_source(
                    runtime_settings.get(runtime_key),
                    str(payload.get(settings_key, DEFAULT_MARKET_SETTINGS[settings_key])),
                )
            else:
                payload[settings_key] = _coerce_runtime_int(
                    runtime_settings.get(runtime_key),
                    str(payload.get(settings_key, DEFAULT_MARKET_SETTINGS[settings_key])),
                )
        return payload

    async def save_settings(self, user: AppUser, payload: dict[str, Any]) -> dict[str, Any]:
        normalized = deepcopy(DEFAULT_MARKET_SETTINGS)
        normalized.update({key: value for key, value in payload.items() if key in DEFAULT_MARKET_SETTINGS})
        runtime_settings = _read_runtime_sync_settings()
        for settings_key, runtime_key in RUNTIME_SYNC_KEYS.items():
            if settings_key.endswith("Source"):
                normalized_value = _coerce_runtime_source(
                    normalized.get(settings_key),
                    str(DEFAULT_MARKET_SETTINGS[settings_key]),
                )
                normalized[settings_key] = normalized_value
                runtime_settings[runtime_key] = normalized_value
            else:
                normalized_value = _coerce_runtime_int(
                    normalized.get(settings_key),
                    str(DEFAULT_MARKET_SETTINGS[settings_key]),
                )
                normalized[settings_key] = normalized_value
                runtime_settings[runtime_key] = int(normalized_value)
        _write_runtime_sync_settings(runtime_settings)
        await self.repo.upsert_user_settings(user.id, normalized)
        return normalized

    async def reset_settings(self, user: AppUser) -> dict[str, Any]:
        payload = deepcopy(DEFAULT_MARKET_SETTINGS)
        runtime_settings = _read_runtime_sync_settings()
        for settings_key, runtime_key in RUNTIME_SYNC_KEYS.items():
            payload[settings_key] = str(DEFAULT_MARKET_SETTINGS[settings_key])
            if settings_key.endswith("Source"):
                runtime_settings[runtime_key] = str(DEFAULT_MARKET_SETTINGS[settings_key])
            else:
                runtime_settings[runtime_key] = int(str(DEFAULT_MARKET_SETTINGS[settings_key]))
        _write_runtime_sync_settings(runtime_settings)
        await self.repo.upsert_user_settings(user.id, payload)
        return payload


class SyncStatusService:
    def __init__(self, market_repo: MarketReadRepository) -> None:
        self.market_repo = market_repo

    async def get_status(self) -> dict[str, Any]:
        logs = await self.market_repo.get_latest_sync_logs(limit=50)
        logs_by_job: dict[str, list[Any]] = {}
        for log in logs:
            logs_by_job.setdefault(log.job_name, []).append(log)

        latest_news = await self.market_repo.get_latest_news_articles(source="CafeF", limit=1)
        runtime_settings = _read_runtime_sync_settings()
        coverage_snapshot = await self.market_repo.get_data_coverage_snapshot()

        return {
            "quotes": self._to_job_payload("collect_quotes", logs_by_job.get("collect_quotes", []), fallback_source=str(runtime_settings.get("quoteSource") or DEFAULT_MARKET_SETTINGS["collectorQuoteSource"])),
            "intraday": self._to_job_payload("collect_intraday", logs_by_job.get("collect_intraday", []), fallback_source=str(runtime_settings.get("intradaySource") or DEFAULT_MARKET_SETTINGS["collectorIntradaySource"]), coverage_mode=self._resolve_intraday_coverage_mode(logs_by_job.get("collect_intraday", []))),
            "intradayBackfill": self._to_job_payload("collect_intraday_backfill", logs_by_job.get("collect_intraday_backfill", []), fallback_source=str(runtime_settings.get("intradaySource") or DEFAULT_MARKET_SETTINGS["collectorIntradaySource"])),
            "indexDaily": self._to_job_payload("collect_index_daily", logs_by_job.get("collect_index_daily", []), fallback_source=str(runtime_settings.get("indexSource") or DEFAULT_MARKET_SETTINGS["collectorIndexSource"])),
            "financial": self._to_job_payload("collect_financial_statements", logs_by_job.get("collect_financial_statements", []), fallback_source=str(runtime_settings.get("financialSource") or DEFAULT_MARKET_SETTINGS["collectorFinancialSource"])),
            "financialBackfill": self._to_job_payload("collect_financial_statements_backfill", logs_by_job.get("collect_financial_statements_backfill", []), fallback_source=str(runtime_settings.get("financialSource") or DEFAULT_MARKET_SETTINGS["collectorFinancialSource"])),
            "cashFlowBackfill": self._to_job_payload("collect_financial_cash_flow_backfill", logs_by_job.get("collect_financial_cash_flow_backfill", []), fallback_source=str(runtime_settings.get("financialSource") or DEFAULT_MARKET_SETTINGS["collectorFinancialSource"])),
            "seedSymbols": self._to_job_payload("seed_symbols", logs_by_job.get("seed_symbols", []), fallback_source=str(runtime_settings.get("symbolMasterSource") or DEFAULT_MARKET_SETTINGS["collectorSymbolMasterSource"])),
            "foundationCandles": self._to_job_payload("foundation_candles", logs_by_job.get("foundation_candles", []), fallback_source="internal"),
            "foundationDataQuality": self._to_job_payload("foundation_data_quality", logs_by_job.get("foundation_data_quality", []), fallback_source="internal"),
            "foundationAlerts": self._to_job_payload("foundation_alert_delivery", logs_by_job.get("foundation_alert_delivery", []), fallback_source="internal"),
            "workflowAutomation": self._to_job_payload("workflow_auto_executor", logs_by_job.get("workflow_auto_executor", []), fallback_source="internal"),
            "news": self._build_news_payload(logs_by_job.get("collect_news", []), latest_news),
            "coverage": coverage_snapshot,
            "checkedAt": datetime.now().isoformat(),
        }

    def _build_news_payload(self, logs: list[Any], latest_news: list[Any]) -> dict[str, Any]:
        if logs:
            return self._to_job_payload("collect_news", logs, fallback_source="CAFEF")
        if latest_news:
            latest = latest_news[0]
            return {
                "status": "success",
                "jobName": "collect_news",
                "health": "healthy",
                "startedAt": None,
                "finishedAt": latest.captured_at.isoformat() if latest.captured_at else None,
                "message": latest.title or "CafeF news persisted",
                "batchIndex": None,
                "totalBatches": None,
                "remainingBatches": None,
                "itemsInBatch": 1,
                "itemsResolved": 1,
                "source": "CAFEF",
                "coverageMode": None,
                "lastError": None,
                "lastErrorAt": None,
                "lastSuccessAt": latest.captured_at.isoformat() if latest.captured_at else None,
                "recoveredAt": None,
                "consecutiveFailures": 0,
                "ageSeconds": self._age_seconds(latest.captured_at),
            }
        return {
            "status": "idle",
            "jobName": "collect_news",
            "health": "idle",
            "startedAt": None,
            "finishedAt": None,
            "message": "Chua co log dong bo tin tuc",
            "batchIndex": None,
            "totalBatches": None,
            "remainingBatches": None,
            "itemsInBatch": None,
            "itemsResolved": None,
            "source": "CAFEF",
            "coverageMode": None,
            "lastError": None,
            "lastErrorAt": None,
            "lastSuccessAt": None,
            "recoveredAt": None,
            "consecutiveFailures": 0,
            "ageSeconds": None,
        }

    def _to_job_payload(
        self,
        job_name: str,
        logs: list[Any],
        *,
        fallback_source: str | None = None,
        coverage_mode: str | None = None,
    ) -> dict[str, Any]:
        if not logs:
            return {
                "status": "idle",
                "jobName": job_name,
                "health": "idle",
                "startedAt": None,
                "finishedAt": None,
                "message": "Chua co log dong bo",
                "batchIndex": None,
                "totalBatches": None,
                "remainingBatches": None,
                "itemsInBatch": None,
                "itemsResolved": None,
                "source": fallback_source,
                "coverageMode": coverage_mode,
                "lastError": None,
                "lastErrorAt": None,
                "lastSuccessAt": None,
                "recoveredAt": None,
                "consecutiveFailures": 0,
                "ageSeconds": None,
            }

        log = logs[0]
        extra = log.extra_json if isinstance(log.extra_json, dict) else {}
        batch_index = extra.get("batch_index")
        total_batches = extra.get("total_batches")
        items_in_batch = extra.get("batch_symbols", extra.get("selected_requests"))
        items_resolved = extra.get("resolved_symbols", extra.get("resolved_requests"))
        source = str(extra.get("source") or fallback_source or "").strip().upper() or None
        remaining_batches = None
        if isinstance(batch_index, int) and isinstance(total_batches, int):
            remaining_batches = max(0, total_batches - (batch_index + 1))

        latest_status = str(log.status or "").lower()
        last_failure = next((item for item in logs if str(item.status or "").lower() in {"error", "partial", "warning"}), None)
        last_success = next((item for item in logs if str(item.status or "").lower() == "success"), None)
        previous_log = logs[1] if len(logs) > 1 else None
        consecutive_failures = 0
        for item in logs:
            if str(item.status or "").lower() == "success":
                break
            consecutive_failures += 1

        if latest_status == "error":
            health = "hard-failed"
        elif latest_status in {"partial", "warning"}:
            health = "soft-failed"
        elif latest_status == "success" and previous_log and str(previous_log.status or "").lower() in {"error", "partial", "warning"}:
            health = "recovered"
        else:
            health = "healthy"

        return {
            "status": log.status,
            "jobName": job_name,
            "health": health,
            "startedAt": log.started_at.isoformat() if log.started_at else None,
            "finishedAt": log.finished_at.isoformat() if log.finished_at else None,
            "message": log.message,
            "batchIndex": (batch_index + 1) if isinstance(batch_index, int) else None,
            "totalBatches": total_batches,
            "remainingBatches": remaining_batches,
            "itemsInBatch": items_in_batch,
            "itemsResolved": items_resolved,
            "source": source,
            "coverageMode": coverage_mode,
            "lastError": last_failure.message if last_failure else None,
            "lastErrorAt": self._to_iso(last_failure.finished_at if last_failure else None) or self._to_iso(last_failure.started_at if last_failure else None),
            "lastSuccessAt": self._to_iso(last_success.finished_at if last_success else None) or self._to_iso(last_success.started_at if last_success else None),
            "recoveredAt": self._to_iso(log.finished_at) if health == "recovered" else None,
            "consecutiveFailures": consecutive_failures if latest_status in {"error", "partial", "warning"} else 0,
            "ageSeconds": self._age_seconds(log.finished_at or log.started_at),
        }

    @staticmethod
    def _resolve_intraday_coverage_mode(logs: list[Any]) -> str | None:
        if not logs:
            return None
        log = logs[0]
        extra = log.extra_json if isinstance(log.extra_json, dict) else {}
        total_batches = extra.get("total_batches")
        try:
            if int(total_batches or 0) > 1:
                return "rotated"
            if int(total_batches or 0) == 1:
                return "full"
        except Exception:
            return None
        return None

    @staticmethod
    def _to_iso(value: datetime | None) -> str | None:
        return value.isoformat() if value else None

    @staticmethod
    def _age_seconds(value: datetime | None) -> int | None:
        if not value:
            return None
        return max(0, int((datetime.now() - value).total_seconds()))
