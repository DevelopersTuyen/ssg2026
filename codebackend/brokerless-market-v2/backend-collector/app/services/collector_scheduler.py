from __future__ import annotations

import asyncio
from typing import Callable

from app.core.config import get_runtime_sync_int, settings
from app.core.logging import get_logger
from app.services.financial_statement_collector import FinancialStatementCollector
from app.services.index_collector import IndexCollector
from app.services.intraday_collector import IntradayCollector
from app.services.news_collector import NewsCollector
from app.services.quote_collector import QuoteCollector
from app.services.symbol_seed_service import SymbolSeedService

logger = get_logger(__name__)


class CollectorScheduler:
    def __init__(self) -> None:
        self.quote_collector = QuoteCollector()
        self.intraday_collector = IntradayCollector()
        self.index_collector = IndexCollector()
        self.financial_statement_collector = FinancialStatementCollector()
        self.news_collector = NewsCollector()
        self.symbol_seed_service = SymbolSeedService()
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
                    lambda: get_runtime_sync_int("quotePollSeconds", settings.quote_poll_seconds),
                    initial_delay=10,
                )
            ),
            asyncio.create_task(
                self._run_loop(
                    "intraday",
                    self.intraday_collector.run,
                    lambda: get_runtime_sync_int("intradayPollSeconds", settings.intraday_poll_seconds),
                    initial_delay=45,
                )
            ),
            asyncio.create_task(
                self._run_loop(
                    "index_daily",
                    self.index_collector.run_daily,
                    lambda: get_runtime_sync_int("indexDailyPollSeconds", settings.index_daily_poll_seconds),
                    initial_delay=90,
                )
            ),
            asyncio.create_task(
                self._run_loop(
                    "financial_statements",
                    self.financial_statement_collector.run,
                    lambda: get_runtime_sync_int("financialPollSeconds", settings.financial_poll_seconds),
                    initial_delay=150,
                )
            ),
            asyncio.create_task(
                self._run_loop(
                    "news",
                    self.news_collector.run,
                    lambda: get_runtime_sync_int("newsPollSeconds", settings.news_poll_seconds),
                    initial_delay=180,
                )
            ),
        ]
        if settings.intraday_backfill_enabled:
            self.tasks.append(
                asyncio.create_task(
                    self._run_loop(
                        "intraday_backfill",
                        self.intraday_collector.run_backfill,
                        lambda: get_runtime_sync_int("intradayBackfillIntervalSeconds", settings.intraday_backfill_interval_seconds),
                        initial_delay=60,
                    )
                )
            )
        if settings.seed_symbols_refresh_enabled:
            self.tasks.append(
                asyncio.create_task(
                    self._run_loop(
                        "seed_symbols_refresh",
                        self.symbol_seed_service.run,
                        settings.seed_symbols_refresh_interval_seconds,
                        initial_delay=240,
                    )
                )
            )
        if settings.financial_backfill_enabled:
            self.tasks.append(
                asyncio.create_task(
                    self._run_loop(
                        "financial_statements_backfill",
                        self.financial_statement_collector.run_backfill,
                        lambda: get_runtime_sync_int("financialBackfillIntervalSeconds", settings.financial_backfill_interval_seconds),
                        initial_delay=210,
                    )
                )
            )
        if settings.financial_cash_flow_backfill_enabled:
            self.tasks.append(
                asyncio.create_task(
                    self._run_loop(
                        "financial_cash_flow_backfill",
                        self.financial_statement_collector.run_cash_flow_backfill,
                        lambda: get_runtime_sync_int("cashFlowBackfillIntervalSeconds", settings.financial_cash_flow_backfill_interval_seconds),
                        initial_delay=270,
                    )
                )
            )

    async def stop(self) -> None:
        self._running = False
        active_tasks = list(self.tasks)
        for task in active_tasks:
            task.cancel()
        if active_tasks:
            await asyncio.gather(*active_tasks, return_exceptions=True)
        self.tasks = []

    async def _run_loop(
        self,
        job_name: str,
        func,
        interval_seconds: int | Callable[[], int],
        initial_delay: int = 0,
    ) -> None:
        initial_interval = interval_seconds() if callable(interval_seconds) else interval_seconds
        logger.info(
            "scheduler loop started | job=%s interval=%s initial_delay=%s",
            job_name,
            initial_interval,
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
                except BaseException as exc:
                    logger.exception("scheduler job failed | job=%s | err=%s", job_name, exc)

                current_interval = interval_seconds() if callable(interval_seconds) else interval_seconds
                await asyncio.sleep(max(1, int(current_interval)))
        except asyncio.CancelledError:
            logger.info("scheduler loop stopped | job=%s", job_name)
            raise
