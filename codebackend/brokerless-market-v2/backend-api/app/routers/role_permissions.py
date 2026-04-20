from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, status

from app.core.db import SessionLocal
from app.repositories.auth_repo import AuthRepository
from app.schemas.market import ApiEnvelope
from app.services.auth_service import AuthService, hash_password
from app.services.role_permissions_service import RolePermissionsService

router = APIRouter(prefix="/api/role-permissions", tags=["role-permissions"])


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")

    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization scheme")
    return authorization[len(prefix) :].strip()


async def get_services():
    async with SessionLocal() as session:
        repo = AuthRepository(session)
        yield AuthService(repo), RolePermissionsService(repo), session


@router.get("/overview", response_model=ApiEnvelope)
async def get_role_permissions_overview(
    authorization: str | None = Header(default=None),
    role_key: str | None = Query(default=None),
    services: tuple[AuthService, RolePermissionsService, Any] = Depends(get_services),
):
    auth_service, permission_service, _ = services
    token = _extract_bearer_token(authorization)
    actor = await auth_service.get_current_user(token)
    data = await permission_service.get_overview(actor, selected_role_key=role_key)
    return ApiEnvelope(data=data)


@router.post("/users", response_model=ApiEnvelope)
async def create_role_permission_user(
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, RolePermissionsService, Any] = Depends(get_services),
):
    auth_service, permission_service, session = services
    token = _extract_bearer_token(authorization)
    actor = await auth_service.get_current_user(token)

    payload = dict(body)
    payload["password_hash"] = hash_password(str(body.get("password") or ""))
    data = await permission_service.create_user(actor, payload)
    await session.commit()
    return ApiEnvelope(data=data)


@router.patch("/users/{user_id}", response_model=ApiEnvelope)
async def update_role_permission_user(
    user_id: int,
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, RolePermissionsService, Any] = Depends(get_services),
):
    auth_service, permission_service, session = services
    token = _extract_bearer_token(authorization)
    actor = await auth_service.get_current_user(token)
    data = await permission_service.update_user(actor, user_id, body)
    await session.commit()
    return ApiEnvelope(data=data)


@router.post("/roles", response_model=ApiEnvelope)
async def create_role_permission_role(
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, RolePermissionsService, Any] = Depends(get_services),
):
    auth_service, permission_service, session = services
    token = _extract_bearer_token(authorization)
    actor = await auth_service.get_current_user(token)
    data = await permission_service.create_role(actor, body)
    await session.commit()
    return ApiEnvelope(data=data)


@router.patch("/roles/{role_key}", response_model=ApiEnvelope)
async def update_role_permission_role(
    role_key: str,
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, RolePermissionsService, Any] = Depends(get_services),
):
    auth_service, permission_service, session = services
    token = _extract_bearer_token(authorization)
    actor = await auth_service.get_current_user(token)
    data = await permission_service.update_role(actor, role_key, body)
    await session.commit()
    return ApiEnvelope(data=data)


@router.put("/roles/{role_key}/matrix", response_model=ApiEnvelope)
async def save_role_matrix(
    role_key: str,
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, RolePermissionsService, Any] = Depends(get_services),
):
    auth_service, permission_service, session = services
    token = _extract_bearer_token(authorization)
    actor = await auth_service.get_current_user(token)
    data = await permission_service.save_matrix(actor, role_key, list(body.get("matrix") or []))
    await session.commit()
    return ApiEnvelope(data=data)
