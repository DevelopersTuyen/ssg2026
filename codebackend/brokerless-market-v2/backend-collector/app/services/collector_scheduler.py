from __future__ import annotations

import asyncio

from app.core.config import settings
from app.core.logging import get_logger
from app.services.financial_statement_collector import FinancialStatementCollector
from app.services.index_collector import IndexCollector
from app.services.intraday_collector import IntradayCollector
from app.services.quote_collector import QuoteCollector

logger = get_logger(__name__)


class CollectorScheduler:
    def __init__(self) -> None:
        self.quote_collector = QuoteCollector()
        self.intraday_collector = IntradayCollector()
        self.index_collector = IndexCollector()
        self.financial_statement_collector = FinancialStatementCollector()
        self.tasks: list[asyncio.Task] = []
        self._running = False

    async def start(self) -> None:
        if self._running:
            return

        self._running = True

        self.tasks = [
            asyncio.create_task(
                self._run_loop(
                    "quotes",
                    self.quote_collector.run,
                    settings.quote_poll_seconds,
                    initial_delay=10,
                )
            ),
            asyncio.create_task(
                self._run_loop(
                    "intraday",
                    self.intraday_collector.run,
                    settings.intraday_poll_seconds,
                    initial_delay=45,
                )
            ),
            asyncio.create_task(
                self._run_loop(
                    "index_daily",
                    self.index_collector.run_daily,
                    settings.index_daily_poll_seconds,
                    initial_delay=90,
                )
            ),
            asyncio.create_task(
                self._run_loop(
                    "financial_statements",
                    self.financial_statement_collector.run,
                    settings.financial_poll_seconds,
                    initial_delay=150,
                )
            ),
        ]

    async def stop(self) -> None:
        self._running = False
        active_tasks = list(self.tasks)
        for task in active_tasks:
            task.cancel()
        if active_tasks:
            await asyncio.gather(*active_tasks, return_exceptions=True)
        self.tasks = []

    async def _run_loop(self, job_name: str, func, interval_seconds: int, initial_delay: int = 0) -> None:
        logger.info(
            "scheduler loop started | job=%s interval=%s initial_delay=%s",
            job_name,
            interval_seconds,
            initial_delay,
        )

        try:
            if initial_delay > 0:
                await asyncio.sleep(initial_delay)

            while self._running:
                try:
                    await func()
                except asyncio.CancelledError:
                    logger.info("scheduler job cancelled | job=%s", job_name)
                    raise
                except Exception as exc:
                    logger.exception("scheduler job failed | job=%s | err=%s", job_name, exc)

                await asyncio.sleep(interval_seconds)
        except asyncio.CancelledError:
            logger.info("scheduler loop stopped | job=%s", job_name)
            raise
