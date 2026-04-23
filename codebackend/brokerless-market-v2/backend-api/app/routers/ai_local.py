from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.db import SessionLocal
from app.repositories.market_read_repo import MarketReadRepository
from app.schemas.ai_agent import AiChatRequest
from app.schemas.market import ApiEnvelope
from app.services.ai_local_service import AiLocalService

router = APIRouter(prefix="/api/ai-local", tags=["ai-local"])


async def get_service():
    async with SessionLocal() as session:
        repo = MarketReadRepository(session)
        yield AiLocalService(repo)


@router.get("/overview", response_model=ApiEnvelope)
async def get_ai_local_overview(
    exchange: str = Query(default="HSX"),
    include_financial_analysis: bool = Query(default=False),
    service: AiLocalService = Depends(get_service),
):
    data = await service.get_overview(
        exchange=exchange,
        include_financial_analysis=include_financial_analysis,
    )
    return ApiEnvelope(data=data)


@router.post("/chat", response_model=ApiEnvelope)
async def chat_with_ai_local(
    body: AiChatRequest,
    service: AiLocalService = Depends(get_service),
):
    data = await service.chat(body)
    return ApiEnvelope(data=data)
