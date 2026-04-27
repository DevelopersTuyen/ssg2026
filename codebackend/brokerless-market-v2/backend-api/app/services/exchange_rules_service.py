from __future__ import annotations

from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market import MarketExchangeRule


DEFAULT_EXCHANGE_RULES: dict[str, dict[str, Any]] = {
    "HSX": {
        "timezone": "Asia/Ho_Chi_Minh",
        "trading_sessions_json": [
            {"code": "preopen", "label": "ATO", "start": "09:00", "end": "09:15"},
            {"code": "morning", "label": "Continuous morning", "start": "09:15", "end": "11:30"},
            {"code": "lunch", "label": "Lunch break", "start": "11:30", "end": "13:00", "is_break": True},
            {"code": "afternoon", "label": "Continuous afternoon", "start": "13:00", "end": "14:30"},
            {"code": "close", "label": "ATC", "start": "14:30", "end": "14:45"},
        ],
        "tick_size_rules_json": [
            {"lt": 10000, "tick": 10},
            {"lt": 50000, "tick": 50},
            {"gte": 50000, "tick": 100},
        ],
        "lot_size": 100,
        "odd_lot_size": 1,
        "price_limit_percent": 7,
        "holiday_calendar_json": [],
        "supported_order_types_json": ["LO", "ATO", "ATC", "MP"],
    },
    "HNX": {
        "timezone": "Asia/Ho_Chi_Minh",
        "trading_sessions_json": [
            {"code": "morning", "label": "Continuous morning", "start": "09:00", "end": "11:30"},
            {"code": "lunch", "label": "Lunch break", "start": "11:30", "end": "13:00", "is_break": True},
            {"code": "afternoon", "label": "Continuous afternoon", "start": "13:00", "end": "14:30"},
            {"code": "close", "label": "ATC", "start": "14:30", "end": "14:45"},
        ],
        "tick_size_rules_json": [{"gte": 0, "tick": 100}],
        "lot_size": 100,
        "odd_lot_size": 1,
        "price_limit_percent": 10,
        "holiday_calendar_json": [],
        "supported_order_types_json": ["LO", "ATC", "MTL", "MOK", "MAK"],
    },
    "UPCOM": {
        "timezone": "Asia/Ho_Chi_Minh",
        "trading_sessions_json": [
            {"code": "morning", "label": "Continuous morning", "start": "09:00", "end": "11:30"},
            {"code": "lunch", "label": "Lunch break", "start": "11:30", "end": "13:00", "is_break": True},
            {"code": "afternoon", "label": "Continuous afternoon", "start": "13:00", "end": "15:00"},
        ],
        "tick_size_rules_json": [{"gte": 0, "tick": 100}],
        "lot_size": 100,
        "odd_lot_size": 1,
        "price_limit_percent": 15,
        "holiday_calendar_json": [],
        "supported_order_types_json": ["LO"],
    },
}


async def seed_exchange_rules(session: AsyncSession) -> None:
    now = datetime.now()
    for exchange, values in DEFAULT_EXCHANGE_RULES.items():
        stmt = insert(MarketExchangeRule).values(
            exchange=exchange,
            updated_at=now,
            is_active=True,
            **values,
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_market_exchange_rules_exchange",
            set_={
                "timezone": stmt.excluded.timezone,
                "trading_sessions_json": stmt.excluded.trading_sessions_json,
                "tick_size_rules_json": stmt.excluded.tick_size_rules_json,
                "lot_size": stmt.excluded.lot_size,
                "odd_lot_size": stmt.excluded.odd_lot_size,
                "price_limit_percent": stmt.excluded.price_limit_percent,
                "holiday_calendar_json": stmt.excluded.holiday_calendar_json,
                "supported_order_types_json": stmt.excluded.supported_order_types_json,
                "is_active": True,
                "updated_at": now,
            },
        )
        await session.execute(stmt)


