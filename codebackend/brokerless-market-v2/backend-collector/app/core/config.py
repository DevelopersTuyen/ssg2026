from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = Field(alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    vnstock_api_key: str = Field(default="", alias="VNSTOCK_API_KEY")
    vnstock_source: str = Field(default="VCI", alias="VNSTOCK_SOURCE")
    index_source: str = Field(default="", alias="INDEX_SOURCE")
    symbol_master_source: str = Field(default="", alias="SYMBOL_MASTER_SOURCE")

    quote_poll_seconds: int = Field(default=60, alias="QUOTE_POLL_SECONDS")
    intraday_poll_seconds: int = Field(default=180, alias="INTRADAY_POLL_SECONDS")
    index_daily_poll_seconds: int = Field(default=1800, alias="INDEX_DAILY_POLL_SECONDS")
    financial_poll_seconds: int = Field(default=21600, alias="FINANCIAL_POLL_SECONDS")

    seed_symbols_on_startup: bool = Field(default=True, alias="SEED_SYMBOLS_ON_STARTUP")

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
    financial_source: str = Field(default="", alias="FINANCIAL_SOURCE")
    financial_use_all_symbols: bool = Field(default=True, alias="FINANCIAL_USE_ALL_SYMBOLS")
    financial_symbols_per_run: int = Field(default=1, alias="FINANCIAL_SYMBOLS_PER_RUN")
    financial_rotate_batches: bool = Field(default=True, alias="FINANCIAL_ROTATE_BATCHES")
    financial_periods: str = Field(default="quarter,year", alias="FINANCIAL_PERIODS")

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
