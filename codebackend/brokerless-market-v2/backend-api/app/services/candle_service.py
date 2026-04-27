from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market import MarketCandle, MarketIntradayPoint


TIMEFRAME_MINUTES = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "1h": 60,
    "1d": 24 * 60,
}


class CandleService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def resample_symbol(
        self,
        *,
        symbol: str,
        timeframe: str = "5m",
        limit: int = 20000,
    ) -> dict[str, Any]:
        symbol = symbol.upper().strip()
        timeframe = timeframe.lower().strip()
        if timeframe not in TIMEFRAME_MINUTES:
            raise ValueError(f"Unsupported timeframe: {timeframe}")

        stmt = (
            select(MarketIntradayPoint)
            .where(MarketIntradayPoint.symbol == symbol)
            .order_by(MarketIntradayPoint.point_time.desc())
            .limit(limit)
        )
        points = list((await self.session.execute(stmt)).scalars().all())
        points.reverse()
        buckets: dict[datetime, list[MarketIntradayPoint]] = defaultdict(list)
        for point in points:
            if point.point_time is None or point.price is None:
                continue
            buckets[self._bucket_time(point.point_time, timeframe)].append(point)

        now = datetime.now()
        upserted = 0
        for candle_time, rows in buckets.items():
            prices = [float(row.price) for row in rows if row.price is not None]
            if not prices:
                continue
            volume, volume_mode = self._bucket_volume(rows)
            trading_value, value_mode = self._bucket_trading_value(rows)
            quality_flags = {
                "volume_mode": volume_mode,
                "trading_value_mode": value_mode,
                "source_points": len(rows),
            }
            stmt_insert = insert(MarketCandle).values(
                symbol=symbol,
                exchange=rows[-1].exchange,
                timeframe=timeframe,
                source="resample",
                candle_time=candle_time,
                open_price=prices[0],
                high_price=max(prices),
                low_price=min(prices),
                close_price=prices[-1],
                volume=volume,
                trading_value=trading_value,
                point_count=len(rows),
                quality_flags_json=quality_flags,
                computed_at=now,
            )
            stmt_insert = stmt_insert.on_conflict_do_update(
                constraint="uq_market_candle_symbol_timeframe_time_source",
                set_={
                    "exchange": stmt_insert.excluded.exchange,
                    "open_price": stmt_insert.excluded.open_price,
                    "high_price": stmt_insert.excluded.high_price,
                    "low_price": stmt_insert.excluded.low_price,
                    "close_price": stmt_insert.excluded.close_price,
                    "volume": stmt_insert.excluded.volume,
                    "trading_value": stmt_insert.excluded.trading_value,
                    "point_count": stmt_insert.excluded.point_count,
                    "quality_flags_json": stmt_insert.excluded.quality_flags_json,
                    "computed_at": now,
                },
            )
            await self.session.execute(stmt_insert)
            upserted += 1

        return {
            "symbol": symbol,
            "timeframe": timeframe,
            "source_points": len(points),
            "candles_upserted": upserted,
        }

    async def list_candles(self, *, symbol: str, timeframe: str = "5m", limit: int = 500) -> list[dict[str, Any]]:
        symbol = symbol.upper().strip()
        timeframe = timeframe.lower().strip()
        stmt = (
            select(MarketCandle)
            .where(MarketCandle.symbol == symbol, MarketCandle.timeframe == timeframe)
            .order_by(MarketCandle.candle_time.desc())
            .limit(limit)
        )
        rows = list((await self.session.execute(stmt)).scalars().all())
        rows.reverse()
        return [
            {
                "symbol": row.symbol,
                "exchange": row.exchange,
                "timeframe": row.timeframe,
                "time": row.candle_time,
                "open": row.open_price,
                "high": row.high_price,
                "low": row.low_price,
                "close": row.close_price,
                "volume": row.volume,
                "trading_value": row.trading_value,
                "point_count": row.point_count,
                "quality_flags": row.quality_flags_json or {},
                "computed_at": row.computed_at,
            }
            for row in rows
        ]

    async def list_recent_intraday_symbols(self, *, limit: int = 30) -> list[str]:
        stmt = (
            select(MarketIntradayPoint.symbol)
            .where(MarketIntradayPoint.symbol.is_not(None))
            .group_by(MarketIntradayPoint.symbol)
            .order_by(desc(func.max(MarketIntradayPoint.point_time)))
            .limit(limit)
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        return [str(symbol).upper() for symbol in rows if symbol]

    def _bucket_time(self, value: datetime, timeframe: str) -> datetime:
        if timeframe == "1d":
            return value.replace(hour=0, minute=0, second=0, microsecond=0)
        minutes = TIMEFRAME_MINUTES[timeframe]
        total_minutes = value.hour * 60 + value.minute
        bucket = (total_minutes // minutes) * minutes
        return value.replace(hour=bucket // 60, minute=bucket % 60, second=0, microsecond=0)

    def _bucket_volume(self, rows: list[MarketIntradayPoint]) -> tuple[float | None, str]:
        values = [float(row.volume) for row in rows if row.volume is not None]
        if not values:
            return None, "missing"
        if len(values) > 1 and all(values[index] <= values[index + 1] for index in range(len(values) - 1)):
            return max(values) - min(values), "cumulative_delta"
        return sum(values), "point_sum"

    def _bucket_trading_value(self, rows: list[MarketIntradayPoint]) -> tuple[float | None, str]:
        values = [float(row.trading_value) for row in rows if row.trading_value is not None]
        if not values:
            return None, "missing"
        if len(values) > 1 and all(values[index] <= values[index + 1] for index in range(len(values) - 1)):
            return max(values) - min(values), "cumulative_delta"
        return sum(values), "point_sum"
