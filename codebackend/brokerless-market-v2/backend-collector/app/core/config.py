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

    quote_poll_seconds: int = Field(default=60, alias="QUOTE_POLL_SECONDS")
    intraday_poll_seconds: int = Field(default=180, alias="INTRADAY_POLL_SECONDS")
    index_daily_poll_seconds: int = Field(default=1800, alias="INDEX_DAILY_POLL_SECONDS")

    seed_symbols_on_startup: bool = Field(default=True, alias="SEED_SYMBOLS_ON_STARTUP")

    hsx_symbols: str = Field(default="", alias="HSX_SYMBOLS")
    hnx_symbols: str = Field(default="", alias="HNX_SYMBOLS")
    upcom_symbols: str = Field(default="", alias="UPCOM_SYMBOLS")
    intraday_symbols: str = Field(default="", alias="INTRADAY_SYMBOLS")
    index_symbols: str = Field(default="VNINDEX,HNXINDEX,UPCOMINDEX", alias="INDEX_SYMBOLS")

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


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
