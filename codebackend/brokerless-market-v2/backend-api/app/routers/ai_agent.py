from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.core.db import SessionLocal
from app.repositories.market_read_repo import MarketReadRepository
from app.schemas.ai_agent import AiChatRequest
from app.schemas.market import ApiEnvelope
from app.services.ai_agent_service import AiAgentService

router = APIRouter(prefix="/api/ai-agent", tags=["ai-agent"])


async def get_service():
    async with SessionLocal() as session:
        repo = MarketReadRepository(session)
        yield AiAgentService(repo)


@router.get("/overview", response_model=ApiEnvelope)
async def get_ai_agent_overview(
    exchange: str = Query(default="HSX"),
    service: AiAgentService = Depends(get_service),
):
    data = await service.get_overview(exchange=exchange)
    return ApiEnvelope(data=data)


@router.post("/chat", response_model=ApiEnvelope)
async def chat_with_ai_agent(
    body: AiChatRequest,
    service: AiAgentService = Depends(get_service),
):
    data = await service.chat(body)
    return ApiEnvelope(data=data)
