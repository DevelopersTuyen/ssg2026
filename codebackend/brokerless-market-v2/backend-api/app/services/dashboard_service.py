from __future__ import annotations

from app.repositories.market_read_repo import MarketReadRepository


class DashboardService:
    def __init__(self, repo: MarketReadRepository) -> None:
        self.repo = repo

    async def get_index_cards(self):
        items = []
        for symbol, exchange in (("VNINDEX", "HSX"), ("HNXINDEX", "HNX"), ("UPCOMINDEX", "UPCOM")):
            latest, prev = await self.repo.get_latest_index_card(symbol)
            close = latest.close_price if latest else None
            prev_close = prev.close_price if prev else None
            change_value = None
            change_percent = None
            if close is not None and prev_close not in (None, 0):
                change_value = close - prev_close
                change_percent = (change_value / prev_close) * 100
            items.append(
                {
                    "symbol": symbol,
                    "exchange": exchange,
                    "close": close,
                    "change_value": change_value,
                    "change_percent": change_percent,
                    "updated_at": latest.captured_at if latest else None,
                }
            )
        return items
