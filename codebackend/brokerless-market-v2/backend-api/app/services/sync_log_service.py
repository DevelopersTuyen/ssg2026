from __future__ import annotations

from datetime import datetime
from typing import Any

from app.core.db import SessionLocal
from app.core.json_utils import make_json_safe
from app.core.logging import get_logger
from app.models.market import MarketSyncLog

logger = get_logger(__name__)


async def write_sync_log_safely(
    *,
    job_name: str,
    status: str,
    started_at: datetime,
    finished_at: datetime | None = None,
    message: str | None = None,
    extra_json: dict[str, Any] | list[Any] | None = None,
) -> None:
    try:
        async with SessionLocal() as session:
            session.add(
                MarketSyncLog(
                    job_name=job_name,
                    status=status,
                    started_at=started_at,
                    finished_at=finished_at or datetime.now(),
                    message=message,
                    extra_json=make_json_safe(extra_json),
                )
            )
            await session.commit()
    except Exception as exc:  # pragma: no cover
        logger.exception("failed to persist backend sync log | job=%s | status=%s | err=%s", job_name, status, exc)
