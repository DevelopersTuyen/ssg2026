from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

from app.core.config import settings

Base = declarative_base()
engine = create_async_engine(settings.database_url, future=True, pool_pre_ping=True)
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    from app.models.market import (  # noqa: F401
        AppPermissionLog,
        AppRole,
        AppUser,
        AppUserSetting,
        MarketSymbol,
        MarketQuoteSnapshot,
        MarketIntradayPoint,
        MarketIndexDailyPoint,
        MarketIndexIntradayPoint,
        MarketSyncLog,
        MarketWatchlistItem,
    )
    from app.repositories.auth_repo import AuthRepository
    from app.services.auth_service import seed_authorization_data

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.exec_driver_sql("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email VARCHAR(255)")
        await conn.exec_driver_sql("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS department VARCHAR(120)")

    async with SessionLocal() as session:
        await seed_authorization_data(AuthRepository(session))
        await session.commit()
