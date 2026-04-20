from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.core.db import SessionLocal
from app.repositories.auth_repo import AuthRepository
from app.schemas.auth import LoginRequest
from app.schemas.market import ApiEnvelope
from app.services.auth_service import AuthService, to_profile

router = APIRouter(prefix="/api/auth", tags=["auth"])


async def get_service():
    async with SessionLocal() as session:
        repo = AuthRepository(session)
        yield AuthService(repo)


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")

    prefix = "Bearer "
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authorization scheme")
    return authorization[len(prefix) :].strip()


@router.post("/login", response_model=ApiEnvelope)
async def login(body: LoginRequest, service: AuthService = Depends(get_service)):
    data = await service.login(
        company_code=body.company_code,
        username=body.username,
        password=body.password,
    )
    return ApiEnvelope(data=data.model_dump(mode="json"))


@router.get("/me", response_model=ApiEnvelope)
async def me(
    authorization: str | None = Header(default=None),
    service: AuthService = Depends(get_service),
):
    token = _extract_bearer_token(authorization)
    user = await service.get_current_user(token)
    return ApiEnvelope(data=to_profile(user).model_dump(mode="json"))
