from __future__ import annotations

from datetime import date, datetime
from math import isnan
from typing import Any

from app.utils.json_safe import to_jsonable

INDEX_EXCHANGE_MAP = {
    "VNINDEX": "HSX",
    "HNXINDEX": "HNX",
    "UPCOMINDEX": "UPCOM",
}

EXCHANGE_ALIAS_MAP = {
    "HOSE": "HSX",
    "HSX": "HSX",
    "HNX": "HNX",
    "UPCOM": "UPCOM",
}


def resolve_index_exchange(index_symbol: str) -> str:
    symbol = str(index_symbol or "").upper()
    if symbol in INDEX_EXCHANGE_MAP:
        return INDEX_EXCHANGE_MAP[symbol]
    if symbol.startswith("HNX"):
        return "HNX"
    if symbol.startswith("UPCOM"):
        return "UPCOM"
    if symbol.startswith("VN"):
        return "HSX"
    return "INDEX"


def normalize_exchange(exchange: str | None) -> str | None:
    if exchange is None:
        return None
    value = str(exchange).strip().upper()
    if not value:
        return None
    return EXCHANGE_ALIAS_MAP.get(value, value)


class NormalizationService:
    @staticmethod
    def pick(row: dict[str, Any], keys: list[str]) -> Any:
        for key in keys:
            if key in row and row[key] not in (None, ""):
                return row[key]
        return None

    @staticmethod
    def to_float(value: Any) -> float | None:
        if value in (None, ""):
            return None
        try:
            number = float(str(value).replace(",", "").strip()) if isinstance(value, str) else float(value)
            if isnan(number):
                return None
            return number
        except Exception:
            return None

    @staticmethod
    def to_datetime(value: Any) -> datetime | None:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            return value.replace(tzinfo=None)
        if isinstance(value, date):
            return datetime.combine(value, datetime.min.time())
        if isinstance(value, (int, float)):
            try:
                timestamp = float(value)
                if timestamp > 1_000_000_000_000:
                    timestamp /= 1000
                return datetime.fromtimestamp(timestamp).replace(tzinfo=None)
            except Exception:
                pass
        if hasattr(value, "to_pydatetime"):
            try:
                return value.to_pydatetime().replace(tzinfo=None)
            except Exception:
                pass
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00")).replace(tzinfo=None)
        except Exception:
            pass
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
            try:
                return datetime.strptime(str(value), fmt)
            except Exception:
                continue
        return None

    @staticmethod
    def to_date(value: Any) -> date | None:
        dt = NormalizationService.to_datetime(value)
        return dt.date() if dt else None

    def normalize_board_row(self, row: dict[str, Any], captured_at: datetime, source: str, default_exchange: str | None = None) -> dict[str, Any] | None:
        symbol = str(self.pick(row, ["symbol", "ticker", "Symbol", "Ticker", "code", "Code"]) or "").upper()
        if not symbol:
            return None

        price = self.to_float(
            self.pick(
                row,
                [
                    "price",
                    "match_price",
                    "lastPrice",
                    "last_price",
                    "close",
                    "close_price",
                    "Close",
                    "last",
                    "Last",
                ],
            )
        )
        ref = self.to_float(self.pick(row, ["reference_price", "reference", "refPrice", "prevClose", "prior_close", "basic_price", "referencePrice"]))
        open_price = self.to_float(self.pick(row, ["open", "Open", "open_price"]))
        high_price = self.to_float(self.pick(row, ["high", "High", "high_price"]))
        low_price = self.to_float(self.pick(row, ["low", "Low", "low_price"]))
        volume = self.to_float(self.pick(row, ["volume", "Volume", "match_volume", "total_volume", "volume_accumulated"]))
        trading_value = self.to_float(self.pick(row, ["value", "Value", "trading_value", "match_value", "total_value"]))
        change_value = self.to_float(self.pick(row, ["change_value", "change", "priceChange", "price_change", "Change"]))
        change_percent = self.to_float(self.pick(row, ["change_percent", "pct_change", "percentChange", "percent_change", "%", "ChangePct"]))
        if change_value is None and price is not None and ref not in (None, 0):
            change_value = price - ref
        if change_percent is None and change_value is not None and ref not in (None, 0):
            change_percent = (change_value / ref) * 100

        if price is None and ref is None and volume is None:
            return None

        quote_time = self.to_datetime(self.pick(row, ["time", "quote_time", "updated_at", "matched_at", "datetime"]))

        return {
            "symbol": symbol,
            "exchange": normalize_exchange(self.pick(row, ["exchange", "market", "Exchange"]) or default_exchange),
            "source": source,
            "price": price,
            "reference_price": ref,
            "open_price": open_price,
            "high_price": high_price,
            "low_price": low_price,
            "change_value": change_value,
            "change_percent": change_percent,
            "volume": volume,
            "trading_value": trading_value,
            "quote_time": quote_time,
            "raw_json": to_jsonable(row),
            "captured_at": captured_at,
        }

    def normalize_intraday_row(self, symbol: str, exchange: str | None, row: dict[str, Any], captured_at: datetime, source: str) -> dict[str, Any] | None:
        point_time = self.to_datetime(self.pick(row, ["time", "Time", "timestamp", "matched_at", "datetime", "date"]))
        if not point_time:
            return None
        price = self.to_float(self.pick(row, ["price", "Price", "match_price", "close", "last", "Last"]))
        volume = self.to_float(self.pick(row, ["volume", "matched_volume", "Volume", "accumulated_volume"]))
        trading_value = self.to_float(self.pick(row, ["value", "trading_value", "Value", "accumulated_value"]))
        change_value = self.to_float(self.pick(row, ["change", "change_value", "priceChange"]))
        change_percent = self.to_float(self.pick(row, ["change_percent", "pct_change", "percentChange"]))

        return {
            "symbol": symbol,
            "exchange": normalize_exchange(exchange),
            "source": source,
            "point_time": point_time,
            "price": price,
            "change_value": change_value,
            "change_percent": change_percent,
            "volume": volume,
            "trading_value": trading_value,
            "raw_json": to_jsonable(row),
            "captured_at": captured_at,
        }

    def normalize_index_daily_row(self, index_symbol: str, row: dict[str, Any], captured_at: datetime, source: str) -> dict[str, Any] | None:
        point_date = self.to_date(self.pick(row, ["time", "date", "Date", "tradingDate"]))
        if not point_date:
            return None
        return {
            "index_symbol": index_symbol,
            "exchange": resolve_index_exchange(index_symbol),
            "source": source,
            "point_date": point_date,
            "open_price": self.to_float(self.pick(row, ["open", "Open"])),
            "high_price": self.to_float(self.pick(row, ["high", "High"])),
            "low_price": self.to_float(self.pick(row, ["low", "Low"])),
            "close_price": self.to_float(self.pick(row, ["close", "Close", "price", "Price"])),
            "volume": self.to_float(self.pick(row, ["volume", "Volume"])),
            "trading_value": self.to_float(self.pick(row, ["value", "Value", "trading_value"])),
            "raw_json": to_jsonable(row),
            "captured_at": captured_at,
        }

    def normalize_index_intraday_row(self, index_symbol: str, row: dict[str, Any], captured_at: datetime, source: str) -> dict[str, Any] | None:
        point_time = self.to_datetime(self.pick(row, ["time", "Time", "timestamp", "matched_at", "datetime", "date"]))
        if not point_time:
            return None
        price = self.to_float(self.pick(row, ["price", "Price", "match_price", "close", "last", "Last"]))
        return {
            "index_symbol": index_symbol,
            "exchange": resolve_index_exchange(index_symbol),
            "source": source,
            "point_time": point_time,
            "price": price,
            "change_value": self.to_float(self.pick(row, ["change", "change_value", "priceChange"])),
            "change_percent": self.to_float(self.pick(row, ["change_percent", "pct_change", "percentChange"])),
            "volume": self.to_float(self.pick(row, ["volume", "matched_volume", "Volume", "accumulated_volume"])),
            "trading_value": self.to_float(self.pick(row, ["value", "trading_value", "Value", "accumulated_value"])),
            "raw_json": to_jsonable(row),
            "captured_at": captured_at,
        }
