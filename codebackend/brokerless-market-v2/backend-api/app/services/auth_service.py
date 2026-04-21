from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException, status

from app.core.config import settings
from app.models.market import AppRole, AppUser
from app.repositories.auth_repo import AuthRepository
from app.schemas.auth import AuthSessionResponse, UserProfileResponse


ROLE_DEFINITIONS = [
    {
        "key": "admin",
        "name": "Admin",
        "description": "Toan quyen quan tri he thong, role va cau hinh.",
        "permissions": [
            "dashboard.view",
            "dashboard.export",
            "market-watch.view",
            "market-watch.export",
            "market-alerts.view",
            "market-alerts.export",
            "watchlist.view",
            "watchlist.create",
            "watchlist.update",
            "watchlist.delete",
            "watchlist.export",
            "watchlist.ai",
            "ai-agent.view",
            "ai-agent.create",
            "ai-agent.update",
            "ai-agent.export",
            "ai-agent.ai",
            "ai-local.view",
            "ai-local.create",
            "ai-local.update",
            "ai-local.export",
            "ai-local.ai",
            "strategy-hub.view",
            "strategy-settings.view",
            "strategy-settings.update",
            "screener.view",
            "scoring.view",
            "risk.view",
            "journal.view",
            "journal.create",
            "market-settings.view",
            "market-settings.update",
            "role-permissions.view",
            "role-permissions.create",
            "role-permissions.update",
            "role-permissions.delete",
            "role-permissions.approve",
            "role-permissions.export",
            "role-permissions.manage",
        ],
    },
    {
        "key": "analyst",
        "name": "Chuyen vien phan tich",
        "description": "Theo doi thi truong, watchlist, canh bao va AI.",
        "permissions": [
            "dashboard.view",
            "dashboard.export",
            "market-watch.view",
            "market-watch.export",
            "market-alerts.view",
            "watchlist.view",
            "watchlist.create",
            "watchlist.update",
            "watchlist.delete",
            "watchlist.export",
            "watchlist.ai",
            "ai-agent.view",
            "ai-agent.create",
            "ai-agent.ai",
            "ai-local.view",
            "ai-local.ai",
            "strategy-hub.view",
            "strategy-settings.view",
            "strategy-settings.update",
            "screener.view",
            "scoring.view",
            "risk.view",
            "journal.view",
            "journal.create",
            "market-settings.view",
            "market-settings.update",
            "role-permissions.view",
        ],
    },
    {
        "key": "trader",
        "name": "Trader",
        "description": "Theo doi co phieu va watchlist voi quyen tac nghiep nhanh.",
        "permissions": [
            "dashboard.view",
            "market-watch.view",
            "market-alerts.view",
            "watchlist.view",
            "watchlist.create",
            "watchlist.update",
            "watchlist.delete",
            "ai-agent.view",
            "ai-agent.ai",
            "ai-local.view",
            "ai-local.ai",
            "strategy-hub.view",
            "screener.view",
            "scoring.view",
            "risk.view",
            "journal.view",
            "journal.create",
            "market-settings.view",
            "market-settings.update",
        ],
    },
    {
        "key": "viewer",
        "name": "Viewer",
        "description": "Chi xem dashboard va thi truong.",
        "permissions": [
            "dashboard.view",
            "market-watch.view",
            "market-alerts.view",
            "ai-local.view",
            "strategy-hub.view",
            "screener.view",
            "scoring.view",
            "risk.view",
            "journal.view",
            "market-settings.view",
        ],
    },
]

DEMO_USERS = [
    {
        "company_code": "MW",
        "username": "admin.demo",
        "full_name": "Admin Demo",
        "email": "admin.demo@marketwatch.local",
        "department": "Dieu hanh",
        "password": "demo123",
        "role": "admin",
    },
    {
        "company_code": "MW",
        "username": "analyst.demo",
        "full_name": "Analyst Demo",
        "email": "analyst.demo@marketwatch.local",
        "department": "Phan tich",
        "password": "demo123",
        "role": "analyst",
    },
    {
        "company_code": "MW",
        "username": "trader.demo",
        "full_name": "Trader Demo",
        "email": "trader.demo@marketwatch.local",
        "department": "Trading",
        "password": "demo123",
        "role": "trader",
    },
]


