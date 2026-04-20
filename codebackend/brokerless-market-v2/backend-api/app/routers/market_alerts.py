from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.db import SessionLocal
from app.repositories.market_read_repo import MarketReadRepository
from app.schemas.market import ApiEnvelope
from app.services.market_alerts_service import MarketAlertsService

router = APIRouter(prefix="/api/market-alerts", tags=["market-alerts"])


async def get_service():
    async with SessionLocal() as session:
        repo = MarketReadRepository(session)
        yield MarketAlertsService(repo)


@router.get("/overview", response_model=ApiEnvelope)
async def get_market_alerts_overview(
    exchange: str = Query(default="HSX"),
    service: MarketAlertsService = Depends(get_service),
):
    data = await service.get_overview(exchange=exchange)
    return ApiEnvelope(data=data)
