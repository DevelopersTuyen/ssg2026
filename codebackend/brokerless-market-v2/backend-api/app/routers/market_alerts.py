from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.db import SessionLocal
from app.repositories.market_read_repo import MarketReadRepository
from app.schemas.market import ApiEnvelope
from app.services.alert_delivery_service import AlertDeliveryService
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


@router.post("/events/refresh", response_model=ApiEnvelope)
async def refresh_market_alert_events(exchange: str = Query(default="HSX")):
    async with SessionLocal() as session:
        data = await AlertDeliveryService(session).materialize_market_alerts(exchange=exchange)
        await session.commit()
    return ApiEnvelope(data=data)


@router.get("/events", response_model=ApiEnvelope)
async def list_market_alert_events(
    status: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
):
    async with SessionLocal() as session:
        data = await AlertDeliveryService(session).list_events(status=status, limit=limit)
    return ApiEnvelope(data=data)


@router.post("/events/deliver", response_model=ApiEnvelope)
async def deliver_market_alert_events(limit: int = Query(default=50, ge=1, le=500)):
    async with SessionLocal() as session:
        data = await AlertDeliveryService(session).deliver_pending(limit=limit)
        await session.commit()
    return ApiEnvelope(data=data)
