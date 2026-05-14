import json
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), env_file_encoding="utf-8", extra="ignore")

    database_url: str = Field(alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")
    auto_init_db_on_startup: bool = Field(default=True, alias="AUTO_INIT_DB_ON_STARTUP")

    vnstock_api_key: str = Field(default="", alias="VNSTOCK_API_KEY")
    vnstock_source: str = Field(default="VCI", alias="VNSTOCK_SOURCE")
    quote_source: str = Field(default="", alias="QUOTE_SOURCE")
    intraday_source: str = Field(default="", alias="INTRADAY_SOURCE")
    vnstock_retry_attempts: int = Field(default=2, alias="VNSTOCK_RETRY_ATTEMPTS")
    vnstock_retry_backoff_seconds: int = Field(default=1, alias="VNSTOCK_RETRY_BACKOFF_SECONDS")
    index_source: str = Field(default="", alias="INDEX_SOURCE")
    symbol_master_source: str = Field(default="", alias="SYMBOL_MASTER_SOURCE")

    quote_poll_seconds: int = Field(default=60, alias="QUOTE_POLL_SECONDS")
    intraday_poll_seconds: int = Field(default=180, alias="INTRADAY_POLL_SECONDS")
    index_daily_poll_seconds: int = Field(default=1800, alias="INDEX_DAILY_POLL_SECONDS")
    financial_poll_seconds: int = Field(default=21600, alias="FINANCIAL_POLL_SECONDS")
    news_poll_seconds: int = Field(default=300, alias="NEWS_POLL_SECONDS")

    seed_symbols_on_startup: bool = Field(default=True, alias="SEED_SYMBOLS_ON_STARTUP")
    seed_symbols_refresh_enabled: bool = Field(default=True, alias="SEED_SYMBOLS_REFRESH_ENABLED")
    seed_symbols_refresh_interval_seconds: int = Field(default=21600, alias="SEED_SYMBOLS_REFRESH_INTERVAL_SECONDS")

    hsx_symbols: str = Field(default="", alias="HSX_SYMBOLS")
    hnx_symbols: str = Field(default="", alias="HNX_SYMBOLS")
    upcom_symbols: str = Field(default="", alias="UPCOM_SYMBOLS")
    intraday_symbols: str = Field(default="", alias="INTRADAY_SYMBOLS")
    index_symbols: str = Field(default="VNINDEX,HNXINDEX,UPCOMINDEX", alias="INDEX_SYMBOLS")
    quote_use_all_symbols: bool = Field(default=True, alias="QUOTE_USE_ALL_SYMBOLS")
    intraday_use_all_symbols: bool = Field(default=True, alias="INTRADAY_USE_ALL_SYMBOLS")
    fallback_to_env_symbols: bool = Field(default=True, alias="FALLBACK_TO_ENV_SYMBOLS")
    quote_batch_size: int = Field(default=200, alias="QUOTE_BATCH_SIZE")
    quote_requests_per_run: int = Field(default=4, alias="QUOTE_REQUESTS_PER_RUN")
    quote_rotate_batches: bool = Field(default=True, alias="QUOTE_ROTATE_BATCHES")
    index_requests_per_run: int = Field(default=6, alias="INDEX_REQUESTS_PER_RUN")
    index_rotate_batches: bool = Field(default=True, alias="INDEX_ROTATE_BATCHES")
    max_intraday_symbols: int = Field(default=0, alias="MAX_INTRADAY_SYMBOLS")
    intraday_requests_per_run: int = Field(default=6, alias="INTRADAY_REQUESTS_PER_RUN")
    intraday_rotate_batches: bool = Field(default=True, alias="INTRADAY_ROTATE_BATCHES")
    intraday_max_concurrency: int = Field(default=2, alias="INTRADAY_MAX_CONCURRENCY")
    intraday_backfill_enabled: bool = Field(default=True, alias="INTRADAY_BACKFILL_ENABLED")
    intraday_backfill_interval_seconds: int = Field(default=300, alias="INTRADAY_BACKFILL_INTERVAL_SECONDS")
    intraday_backfill_requests_per_run: int = Field(default=12, alias="INTRADAY_BACKFILL_REQUESTS_PER_RUN")
    intraday_backfill_max_concurrency: int = Field(default=2, alias="INTRADAY_BACKFILL_MAX_CONCURRENCY")
    financial_source: str = Field(default="", alias="FINANCIAL_SOURCE")
    financial_use_all_symbols: bool = Field(default=True, alias="FINANCIAL_USE_ALL_SYMBOLS")
    financial_symbols_per_run: int = Field(default=20, alias="FINANCIAL_SYMBOLS_PER_RUN")
    financial_rotate_batches: bool = Field(default=True, alias="FINANCIAL_ROTATE_BATCHES")
    financial_backfill_enabled: bool = Field(default=False, alias="FINANCIAL_BACKFILL_ENABLED")
    financial_backfill_interval_seconds: int = Field(default=600, alias="FINANCIAL_BACKFILL_INTERVAL_SECONDS")
    financial_backfill_symbols_per_run: int = Field(default=100, alias="FINANCIAL_BACKFILL_SYMBOLS_PER_RUN")
    financial_cash_flow_backfill_enabled: bool = Field(default=True, alias="FINANCIAL_CASH_FLOW_BACKFILL_ENABLED")
    financial_cash_flow_backfill_interval_seconds: int = Field(default=900, alias="FINANCIAL_CASH_FLOW_BACKFILL_INTERVAL_SECONDS")
    financial_cash_flow_backfill_symbols_per_run: int = Field(default=60, alias="FINANCIAL_CASH_FLOW_BACKFILL_SYMBOLS_PER_RUN")
    financial_periods: str = Field(default="quarter,year", alias="FINANCIAL_PERIODS")
    cafef_financial_timeout_seconds: int = Field(default=20, alias="CAFEF_FINANCIAL_TIMEOUT_SECONDS")
    cafef_financial_user_agent: str = Field(
        default=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/135.0.0.0 Safari/537.36"
        ),
        alias="CAFEF_FINANCIAL_USER_AGENT",
    )
    cafef_news_url: str = Field(default="https://cafef.vn/thi-truong-chung-khoan.chn", alias="CAFEF_NEWS_URL")
    cafef_news_timeout_seconds: int = Field(default=20, alias="CAFEF_NEWS_TIMEOUT_SECONDS")
    cafef_news_user_agent: str = Field(
        default=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/135.0.0.0 Safari/537.36"
        ),
        alias="CAFEF_NEWS_USER_AGENT",
    )

    @staticmethod
    def _split_csv(value: str) -> List[str]:
        return [item.strip().upper() for item in value.split(",") if item.strip()]

    @property
    def hsx_symbol_list(self) -> List[str]:
        return self._split_csv(self.hsx_symbols)

    @property
    def hnx_symbol_list(self) -> List[str]:
        return self._split_csv(self.hnx_symbols)

    @property
    def upcom_symbol_list(self) -> List[str]:
        return self._split_csv(self.upcom_symbols)

    @property
    def intraday_symbol_list(self) -> List[str]:
        return self._split_csv(self.intraday_symbols)

    @property
    def index_symbol_list(self) -> List[str]:
        values = self._split_csv(self.index_symbols)
        return values or ["VNINDEX", "HNXINDEX", "UPCOMINDEX"]

    @property
    def financial_period_list(self) -> List[str]:
        values = [item.strip().lower() for item in self.financial_periods.split(",") if item.strip()]
        normalized = [item for item in values if item in {"quarter", "year"}]
        return normalized or ["quarter", "year"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

RUNTIME_SYNC_FILE = Path(__file__).resolve().parents[2].parent / "runtime" / "collector-sync-settings.json"


def read_runtime_sync_overrides() -> dict:
    try:
        if not RUNTIME_SYNC_FILE.exists():
            return {}
        payload = json.loads(RUNTIME_SYNC_FILE.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def get_runtime_sync_int(key: str, fallback: int) -> int:
    overrides = read_runtime_sync_overrides()
    try:
        return max(1, int(overrides.get(key, fallback)))
    except Exception:
        return max(1, int(fallback))


def get_runtime_sync_str(key: str, fallback: str) -> str:
    overrides = read_runtime_sync_overrides()
    try:
        value = str(overrides.get(key, fallback) or fallback).strip()
        return value or fallback
    except Exception:
        return fallback
