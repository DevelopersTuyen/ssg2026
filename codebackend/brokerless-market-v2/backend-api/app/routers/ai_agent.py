from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.core.db import SessionLocal
from app.repositories.auth_repo import AuthRepository
from app.repositories.market_read_repo import MarketReadRepository
from app.schemas.ai_agent import AiChatRequest
from app.schemas.market import ApiEnvelope
from app.services.auth_service import AuthService, require_permission
from app.services.ai_agent_service import AiAgentService
from app.services.settings_service import SettingsService

router = APIRouter(prefix="/api/ai-agent", tags=["ai-agent"])


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")

    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization scheme")
    return authorization[len(prefix) :].strip()


async def get_services():
    async with SessionLocal() as session:
        auth_repo = AuthRepository(session)
        repo = MarketReadRepository(session)
        yield AuthService(auth_repo), SettingsService(auth_repo), AiAgentService(repo), session


@router.get("/overview", response_model=ApiEnvelope)
async def get_ai_agent_overview(
    exchange: str = Query(default="HSX"),
    authorization: str | None = Header(default=None),
    services: tuple[AuthService, SettingsService, AiAgentService, Any] = Depends(get_services),
):
    auth_service, settings_service, service, _session = services
    token = _extract_bearer_token(authorization)
    user = await auth_service.get_current_user(token)
    require_permission(user, "ai-agent.view")
    user_settings = await settings_service.get_settings(user)
    data = await service.get_overview(exchange=exchange, user_settings=user_settings)
    return ApiEnvelope(data=data)


@router.post("/chat", response_model=ApiEnvelope)
async def chat_with_ai_agent(
    body: AiChatRequest,
    authorization: str | None = Header(default=None),
    services: tuple[AuthService, SettingsService, AiAgentService, Any] = Depends(get_services),
):
    auth_service, settings_service, service, _session = services
    token = _extract_bearer_token(authorization)
    user = await auth_service.get_current_user(token)
    require_permission(user, "ai-agent.ai")
    user_settings = await settings_service.get_settings(user)
    data = await service.chat(body, user_settings=user_settings)
    return ApiEnvelope(data=data)
