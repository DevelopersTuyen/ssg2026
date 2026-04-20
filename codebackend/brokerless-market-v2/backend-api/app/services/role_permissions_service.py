from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException, status

from app.models.market import AppRole, AppUser
from app.repositories.auth_repo import AuthRepository
from app.services.auth_service import has_permission, require_permission

PERMISSION_ACTIONS = ["view", "create", "update", "delete", "approve", "export", "ai"]
PERMISSION_MODULES = [
    ("dashboard", "Dashboard"),
    ("market-watch", "Market Watch"),
    ("market-alerts", "Canh bao"),
    ("watchlist", "Watchlist"),
    ("ai-agent", "AI Agent"),
    ("market-settings", "Cai dat"),
    ("role-permissions", "Phan quyen"),
]


class RolePermissionsService:
    def __init__(self, repo: AuthRepository) -> None:
        self.repo = repo

    async def get_overview(self, actor: AppUser, selected_role_key: str | None = None) -> dict[str, Any]:
        require_permission(actor, "role-permissions.view")

        roles = await self.repo.list_roles(actor.company_code)
        users = await self.repo.list_users()
        logs = await self.repo.list_permission_logs(actor.company_code, limit=50)
        role_counts = await self.repo.count_users_by_role(actor.company_code)

        active_roles = [item for item in roles if item.company_code == actor.company_code]
        chosen_role = self._resolve_selected_role(active_roles, selected_role_key)

        return {
            "selected_role_key": chosen_role.role_key,
            "can_manage": has_permission(actor, "role-permissions.manage"),
            "users": [
                {
                    "id": item.id,
                    "username": item.username,
                    "full_name": item.full_name,
                    "department": item.department,
                    "role_key": item.role,
                    "email": item.email,
                    "status": "active" if item.is_active else "inactive",
                    "company_code": item.company_code,
                }
                for item in users
                if item.company_code == actor.company_code
            ],
            "roles": [
                {
                    "id": item.id,
                    "key": item.role_key,
                    "name": item.name,
                    "description": item.description,
                    "user_count": role_counts.get(item.role_key, 0),
                    "status": "active" if item.is_active else "inactive",
                    "permissions_count": len(item.permissions or []),
                }
                for item in active_roles
            ],
            "matrix": self._build_matrix(chosen_role.permissions or []),
            "logs": [
                {
                    "time": log.created_at.isoformat(),
                    "user": log.actor_username,
                    "action": log.action,
                    "target": log.target,
                    "detail": log.detail,
                }
                for log in logs
            ],
        }

    async def create_user(self, actor: AppUser, payload: dict[str, Any]) -> dict[str, Any]:
        require_permission(actor, "role-permissions.manage")
        role_key = str(payload.get("role_key") or "").strip().lower()
        role = await self.repo.get_role(actor.company_code, role_key)
        if role is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role not found")

        username = str(payload.get("username") or "").strip().lower()
        full_name = str(payload.get("full_name") or "").strip()
        password_hash = str(payload.get("password_hash") or "")
        if not username or not full_name or not password_hash:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing required user fields")

        user = await self.repo.upsert_user(
            company_code=actor.company_code,
            username=username,
            full_name=full_name,
            email=str(payload.get("email") or "").strip() or None,
            department=str(payload.get("department") or "").strip() or None,
            password_hash=password_hash,
            role=role.role_key,
            permissions=list(role.permissions or []),
            is_active=True,
        )
        await self.repo.add_permission_log(
            company_code=actor.company_code,
            actor_username=actor.username,
            action="create-user",
            target=f"user:{user.username}",
            detail=f"Tao user moi va gan role {role.role_key}.",
        )
        return {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "department": user.department,
            "role_key": user.role,
            "email": user.email,
            "status": "active" if user.is_active else "inactive",
        }

    async def update_user(self, actor: AppUser, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        require_permission(actor, "role-permissions.manage")
        item = await self.repo.get_user_by_id(user_id)
        if item is None or item.company_code != actor.company_code:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        role_key = payload.get("role_key")
        permissions: list[str] | None = None
        if role_key is not None:
            role = await self.repo.get_role(actor.company_code, str(role_key).strip().lower())
            if role is None:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role not found")
            role_key = role.role_key
            permissions = list(role.permissions or [])

        updated = await self.repo.update_user(
            user_id,
            full_name=str(payload.get("full_name")).strip() if payload.get("full_name") is not None else None,
            email=str(payload.get("email")).strip() if payload.get("email") is not None else None,
            department=str(payload.get("department")).strip() if payload.get("department") is not None else None,
            role=role_key,
            permissions=permissions,
            is_active=payload.get("is_active"),
        )
        if updated is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        await self.repo.add_permission_log(
            company_code=actor.company_code,
            actor_username=actor.username,
            action="update-user",
            target=f"user:{updated.username}",
            detail=f"Cap nhat role/trang thai cho user {updated.username}.",
        )
        return {
            "id": updated.id,
            "username": updated.username,
            "full_name": updated.full_name,
            "department": updated.department,
            "role_key": updated.role,
            "email": updated.email,
            "status": "active" if updated.is_active else "inactive",
        }

    async def create_role(self, actor: AppUser, payload: dict[str, Any]) -> dict[str, Any]:
        require_permission(actor, "role-permissions.manage")
        role_key = str(payload.get("key") or "").strip().lower()
        name = str(payload.get("name") or "").strip()
        if not role_key or not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing role key or name")

        item = await self.repo.upsert_role(
            company_code=actor.company_code,
            role_key=role_key,
            name=name,
            description=str(payload.get("description") or "").strip() or None,
            permissions=[],
            is_active=True,
        )
        await self.repo.add_permission_log(
            company_code=actor.company_code,
            actor_username=actor.username,
            action="create-role",
            target=f"role:{item.role_key}",
            detail=f"Tao vai tro {item.name}.",
        )
        return {
            "id": item.id,
            "key": item.role_key,
            "name": item.name,
            "description": item.description,
            "status": "active" if item.is_active else "inactive",
            "permissions_count": len(item.permissions or []),
        }

    async def update_role(self, actor: AppUser, role_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        require_permission(actor, "role-permissions.manage")
        role = await self.repo.get_role(actor.company_code, role_key.lower())
        if role is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

        updated = await self.repo.upsert_role(
            company_code=actor.company_code,
            role_key=role.role_key,
            name=str(payload.get("name") or role.name).strip() or role.name,
            description=(
                str(payload.get("description")).strip()
                if payload.get("description") is not None
                else role.description
            ),
            permissions=list(role.permissions or []),
            is_active=bool(payload.get("is_active")) if payload.get("is_active") is not None else role.is_active,
        )
        await self.repo.add_permission_log(
            company_code=actor.company_code,
            actor_username=actor.username,
            action="update-role",
            target=f"role:{updated.role_key}",
            detail=f"Cap nhat mo ta/trang thai cho role {updated.role_key}.",
        )
        return {
            "id": updated.id,
            "key": updated.role_key,
            "name": updated.name,
            "description": updated.description,
            "status": "active" if updated.is_active else "inactive",
            "permissions_count": len(updated.permissions or []),
        }

    async def save_matrix(self, actor: AppUser, role_key: str, matrix_rows: list[dict[str, Any]]) -> dict[str, Any]:
        require_permission(actor, "role-permissions.manage")
        role = await self.repo.get_role(actor.company_code, role_key.lower())
        if role is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

        permissions = self._permissions_from_matrix(matrix_rows)
        updated = await self.repo.upsert_role(
            company_code=actor.company_code,
            role_key=role.role_key,
            name=role.name,
            description=role.description,
            permissions=permissions,
            is_active=role.is_active,
        )
        await self.repo.sync_role_permissions_to_users(actor.company_code, updated.role_key, permissions)
        await self.repo.add_permission_log(
            company_code=actor.company_code,
            actor_username=actor.username,
            action="save-matrix",
            target=f"role:{updated.role_key}",
            detail=f"Luu ma tran quyen cho role {updated.role_key} voi {len(permissions)} permission.",
        )
        return {
            "role_key": updated.role_key,
            "permissions_count": len(permissions),
            "matrix": self._build_matrix(permissions),
        }

    def _resolve_selected_role(self, roles: list[AppRole], selected_role_key: str | None) -> AppRole:
        if not roles:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No roles configured")
        if selected_role_key:
            for item in roles:
                if item.role_key == selected_role_key:
                    return item
        return roles[0]

    def _build_matrix(self, permissions: list[str]) -> list[dict[str, Any]]:
        permission_set = set(permissions or [])
        rows: list[dict[str, Any]] = []
        for module_key, module_label in PERMISSION_MODULES:
            row: dict[str, Any] = {
                "module_key": module_key,
                "module": module_label,
            }
            for action in PERMISSION_ACTIONS:
                row[action] = f"{module_key}.{action}" in permission_set
            rows.append(row)
        return rows

    def _permissions_from_matrix(self, rows: list[dict[str, Any]]) -> list[str]:
        permissions: list[str] = []
        valid_modules = {key for key, _ in PERMISSION_MODULES}
        for row in rows:
            module_key = str(row.get("module_key") or "").strip()
            if module_key not in valid_modules:
                continue
            for action in PERMISSION_ACTIONS:
                if bool(row.get(action)):
                    permissions.append(f"{module_key}.{action}")

        if any(item.startswith("role-permissions.") for item in permissions):
            permissions.append("role-permissions.manage")
        return sorted(set(permissions))
