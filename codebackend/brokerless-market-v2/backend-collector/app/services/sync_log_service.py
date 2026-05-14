from __future__ import annotations

from datetime import datetime
from typing import Any

from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.repositories.market_repo import MarketRepository

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
            repo = MarketRepository(session)
            await repo.create_sync_log(
                job_name=job_name,
                status=status,
                started_at=started_at,
                finished_at=finished_at or datetime.now(),
                message=message,
                extra_json=extra_json,
            )
            await session.commit()
    except Exception as exc:  # pragma: no cover
        logger.exception("failed to persist collector sync log | job=%s | status=%s | err=%s", job_name, status, exc)
