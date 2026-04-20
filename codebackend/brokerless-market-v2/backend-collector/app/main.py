from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.core.db import init_db
from app.core.logging import setup_logging, get_logger
from app.services.collector_scheduler import CollectorScheduler

setup_logging()
logger = get_logger(__name__)
scheduler = CollectorScheduler()


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info("collector service starting")
    await init_db()
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
