from __future__ import annotations

from datetime import datetime

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.json_utils import make_json_safe
from app.models.market import AppPermissionLog, AppRole, AppUser, AppUserSetting


class AuthRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_user(self, company_code: str, username: str) -> AppUser | None:
        result = await self.session.execute(
            select(AppUser).where(
                AppUser.company_code == company_code.upper(),
                AppUser.username == username.lower(),
            )
        )
        return result.scalar_one_or_none()

    async def list_users(self) -> list[AppUser]:
        result = await self.session.execute(select(AppUser).order_by(AppUser.company_code.asc(), AppUser.username.asc()))
        return result.scalars().all()

    async def list_active_users(self) -> list[AppUser]:
        result = await self.session.execute(
            select(AppUser)
            .where(AppUser.is_active.is_(True))
            .order_by(AppUser.company_code.asc(), AppUser.username.asc())
        )
        return result.scalars().all()

    async def get_user_by_id(self, user_id: int) -> AppUser | None:
        result = await self.session.execute(select(AppUser).where(AppUser.id == user_id))
        return result.scalar_one_or_none()

    async def upsert_user(
        self,
        *,
        company_code: str,
        username: str,
        full_name: str,
        email: str | None = None,
        department: str | None = None,
        password_hash: str,
        role: str,
        permissions: list[str],
        is_active: bool = True,
    ) -> AppUser:
        existing = await self.get_user(company_code=company_code, username=username)
        now = datetime.now()

        if existing:
            existing.full_name = full_name
            existing.email = email
            existing.department = department
            existing.password_hash = password_hash
            existing.role = role
            existing.permissions = permissions
            existing.is_active = is_active
            existing.updated_at = now
            await self.session.flush()
            return existing

        item = AppUser(
            company_code=company_code.upper(),
            username=username.lower(),
            full_name=full_name,
            email=email,
            department=department,
            password_hash=password_hash,
            role=role,
            permissions=permissions,
            is_active=is_active,
            created_at=now,
            updated_at=now,
        )
        self.session.add(item)
        await self.session.flush()
        return item

    async def update_user(
        self,
        user_id: int,
        *,
        full_name: str | None = None,
        email: str | None = None,
        department: str | None = None,
        role: str | None = None,
        permissions: list[str] | None = None,
        is_active: bool | None = None,
    ) -> AppUser | None:
        item = await self.get_user_by_id(user_id)
        if item is None:
            return None

        if full_name is not None:
            item.full_name = full_name
        if email is not None:
            item.email = email
        if department is not None:
            item.department = department
        if role is not None:
            item.role = role
        if permissions is not None:
            item.permissions = permissions
        if is_active is not None:
            item.is_active = is_active
        item.updated_at = datetime.now()
        await self.session.flush()
        return item

    async def sync_role_permissions_to_users(self, company_code: str, role_key: str, permissions: list[str]) -> None:
        result = await self.session.execute(
            select(AppUser).where(
                AppUser.company_code == company_code.upper(),
                AppUser.role == role_key,
            )
        )
        rows = result.scalars().all()
        now = datetime.now()
        for item in rows:
            item.permissions = permissions
            item.updated_at = now
        await self.session.flush()

    async def get_role(self, company_code: str, role_key: str) -> AppRole | None:
        result = await self.session.execute(
            select(AppRole).where(
                AppRole.company_code == company_code.upper(),
                AppRole.role_key == role_key,
            )
        )
        return result.scalar_one_or_none()

    async def list_roles(self, company_code: str) -> list[AppRole]:
        result = await self.session.execute(
            select(AppRole)
            .where(AppRole.company_code == company_code.upper())
            .order_by(AppRole.role_key.asc())
        )
        return result.scalars().all()

    async def upsert_role(
        self,
        *,
        company_code: str,
        role_key: str,
        name: str,
        description: str | None,
        permissions: list[str],
        is_active: bool = True,
    ) -> AppRole:
        existing = await self.get_role(company_code=company_code, role_key=role_key)
        now = datetime.now()
        if existing:
            existing.name = name
            existing.description = description
            existing.permissions = permissions
            existing.is_active = is_active
            existing.updated_at = now
            await self.session.flush()
            return existing

        item = AppRole(
            company_code=company_code.upper(),
            role_key=role_key,
            name=name,
            description=description,
            permissions=permissions,
            is_active=is_active,
            created_at=now,
            updated_at=now,
        )
        self.session.add(item)
        await self.session.flush()
        return item

    async def count_users_by_role(self, company_code: str) -> dict[str, int]:
        result = await self.session.execute(
            select(AppUser.role, func.count(AppUser.id))
            .where(AppUser.company_code == company_code.upper())
            .group_by(AppUser.role)
        )
        return {str(role): int(count) for role, count in result.all()}

    async def get_user_settings(self, user_id: int) -> AppUserSetting | None:
        result = await self.session.execute(select(AppUserSetting).where(AppUserSetting.user_id == user_id))
        return result.scalar_one_or_none()

    async def upsert_user_settings(self, user_id: int, settings_json: dict) -> AppUserSetting:
        existing = await self.get_user_settings(user_id)
        now = datetime.now()
        if existing:
            existing.settings_json = make_json_safe(settings_json)
            existing.updated_at = now
            await self.session.flush()
            return existing

        item = AppUserSetting(
            user_id=user_id,
            settings_json=make_json_safe(settings_json),
            created_at=now,
            updated_at=now,
        )
        self.session.add(item)
        await self.session.flush()
        return item

    async def list_permission_logs(self, company_code: str, limit: int = 50) -> list[AppPermissionLog]:
        result = await self.session.execute(
            select(AppPermissionLog)
            .where(AppPermissionLog.company_code == company_code.upper())
            .order_by(desc(AppPermissionLog.created_at))
            .limit(limit)
        )
        return result.scalars().all()

    async def add_permission_log(
        self,
        *,
        company_code: str,
        actor_username: str,
        action: str,
        target: str,
        detail: str | None,
    ) -> AppPermissionLog:
        item = AppPermissionLog(
            company_code=company_code.upper(),
            actor_username=actor_username,
            action=action,
            target=target,
            detail=detail,
            created_at=datetime.now(),
        )
        self.session.add(item)
        await self.session.flush()
        return item
