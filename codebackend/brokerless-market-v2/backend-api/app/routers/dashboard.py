from fastapi import APIRouter, Depends, Query

from app.core.cache import cache_service
from app.core.config import settings
from app.core.db import SessionLocal
from app.repositories.market_read_repo import MarketReadRepository

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


async def get_repo():
    async with SessionLocal() as session:
        yield MarketReadRepository(session)


@router.get("/overview")
async def get_dashboard_overview(
    exchange: str = Query(default="HSX"),
    sort: str = Query(default="actives"),
    limit: int = Query(default=5000, ge=1, le=10000),
    repo: MarketReadRepository = Depends(get_repo),
):
    cache_key = f"dashboard:overview:{exchange}:{sort}:{limit}"
    cached = await cache_service.get_json(cache_key)
    if cached is not None:
        return {"success": True, "data": cached}

    index_cards = await repo.get_index_cards()
    top_stocks = await repo.get_top_stocks(exchange=exchange, sort=sort, limit=limit)
    hourly = await repo.get_exchange_intraday_hourly(exchange=exchange)

    data = {
        "exchange": exchange.upper(),
        "index_cards": index_cards,
        "top_stocks": [
            {
                "symbol": row.symbol,
                "exchange": row.exchange,
                "price": row.price,
                "change_value": row.change_value,
                "change_percent": row.change_percent,
                "volume": row.volume,
                "trading_value": row.trading_value,
                "captured_at": row.captured_at,
            }
            for row in top_stocks
        ],
        "hourly_trading": hourly,
    }

    await cache_service.set_json(cache_key, data, ttl=settings.cache_ttl_seconds)
    return {"success": True, "data": data}


@router.get("/index-cards")
async def get_index_cards(repo: MarketReadRepository = Depends(get_repo)):
    data = await repo.get_index_cards()
    return {"success": True, "data": data}


@router.get("/top-stocks")
async def get_top_stocks(
    exchange: str = Query(default="HSX"),
    sort: str = Query(default="actives"),
    limit: int = Query(default=5000, ge=1, le=10000),
    repo: MarketReadRepository = Depends(get_repo),
):
    rows = await repo.get_top_stocks(exchange=exchange, sort=sort, limit=limit)
    data = [
        {
            "symbol": row.symbol,
            "exchange": row.exchange,
            "price": row.price,
            "change_value": row.change_value,
            "change_percent": row.change_percent,
            "volume": row.volume,
            "trading_value": row.trading_value,
            "captured_at": row.captured_at,
        }
        for row in rows
    ]
    return {"success": True, "data": data}