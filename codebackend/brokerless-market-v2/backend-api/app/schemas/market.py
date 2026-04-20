from datetime import datetime, date
from typing import Any

from pydantic import BaseModel


class QuoteResponse(BaseModel):
    symbol: str
    exchange: str | None
    price: float | None
    reference_price: float | None
    change_value: float | None
    change_percent: float | None
    volume: float | None
    trading_value: float | None
    open_price: float | None
    high_price: float | None
    low_price: float | None
    quote_time: datetime | None
    captured_at: datetime


class IntradayPointResponse(BaseModel):
    time: datetime
    price: float | None
    change_value: float | None
    change_percent: float | None
    volume: float | None
    trading_value: float | None


class IndexDailyPointResponse(BaseModel):
    date: date
    open: float | None
    high: float | None
    low: float | None
    close: float | None
    volume: float | None
    value: float | None


class IndexCardResponse(BaseModel):
    symbol: str
    exchange: str | None
    close: float | None
    change_value: float | None
    change_percent: float | None
    updated_at: datetime | None


class DashboardStockItem(BaseModel):
    symbol: str
    exchange: str | None
    price: float | None
    change_value: float | None
    change_percent: float | None
    volume: float | None
    trading_value: float | None
    captured_at: datetime | None


class ApiEnvelope(BaseModel):
    success: bool = True
    data: Any
