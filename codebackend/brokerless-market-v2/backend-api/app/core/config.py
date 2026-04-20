from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = Field(alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    cache_ttl_seconds: int = Field(default=15, alias="CACHE_TTL_SECONDS")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    gemini_api_base_url: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta",
        alias="GEMINI_API_BASE_URL",
    )
    gemini_timeout_seconds: int = Field(default=20, alias="GEMINI_TIMEOUT_SECONDS")
    ai_agent_overview_ttl_seconds: int = Field(default=60, alias="AI_AGENT_OVERVIEW_TTL_SECONDS")
    cafef_news_url: str = Field(
        default="https://cafef.vn/thi-truong-chung-khoan.chn",
        alias="CAFEF_NEWS_URL",
    )
    cafef_news_timeout_seconds: int = Field(default=20, alias="CAFEF_NEWS_TIMEOUT_SECONDS")
    cafef_news_cache_ttl_seconds: int = Field(default=120, alias="CAFEF_NEWS_CACHE_TTL_SECONDS")
    cafef_news_user_agent: str = Field(
        default="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        alias="CAFEF_NEWS_USER_AGENT",
    )
    market_alerts_ttl_seconds: int = Field(default=60, alias="MARKET_ALERTS_TTL_SECONDS")
    auth_token_secret: str = Field(default="change-this-auth-secret", alias="AUTH_TOKEN_SECRET")
    auth_token_ttl_hours: int = Field(default=12, alias="AUTH_TOKEN_TTL_HOURS")
    auth_seed_demo_users: bool = Field(default=True, alias="AUTH_SEED_DEMO_USERS")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
