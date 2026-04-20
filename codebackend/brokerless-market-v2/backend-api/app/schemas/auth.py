from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    company_code: str = Field(min_length=1, max_length=30)
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=200)


class UserProfileResponse(BaseModel):
    id: int
    company_code: str
    username: str
    full_name: str
    role: str
    permissions: list[str] = []


class AuthSessionResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_at: datetime
    profile: UserProfileResponse
