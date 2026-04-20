from __future__ import annotations

from datetime import datetime

from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market import MarketSymbol, MarketWatchlistItem


class WatchlistRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_items(self, active_only: bool = False) -> list[MarketWatchlistItem]:
        stmt = select(MarketWatchlistItem)
        if active_only:
            stmt = stmt.where(MarketWatchlistItem.is_active.is_(True))
        stmt = stmt.order_by(MarketWatchlistItem.sort_order.asc(), MarketWatchlistItem.updated_at.desc())
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def get_by_symbol(self, symbol: str) -> MarketWatchlistItem | None:
        result = await self.session.execute(
            select(MarketWatchlistItem).where(MarketWatchlistItem.symbol == symbol.upper())
        )
        return result.scalar_one_or_none()

    async def upsert_item(
        self,
        *,
        symbol: str,
        exchange: str | None = None,
        note: str | None = None,
        sort_order: int = 0,
        is_active: bool = True,
    ) -> MarketWatchlistItem | None:
        symbol = symbol.upper()
        now = datetime.now()

        if exchange is None:
            market_symbol = await self.session.get(MarketSymbol, symbol)
            if market_symbol:
                exchange = market_symbol.exchange

        stmt = insert(MarketWatchlistItem).values(
            symbol=symbol,
            exchange=exchange,
            note=note,
            sort_order=sort_order,
            is_active=is_active,
            created_at=now,
            updated_at=now,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[MarketWatchlistItem.symbol],
            set_={
                "exchange": exchange,
                "note": note,
                "sort_order": sort_order,
                "is_active": is_active,
                "updated_at": now,
            },
        )
        await self.session.execute(stmt)
        await self.session.flush()
        return await self.get_by_symbol(symbol)

    async def update_item(
        self,
        symbol: str,
        *,
        note: str | None = None,
        sort_order: int | None = None,
        is_active: bool | None = None,
    ) -> MarketWatchlistItem | None:
        item = await self.get_by_symbol(symbol)
        if not item:
            return None

        if note is not None:
            item.note = note
        if sort_order is not None:
            item.sort_order = sort_order
        if is_active is not None:
            item.is_active = is_active

        item.updated_at = datetime.now()
        await self.session.flush()
        return item

    async def delete_item(self, symbol: str) -> None:
        await self.session.execute(
            delete(MarketWatchlistItem).where(MarketWatchlistItem.symbol == symbol.upper())
        )