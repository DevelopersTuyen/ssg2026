from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import pandas as pd

from app.core.config import settings
from app.core.logging import get_logger
from app.utils.json_safe import to_jsonable

logger = get_logger(__name__)


@dataclass
class VnstockDataResult:
    rows: list[dict[str, Any]]
    raw: Any
    source: str | None = None
    errors: list[str] | None = None


class VnstockClient:
    def __init__(self) -> None:
        self.source = settings.vnstock_source
        self.api_key = settings.vnstock_api_key
        self._vnstock = None
        self._import_vnstock()

    def _import_vnstock(self) -> None:
        try:
            import vnstock  # type: ignore
            self._vnstock = vnstock
        except Exception as exc:  # pragma: no cover
            logger.exception("cannot import vnstock: %s", exc)
            self._vnstock = None

    def _ensure_ready(self) -> None:
        if self._vnstock is None:
            raise RuntimeError("vnstock is not available. Please install vnstock in collector environment.")

    def _apply_api_key_if_supported(self) -> None:
        if not self.api_key or self._vnstock is None:
            return
        try:
            if hasattr(self._vnstock, "config") and hasattr(self._vnstock.config, "set_api_key"):
                self._vnstock.config.set_api_key(self.api_key)
                return
            if hasattr(self._vnstock, "change_api_key"):
                self._vnstock.change_api_key(self.api_key)
        except Exception as exc:  # pragma: no cover
            logger.warning("cannot set vnstock api key automatically: %s", exc)

    @staticmethod
    def _df_to_records(df: Any) -> list[dict[str, Any]]:
        if df is None:
            return []
        if isinstance(df, pd.DataFrame):
            normalized = df.where(pd.notnull(df), None)
            return [to_jsonable(record) for record in normalized.to_dict(orient="records")]
        if isinstance(df, list):
            return [to_jsonable(x) for x in df if isinstance(x, dict)]
        if isinstance(df, dict):
            return [to_jsonable(df)]
        return []

    def get_listing_symbols(self, source: str | None = None) -> VnstockDataResult:
        self._ensure_ready()
        self._apply_api_key_if_supported()

        listing_source = str(source or settings.symbol_master_source or self.source).strip().lower()
        raw: Any = None
        errors: list[str] = []

        try:
            Listing = getattr(self._vnstock, "Listing")
            listing = Listing(source=listing_source, show_log=False)
            raw = listing.symbols_by_exchange()
            rows = self._df_to_records(raw)
            if rows:
                return VnstockDataResult(rows=rows, raw=raw)
        except Exception as exc:
            errors.append(f"Listing.symbols_by_exchange failed for {listing_source}: {exc}")

        try:
            Listing = getattr(self._vnstock, "Listing")
            listing = Listing(source=listing_source, show_log=False)
            raw = listing.all_symbols()
            rows = self._df_to_records(raw)
            if rows:
                return VnstockDataResult(rows=rows, raw=raw)
        except Exception as exc:
            errors.append(f"Listing.all_symbols failed for {listing_source}: {exc}")

        if errors:
            logger.warning("listing fetch failed: %s", " | ".join(errors[:3]))
        return VnstockDataResult(rows=[], raw=raw)

    def get_price_board(self, symbols: list[str]) -> VnstockDataResult:
        self._ensure_ready()
        self._apply_api_key_if_supported()
        if not symbols:
            return VnstockDataResult(rows=[], raw=[])

        errors: list[str] = []
        raw: Any = None

        try:
            Trading = getattr(self._vnstock, "Trading")
            trading = Trading(source=self.source)
            raw = trading.price_board(symbols)
            rows = self._df_to_records(raw)
            if rows:
                return VnstockDataResult(rows=rows, raw=raw)
        except Exception as exc:
            errors.append(f"Trading.price_board failed: {exc}")

        rows: list[dict[str, Any]] = []
        for symbol in symbols:
            try:
                quote = self._make_quote(symbol)
                hist = self._quote_history_fallback(quote, length="10D", interval="1D")
                records = self._df_to_records(hist)
                if not records:
                    continue
                latest = records[-1]
                prev = records[-2] if len(records) > 1 else None
                price = self._pick(latest, ["close", "Close", "price", "Price"])
                ref = self._pick(prev or {}, ["close", "Close", "price", "Price"])
                change_value = None
                change_percent = None
                p = self._to_float(price)
                r = self._to_float(ref)
                if p is not None and r not in (None, 0):
                    change_value = p - r
                    change_percent = (change_value / r) * 100
                rows.append(
                    {
                        "symbol": symbol,
                        "exchange": None,
                        "price": price,
                        "reference_price": ref,
                        "change_value": change_value,
                        "change_percent": change_percent,
                        "open": self._pick(latest, ["open", "Open"]),
                        "high": self._pick(latest, ["high", "High"]),
                        "low": self._pick(latest, ["low", "Low"]),
                        "volume": self._pick(latest, ["volume", "Volume"]),
                        "value": self._pick(latest, ["value", "Value", "trading_value", "TradingValue"]),
                        "time": self._pick(latest, ["time", "date", "Date"]),
                    }
                )
            except Exception as exc:
                errors.append(f"fallback history failed for {symbol}: {exc}")

        if errors:
            logger.warning("price_board fallback used: %s", " | ".join(errors[:5]))
        return VnstockDataResult(rows=rows, raw=rows)

    def get_intraday(self, symbol: str, page_size: int = 10000) -> VnstockDataResult:
        self._ensure_ready()
        self._apply_api_key_if_supported()
        quote = self._make_quote(symbol)

        errors: list[str] = []
        raw: Any = None
        for kwargs in (
            {"show_log": False, "page_size": page_size},
            {"show_log": False},
            {},
        ):
            try:
                raw = quote.intraday(**kwargs)
                rows = self._df_to_records(raw)
                if rows:
                    return VnstockDataResult(rows=rows, raw=raw)
            except Exception as exc:
                errors.append(str(exc))

        if errors:
            logger.warning("intraday fetch failed for %s: %s", symbol, " | ".join(errors[:3]))
        return VnstockDataResult(rows=[], raw=raw)

    def get_history(
        self,
        symbol: str,
        interval: str = "1D",
        months: int = 6,
        source: str | None = None,
    ) -> VnstockDataResult:
        self._ensure_ready()
        self._apply_api_key_if_supported()
        quote = self._make_quote(symbol, source=source)
        raw = self._quote_history_fallback(quote, length=f"{months}M", interval=interval)
        return VnstockDataResult(rows=self._df_to_records(raw), raw=raw)

    def get_financial_statement(
        self,
        symbol: str,
        statement_type: str,
        period: str = "quarter",
        source: str | None = None,
    ) -> VnstockDataResult:
        self._ensure_ready()
        self._apply_api_key_if_supported()

        preferred_source = str(source or settings.financial_source or settings.vnstock_source or self.source).strip().upper() or self.source
        sources_to_try = [preferred_source]
        for fallback_source in ("KBS", "VCI"):
            if fallback_source not in sources_to_try:
                sources_to_try.append(fallback_source)

        collected_errors: list[str] = []
        latest_raw: Any = None

        for source_name in sources_to_try:
            if statement_type == "note":
                collected_errors.append(f"{source_name}: Finance.note is not supported by installed vnstock package")
                continue

            try:
                finance = self._make_finance(symbol=symbol, period=period, source=source_name)
            except Exception as exc:
                collected_errors.append(f"{source_name}:construct {exc}")
                continue

            method = getattr(finance, statement_type, None)
            if not callable(method):
                collected_errors.append(f"{source_name}: vnstock Finance.{statement_type} is not available")
                continue

            call_variants: list[dict[str, Any]]
            if source_name == "KBS":
                call_variants = [
                    {"period": period, "display_mode": "std", "show_log": False},
                    {"period": period, "show_log": False},
                    {"period": period},
                ]
            else:
                call_variants = [
                    {"dropna": False},
                    {"dropna": True},
                    {},
                ]

            errors: list[str] = []
            for kwargs in call_variants:
                try:
                    latest_raw = method(**kwargs)
                    rows = self._df_to_records(latest_raw)
                    if rows:
                        return VnstockDataResult(rows=rows, raw=latest_raw, source=source_name, errors=errors)
                    if latest_raw is not None:
                        return VnstockDataResult(rows=rows, raw=latest_raw, source=source_name, errors=errors)
                except TypeError:
                    try:
                        latest_raw = method()
                        rows = self._df_to_records(latest_raw)
                        if rows or latest_raw is not None:
                            return VnstockDataResult(rows=rows, raw=latest_raw, source=source_name, errors=errors)
                    except Exception as exc:
                        errors.append(str(exc))
                        continue
                except Exception as exc:
                    errors.append(str(exc))

            collected_errors.extend(f"{source_name}:{error}" for error in errors)

        if collected_errors:
            logger.warning(
                "financial statement fetch failed | symbol=%s | statement=%s | period=%s | err=%s",
                symbol,
                statement_type,
                period,
                " | ".join(collected_errors[:4]),
            )
        return VnstockDataResult(rows=[], raw=latest_raw, source=preferred_source, errors=collected_errors)

    def _make_quote(self, symbol: str, source: str | None = None) -> Any:
        Quote = getattr(self._vnstock, "Quote")
        return Quote(symbol=symbol, source=(source or self.source))

    def _make_finance(self, symbol: str, period: str = "quarter", source: str | None = None) -> Any:
        Finance = getattr(self._vnstock, "Finance")
        kwargs = {
            "symbol": symbol,
            "period": period,
            "source": source or self.source,
        }

        for variant in (
            {**kwargs, "show_log": False},
            kwargs,
        ):
            try:
                return Finance(**variant)
            except TypeError:
                continue

        return Finance(**kwargs)

    def _quote_history_fallback(self, quote: Any, length: str = "6M", interval: str = "1D") -> Any:
        errors: list[str] = []
        for kwargs in (
            {"length": length, "interval": interval},
            {
                "start": (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d"),
                "end": datetime.now().strftime("%Y-%m-%d"),
                "interval": interval,
            },
        ):
            try:
                return quote.history(**kwargs)
            except Exception as exc:
                errors.append(str(exc))
        raise RuntimeError("; ".join(errors) or "quote.history failed")

    @staticmethod
    def _pick(row: dict[str, Any], keys: list[str]) -> Any:
        for key in keys:
            if key in row and row[key] not in (None, ""):
                return row[key]
        return None

    @staticmethod
    def _to_float(value: Any) -> float | None:
        if value in (None, ""):
            return None
        try:
            if isinstance(value, str):
                value = value.replace(",", "").strip()
            return float(value)
        except Exception:
            return None
