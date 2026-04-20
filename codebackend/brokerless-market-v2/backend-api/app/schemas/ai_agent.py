from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class AiForecastCard(BaseModel):
    title: str
    summary: str
    direction: Literal["up", "down", "neutral"] = "neutral"
    confidence: int = Field(default=60, ge=0, le=100)


class AiActivityItem(BaseModel):
    time: str
    text: str


class AiStatusItem(BaseModel):
    label: str
    value: str
    tone: Literal["default", "positive", "warning"] = "default"


class AiTaskItem(BaseModel):
    name: str
    schedule: str
    status: str
    target: str


class AiSkillItem(BaseModel):
    title: str
    description: str
    icon: str


class AiOverviewResponse(BaseModel):
    exchange: str
    provider: str
    model: str
    used_fallback: bool = False
    generated_at: datetime
    summary_items: list[AiStatusItem]
    quick_prompts: list[str]
    forecast_cards: list[AiForecastCard]
    recent_activities: list[AiActivityItem]
    tasks: list[AiTaskItem]
    skills: list[AiSkillItem]
    history: list[AiActivityItem]
    assistant_greeting: str


class AiChatHistoryItem(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class AiChatRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=8000)
    exchange: str = Field(default="HSX", min_length=2, max_length=20)
    focus_symbols: list[str] = Field(default_factory=list, max_length=5)
    history: list[AiChatHistoryItem] = Field(default_factory=list, max_length=12)


class AiChatMessage(BaseModel):
    role: Literal["assistant"] = "assistant"
    content: str
    time: str


class AiChatResponse(BaseModel):
    exchange: str
    provider: str
    model: str
    used_fallback: bool = False
    generated_at: datetime
    focus_symbols: list[str]
    message: AiChatMessage
