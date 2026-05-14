from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), env_file_encoding="utf-8", extra="ignore")

    database_url: str = Field(alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    cache_ttl_seconds: int = Field(default=15, alias="CACHE_TTL_SECONDS")
    auto_init_db_on_startup: bool = Field(default=True, alias="AUTO_INIT_DB_ON_STARTUP")
    cors_allow_origins_raw: str = Field(
        default=(
            "http://localhost:8100,"
            "http://127.0.0.1:8100,"
            "http://localhost:4200,"
            "http://127.0.0.1:4200,"
            "http://14.224.134.120:8100,"
            "http://14.224.134.120:8000,"
            "http://14.224.134.120,"
            "http://192.168.101.170:8100,"
            "capacitor://localhost,"
            "ionic://localhost"
        ),
        alias="CORS_ALLOW_ORIGINS",
    )
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    gemini_api_base_url: str = Field(
        default="https://generativelanguage.googleapis.com/v1beta",
        alias="GEMINI_API_BASE_URL",
    )
    gemini_timeout_seconds: int = Field(default=20, alias="GEMINI_TIMEOUT_SECONDS")
    ai_agent_overview_ttl_seconds: int = Field(default=60, alias="AI_AGENT_OVERVIEW_TTL_SECONDS")
    ollama_base_url: str = Field(default="http://127.0.0.1:11434", alias="OLLAMA_BASE_URL")
    ollama_model: str = Field(default="qwen3:8b", alias="OLLAMA_MODEL")
    ollama_timeout_seconds: int = Field(default=90, alias="OLLAMA_TIMEOUT_SECONDS")
    ai_local_overview_ttl_seconds: int = Field(default=45, alias="AI_LOCAL_OVERVIEW_TTL_SECONDS")
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
    strategy_overview_ttl_seconds: int = Field(default=45, alias="STRATEGY_OVERVIEW_TTL_SECONDS")
    strategy_runtime_ttl_seconds: int = Field(default=20, alias="STRATEGY_RUNTIME_TTL_SECONDS")
    strategy_history_ttl_seconds: int = Field(default=15, alias="STRATEGY_HISTORY_TTL_SECONDS")
    foundation_worker_enabled: bool = Field(default=True, alias="FOUNDATION_WORKER_ENABLED")
    foundation_worker_initial_delay_seconds: int = Field(default=30, alias="FOUNDATION_WORKER_INITIAL_DELAY_SECONDS")
    foundation_worker_interval_seconds: int = Field(default=300, alias="FOUNDATION_WORKER_INTERVAL_SECONDS")
    foundation_candle_symbols_per_run: int = Field(default=30, alias="FOUNDATION_CANDLE_SYMBOLS_PER_RUN")
    foundation_candle_timeframes: str = Field(default="5m,15m,1h", alias="FOUNDATION_CANDLE_TIMEFRAMES")
    foundation_data_quality_limit: int = Field(default=1500, alias="FOUNDATION_DATA_QUALITY_LIMIT")
    alert_delivery_enabled: bool = Field(default=True, alias="ALERT_DELIVERY_ENABLED")
    alert_delivery_batch_size: int = Field(default=50, alias="ALERT_DELIVERY_BATCH_SIZE")
    telegram_bot_token: str | None = Field(default=None, alias="TELEGRAM_BOT_TOKEN")
    telegram_chat_id: str | None = Field(default=None, alias="TELEGRAM_CHAT_ID")
    smtp_host: str | None = Field(default=None, alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_username: str | None = Field(default=None, alias="SMTP_USERNAME")
    smtp_password: str | None = Field(default=None, alias="SMTP_PASSWORD")
    smtp_from_email: str | None = Field(default=None, alias="SMTP_FROM_EMAIL")
    alert_delivery_email_to: str | None = Field(default=None, alias="ALERT_DELIVERY_EMAIL_TO")
    strategy_precompute_enabled: bool = Field(default=True, alias="STRATEGY_PRECOMPUTE_ENABLED")
    strategy_precompute_initial_delay_seconds: int = Field(default=10, alias="STRATEGY_PRECOMPUTE_INITIAL_DELAY_SECONDS")
    strategy_precompute_interval_seconds: int = Field(default=180, alias="STRATEGY_PRECOMPUTE_INTERVAL_SECONDS")
    workflow_auto_executor_enabled: bool = Field(default=True, alias="WORKFLOW_AUTO_EXECUTOR_ENABLED")
    workflow_auto_executor_initial_delay_seconds: int = Field(default=20, alias="WORKFLOW_AUTO_EXECUTOR_INITIAL_DELAY_SECONDS")
    workflow_auto_executor_interval_seconds: int = Field(default=60, alias="WORKFLOW_AUTO_EXECUTOR_INTERVAL_SECONDS")
    auth_token_secret: str = Field(default="change-this-auth-secret", alias="AUTH_TOKEN_SECRET")
    auth_token_ttl_hours: int = Field(default=12, alias="AUTH_TOKEN_TTL_HOURS")
    auth_seed_demo_users: bool = Field(default=True, alias="AUTH_SEED_DEMO_USERS")

    @property
    def cors_allow_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_allow_origins_raw.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