class AuthService:
    def __init__(self, repo: AuthRepository) -> None:
        self.repo = repo

    async def login(self, *, company_code: str, username: str, password: str) -> AuthSessionResponse:
        user = await self.repo.get_user(company_code=company_code, username=username)
        if user is None or not user.is_active or not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid company code, username, or password",
            )

        return self._build_session(user)

    async def get_current_user(self, token: str) -> AppUser:
        payload = decode_token(token)
        company_code = str(payload.get("company_code") or "").upper()
        username = str(payload.get("username") or "").lower()

        if not company_code or not username:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

        user = await self.repo.get_user(company_code=company_code, username=username)
        if user is None or not user.is_active:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User is inactive or not found")
        return user

    def _build_session(self, user: AppUser) -> AuthSessionResponse:
        expires_at = datetime.now() + timedelta(hours=settings.auth_token_ttl_hours)
        payload = {
            "company_code": user.company_code,
            "username": user.username,
            "role": user.role,
            "permissions": list(user.permissions or []),
            "exp": int(expires_at.timestamp()),
        }
        token = encode_token(payload)
        return AuthSessionResponse(
            access_token=token,
            expires_at=expires_at,
            profile=to_profile(user),
        )


async def seed_demo_users(repo: AuthRepository) -> None:
    if not settings.auth_seed_demo_users:
        return

    role_lookup = {item["key"]: item for item in ROLE_DEFINITIONS}
    for item in DEMO_USERS:
        role = role_lookup[item["role"]]
        await repo.upsert_user(
            company_code=item["company_code"],
            username=item["username"],
            full_name=item["full_name"],
            email=item.get("email"),
            department=item.get("department"),
            password_hash=hash_password(item["password"]),
            role=item["role"],
            permissions=role["permissions"],
            is_active=True,
        )


async def seed_roles(repo: AuthRepository) -> None:
    if not settings.auth_seed_demo_users:
        return

    for item in ROLE_DEFINITIONS:
        await repo.upsert_role(
            company_code="MW",
            role_key=item["key"],
            name=item["name"],
            description=item["description"],
            permissions=item["permissions"],
            is_active=True,
        )


async def seed_permission_logs(repo: AuthRepository) -> None:
    existing = await repo.list_permission_logs("MW", limit=1)
    if existing:
        return

    await repo.add_permission_log(
        company_code="MW",
        actor_username="system",
        action="seed",
        target="roles",
        detail="Khoi tao role va permission mac dinh cho he thong.",
    )
    await repo.add_permission_log(
        company_code="MW",
        actor_username="system",
        action="seed",
        target="users",
        detail="Khoi tao tai khoan demo admin, analyst va trader.",
    )


async def seed_authorization_data(repo: AuthRepository) -> None:
    await seed_roles(repo)
    await seed_demo_users(repo)
    await seed_permission_logs(repo)


def to_profile(user: AppUser) -> UserProfileResponse:
    return UserProfileResponse(
        id=user.id,
        company_code=user.company_code,
        username=user.username,
        full_name=user.full_name,
        role=user.role,
        permissions=list(user.permissions or []),
    )


def has_permission(user: AppUser | UserProfileResponse, permission: str) -> bool:
    permissions = set(getattr(user, "permissions", []) or [])
    if permission in permissions:
        return True

    if permission == "role-permissions.manage":
        return any(item in permissions for item in {"role-permissions.update", "role-permissions.approve"})
    return False


def require_permission(user: AppUser | UserProfileResponse, permission: str) -> None:
    if has_permission(user, permission):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=f"Missing permission: {permission}")


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    rounds = 120000
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), rounds)
    return f"pbkdf2_sha256${rounds}${salt}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, rounds_str, salt, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        rounds = int(rounds_str)
    except ValueError:
        return False

    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), rounds).hex()
    return hmac.compare_digest(candidate, digest_hex)


def encode_token(payload: dict[str, Any]) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    encoded_header = _b64url_encode(json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    encoded_payload = _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = _sign(f"{encoded_header}.{encoded_payload}".encode("utf-8"))
    return f"{encoded_header}.{encoded_payload}.{signature}"


def decode_token(token: str) -> dict[str, Any]:
    try:
        encoded_header, encoded_payload, encoded_signature = token.split(".", 2)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Malformed token") from exc

    expected = _sign(f"{encoded_header}.{encoded_payload}".encode("utf-8"))
    if not hmac.compare_digest(expected, encoded_signature):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token signature")

    try:
        payload = json.loads(_b64url_decode(encoded_payload).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload") from exc

    exp = int(payload.get("exp") or 0)
    if exp <= int(datetime.now().timestamp()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    return payload


def _sign(value: bytes) -> str:
    digest = hmac.new(settings.auth_token_secret.encode("utf-8"), value, hashlib.sha256).digest()
    return _b64url_encode(digest)


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}")
