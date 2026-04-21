from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.config import settings
from app.core.db import init_db
from app.core.logging import setup_logging, get_logger
from app.services.collector_scheduler import CollectorScheduler
from app.services.symbol_seed_service import SymbolSeedService

setup_logging()
logger = get_logger(__name__)
scheduler = CollectorScheduler()
symbol_seed_service = SymbolSeedService()


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("collector service starting")
    await init_db()
    if settings.seed_symbols_on_startup:
        await symbol_seed_service.run()
    await scheduler.start()
    try:
        yield
    finally:
        logger.info("collector service stopping")
        await scheduler.stop()


app = FastAPI(
    title="Brokerless Market Collector",
    version="2.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "collector"}
