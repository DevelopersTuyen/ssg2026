from __future__ import annotations

import asyncio
from datetime import datetime
from typing import Any

from app.core.config import settings
from app.core.logging import get_logger
from app.core.db import SessionLocal
from app.repositories.auth_repo import AuthRepository
from app.services.settings_service import DEFAULT_MARKET_SETTINGS
from app.services.strategy_service import StrategyService
from app.services.sync_log_service import write_sync_log_safely

logger = get_logger(__name__)

AUTO_ACTION_SETTINGS_MAP: dict[str, str] = {
    "take_profit": "workflowAutoTakeProfit",
    "cut_loss": "workflowAutoCutLoss",
    "rebalance": "workflowAutoRebalance",
    "review_portfolio": "workflowAutoReviewPortfolio",
    "probe_buy": "workflowAutoProbeBuy",
    "add_position": "workflowAutoAddPosition",
}


class WorkflowAutoExecutorWorker:
    def __init__(self) -> None:
        self._stop_event = asyncio.Event()

    def stop(self) -> None:
        self._stop_event.set()

    async def run(self) -> None:
        if not settings.workflow_auto_executor_enabled:
            logger.info("workflow auto executor disabled")
            return

        await self._sleep_or_stop(max(0, settings.workflow_auto_executor_initial_delay_seconds))
        while not self._stop_event.is_set():
            started = datetime.now()
            try:
                await self.run_once()
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("workflow auto executor cycle failed")

            elapsed = (datetime.now() - started).total_seconds()
            wait_seconds = max(15, settings.workflow_auto_executor_interval_seconds - int(elapsed))
            await self._sleep_or_stop(wait_seconds)

    async def run_once(self) -> None:
        started_at = datetime.now()
        summary = {
            "usersChecked": 0,
            "usersEligible": 0,
            "suggestionsSeen": 0,
            "actionsAutoCreated": 0,
            "actionsSkipped": 0,
            "actionsFailed": 0,
        }
        try:
            async with SessionLocal() as session:
                auth_repo = AuthRepository(session)
                strategy_service = StrategyService(session)
                users = await auth_repo.list_active_users()
                summary["usersChecked"] = len(users)

                for user in users:
                    if "journal.view" not in (user.permissions or []) or "journal.create" not in (user.permissions or []):
                        continue

                    settings_row = await auth_repo.get_user_settings(user.id)
                    merged_settings = dict(DEFAULT_MARKET_SETTINGS)
                    if settings_row and isinstance(settings_row.settings_json, dict):
                        merged_settings.update(settings_row.settings_json)

                    if not bool(merged_settings.get("workflowAutoEnabled")):
                        continue

                    summary["usersEligible"] += 1
                    exchange_scope = str(merged_settings.get("workflowAutoExchangeScope") or "ALL").upper()
                    overview = await strategy_service.get_action_workflow_overview(
                        user,
                        exchange=exchange_scope if exchange_scope in {"ALL", "HSX", "HNX", "UPCOM"} else "ALL",
                        limit=120,
                    )
                    suggestions = overview.get("suggestedActions") or []
                    summary["suggestionsSeen"] += len(suggestions)

                    for item in suggestions:
                        if not self._should_auto_execute(item, merged_settings):
                            summary["actionsSkipped"] += 1
                            continue
                        try:
                            await strategy_service.create_action_workflow_entry(
                                user,
                                {
                                    "profile_id": item.get("profileId"),
                                    "journal_entry_id": item.get("journalEntryId"),
                                    "symbol": item.get("symbol"),
                                    "exchange": item.get("exchange"),
                                    "source_type": item.get("sourceType"),
                                    "source_key": item.get("sourceKey"),
                                    "action_code": item.get("actionCode"),
                                    "action_label": item.get("actionLabel"),
                                    "execution_mode": "automatic",
                                    "severity": item.get("severity"),
                                    "title": item.get("title"),
                                    "message": item.get("message"),
                                    "metadata_json": {
                                        "autoExecutor": True,
                                        "autoPolicy": self._policy_snapshot(merged_settings),
                                    },
                                },
                            )
                            summary["actionsAutoCreated"] += 1
                        except Exception:
                            summary["actionsFailed"] += 1
                            logger.exception(
                                "workflow auto executor failed for user=%s symbol=%s action=%s",
                                user.username,
                                item.get("symbol"),
                                item.get("actionCode"),
                            )

                await session.commit()

            await write_sync_log_safely(
                job_name="workflow_auto_executor",
                status="success",
                started_at=started_at,
                finished_at=datetime.now(),
                message=(
                    f"checked {summary['usersChecked']} users, auto-created {summary['actionsAutoCreated']} "
                    f"workflow actions, skipped {summary['actionsSkipped']}"
                ),
                extra_json=summary,
            )
            logger.info("workflow auto executor completed | %s", summary)
        except Exception as exc:
            logger.exception("workflow auto executor failed | err=%s", exc)
            await write_sync_log_safely(
                job_name="workflow_auto_executor",
                status="error",
                started_at=started_at,
                finished_at=datetime.now(),
                message=str(exc),
                extra_json=summary,
            )

    def _should_auto_execute(self, item: dict[str, Any], merged_settings: dict[str, Any]) -> bool:
        action_code = str(item.get("actionCode") or "").strip().lower()
        source_type = str(item.get("sourceType") or "").strip().lower()
        if source_type == "portfolio_alert" and action_code == "review_portfolio":
            return bool(merged_settings.get("workflowAutoReviewPortfolio"))
        setting_key = AUTO_ACTION_SETTINGS_MAP.get(action_code)
        if not setting_key:
            return False
        return bool(merged_settings.get(setting_key))

    @staticmethod
    def _policy_snapshot(merged_settings: dict[str, Any]) -> dict[str, Any]:
        return {
            "exchangeScope": merged_settings.get("workflowAutoExchangeScope"),
            "takeProfit": bool(merged_settings.get("workflowAutoTakeProfit")),
            "cutLoss": bool(merged_settings.get("workflowAutoCutLoss")),
            "rebalance": bool(merged_settings.get("workflowAutoRebalance")),
            "reviewPortfolio": bool(merged_settings.get("workflowAutoReviewPortfolio")),
            "probeBuy": bool(merged_settings.get("workflowAutoProbeBuy")),
            "addPosition": bool(merged_settings.get("workflowAutoAddPosition")),
        }

    async def _sleep_or_stop(self, seconds: int) -> None:
        if seconds <= 0:
            return
        try:
            await asyncio.wait_for(self._stop_event.wait(), timeout=seconds)
        except asyncio.TimeoutError:
            return
