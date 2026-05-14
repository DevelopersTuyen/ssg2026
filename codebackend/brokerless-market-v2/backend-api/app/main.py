import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.db import init_db
from app.core.logging import setup_logging, get_logger
from app.services.foundation_worker import FoundationWorker
from app.services.strategy_precompute_service import StrategyPrecomputeWorker
from app.services.workflow_auto_executor_service import WorkflowAutoExecutorWorker
from app.routers import (
    health,
    dashboard,
    market,
    live,
    watchlist,
    ai_agent,
    ai_local,
    auth,
    market_alerts,
    settings as settings_router,
    role_permissions,
    strategy,
)

setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("api service starting")
    if settings.auto_init_db_on_startup:
        await init_db()
    else:
        logger.info("skip init_db on startup because AUTO_INIT_DB_ON_STARTUP=false")
    foundation_worker = FoundationWorker()
    strategy_precompute_worker = StrategyPrecomputeWorker()
    workflow_auto_executor_worker = WorkflowAutoExecutorWorker()
    foundation_task = asyncio.create_task(
        foundation_worker.run(),
        name="foundation-worker",
    )
    strategy_precompute_task = asyncio.create_task(
        strategy_precompute_worker.run(),
        name="strategy-precompute-worker",
    )
    workflow_auto_executor_task = asyncio.create_task(
        workflow_auto_executor_worker.run(),
        name="workflow-auto-executor-worker",
    )
    try:
        yield
    finally:
        foundation_worker.stop()
        strategy_precompute_worker.stop()
        workflow_auto_executor_worker.stop()
        foundation_task.cancel()
        strategy_precompute_task.cancel()
        workflow_auto_executor_task.cancel()
        with suppress(asyncio.CancelledError):
            await foundation_task
        with suppress(asyncio.CancelledError):
            await strategy_precompute_task
        with suppress(asyncio.CancelledError):
            await workflow_auto_executor_task
        logger.info("api service stopping")


app = FastAPI(
    title="Brokerless Market API",
    version="2.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(market.router)
app.include_router(live.router)
app.include_router(watchlist.router)
app.include_router(ai_agent.router)
app.include_router(ai_local.router)
app.include_router(market_alerts.router)
app.include_router(settings_router.router)
app.include_router(role_permissions.router)
app.include_router(strategy.router)