class ExchangeRulesService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_rules(self) -> list[dict[str, Any]]:
        stmt = select(MarketExchangeRule).where(MarketExchangeRule.is_active.is_(True)).order_by(MarketExchangeRule.exchange)
        rows = (await self.session.execute(stmt)).scalars().all()
        return [self._to_dict(row) for row in rows]

    async def get_rule(self, exchange: str) -> dict[str, Any] | None:
        stmt = select(MarketExchangeRule).where(MarketExchangeRule.exchange == exchange.upper())
        row = (await self.session.execute(stmt)).scalar_one_or_none()
        return self._to_dict(row) if row else None

    async def evaluate_context(
        self,
        *,
        exchange: str,
        price: float | None = None,
        reference_price: float | None = None,
        volume: float | None = None,
        at: datetime | None = None,
    ) -> dict[str, Any]:
        rule = await self.get_rule(exchange)
        if not rule:
            return {"exchange": exchange.upper(), "known_exchange": False}

        current = at or datetime.now(ZoneInfo(rule["timezone"]))
        session_state = self._session_state(rule, current)
        price_limit = self._price_limit(rule, reference_price)
        tick_size = self._tick_size(rule, price)
        lot_size = int(rule.get("lot_size") or 100)

        return {
            "exchange": rule["exchange"],
            "known_exchange": True,
            "session": session_state,
            "tick_size": tick_size,
            "price_limit": price_limit,
            "is_price_in_range": self._is_price_in_range(price, price_limit),
            "is_lot_valid": None if volume is None else volume % lot_size == 0,
            "lot_size": lot_size,
            "order_types": rule.get("supported_order_types") or [],
        }

    def _to_dict(self, row: MarketExchangeRule) -> dict[str, Any]:
        return {
            "exchange": row.exchange,
            "timezone": row.timezone,
            "trading_sessions": row.trading_sessions_json or [],
            "tick_size_rules": row.tick_size_rules_json or [],
            "lot_size": row.lot_size,
            "odd_lot_size": row.odd_lot_size,
            "price_limit_percent": row.price_limit_percent,
            "holiday_calendar": row.holiday_calendar_json or [],
            "supported_order_types": row.supported_order_types_json or [],
            "is_active": row.is_active,
            "updated_at": row.updated_at,
        }

    def _session_state(self, rule: dict[str, Any], current: datetime) -> dict[str, Any]:
        if current.weekday() >= 5:
            return {"code": "closed", "label": "Weekend", "is_trading": False}

        day_key = current.date().isoformat()
        holidays = set(rule.get("holiday_calendar") or [])
        if day_key in holidays:
            return {"code": "closed", "label": "Holiday", "is_trading": False}

        now_minutes = current.hour * 60 + current.minute
        for item in rule.get("trading_sessions") or []:
            start = self._minutes(item.get("start"))
            end = self._minutes(item.get("end"))
            if start <= now_minutes < end:
                return {
                    "code": item.get("code"),
                    "label": item.get("label"),
                    "is_trading": not bool(item.get("is_break")),
                    "start": item.get("start"),
                    "end": item.get("end"),
                }
        return {"code": "closed", "label": "Closed", "is_trading": False}

    def _tick_size(self, rule: dict[str, Any], price: float | None) -> float | None:
        if price is None:
            return None
        for item in rule.get("tick_size_rules") or []:
            lower_ok = "gte" not in item or price >= float(item["gte"])
            upper_ok = "lt" not in item or price < float(item["lt"])
            if lower_ok and upper_ok:
                return float(item.get("tick") or 0)
        return None

    def _price_limit(self, rule: dict[str, Any], reference_price: float | None) -> dict[str, float | None]:
        percent = rule.get("price_limit_percent")
        if reference_price is None or percent is None:
            return {"floor": None, "ceiling": None, "reference": reference_price}
        band = reference_price * float(percent) / 100
        return {"floor": reference_price - band, "ceiling": reference_price + band, "reference": reference_price}

    def _is_price_in_range(self, price: float | None, price_limit: dict[str, float | None]) -> bool | None:
        floor = price_limit.get("floor")
        ceiling = price_limit.get("ceiling")
        if price is None or floor is None or ceiling is None:
            return None
        return floor <= price <= ceiling

    def _minutes(self, value: str | None) -> int:
        if not value or ":" not in value:
            return 0
        hour, minute = value.split(":", 1)
        return int(hour) * 60 + int(minute)
