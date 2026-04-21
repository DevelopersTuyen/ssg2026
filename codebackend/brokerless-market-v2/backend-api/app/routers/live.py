from __future__ import annotations

from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query

from app.core.db import SessionLocal
from app.repositories.market_read_repo import INDEX_EXCHANGE_TO_SYMBOL, MarketReadRepository
from app.services.cafef_news_service import CafeFNewsService

router = APIRouter(prefix="/api/live", tags=["live"])
cafef_news_service = CafeFNewsService()


async def get_repo():
    async with SessionLocal() as session:
        yield MarketReadRepository(session)


def _to_iso(value):
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.replace(tzinfo=None).isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return str(value)


@router.get("/stocks")
async def get_stocks(
    exchange: str = Query(...),
    sort: str = Query(default="actives"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=5000, ge=1, le=10000),
    q: str | None = Query(default=None),
    repo: MarketReadRepository = Depends(get_repo),
):
    result = await repo.get_market_stocks(
        exchange=exchange,
        sort=sort,
        page=page,
        page_size=page_size,
        keyword=q,
    )

    return {
        "exchange": exchange.upper(),
        "sort": sort,
        "page": page,
        "pageSize": page_size,
        "total": result["total"],
        "capturedAt": _to_iso(datetime.now()),
        "items": [
            {
                "rank": idx + 1 + ((page - 1) * page_size),
                "symbol": row["symbol"],
                "name": row["name"],
                "exchange": row["exchange"],
                "instrumentType": row["instrument_type"],
                "price": row["price"],
                "changeValue": row["change_value"],
                "changePercent": row["change_percent"],
                "volume": row["volume"],
                "tradingValue": row["trading_value"],
                "pointTime": _to_iso(row["point_time"]),
                "capturedAt": _to_iso(row["captured_at"]),
                "updatedAt": _to_iso(row["updated_at"]),
            }
            for idx, row in enumerate(result["items"])
        ],
    }


@router.get("/hourly-trading")
async def get_hourly_trading(
    exchange: str = Query(default="HSX"),
    repo: MarketReadRepository = Depends(get_repo),
):
    rows = await repo.get_exchange_intraday_hourly(exchange=exchange)
    return {
        "exchange": exchange.upper(),
        "items": [
            {
                "time": _to_iso(item["time"]),
                "volume": item["volume"],
                "tradingValue": item["trading_value"],
                "pointCount": item["point_count"],
                "symbolCount": item["symbol_count"],
            }
            for item in rows
        ],
    }


@router.get("/index-cards")
async def get_index_cards(repo: MarketReadRepository = Depends(get_repo)):
    items = await repo.get_index_cards()
    return {"capturedAt": _to_iso(datetime.now()), "items": items}


@router.get("/index-options")
async def get_index_options(repo: MarketReadRepository = Depends(get_repo)):
    items = await repo.list_available_indices()
    return {"items": items}


@router.get("/index-series")
async def get_index_series(
    exchange: str,
    days: int = Query(default=30, ge=1, le=365),
    prefer_daily: bool = Query(default=False),
    repo: MarketReadRepository = Depends(get_repo),
):
    exchange = exchange.upper()
    index_symbol = INDEX_EXCHANGE_TO_SYMBOL.get(exchange, exchange)

    intraday_rows = [] if prefer_daily else await repo.get_index_intraday_series(exchange=exchange, limit=500)
    if intraday_rows:
        return {
            "exchange": exchange,
            "items": [
                {
                    "time": _to_iso(row.point_time),
                    "open": None,
                    "high": None,
                    "low": None,
                    "close": row.price,
                    "volume": row.volume,
                    "value": row.trading_value,
                }
                for row in intraday_rows
            ],
        }

    daily_rows = await repo.get_index_history(index_symbol=index_symbol, days=days)
    items = []
    for row in daily_rows:
        fake_time = datetime.combine(row.point_date, time(9, 0, 0))
        items.append(
            {
                "time": _to_iso(fake_time),
                "open": row.open_price,
                "high": row.high_price,
                "low": row.low_price,
                "close": row.close_price,
                "volume": row.volume,
                "value": row.trading_value,
            }
        )

    return {
        "exchange": exchange,
        "items": items,
        "fallback": "daily",
    }


@router.get("/symbols/{symbol}/quote")
async def get_symbol_quote(symbol: str, repo: MarketReadRepository = Depends(get_repo)):
    row = await repo.get_latest_quote(symbol)
    if not row:
        return {"symbol": symbol.upper(), "quote": None}

    return {
        "symbol": row.symbol,
        "exchange": row.exchange,
        "quote": {
            "price": row.price,
            "referencePrice": getattr(row, "reference_price", None),
            "changeValue": row.change_value,
            "changePercent": row.change_percent,
            "volume": row.volume,
            "tradingValue": row.trading_value,
            "quoteTime": _to_iso(getattr(row, "quote_time", None)),
            "capturedAt": _to_iso(row.captured_at),
        },
    }


@router.get("/symbols/{symbol}/hourly")
async def get_symbol_hourly(
    symbol: str,
    repo: MarketReadRepository = Depends(get_repo),
):
    rows = await repo.get_symbol_intraday_hourly(symbol=symbol)
    return {
        "symbol": symbol.upper(),
        "items": [
            {
                "time": _to_iso(item["time"]),
                "open": item["open"],
                "high": item["high"],
                "low": item["low"],
                "close": item["close"],
                "volume": item["volume"],
                "tradingValue": item["trading_value"],
                "pointCount": item["point_count"],
            }
            for item in rows
        ],
    }


@router.get("/symbols/{symbol}/financials")
async def get_symbol_financials(
    symbol: str,
    limit_per_section: int = Query(default=24, ge=6, le=100),
    repo: MarketReadRepository = Depends(get_repo),
):
    return await repo.get_symbol_financial_bundle(symbol=symbol, limit_per_section=limit_per_section)


@router.get("/news")
async def get_news(
    limit: int = 10,
    search: str | None = Query(default=None),
    repo: MarketReadRepository = Depends(get_repo),
):
    cafef_items = await cafef_news_service.fetch_latest_news(limit=limit, search=search, repo=repo)
    if cafef_items:
        return [cafef_news_service.to_news_payload(item, index) for index, item in enumerate(cafef_items, start=1)]

    logs = await repo.get_latest_sync_logs(limit=limit)
    return [
        {
            "id": str(log.id),
            "title": log.message or f"{log.job_name} - {log.status}",
            "summary": log.message,
            "date": _to_iso(log.started_at),
            "capturedAt": _to_iso(log.finished_at or log.started_at),
            "url": None,
            "source": "sync-log",
        }
        for log in logs
    ]
