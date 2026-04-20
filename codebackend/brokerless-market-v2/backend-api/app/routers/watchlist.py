from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException

from app.core.db import SessionLocal
from app.repositories.market_read_repo import MarketReadRepository
from app.repositories.watchlist_repo import WatchlistRepository
from app.schemas.market import ApiEnvelope

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])


class WatchlistCreateBody(BaseModel):
    symbol: str = Field(min_length=1)
    exchange: str | None = None
    note: str | None = None
    sort_order: int = 0
    is_active: bool = True


class WatchlistUpdateBody(BaseModel):
    note: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


async def get_session():
    async with SessionLocal() as session:
        yield session


@router.get("", response_model=ApiEnvelope)
async def list_watchlist(session=Depends(get_session)):
    watch_repo = WatchlistRepository(session)
    read_repo = MarketReadRepository(session)

    items = await watch_repo.list_items(active_only=False)
    latest_map = await read_repo.get_latest_intraday_map([item.symbol for item in items])

    data = []
    for item in items:
        latest = latest_map.get(item.symbol)
        data.append(
            {
                "id": item.id,
                "symbol": item.symbol,
                "exchange": item.exchange,
                "note": item.note,
                "sort_order": item.sort_order,
                "is_active": item.is_active,
                "created_at": item.created_at,
                "updated_at": item.updated_at,
                "latest_price": latest.price if latest else None,
                "latest_volume": latest.volume if latest else None,
                "latest_point_time": latest.point_time if latest else None,
            }
        )
    return ApiEnvelope(data=data)


@router.post("", response_model=ApiEnvelope)
async def add_watchlist_item(body: WatchlistCreateBody, session=Depends(get_session)):
    repo = WatchlistRepository(session)
    item = await repo.upsert_item(
        symbol=body.symbol,
        exchange=body.exchange,
        note=body.note,
        sort_order=body.sort_order,
        is_active=body.is_active,
    )
    await session.commit()
    return ApiEnvelope(
        data={
            "id": item.id,
            "symbol": item.symbol,
            "exchange": item.exchange,
            "note": item.note,
            "sort_order": item.sort_order,
            "is_active": item.is_active,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
    )


@router.patch("/{symbol}", response_model=ApiEnvelope)
async def update_watchlist_item(symbol: str, body: WatchlistUpdateBody, session=Depends(get_session)):
    repo = WatchlistRepository(session)
    item = await repo.update_item(
        symbol,
        note=body.note,
        sort_order=body.sort_order,
        is_active=body.is_active,
    )
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")

    await session.commit()
    return ApiEnvelope(
        data={
            "id": item.id,
            "symbol": item.symbol,
            "exchange": item.exchange,
            "note": item.note,
            "sort_order": item.sort_order,
            "is_active": item.is_active,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
    )


@router.delete("/{symbol}", response_model=ApiEnvelope)
async def delete_watchlist_item(symbol: str, session=Depends(get_session)):
    repo = WatchlistRepository(session)
    await repo.delete_item(symbol)
    await session.commit()
    return ApiEnvelope(data={"deleted": True, "symbol": symbol.upper()})