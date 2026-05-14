from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status

from app.core.db import SessionLocal
from app.repositories.auth_repo import AuthRepository
from app.repositories.market_read_repo import MarketReadRepository
from app.schemas.ai_agent import AiChatRequest
from app.schemas.market import ApiEnvelope
from app.services.auth_service import AuthService
from app.services.ai_local_service import AiLocalService
from app.services.settings_service import SettingsService

router = APIRouter(prefix="/api/ai-local", tags=["ai-local"])


def _extract_optional_bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization scheme")
    return authorization[len(prefix) :].strip()


async def get_services():
    async with SessionLocal() as session:
        repo = MarketReadRepository(session)
        auth_repo = AuthRepository(session)
        yield AiLocalService(repo), AuthService(auth_repo), SettingsService(auth_repo)


@router.get("/overview", response_model=ApiEnvelope)
async def get_ai_local_overview(
    exchange: str = Query(default="HSX"),
    include_financial_analysis: bool = Query(default=False),
    authorization: str | None = Header(default=None),
    services: tuple[AiLocalService, AuthService, SettingsService] = Depends(get_services),
):
    service, auth_service, settings_service = services
    user_settings = None
    token = _extract_optional_bearer_token(authorization)
    if token:
        user = await auth_service.get_current_user(token)
        user_settings = await settings_service.get_settings(user)
    data = await service.get_overview(
        exchange=exchange,
        include_financial_analysis=include_financial_analysis,
        user_settings=user_settings,
    )
    return ApiEnvelope(data=data)


@router.post("/chat", response_model=ApiEnvelope)
async def chat_with_ai_local(
    body: AiChatRequest,
    authorization: str | None = Header(default=None),
    services: tuple[AiLocalService, AuthService, SettingsService] = Depends(get_services),
):
    service, auth_service, settings_service = services
    user_settings = None
    token = _extract_optional_bearer_token(authorization)
    if token:
        user = await auth_service.get_current_user(token)
        user_settings = await settings_service.get_settings(user)
    data = await service.chat(body, user_settings=user_settings)
    return ApiEnvelope(data=data)
