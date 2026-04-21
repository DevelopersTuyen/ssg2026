from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from typing import Any

from sqlalchemy import and_, case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market import (
    MarketFinancialBalanceSheet,
    MarketFinancialCashFlow,
    MarketFinancialIncomeStatement,
    MarketFinancialNote,
    MarketFinancialRatio,
    MarketIndexDailyPoint,
    MarketIndexIntradayPoint,
    MarketIntradayPoint,
    MarketNewsArticle,
    MarketQuoteSnapshot,
    MarketSymbol,
    MarketSyncLog,
    MarketWatchlistItem,
)

INDEX_EXCHANGE_TO_SYMBOL = {
    "HSX": "VNINDEX",
    "HNX": "HNXINDEX",
    "UPCOM": "UPCOMINDEX",
}

INDEX_SYMBOL_TO_EXCHANGE = {
    "VNINDEX": "HSX",
    "HNXINDEX": "HNX",
    "UPCOMINDEX": "UPCOM",
}

INDEX_PRIORITY = [
    "VNINDEX",
    "VN30",
    "VN100",
    "VNALL",
    "VNSI",
    "VNFIN",
    "VNCOND",
    "VNCONS",
    "VNENE",
    "VNHEAL",
    "VNIND",
    "VNIT",
    "VNMAT",
    "VNREAL",
    "VNX50",
    "VNMID",
    "VNSML",
    "HNXINDEX",
    "HNX30",
    "UPCOMINDEX",
]

FINANCIAL_TABLES = {
    "balance_sheet": MarketFinancialBalanceSheet,
    "income_statement": MarketFinancialIncomeStatement,
    "cash_flow": MarketFinancialCashFlow,
    "ratio": MarketFinancialRatio,
    "note": MarketFinancialNote,
}

FINANCIAL_TITLES = {
    "balance_sheet": "Bang can doi ke toan",
    "income_statement": "Bao cao ket qua kinh doanh",
    "cash_flow": "Bao cao luu chuyen tien te",
    "ratio": "Chi so tai chinh",
    "note": "Thuyet minh bao cao tai chinh",
}


class MarketReadRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _today_bounds(ref: date | None = None) -> tuple[datetime, datetime]:
        d = ref or datetime.now().date()
        start = datetime.combine(d, time.min)
        end = start + timedelta(days=1)
        return start, end

    async def _resolve_latest_intraday_date(
        self,
        *,
        symbol: str | None = None,
        symbols: list[str] | None = None,
    ) -> date | None:
        stmt = select(func.max(MarketIntradayPoint.point_time))

        if symbol:
            stmt = stmt.where(MarketIntradayPoint.symbol == symbol.upper())
        elif symbols:
            normalized = [item.upper() for item in symbols if item]
            if not normalized:
                return None
            stmt = stmt.where(MarketIntradayPoint.symbol.in_(normalized))

        latest_point_time = await self.session.scalar(stmt)
        return latest_point_time.date() if latest_point_time else None

    @staticmethod
    def _normalize_reference_price(reference_price: float | None, current_price: float | None) -> float | None:
        if reference_price is None:
            return None
        if current_price in (None, 0):
            return reference_price

        ref = float(reference_price)
        price = float(current_price)

        if ref > price * 100:
            return ref / 1000
        if ref > price * 10:
            return ref / 100
        return ref

    @staticmethod
    def _quote_timestamp(row: MarketQuoteSnapshot) -> datetime:
        return getattr(row, "quote_time", None) or row.captured_at

    @staticmethod
    def _quote_bucket_time(row: MarketQuoteSnapshot, multi_day: bool) -> datetime:
        if multi_day:
            return datetime.combine(MarketReadRepository._quote_timestamp(row).date(), time(15, 0))
        return row.captured_at.replace(second=0, microsecond=0)

    def _build_symbol_quote_series(self, quote_rows: list[MarketQuoteSnapshot]) -> list[dict[str, Any]]:
        if not quote_rows:
            return []

        buckets: dict[datetime, dict[str, Any]] = {}
        multi_day = len({self._quote_timestamp(item).date() for item in quote_rows}) > 1

        for row in reversed(quote_rows):
            bucket = self._quote_bucket_time(row, multi_day)
            item = buckets.get(bucket)
            price = row.price

            if item is None:
                buckets[bucket] = {
                    "time": bucket,
                    "open": price,
                    "high": row.high_price if row.high_price is not None else price,
                    "low": row.low_price if row.low_price is not None else price,
                    "close": price,
                    "volume": row.volume or 0,
                    "trading_value": row.trading_value or 0,
                    "point_count": 1,
                }
            else:
                if price is not None:
                    if item["open"] is None:
                        item["open"] = price
                    item["close"] = price
                    item["high"] = (
                        max(item["high"], row.high_price or price)
                        if item["high"] is not None
                        else (row.high_price or price)
                    )
                    item["low"] = (
                        min(item["low"], row.low_price or price)
                        if item["low"] is not None
                        else (row.low_price or price)
                    )

                item["volume"] = max(item["volume"], row.volume or 0)
                item["trading_value"] = max(item["trading_value"], row.trading_value or 0)
                item["point_count"] += 1

        series = [buckets[k] for k in sorted(buckets.keys())]
        if len(series) >= 2:
            return series

        latest = quote_rows[0]
        timestamp = self._quote_timestamp(latest).replace(minute=0, second=0, microsecond=0)
        reference_price = self._normalize_reference_price(latest.reference_price, latest.price)
        open_price = latest.open_price if latest.open_price is not None else reference_price
        start_price = open_price if open_price not in (None, 0) else reference_price

        if start_price is None or latest.price is None:
            return series

        synthetic_start = timestamp.replace(hour=9, minute=0, second=0, microsecond=0)
        return [
            {
                "time": synthetic_start,
                "open": start_price,
                "high": max(start_price, latest.price),
                "low": min(start_price, latest.price),
                "close": start_price,
                "volume": 0,
                "trading_value": 0,
                "point_count": 1,
            },
            {
                "time": timestamp,
                "open": start_price,
                "high": latest.high_price if latest.high_price is not None else max(start_price, latest.price),
                "low": latest.low_price if latest.low_price is not None else min(start_price, latest.price),
                "close": latest.price,
                "volume": latest.volume or 0,
                "trading_value": latest.trading_value or 0,
                "point_count": 1,
            },
        ]

    def _build_exchange_quote_series(self, quote_rows: list[MarketQuoteSnapshot]) -> list[dict[str, Any]]:
        if not quote_rows:
            return []

        buckets: dict[datetime, dict[str, Any]] = {}
        symbol_seen_per_bucket: dict[datetime, set[str]] = defaultdict(set)
        multi_day = len({self._quote_timestamp(item).date() for item in quote_rows}) > 1

        for row in reversed(quote_rows):
            bucket = self._quote_bucket_time(row, multi_day)
            item = buckets.get(bucket)

            if item is None:
                buckets[bucket] = {
                    "time": bucket,
                    "volume": row.volume or 0,
                    "trading_value": row.trading_value or 0,
                    "point_count": 1,
                    "symbol_count": 0,
                }
            else:
                item["volume"] += row.volume or 0
                item["trading_value"] += row.trading_value or 0
                item["point_count"] += 1

            symbol_seen_per_bucket[bucket].add(row.symbol)

        for bucket, seen in symbol_seen_per_bucket.items():
            buckets[bucket]["symbol_count"] = len(seen)

        return [buckets[k] for k in sorted(buckets.keys())]

    async def _get_symbol_quote_rows(
        self,
        symbol: str,
        latest_only: bool = True,
        history_days: int = 14,
    ) -> list[MarketQuoteSnapshot]:
        cutoff = datetime.now() - timedelta(days=max(1, history_days))
        result = await self.session.execute(
            select(MarketQuoteSnapshot)
            .where(
                MarketQuoteSnapshot.symbol == symbol.upper(),
                MarketQuoteSnapshot.price.is_not(None),
                MarketQuoteSnapshot.captured_at >= cutoff,
            )
            .order_by(desc(MarketQuoteSnapshot.captured_at))
            .limit(2000)
        )
        rows = result.scalars().all()
        if not rows:
            return []
        if not latest_only:
            return rows

        latest_date = self._quote_timestamp(rows[0]).date()
        return [row for row in rows if self._quote_timestamp(row).date() == latest_date]

    async def _get_exchange_quote_rows(
        self,
        exchange: str,
        latest_only: bool = True,
        history_days: int = 14,
    ) -> list[MarketQuoteSnapshot]:
        cutoff = datetime.now() - timedelta(days=max(1, history_days))
        result = await self.session.execute(
            select(MarketQuoteSnapshot)
            .where(
                MarketQuoteSnapshot.exchange == exchange.upper(),
                MarketQuoteSnapshot.price.is_not(None),
                MarketQuoteSnapshot.captured_at >= cutoff,
            )
            .order_by(desc(MarketQuoteSnapshot.captured_at))
            .limit(25000)
        )
        rows = result.scalars().all()
        if not rows:
            return []
        if not latest_only:
            return rows

        latest_date = self._quote_timestamp(rows[0]).date()
        return [row for row in rows if self._quote_timestamp(row).date() == latest_date]

    @staticmethod
    def _resolve_index_exchange(index_symbol: str, exchange: str | None = None) -> str:
        symbol = str(index_symbol or "").upper()
        if symbol in INDEX_SYMBOL_TO_EXCHANGE:
            return INDEX_SYMBOL_TO_EXCHANGE[symbol]
        if exchange:
            return str(exchange).upper()
        if symbol.startswith("HNX"):
            return "HNX"
        if symbol.startswith("UPCOM"):
            return "UPCOM"
        if symbol.startswith("VN"):
            return "HSX"
        return "INDEX"
    
    def _stock_symbols_stmt(self):
        return select(MarketSymbol).where(
            MarketSymbol.is_active.is_(True),
            ~MarketSymbol.symbol.in_(list(INDEX_SYMBOL_TO_EXCHANGE.keys())),
            or_(
                MarketSymbol.instrument_type.is_(None),
                func.lower(func.coalesce(MarketSymbol.instrument_type, "")).in_(
                    ["stock", "cw", "etf"]
                ),
            ),
        )

    @staticmethod
    def _normalize_symbol_keyword(keyword: str | None) -> str | None:
        value = str(keyword or "").strip().upper()
        return value or None

    def _apply_symbol_keyword_filter(self, stmt, keyword: str | None):
        normalized = self._normalize_symbol_keyword(keyword)
        if not normalized:
            return stmt

        prefix_pattern = f"{normalized}%"
        name_pattern = f"%{normalized}%"
        normalized_name = func.upper(func.coalesce(MarketSymbol.name, ""))
        normalized_symbol = func.upper(MarketSymbol.symbol)
        return stmt.where(
            or_(
                normalized_symbol == normalized,
                normalized_symbol.like(prefix_pattern),
                and_(
                    normalized_name.like(name_pattern),
                    normalized_name != normalized_symbol,
                ),
            )
        )

    def _symbol_keyword_ordering(self, keyword: str | None):
        normalized = self._normalize_symbol_keyword(keyword)
        if not normalized:
            return [MarketSymbol.exchange.asc(), MarketSymbol.symbol.asc()]

        prefix_pattern = f"{normalized}%"
        name_pattern = f"%{normalized}%"
        normalized_name = func.upper(func.coalesce(MarketSymbol.name, ""))
        normalized_symbol = func.upper(MarketSymbol.symbol)
        return [
            case(
                (normalized_symbol == normalized, 0),
                (normalized_symbol.like(prefix_pattern), 1),
                (
                    and_(
                        normalized_name.like(name_pattern),
                        normalized_name != normalized_symbol,
                    ),
                    2,
                ),
                else_=3,
            ),
            MarketSymbol.exchange.asc(),
            MarketSymbol.symbol.asc(),
        ]

    async def search_symbols(self, keyword: str, limit: int = 20):
        stmt = (
            self._apply_symbol_keyword_filter(self._stock_symbols_stmt(), keyword)
            .order_by(*self._symbol_keyword_ordering(keyword))
            .limit(limit)
        )

        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def count_symbols(self, exchange: str | None = None, keyword: str | None = None) -> int:
        stmt = select(func.count()).select_from(MarketSymbol).where(
            MarketSymbol.is_active.is_(True),
            ~MarketSymbol.symbol.in_(list(INDEX_SYMBOL_TO_EXCHANGE.keys())),
            or_(
                MarketSymbol.instrument_type.is_(None),
                func.lower(func.coalesce(MarketSymbol.instrument_type, "")) != "index",
            ),
        )

        if exchange:
            stmt = stmt.where(MarketSymbol.exchange == exchange.upper())

        stmt = self._apply_symbol_keyword_filter(stmt, keyword)

        result = await self.session.execute(stmt)
        return int(result.scalar_one() or 0)

    async def list_symbols(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        exchange: str | None = None,
        keyword: str | None = None,
    ):
        stmt = self._stock_symbols_stmt()

        if exchange:
            stmt = stmt.where(MarketSymbol.exchange == exchange.upper())

        stmt = self._apply_symbol_keyword_filter(stmt, keyword)

        stmt = (
            stmt.order_by(*self._symbol_keyword_ordering(keyword))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_symbols_by_exchange(self, exchange: str, limit: int | None = None):
        stmt = (
            self._stock_symbols_stmt()
            .where(MarketSymbol.exchange == exchange.upper())
            .order_by(MarketSymbol.symbol.asc())
        )

        if limit is not None:
            stmt = stmt.limit(limit)

        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_latest_quote_map(self, symbols: list[str]) -> dict[str, MarketQuoteSnapshot]:
        if not symbols:
            return {}

        normalized = [s.upper() for s in symbols]

        subq = (
            select(
                MarketQuoteSnapshot.symbol.label("symbol"),
                func.max(MarketQuoteSnapshot.captured_at).label("max_captured_at"),
            )
            .where(MarketQuoteSnapshot.symbol.in_(normalized))
            .group_by(MarketQuoteSnapshot.symbol)
            .subquery()
        )

        stmt = (
            select(MarketQuoteSnapshot)
            .join(
                subq,
                and_(
                    MarketQuoteSnapshot.symbol == subq.c.symbol,
                    MarketQuoteSnapshot.captured_at == subq.c.max_captured_at,
                ),
            )
        )

        result = await self.session.execute(stmt)
        rows = result.scalars().all()
        return {row.symbol: row for row in rows}

    async def get_market_stocks(
        self,
        *,
        exchange: str,
        sort: str = "actives",
        page: int = 1,
        page_size: int = 5000,
        keyword: str | None = None,
    ) -> dict[str, Any]:
        symbol_rows = await self.list_symbols(
            page=1,
            page_size=100000,
            exchange=exchange,
            keyword=keyword,
        )

        if not symbol_rows:
            return {"total": 0, "items": []}

        symbols = [row.symbol.upper() for row in symbol_rows]
        quote_map = await self.get_latest_quote_map(symbols)
        intraday_map = await self.get_latest_intraday_map(symbols)

        items: list[dict[str, Any]] = []

        for row in symbol_rows:
            symbol = row.symbol.upper()
            quote_row = quote_map.get(symbol)
            intraday_row = intraday_map.get(symbol)

            price = None
            change_value = None
            change_percent = None
            volume = None
            trading_value = None
            point_time = None
            captured_at = None

            if quote_row:
                price = quote_row.price
                change_value = quote_row.change_value
                change_percent = quote_row.change_percent
                volume = quote_row.volume
                trading_value = quote_row.trading_value
                captured_at = quote_row.captured_at

            if intraday_row:
                price = intraday_row.price if intraday_row.price is not None else price
                change_value = intraday_row.change_value if intraday_row.change_value is not None else change_value
                change_percent = intraday_row.change_percent if intraday_row.change_percent is not None else change_percent
                volume = intraday_row.volume if intraday_row.volume is not None else volume
                trading_value = intraday_row.trading_value if intraday_row.trading_value is not None else trading_value
                point_time = intraday_row.point_time
                captured_at = intraday_row.captured_at or captured_at

            reference_price = self._normalize_reference_price(
                getattr(quote_row, "reference_price", None),
                price,
            )
            if change_value is None and price is not None and reference_price not in (None, 0):
                change_value = price - reference_price

            if change_percent is None and change_value is not None and reference_price not in (None, 0):
                change_percent = (change_value / reference_price) * 100

            items.append(
                {
                    "symbol": row.symbol,
                    "name": row.name,
                    "exchange": row.exchange,
                    "instrument_type": row.instrument_type,
                    "updated_at": row.updated_at,
                    "price": price,
                    "change_value": change_value,
                    "change_percent": change_percent,
                    "volume": volume,
                    "trading_value": trading_value,
                    "point_time": point_time,
                    "captured_at": captured_at,
                }
            )

        sort_key = sort.lower()
        if sort_key == "all":
            items.sort(
                key=lambda x: (
                    x["symbol"],
                )
            )
        elif sort_key == "gainers":
            items.sort(
                key=lambda x: (
                    -(x["change_percent"] if x["change_percent"] is not None else float("-inf")),
                    -(x["volume"] or 0),
                    x["symbol"],
                )
            )
        elif sort_key == "losers":
            items.sort(
                key=lambda x: (
                    (x["change_percent"] if x["change_percent"] is not None else float("inf")),
                    -(x["volume"] or 0),
                    x["symbol"],
                )
            )
        else:
            items.sort(
                key=lambda x: (
                    -(x["volume"] or 0),
                    -(x["trading_value"] or 0),
                    x["symbol"],
                )
            )

        total = len(items)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size

        return {
            "total": total,
            "items": items[start_idx:end_idx],
        }

    async def search_symbols(self, keyword: str, limit: int = 20):
        result = await self.session.execute(
            self._apply_symbol_keyword_filter(self._stock_symbols_stmt(), keyword)
            .order_by(*self._symbol_keyword_ordering(keyword))
            .limit(limit)
        )
        return result.scalars().all()

    async def count_symbols(self, exchange: str | None = None, keyword: str | None = None) -> int:
        stmt = select(func.count()).select_from(MarketSymbol).where(
            MarketSymbol.is_active.is_(True),
            ~MarketSymbol.symbol.in_(list(INDEX_SYMBOL_TO_EXCHANGE.keys())),
            or_(
                MarketSymbol.instrument_type.is_(None),
                func.lower(func.coalesce(MarketSymbol.instrument_type, "")) != "index",
            ),
        )

        if exchange:
            stmt = stmt.where(MarketSymbol.exchange == exchange.upper())

        stmt = self._apply_symbol_keyword_filter(stmt, keyword)

        result = await self.session.execute(stmt)
        return int(result.scalar_one() or 0)

    async def list_symbols(
        self,
        *,
        page: int = 1,
        page_size: int = 50,
        exchange: str | None = None,
        keyword: str | None = None,
    ):
        stmt = self._stock_symbols_stmt()

        if exchange:
            stmt = stmt.where(MarketSymbol.exchange == exchange.upper())

        stmt = self._apply_symbol_keyword_filter(stmt, keyword)

        stmt = (
            stmt.order_by(*self._symbol_keyword_ordering(keyword))
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_symbols_by_exchange(self, exchange: str, limit: int | None = None):
        stmt = (
            self._stock_symbols_stmt()
            .where(MarketSymbol.exchange == exchange.upper())
            .order_by(MarketSymbol.symbol.asc())
        )

        if limit is not None:
            stmt = stmt.limit(limit)

        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_intraday_points(
        self,
        symbol: str,
        limit: int = 5000,
        trading_date: date | None = None,
    ):
        effective_date = trading_date
        start, end = self._today_bounds(effective_date)
        stmt = (
            select(MarketIntradayPoint)
            .where(
                MarketIntradayPoint.symbol == symbol.upper(),
                MarketIntradayPoint.point_time >= start,
                MarketIntradayPoint.point_time < end,
            )
            .order_by(MarketIntradayPoint.point_time.asc())
            .limit(limit)
        )
        result = await self.session.execute(stmt)
        rows = result.scalars().all()

        if rows or trading_date is not None:
            return rows

        latest_date = await self._resolve_latest_intraday_date(symbol=symbol)
        if latest_date is None or latest_date == start.date():
            return rows

        fallback_start, fallback_end = self._today_bounds(latest_date)
        fallback_stmt = (
            select(MarketIntradayPoint)
            .where(
                MarketIntradayPoint.symbol == symbol.upper(),
                MarketIntradayPoint.point_time >= fallback_start,
                MarketIntradayPoint.point_time < fallback_end,
            )
            .order_by(MarketIntradayPoint.point_time.asc())
            .limit(limit)
        )
        fallback_result = await self.session.execute(fallback_stmt)
        return fallback_result.scalars().all()

    async def get_symbol_intraday_hourly(
        self,
        symbol: str,
        trading_date: date | None = None,
    ) -> list[dict[str, Any]]:
        quote_rows = await self._get_symbol_quote_rows(symbol, latest_only=False)
        quote_series = self._build_symbol_quote_series(quote_rows)
        if quote_series and (len(quote_series) >= 3 or trading_date is None):
            return quote_series

        rows = await self.get_intraday_points(symbol=symbol, limit=20000, trading_date=trading_date)
        latest_intraday_time = rows[-1].point_time if rows else None
        latest_quote_time = self._quote_timestamp(quote_rows[0]) if quote_rows else None
        prefer_quote = (
            bool(quote_rows)
            and (
                not rows
                or latest_intraday_time is None
                or (latest_quote_time is not None and latest_quote_time.date() > latest_intraday_time.date())
            )
        )

        buckets: dict[datetime, dict[str, Any]] = {}

        if rows and not prefer_quote:
            for row in rows:
                bucket = row.point_time.replace(minute=0, second=0, microsecond=0)
                item = buckets.get(bucket)

                if item is None:
                    buckets[bucket] = {
                        "time": bucket,
                        "open": row.price,
                        "high": row.price,
                        "low": row.price,
                        "close": row.price,
                        "volume": row.volume or 0,
                        "trading_value": row.trading_value or 0,
                        "point_count": 1,
                    }
                else:
                    price = row.price
                    if price is not None:
                        if item["open"] is None:
                            item["open"] = price
                        item["close"] = price
                        item["high"] = price if item["high"] is None else max(item["high"], price)
                        item["low"] = price if item["low"] is None else min(item["low"], price)

                    item["volume"] += row.volume or 0
                    item["trading_value"] += row.trading_value or 0
                    item["point_count"] += 1

            return [buckets[k] for k in sorted(buckets.keys())]

        if not quote_rows:
            return []
        return quote_series

    async def get_exchange_intraday_hourly(
        self,
        exchange: str,
        trading_date: date | None = None,
    ) -> list[dict[str, Any]]:
        exchange = exchange.upper()
        quote_rows = await self._get_exchange_quote_rows(exchange, latest_only=False)
        quote_series = self._build_exchange_quote_series(quote_rows)
        if quote_series and (len(quote_series) >= 2 or trading_date is None):
            return quote_series

        symbols = [row.symbol for row in await self.get_symbols_by_exchange(exchange, limit=None)]
        if not symbols:
            return quote_series

        effective_date = trading_date
        start, end = self._today_bounds(effective_date)

        stmt = (
            select(MarketIntradayPoint)
            .where(
                MarketIntradayPoint.symbol.in_(symbols),
                MarketIntradayPoint.point_time >= start,
                MarketIntradayPoint.point_time < end,
            )
            .order_by(MarketIntradayPoint.point_time.asc())
        )
        result = await self.session.execute(stmt)
        rows = result.scalars().all()

        if not rows and trading_date is None:
            latest_date = await self._resolve_latest_intraday_date(symbols=symbols)
            if latest_date and latest_date != start.date():
                fallback_start, fallback_end = self._today_bounds(latest_date)
                fallback_stmt = (
                    select(MarketIntradayPoint)
                    .where(
                        MarketIntradayPoint.symbol.in_(symbols),
                        MarketIntradayPoint.point_time >= fallback_start,
                        MarketIntradayPoint.point_time < fallback_end,
                    )
                    .order_by(MarketIntradayPoint.point_time.asc())
                )
                fallback_result = await self.session.execute(fallback_stmt)
                rows = fallback_result.scalars().all()

        latest_intraday_time = rows[-1].point_time if rows else None
        latest_quote_time = self._quote_timestamp(quote_rows[0]) if quote_rows else None
        intraday_symbol_total = len({row.symbol for row in rows})
        minimum_coverage = max(5, int(len(symbols) * 0.05))
        prefer_quote = (
            bool(quote_rows)
            and (
                not rows
                or latest_intraday_time is None
                or (latest_quote_time is not None and latest_quote_time.date() > latest_intraday_time.date())
                or intraday_symbol_total < minimum_coverage
            )
        )

        buckets: dict[datetime, dict[str, Any]] = {}
        symbol_seen_per_bucket: dict[datetime, set[str]] = defaultdict(set)

        if rows and not prefer_quote:
            for row in rows:
                bucket = row.point_time.replace(minute=0, second=0, microsecond=0)
                item = buckets.get(bucket)

                if item is None:
                    buckets[bucket] = {
                        "time": bucket,
                        "volume": row.volume or 0,
                        "trading_value": row.trading_value or 0,
                        "point_count": 1,
                        "symbol_count": 0,
                    }
                else:
                    item["volume"] += row.volume or 0
                    item["trading_value"] += row.trading_value or 0
                    item["point_count"] += 1

                symbol_seen_per_bucket[bucket].add(row.symbol)

            for bucket, seen in symbol_seen_per_bucket.items():
                buckets[bucket]["symbol_count"] = len(seen)

            return [buckets[k] for k in sorted(buckets.keys())]

        return quote_series

    async def get_latest_quote(self, symbol: str):
        result = await self.session.execute(
            select(MarketQuoteSnapshot)
            .where(
                MarketQuoteSnapshot.symbol == symbol.upper(),
                MarketQuoteSnapshot.price.is_not(None),
            )
            .order_by(desc(MarketQuoteSnapshot.captured_at))
            .limit(1)
        )
        quote_row = result.scalar_one_or_none()

        if quote_row and quote_row.price is not None:
            return quote_row

        latest_date = await self._resolve_latest_intraday_date(symbol=symbol)
        if latest_date is None:
            return None

        start, end = self._today_bounds(latest_date)
        intraday_result = await self.session.execute(
            select(MarketIntradayPoint)
            .where(
                MarketIntradayPoint.symbol == symbol.upper(),
                MarketIntradayPoint.point_time >= start,
                MarketIntradayPoint.point_time < end,
            )
            .order_by(MarketIntradayPoint.point_time.desc())
            .limit(2)
        )
        rows = list(reversed(intraday_result.scalars().all()))
        if not rows:
            return None

        latest = rows[-1]
        prev = rows[-2] if len(rows) > 1 else None

        prev_price = self._normalize_reference_price(
            getattr(quote_row, "reference_price", None),
            latest.price,
        )
        if prev_price in (None, 0) and prev:
            prev_price = prev.price if prev else None
        change_value = None
        change_percent = None

        if latest.price is not None and prev_price not in (None, 0):
            change_value = latest.price - prev_price
            change_percent = (change_value / prev_price) * 100

        return SimpleNamespace(
            symbol=latest.symbol,
            exchange=latest.exchange,
            price=latest.price,
            reference_price=prev_price,
            change_value=change_value,
            change_percent=change_percent,
            volume=latest.volume,
            trading_value=latest.trading_value,
            quote_time=latest.point_time,
            captured_at=latest.captured_at,
        )

    async def get_latest_quote_map(self, symbols: list[str]) -> dict[str, MarketQuoteSnapshot]:
        if not symbols:
            return {}

        normalized = [s.upper() for s in symbols]

        subq = (
            select(
                MarketQuoteSnapshot.symbol.label("symbol"),
                func.max(MarketQuoteSnapshot.captured_at).label("max_captured_at"),
            )
            .where(MarketQuoteSnapshot.symbol.in_(normalized))
            .group_by(MarketQuoteSnapshot.symbol)
            .subquery()
        )

        stmt = (
            select(MarketQuoteSnapshot)
            .join(
                subq,
                and_(
                    MarketQuoteSnapshot.symbol == subq.c.symbol,
                    MarketQuoteSnapshot.captured_at == subq.c.max_captured_at,
                ),
            )
        )

        result = await self.session.execute(stmt)
        rows = result.scalars().all()
        return {row.symbol: row for row in rows}

    async def get_latest_intraday_map(self, symbols: list[str]) -> dict[str, MarketIntradayPoint]:
        if not symbols:
            return {}

        normalized = [s.upper() for s in symbols]

        subq = (
            select(
                MarketIntradayPoint.symbol.label("symbol"),
                func.max(MarketIntradayPoint.point_time).label("max_point_time"),
            )
            .where(MarketIntradayPoint.symbol.in_(normalized))
            .group_by(MarketIntradayPoint.symbol)
            .subquery()
        )

        stmt = (
            select(MarketIntradayPoint)
            .join(
                subq,
                and_(
                    MarketIntradayPoint.symbol == subq.c.symbol,
                    MarketIntradayPoint.point_time == subq.c.max_point_time,
                ),
            )
        )

        result = await self.session.execute(stmt)
        rows = result.scalars().all()
        return {row.symbol: row for row in rows}

    async def get_market_stocks(
        self,
        *,
        exchange: str,
        sort: str = "actives",
        page: int = 1,
        page_size: int = 5000,
        keyword: str | None = None,
    ) -> dict[str, Any]:
        symbol_rows = await self.list_symbols(
            page=1,
            page_size=100000,
            exchange=exchange,
            keyword=keyword,
        )

        if not symbol_rows:
            return {"total": 0, "items": []}

        symbols = [row.symbol.upper() for row in symbol_rows]
        quote_map = await self.get_latest_quote_map(symbols)
        intraday_map = await self.get_latest_intraday_map(symbols)

        items: list[dict[str, Any]] = []

        for row in symbol_rows:
            symbol = row.symbol.upper()
            quote_row = quote_map.get(symbol)
            intraday_row = intraday_map.get(symbol)

            price = None
            change_value = None
            change_percent = None
            volume = None
            trading_value = None
            point_time = None
            captured_at = None

            if quote_row:
                price = quote_row.price
                change_value = quote_row.change_value
                change_percent = quote_row.change_percent
                volume = quote_row.volume
                trading_value = quote_row.trading_value
                captured_at = quote_row.captured_at

            if intraday_row:
                price = intraday_row.price if intraday_row.price is not None else price
                change_value = (
                    intraday_row.change_value
                    if intraday_row.change_value is not None
                    else change_value
                )
                change_percent = (
                    intraday_row.change_percent
                    if intraday_row.change_percent is not None
                    else change_percent
                )
                volume = intraday_row.volume if intraday_row.volume is not None else volume
                trading_value = (
                    intraday_row.trading_value
                    if intraday_row.trading_value is not None
                    else trading_value
                )
                point_time = intraday_row.point_time
                captured_at = intraday_row.captured_at or captured_at

            reference_price = self._normalize_reference_price(
                getattr(quote_row, "reference_price", None),
                price,
            )
            if change_value is None and price is not None and reference_price not in (None, 0):
                change_value = price - reference_price

            if change_percent is None and change_value is not None and reference_price not in (None, 0):
                change_percent = (change_value / reference_price) * 100

            items.append(
                {
                    "symbol": row.symbol,
                    "name": row.name,
                    "exchange": row.exchange,
                    "instrument_type": row.instrument_type,
                    "source": row.source,
                    "is_active": row.is_active,
                    "updated_at": row.updated_at,
                    "price": price,
                    "change_value": change_value,
                    "change_percent": change_percent,
                    "volume": volume,
                    "trading_value": trading_value,
                    "point_time": point_time,
                    "captured_at": captured_at,
                }
            )

        sort_key = sort.lower()

        if sort_key == "all":
            items.sort(
                key=lambda x: (
                    x["symbol"],
                )
            )
        elif sort_key == "gainers":
            items.sort(
                key=lambda x: (
                    -(x["change_percent"] if x["change_percent"] is not None else float("-inf")),
                    -(x["volume"] or 0),
                    x["symbol"],
                )
            )
        elif sort_key == "losers":
            items.sort(
                key=lambda x: (
                    (x["change_percent"] if x["change_percent"] is not None else float("inf")),
                    -(x["volume"] or 0),
                    x["symbol"],
                )
            )
        else:
            items.sort(
                key=lambda x: (
                    -(x["volume"] or 0),
                    -(x["trading_value"] or 0),
                    x["symbol"],
                )
            )

        total = len(items)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size

        return {
            "total": total,
            "items": items[start_idx:end_idx],
        }

    async def get_top_stocks(self, exchange: str, sort: str = "actives", limit: int = 10):
        exchange = exchange.upper()

        latest_subquery = (
            select(
                MarketIntradayPoint.symbol.label("symbol"),
                func.max(MarketIntradayPoint.point_time).label("max_point_time"),
            )
            .where(MarketIntradayPoint.exchange == exchange)
            .group_by(MarketIntradayPoint.symbol)
            .subquery()
        )

        stmt = (
            select(MarketIntradayPoint)
            .join(
                latest_subquery,
                and_(
                    MarketIntradayPoint.symbol == latest_subquery.c.symbol,
                    MarketIntradayPoint.point_time == latest_subquery.c.max_point_time,
                ),
            )
            .where(MarketIntradayPoint.exchange == exchange)
        )

        sort = sort.lower()
        if sort == "gainers":
            stmt = stmt.order_by(desc(MarketIntradayPoint.change_percent).nullslast())
        elif sort == "losers":
            stmt = stmt.order_by(MarketIntradayPoint.change_percent.asc().nullslast())
        else:
            stmt = stmt.order_by(
                desc(MarketIntradayPoint.volume).nullslast(),
                desc(MarketIntradayPoint.trading_value).nullslast(),
            )

        stmt = stmt.limit(limit)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_index_history(self, index_symbol: str, days: int = 180):
        since = datetime.now().date() - timedelta(days=days)
        result = await self.session.execute(
            select(MarketIndexDailyPoint)
            .where(
                MarketIndexDailyPoint.index_symbol == index_symbol.upper(),
                MarketIndexDailyPoint.point_date >= since,
            )
            .order_by(MarketIndexDailyPoint.point_date.asc())
        )
        return result.scalars().all()

    async def get_latest_index_card(self, index_symbol: str):
        result = await self.session.execute(
            select(MarketIndexDailyPoint)
            .where(MarketIndexDailyPoint.index_symbol == index_symbol.upper())
            .order_by(desc(MarketIndexDailyPoint.point_date))
            .limit(2)
        )
        rows = result.scalars().all()
        latest = rows[0] if rows else None
        prev = rows[1] if len(rows) > 1 else None
        return latest, prev

    async def get_index_intraday_series(self, exchange: str, limit: int = 500):
        index_symbol = INDEX_EXCHANGE_TO_SYMBOL.get(exchange.upper(), exchange.upper())
        start, end = self._today_bounds()

        result = await self.session.execute(
            select(MarketIndexIntradayPoint)
            .where(
                MarketIndexIntradayPoint.index_symbol == index_symbol,
                MarketIndexIntradayPoint.point_time >= start,
                MarketIndexIntradayPoint.point_time < end,
            )
            .order_by(MarketIndexIntradayPoint.point_time.asc())
            .limit(limit)
        )
        return result.scalars().all()

    async def get_latest_index_intraday(self, exchange: str):
        index_symbol = INDEX_EXCHANGE_TO_SYMBOL.get(exchange.upper(), exchange.upper())
        start, end = self._today_bounds()

        result = await self.session.execute(
            select(MarketIndexIntradayPoint)
            .where(
                MarketIndexIntradayPoint.index_symbol == index_symbol,
                MarketIndexIntradayPoint.point_time >= start,
                MarketIndexIntradayPoint.point_time < end,
            )
            .order_by(desc(MarketIndexIntradayPoint.point_time))
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def list_available_indices(self) -> list[dict[str, str]]:
        symbols: dict[str, str] = {}

        daily_rows = await self.session.execute(
            select(MarketIndexDailyPoint.index_symbol, MarketIndexDailyPoint.exchange)
            .distinct()
            .order_by(MarketIndexDailyPoint.index_symbol.asc())
        )
        for symbol, exchange in daily_rows.all():
            if not symbol:
                continue
            key = str(symbol).upper()
            symbols.setdefault(key, self._resolve_index_exchange(key, exchange))

        intraday_rows = await self.session.execute(
            select(MarketIndexIntradayPoint.index_symbol, MarketIndexIntradayPoint.exchange)
            .distinct()
            .order_by(MarketIndexIntradayPoint.index_symbol.asc())
        )
        for symbol, exchange in intraday_rows.all():
            if not symbol:
                continue
            key = str(symbol).upper()
            symbols.setdefault(key, self._resolve_index_exchange(key, exchange))

        def sort_key(item: tuple[str, str]) -> tuple[int, str]:
            symbol = item[0]
            try:
                return (INDEX_PRIORITY.index(symbol), symbol)
            except ValueError:
                return (len(INDEX_PRIORITY) + 1, symbol)

        return [
            {"symbol": symbol, "exchange": exchange}
            for symbol, exchange in sorted(symbols.items(), key=sort_key)
        ]

    async def get_index_cards(self) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        available_indices = await self.list_available_indices()

        for item in available_indices:
            index_symbol = item["symbol"]
            exchange = item["exchange"]
            latest_intraday = await self.get_latest_index_intraday(index_symbol)
            latest_daily, prev_daily = await self.get_latest_index_card(index_symbol)

            if not latest_intraday and not latest_daily:
                continue

            close = None
            if latest_intraday and latest_intraday.price is not None:
                close = latest_intraday.price
            elif latest_daily:
                close = latest_daily.close_price

            prev_close = None
            if prev_daily and prev_daily.close_price is not None:
                prev_close = prev_daily.close_price
            elif latest_daily and latest_daily.open_price is not None:
                prev_close = latest_daily.open_price

            change_value = None
            change_percent = None
            if close is not None and prev_close not in (None, 0):
                change_value = close - prev_close
                change_percent = (change_value / prev_close) * 100

            items.append(
                {
                    "symbol": index_symbol,
                    "exchange": exchange,
                    "close": close,
                    "change_value": change_value,
                    "change_percent": change_percent,
                    "open": latest_daily.open_price if latest_daily else None,
                    "high": latest_daily.high_price if latest_daily else None,
                    "low": latest_daily.low_price if latest_daily else None,
                    "volume": latest_intraday.volume if latest_intraday else (latest_daily.volume if latest_daily else None),
                    "trading_value": latest_intraday.trading_value if latest_intraday else (latest_daily.trading_value if latest_daily else None),
                    "updated_at": latest_intraday.point_time if latest_intraday else (latest_daily.point_date if latest_daily else None),
                }
            )

        return items

    async def get_latest_sync_logs(self, limit: int = 20):
        result = await self.session.execute(
            select(MarketSyncLog).order_by(desc(MarketSyncLog.started_at)).limit(limit)
        )
        return result.scalars().all()

    async def get_symbol_financial_bundle(
        self,
        symbol: str,
        *,
        limit_per_section: int = 24,
    ) -> dict[str, Any]:
        normalized_symbol = symbol.upper()
        symbol_row = await self.session.get(MarketSymbol, normalized_symbol)
        exchange = getattr(symbol_row, "exchange", None)
        sections: list[dict[str, Any]] = []
        latest_updated_at: datetime | None = None

        for statement_type, table in FINANCIAL_TABLES.items():
            result = await self.session.execute(
                select(table)
                .where(table.symbol == normalized_symbol)
                .order_by(
                    desc(table.fiscal_year).nullslast(),
                    desc(table.fiscal_quarter).nullslast(),
                    desc(table.statement_date).nullslast(),
                    desc(table.updated_at),
                )
                .limit(limit_per_section)
            )
            rows = result.scalars().all()
            if not rows:
                sections.append(
                    {
                        "type": statement_type,
                        "title": FINANCIAL_TITLES.get(statement_type, statement_type),
                        "latestPeriod": None,
                        "periodType": None,
                        "rowCount": 0,
                        "rows": [],
                    }
                )
                continue

            latest_row = rows[0]
            latest_updated_at = max(
                latest_updated_at or latest_row.updated_at,
                latest_row.updated_at,
            )
            sections.append(
                {
                    "type": statement_type,
                    "title": FINANCIAL_TITLES.get(statement_type, statement_type),
                    "latestPeriod": latest_row.report_period,
                    "periodType": latest_row.period_type,
                    "rowCount": len(rows),
                    "rows": [
                        {
                            "metricKey": row.metric_key,
                            "metricLabel": row.metric_label,
                            "reportPeriod": row.report_period,
                            "periodType": row.period_type,
                            "fiscalYear": row.fiscal_year,
                            "fiscalQuarter": row.fiscal_quarter,
                            "statementDate": row.statement_date.isoformat() if row.statement_date else None,
                            "valueNumber": row.value_number,
                            "valueText": row.value_text,
                            "updatedAt": row.updated_at.isoformat() if row.updated_at else None,
                            "rawJson": row.raw_json,
                        }
                        for row in rows
                    ],
                }
            )

        highlights = self._build_financial_highlights(sections)

        return {
            "symbol": normalized_symbol,
            "exchange": exchange,
            "updatedAt": latest_updated_at.isoformat() if latest_updated_at else None,
            "highlights": highlights,
            "sections": sections,
        }

    @staticmethod
    def _build_financial_highlights(sections: list[dict[str, Any]]) -> list[dict[str, str]]:
        mappings = [
            ("Doanh thu", ["doanh thu", "revenue", "sales"]),
            ("LNST", ["loi nhuan sau thue", "profit after tax", "net income", "lợi nhuận sau thuế"]),
            ("Tong tai san", ["tong tai san", "total assets"]),
            ("Dong tien KD", ["luu chuyen tien tu hd kinh doanh", "operating cash flow", "cash flow from operating"]),
            ("ROE/ROA", ["roe", "roa"]),
        ]
        highlights: list[dict[str, str]] = []

        for label, patterns in mappings:
            match = None
            for section in sections:
                for row in section.get("rows", []):
                    metric_label = str(row.get("metricLabel") or "").lower()
                    if any(pattern in metric_label for pattern in patterns):
                        match = row
                        break
                if match:
                    break

            if not match:
                continue

            value_number = match.get("valueNumber")
            if value_number is not None:
                value_text = MarketReadRepository._format_financial_value(value_number)
            else:
                value_text = str(match.get("valueText") or "--")

            report_period = match.get("reportPeriod") or "--"
            highlights.append(
                {
                    "label": label,
                    "value": value_text,
                    "helper": f"Ky {report_period}",
                }
            )

        return highlights[:6]

    @staticmethod
    def _format_financial_value(value: float | int | None) -> str:
        if value in (None, ""):
            return "--"
        number = float(value)
        if abs(number) >= 1_000_000_000:
            return f"{number / 1_000_000_000:.2f}B"
        if abs(number) >= 1_000_000:
            return f"{number / 1_000_000:.2f}M"
        if abs(number) >= 1_000:
            return f"{number / 1_000:.2f}K"
        if number.is_integer():
            return f"{int(number)}"
        return f"{number:.2f}"

    async def get_latest_news_articles(
        self,
        *,
        source: str | None = None,
        limit: int = 10,
        search: str | None = None,
    ) -> list[MarketNewsArticle]:
        stmt = select(MarketNewsArticle)

        if source:
            stmt = stmt.where(MarketNewsArticle.source == source)

        if search:
            pattern = f"%{search.lower()}%"
            stmt = stmt.where(
                or_(
                    func.lower(func.coalesce(MarketNewsArticle.title, "")).like(pattern),
                    func.lower(func.coalesce(MarketNewsArticle.summary, "")).like(pattern),
                )
            )

        stmt = stmt.order_by(
            desc(func.coalesce(MarketNewsArticle.published_at, MarketNewsArticle.captured_at)),
            desc(MarketNewsArticle.updated_at),
        ).limit(limit)

        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def upsert_news_articles(self, articles: list[dict[str, Any]]) -> list[MarketNewsArticle]:
        if not articles:
            return []

        urls = [str(item.get("url") or "").strip() for item in articles if str(item.get("url") or "").strip()]
        existing_map: dict[tuple[str, str], MarketNewsArticle] = {}

        if urls:
            existing_result = await self.session.execute(
                select(MarketNewsArticle).where(MarketNewsArticle.url.in_(urls))
            )
            existing_rows = existing_result.scalars().all()
            existing_map = {(row.source, row.url): row for row in existing_rows}

        stored_rows: list[MarketNewsArticle] = []
        now = datetime.now()

        for payload in articles:
            source = str(payload.get("source") or "CafeF").strip() or "CafeF"
            url = str(payload.get("url") or "").strip()
            title = str(payload.get("title") or "").strip()
            if not url or not title:
                continue

            key = (source, url)
            row = existing_map.get(key)
            published_at = payload.get("published_at")
            published_text = payload.get("published_text")
            summary = payload.get("summary")
            raw_json = payload.get("raw_json")

            if row is None:
                row = MarketNewsArticle(
                    source=source,
                    title=title,
                    summary=summary,
                    url=url,
                    published_at=published_at,
                    published_text=published_text,
                    raw_json=raw_json,
                    captured_at=now,
                    updated_at=now,
                )
                self.session.add(row)
                existing_map[key] = row
            else:
                row.title = title
                row.summary = summary
                row.published_at = published_at
                row.published_text = published_text
                row.raw_json = raw_json
                row.updated_at = now

            stored_rows.append(row)

        await self.session.flush()
        return stored_rows

    async def get_active_watchlist_items(self) -> list[MarketWatchlistItem]:
        result = await self.session.execute(
            select(MarketWatchlistItem)
            .where(MarketWatchlistItem.is_active.is_(True))
            .order_by(MarketWatchlistItem.sort_order.asc(), MarketWatchlistItem.updated_at.desc())
        )
        return result.scalars().all()
