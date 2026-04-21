from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Header, HTTPException, status

from app.core.db import SessionLocal
from app.repositories.auth_repo import AuthRepository
from app.repositories.market_read_repo import MarketReadRepository
from app.schemas.market import ApiEnvelope
from app.services.auth_service import AuthService, require_permission
from app.services.settings_service import SettingsService, SyncStatusService

router = APIRouter(prefix="/api/settings", tags=["settings"])


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
        market_repo = MarketReadRepository(session)
        yield AuthService(auth_repo), SettingsService(auth_repo), SyncStatusService(market_repo), session


@router.get("/me", response_model=ApiEnvelope)
async def get_my_settings(
    authorization: str | None = Header(default=None),
    services: tuple[AuthService, SettingsService, SyncStatusService, Any] = Depends(get_services),
):
    auth_service, settings_service, _, _session = services
    token = _extract_bearer_token(authorization)
    user = await auth_service.get_current_user(token)
    require_permission(user, "market-settings.view")
    data = await settings_service.get_settings(user)
    return ApiEnvelope(data=data)


@router.put("/me", response_model=ApiEnvelope)
async def save_my_settings(
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, SettingsService, SyncStatusService, Any] = Depends(get_services),
):
    auth_service, settings_service, _, session = services
    token = _extract_bearer_token(authorization)
    user = await auth_service.get_current_user(token)
    require_permission(user, "market-settings.update")
    data = await settings_service.save_settings(user, body)
    await session.commit()
    return ApiEnvelope(data=data)


@router.post("/me/reset", response_model=ApiEnvelope)
async def reset_my_settings(
    authorization: str | None = Header(default=None),
    services: tuple[AuthService, SettingsService, SyncStatusService, Any] = Depends(get_services),
):
    auth_service, settings_service, _, session = services
    token = _extract_bearer_token(authorization)
    user = await auth_service.get_current_user(token)
    require_permission(user, "market-settings.update")
    data = await settings_service.reset_settings(user)
    await session.commit()
    return ApiEnvelope(data=data)


@router.get("/sync-status", response_model=ApiEnvelope)
async def get_sync_status(
    authorization: str | None = Header(default=None),
    services: tuple[AuthService, SettingsService, SyncStatusService, Any] = Depends(get_services),
):
    auth_service, _settings_service, sync_status_service, _session = services
    token = _extract_bearer_token(authorization)
    user = await auth_service.get_current_user(token)
    require_permission(user, "market-settings.view")
    data = await sync_status_service.get_status()
    return ApiEnvelope(data=data)
