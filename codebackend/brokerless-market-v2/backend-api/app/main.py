import asyncio
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.db import init_db
from app.core.logging import setup_logging, get_logger
from app.services.foundation_worker import FoundationWorker
from app.services.strategy_precompute_service import StrategyPrecomputeWorker
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
    settings,
    role_permissions,
    strategy,
)

setup_logging()
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("api service starting")
    await init_db()
    foundation_worker = FoundationWorker()
    strategy_precompute_worker = StrategyPrecomputeWorker()
    foundation_task = asyncio.create_task(
        foundation_worker.run(),
        name="foundation-worker",
    )
    strategy_precompute_task = asyncio.create_task(
        strategy_precompute_worker.run(),
        name="strategy-precompute-worker",
    )
    try:
        yield
    finally:
        foundation_worker.stop()
        strategy_precompute_worker.stop()
        foundation_task.cancel()
        strategy_precompute_task.cancel()
        with suppress(asyncio.CancelledError):
            await foundation_task
        with suppress(asyncio.CancelledError):
            await strategy_precompute_task
        logger.info("api service stopping")


app = FastAPI(
    title="Brokerless Market API",
    version="2.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:8100",
        "http://127.0.0.1:8100",
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        "http://14.224.134.120:8100",
        "http://14.224.134.120:8000",
        "http://14.224.134.120",
        "http://192.168.101.170:8100",
        "capacitor://localhost",
        "ionic://localhost",
    ],
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
app.include_router(settings.router)
app.include_router(role_permissions.router)
app.include_router(strategy.router)
