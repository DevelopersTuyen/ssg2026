from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, status

from app.core.db import SessionLocal
from app.repositories.auth_repo import AuthRepository
from app.schemas.market import ApiEnvelope
from app.services.auth_service import AuthService
from app.services.strategy_service import StrategyService

router = APIRouter(prefix="/api/strategy", tags=["strategy"])


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
        yield AuthService(repo), StrategyService(session), session


@router.get("/overview", response_model=ApiEnvelope)
async def get_strategy_overview(
    authorization: str | None = Header(default=None),
    profile_id: int | None = Query(default=None),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.get_overview(user, profile_id=profile_id)
    return ApiEnvelope(data=data)


@router.get("/profiles", response_model=ApiEnvelope)
async def list_strategy_profiles(
    authorization: str | None = Header(default=None),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.list_profiles(user)
    return ApiEnvelope(data=data)


@router.post("/profiles", response_model=ApiEnvelope)
async def create_strategy_profile(
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, session = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.create_profile(user, body)
    await session.commit()
    return ApiEnvelope(data=data)


@router.post("/profiles/{profile_id}/activate", response_model=ApiEnvelope)
async def activate_strategy_profile(
    profile_id: int,
    authorization: str | None = Header(default=None),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, session = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.activate_profile(user, profile_id)
    await session.commit()
    return ApiEnvelope(data=data)


@router.get("/profiles/{profile_id}/config", response_model=ApiEnvelope)
async def get_strategy_profile_config(
    profile_id: int,
    authorization: str | None = Header(default=None),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.get_profile_config(user, profile_id)
    return ApiEnvelope(data=data)


@router.put("/profiles/{profile_id}/config", response_model=ApiEnvelope)
async def save_strategy_profile_config(
    profile_id: int,
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, session = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.save_profile_config(user, profile_id, body)
    await session.commit()
    return ApiEnvelope(data=data)


@router.post("/profiles/{profile_id}/publish", response_model=ApiEnvelope)
async def publish_strategy_profile(
    profile_id: int,
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, session = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.publish_profile(user, profile_id, summary=body.get("summary"))
    await session.commit()
    return ApiEnvelope(data=data)


@router.get("/scoring/rankings", response_model=ApiEnvelope)
async def get_strategy_rankings(
    authorization: str | None = Header(default=None),
    profile_id: int = Query(...),
    exchange: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    watchlist_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.get_rankings(
        user,
        profile_id,
        exchange=exchange,
        keyword=keyword,
        watchlist_only=watchlist_only,
        page=page,
        page_size=page_size,
    )
    return ApiEnvelope(data=data)


@router.get("/scoring/symbol/{symbol}", response_model=ApiEnvelope)
async def get_strategy_symbol_score(
    symbol: str,
    authorization: str | None = Header(default=None),
    profile_id: int = Query(...),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.get_symbol_scoring(user, profile_id, symbol)
    return ApiEnvelope(data=data)


@router.get("/screener/run", response_model=ApiEnvelope)
async def run_strategy_screener(
    authorization: str | None = Header(default=None),
    profile_id: int = Query(...),
    exchange: str | None = Query(default=None),
    keyword: str | None = Query(default=None),
    watchlist_only: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.run_screener(
        user,
        profile_id,
        exchange=exchange,
        keyword=keyword,
        watchlist_only=watchlist_only,
        page=page,
        page_size=page_size,
    )
    return ApiEnvelope(data=data)


@router.get("/risk/overview", response_model=ApiEnvelope)
async def get_strategy_risk_overview(
    authorization: str | None = Header(default=None),
    profile_id: int = Query(...),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.get_risk_overview(user, profile_id)
    return ApiEnvelope(data=data)


@router.get("/journal", response_model=ApiEnvelope)
async def list_strategy_journal(
    authorization: str | None = Header(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    exchange: str | None = Query(default=None),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.list_journal(user, limit=limit, exchange=exchange)
    return ApiEnvelope(data=data)


@router.get("/order-statements", response_model=ApiEnvelope)
async def list_strategy_order_statements(
    authorization: str | None = Header(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    exchange: str | None = Query(default=None),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.list_order_statements(user, limit=limit, exchange=exchange)
    return ApiEnvelope(data=data)


@router.get("/operations/overview", response_model=ApiEnvelope)
async def get_strategy_operations_overview(
    authorization: str | None = Header(default=None),
    profile_id: int | None = Query(default=None),
    exchange: str | None = Query(default=None),
    limit: int = Query(default=120, ge=20, le=300),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.get_operations_overview(
        user,
        profile_id=profile_id,
        exchange=exchange,
        limit=limit,
    )
    return ApiEnvelope(data=data)


@router.get("/portfolio/overview", response_model=ApiEnvelope)
async def get_strategy_portfolio_overview(
    authorization: str | None = Header(default=None),
    profile_id: int | None = Query(default=None),
    exchange: str | None = Query(default=None),
    limit: int = Query(default=300, ge=50, le=500),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.get_portfolio_overview(
        user,
        profile_id=profile_id,
        exchange=exchange,
        limit=limit,
    )
    return ApiEnvelope(data=data)


@router.get("/actions/overview", response_model=ApiEnvelope)
async def get_strategy_action_workflow_overview(
    authorization: str | None = Header(default=None),
    profile_id: int | None = Query(default=None),
    exchange: str | None = Query(default=None),
    limit: int = Query(default=100, ge=20, le=300),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.get_action_workflow_overview(
        user,
        profile_id=profile_id,
        exchange=exchange,
        limit=limit,
    )
    return ApiEnvelope(data=data)


@router.get("/actions/history", response_model=ApiEnvelope)
async def get_strategy_action_workflow_history(
    authorization: str | None = Header(default=None),
    profile_id: int | None = Query(default=None),
    exchange: str | None = Query(default=None),
    status_value: str | None = Query(default=None, alias="status"),
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=120, ge=20, le=400),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.get_action_workflow_history(
        user,
        profile_id=profile_id,
        exchange=exchange,
        status_value=status_value,
        days=days,
        limit=limit,
    )
    return ApiEnvelope(data=data)


@router.get("/review-report", response_model=ApiEnvelope)
async def get_strategy_review_report(
    authorization: str | None = Header(default=None),
    profile_id: int | None = Query(default=None),
    exchange: str | None = Query(default=None),
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=300, ge=50, le=500),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, _ = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.get_review_report(
        user,
        profile_id=profile_id,
        exchange=exchange,
        days=days,
        limit=limit,
    )
    return ApiEnvelope(data=data)


@router.post("/actions", response_model=ApiEnvelope)
async def create_strategy_action_workflow(
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, session = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.create_action_workflow_entry(user, body)
    await session.commit()
    return ApiEnvelope(data=data)


@router.put("/actions/{action_id}/status", response_model=ApiEnvelope)
async def update_strategy_action_workflow_status(
    action_id: int,
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, session = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.update_action_workflow_status(user, action_id, body)
    await session.commit()
    return ApiEnvelope(data=data)


@router.post("/journal", response_model=ApiEnvelope)
async def create_strategy_journal(
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, session = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.create_journal_entry(user, body)
    await session.commit()
    return ApiEnvelope(data=data)


@router.post("/order-statements", response_model=ApiEnvelope)
async def create_strategy_order_statement(
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, session = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.create_order_statement_entry(user, body)
    await session.commit()
    return ApiEnvelope(data=data)


@router.put("/journal/{entry_id}", response_model=ApiEnvelope)
async def update_strategy_journal(
    entry_id: int,
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, session = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.update_journal_entry(user, entry_id, body)
    await session.commit()
    return ApiEnvelope(data=data)


@router.put("/order-statements/{entry_id}", response_model=ApiEnvelope)
async def update_strategy_order_statement(
    entry_id: int,
    authorization: str | None = Header(default=None),
    body: dict[str, Any] = Body(default_factory=dict),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, session = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.update_order_statement_entry(user, entry_id, body)
    await session.commit()
    return ApiEnvelope(data=data)


@router.delete("/journal/{entry_id}", response_model=ApiEnvelope)
async def delete_strategy_journal(
    entry_id: int,
    authorization: str | None = Header(default=None),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, session = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.delete_journal_entry(user, entry_id)
    await session.commit()
    return ApiEnvelope(data=data)


@router.delete("/order-statements/{entry_id}", response_model=ApiEnvelope)
async def delete_strategy_order_statement(
    entry_id: int,
    authorization: str | None = Header(default=None),
    services: tuple[AuthService, StrategyService, Any] = Depends(get_services),
):
    auth_service, strategy_service, session = services
    user = await auth_service.get_current_user(_extract_bearer_token(authorization))
    data = await strategy_service.delete_order_statement_entry(user, entry_id)
    await session.commit()
    return ApiEnvelope(data=data)
