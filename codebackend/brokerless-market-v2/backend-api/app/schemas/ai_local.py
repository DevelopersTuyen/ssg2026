from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.ai_agent import AiActivityItem, AiChatMessage, AiForecastCard, AiStatusItem


class AiLocalDataStat(BaseModel):
    label: str
    value: str
    helper: str = ""


class AiLocalNewsItem(BaseModel):
    title: str
    summary: str = ""
    source: str = "CafeF"
    published_at: str | None = None
    url: str | None = None


class AiLocalOverviewResponse(BaseModel):
    exchange: str
    provider: str
    model: str
    connected: bool = False
    model_available: bool = False
    used_fallback: bool = False
    generated_at: datetime
    summary_items: list[AiStatusItem]
    quick_prompts: list[str]
    forecast_cards: list[AiForecastCard]
    recent_activities: list[AiActivityItem]
    dataset_stats: list[AiLocalDataStat]
    focus_symbols: list[str]
    news_items: list[AiLocalNewsItem]
    assistant_greeting: str


class AiLocalChatResponse(BaseModel):
    exchange: str
    provider: str
    model: str
    connected: bool = False
    model_available: bool = False
    used_fallback: bool = False
    generated_at: datetime
    focus_symbols: list[str]
    context_summary: list[AiLocalDataStat] = Field(default_factory=list)
    message: AiChatMessage
