from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timedelta
from types import SimpleNamespace
from typing import Any

from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market import (
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
    "VNMID",
    "VNSML",
    "HNXINDEX",
    "HNX30",
    "UPCOMINDEX",
]


class MarketReadRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _today_bounds(ref: date | None = None) -> tuple[datetime, datetime]:
        d = ref or datetime.now().date()
        start = datetime.combine(d, time.min)
        end = start + timedelta(days=1)
        return start, end

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
                func.lower(func.coalesce(MarketSymbol.instrument_type, "")) != "index",
            ),
        )

    async def search_symbols(self, keyword: str, limit: int = 20):
        pattern = f"%{keyword.upper()}%"
        stmt = self._stock_symbols_stmt().where(
            or_(
                func.upper(MarketSymbol.symbol).like(pattern),
                func.upper(func.coalesce(MarketSymbol.name, "")).like(pattern),
            )
        ).order_by(MarketSymbol.exchange.asc(), MarketSymbol.symbol.asc()).limit(limit)

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

        if keyword:
            pattern = f"%{keyword.upper()}%"
            stmt = stmt.where(
                or_(
                    func.upper(MarketSymbol.symbol).like(pattern),
                    func.upper(func.coalesce(MarketSymbol.name, "")).like(pattern),
                )
            )

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

        if keyword:
            pattern = f"%{keyword.upper()}%"
            stmt = stmt.where(
                or_(
                    func.upper(MarketSymbol.symbol).like(pattern),
                    func.upper(func.coalesce(MarketSymbol.name, "")).like(pattern),
                )
            )

        stmt = (
            stmt.order_by(MarketSymbol.exchange.asc(), MarketSymbol.symbol.asc())
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
        if sort_key == "gainers":
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
        pattern = f"%{keyword.upper()}%"
        result = await self.session.execute(
            select(MarketSymbol)
            .where(
                MarketSymbol.is_active.is_(True),
                or_(
                    func.upper(MarketSymbol.symbol).like(pattern),
                    func.upper(func.coalesce(MarketSymbol.name, "")).like(pattern),
                ),
            )
            .order_by(MarketSymbol.exchange.asc(), MarketSymbol.symbol.asc())
            .limit(limit)
        )
        return result.scalars().all()

    async def count_symbols(self, exchange: str | None = None, keyword: str | None = None) -> int:
        stmt = select(func.count()).select_from(MarketSymbol).where(MarketSymbol.is_active.is_(True))

        if exchange:
            stmt = stmt.where(MarketSymbol.exchange == exchange.upper())

        if keyword:
            pattern = f"%{keyword.upper()}%"
            stmt = stmt.where(
                or_(
                    func.upper(MarketSymbol.symbol).like(pattern),
                    func.upper(func.coalesce(MarketSymbol.name, "")).like(pattern),
                )
            )

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
        stmt = select(MarketSymbol).where(MarketSymbol.is_active.is_(True))

        if exchange:
            stmt = stmt.where(MarketSymbol.exchange == exchange.upper())

        if keyword:
            pattern = f"%{keyword.upper()}%"
            stmt = stmt.where(
                or_(
                    func.upper(MarketSymbol.symbol).like(pattern),
                    func.upper(func.coalesce(MarketSymbol.name, "")).like(pattern),
                )
            )

        stmt = (
            stmt.order_by(MarketSymbol.exchange.asc(), MarketSymbol.symbol.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )

        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_symbols_by_exchange(self, exchange: str, limit: int | None = None):
        stmt = (
            select(MarketSymbol)
            .where(
                MarketSymbol.exchange == exchange.upper(),
                MarketSymbol.is_active.is_(True),
            )
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
        start, end = self._today_bounds(trading_date)
        result = await self.session.execute(
            select(MarketIntradayPoint)
            .where(
                MarketIntradayPoint.symbol == symbol.upper(),
                MarketIntradayPoint.point_time >= start,
                MarketIntradayPoint.point_time < end,
            )
            .order_by(MarketIntradayPoint.point_time.asc())
            .limit(limit)
        )
        return result.scalars().all()

    async def get_symbol_intraday_hourly(
        self,
        symbol: str,
        trading_date: date | None = None,
    ) -> list[dict[str, Any]]:
        rows = await self.get_intraday_points(symbol=symbol, limit=20000, trading_date=trading_date)

        buckets: dict[datetime, dict[str, Any]] = {}

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

    async def get_exchange_intraday_hourly(
        self,
        exchange: str,
        trading_date: date | None = None,
    ) -> list[dict[str, Any]]:
        exchange = exchange.upper()
        symbols = [row.symbol for row in await self.get_symbols_by_exchange(exchange, limit=None)]
        if not symbols:
            return []

        start, end = self._today_bounds(trading_date)

        result = await self.session.execute(
            select(MarketIntradayPoint)
            .where(
                MarketIntradayPoint.symbol.in_(symbols),
                MarketIntradayPoint.point_time >= start,
                MarketIntradayPoint.point_time < end,
            )
            .order_by(MarketIntradayPoint.point_time.asc())
        )
        rows = result.scalars().all()

        buckets: dict[datetime, dict[str, Any]] = {}
        symbol_seen_per_bucket: dict[datetime, set[str]] = defaultdict(set)

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

    async def get_latest_quote(self, symbol: str):
        result = await self.session.execute(
            select(MarketQuoteSnapshot)
            .where(MarketQuoteSnapshot.symbol == symbol.upper())
            .order_by(desc(MarketQuoteSnapshot.captured_at))
            .limit(1)
        )
        quote_row = result.scalar_one_or_none()

        if quote_row and quote_row.price is not None:
            return quote_row

        rows = await self.get_intraday_points(symbol=symbol, limit=10)
        if not rows:
            return None

        latest = rows[-1]
        prev = rows[-2] if len(rows) > 1 else None

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

        if sort_key == "gainers":
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

        symbol_rows = await self.session.execute(
            select(MarketSymbol.symbol, MarketSymbol.exchange)
            .where(
                MarketSymbol.is_active.is_(True),
                func.lower(func.coalesce(MarketSymbol.instrument_type, "")) == "index",
            )
            .order_by(MarketSymbol.symbol.asc())
        )
        for symbol, exchange in symbol_rows.all():
            if not symbol:
                continue
            key = str(symbol).upper()
            symbols[key] = self._resolve_index_exchange(key, exchange)

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
