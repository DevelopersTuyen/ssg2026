from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

from app.core.config import settings

Base = declarative_base()
engine = create_async_engine(settings.database_url, future=True, pool_pre_ping=True)
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    from app.models.market import (  # noqa: F401
        MarketFinancialBalanceSheet,
        MarketFinancialCashFlow,
        MarketFinancialIncomeStatement,
        MarketFinancialNote,
        MarketFinancialRatio,
        MarketNewsArticle,
        MarketSymbol,
        MarketQuoteSnapshot,
        MarketIntradayPoint,
        MarketIndexDailyPoint,
        MarketIndexIntradayPoint,
        MarketSyncLog,
        MarketWatchlistItem,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
