# from fastapi import APIRouter, Depends, Query

# from app.core.db import SessionLocal
# from app.repositories.market_read_repo import MarketReadRepository, INDEX_EXCHANGE_TO_SYMBOL

# router = APIRouter(prefix="/api/market", tags=["market"])


# async def get_repo():
#     async with SessionLocal() as session:
#         yield MarketReadRepository(session)


# @router.get("/symbols/search")
# async def search_symbols(
#     q: str = Query(min_length=1),
#     limit: int = Query(default=20, ge=1, le=100),
#     repo: MarketReadRepository = Depends(get_repo),
# ):
#     rows = await repo.search_symbols(q, limit=limit)
#     return {
#         "success": True,
#         "data": [
#             {
#                 "symbol": row.symbol,
#                 "name": row.name,
#                 "exchange": row.exchange,
#                 "instrument_type": row.instrument_type,
#                 "updated_at": row.updated_at,
#             }
#             for row in rows
#         ],
#     }


# @router.get("/symbols/{symbol}/quote")
# async def get_symbol_quote(symbol: str, repo: MarketReadRepository = Depends(get_repo)):
#     row = await repo.get_latest_quote(symbol)
#     data = None
#     if row:
#         data = {
#             "symbol": row.symbol,
#             "exchange": row.exchange,
#             "price": row.price,
#             "reference_price": getattr(row, "reference_price", None),
#             "change_value": row.change_value,
#             "change_percent": row.change_percent,
#             "volume": row.volume,
#             "trading_value": row.trading_value,
#             "open_price": getattr(row, "open_price", None),
#             "high_price": getattr(row, "high_price", None),
#             "low_price": getattr(row, "low_price", None),
#             "quote_time": getattr(row, "quote_time", None),
#             "captured_at": row.captured_at,
#         }
#     return {"success": True, "data": data}


# @router.get("/symbols/{symbol}/intraday")
# async def get_symbol_intraday(
#     symbol: str,
#     limit: int = Query(default=1000, ge=1, le=20000),
#     repo: MarketReadRepository = Depends(get_repo),
# ):
#     rows = await repo.get_intraday_points(symbol=symbol, limit=limit)
#     data = [
#         {
#             "time": row.point_time,
#             "price": row.price,
#             "change_value": row.change_value,
#             "change_percent": row.change_percent,
#             "volume": row.volume,
#             "trading_value": row.trading_value,
#         }
#         for row in rows
#     ]
#     return {"success": True, "data": data}


# @router.get("/symbols/{symbol}/hourly")
# async def get_symbol_hourly(symbol: str, repo: MarketReadRepository = Depends(get_repo)):
#     rows = await repo.get_symbol_intraday_hourly(symbol=symbol)
#     return {"success": True, "data": rows}


# @router.get("/indices/{index_symbol}/history")
# async def get_index_history(
#     index_symbol: str,
#     period: str = Query(default="6M"),
#     repo: MarketReadRepository = Depends(get_repo),
# ):
#     period = period.upper()
#     days_map = {"10D": 14, "1M": 31, "3M": 93, "6M": 186, "1Y": 366}
#     days = days_map.get(period, 186)

#     rows = await repo.get_index_history(index_symbol=index_symbol, days=days)
#     data = [
#         {
#             "date": row.point_date,
#             "open": row.open_price,
#             "high": row.high_price,
#             "low": row.low_price,
#             "close": row.close_price,
#             "volume": row.volume,
#             "value": row.trading_value,
#         }
#         for row in rows
#     ]
#     return {"success": True, "data": data}


# @router.get("/indices/{exchange}/series")
# async def get_index_series(exchange: str, repo: MarketReadRepository = Depends(get_repo)):
#     exchange = exchange.upper()
#     index_symbol = INDEX_EXCHANGE_TO_SYMBOL.get(exchange, exchange)

#     intraday_rows = await repo.get_index_intraday_series(exchange=exchange, limit=500)
#     if intraday_rows:
#         return {
#             "success": True,
#             "data": [
#                 {
#                     "time": row.point_time,
#                     "price": row.price,
#                     "volume": row.volume,
#                     "trading_value": row.trading_value,
#                 }
#                 for row in intraday_rows
#             ],
#         }

#     rows = await repo.get_index_history(index_symbol=index_symbol, days=30)
#     return {
#         "success": True,
#         "data": [
#             {
#                 "date": row.point_date,
#                 "close": row.close_price,
#                 "volume": row.volume,
#                 "value": row.trading_value,
#             }
#             for row in rows
#         ],
#     }

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.db import SessionLocal
from app.repositories.market_read_repo import MarketReadRepository
from app.schemas.market import ApiEnvelope
from app.services.candle_service import CandleService
from app.services.data_quality_service import DataQualityService
from app.services.exchange_rules_service import ExchangeRulesService

router = APIRouter(prefix="/api/market", tags=["market"])


async def get_repo():
    async with SessionLocal() as session:
        yield MarketReadRepository(session)


@router.get("/exchange-rules", response_model=ApiEnvelope)
async def list_exchange_rules():
    async with SessionLocal() as session:
        data = await ExchangeRulesService(session).list_rules()
    return ApiEnvelope(data=data)


@router.get("/exchange-rules/{exchange}", response_model=ApiEnvelope)
async def get_exchange_rule(exchange: str):
    async with SessionLocal() as session:
        data = await ExchangeRulesService(session).get_rule(exchange)
    return ApiEnvelope(data=data)


@router.get("/symbols", response_model=ApiEnvelope)
async def list_symbols(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    exchange: str | None = Query(default=None),
    q: str | None = Query(default=None),
    repo: MarketReadRepository = Depends(get_repo),
):
    total = await repo.count_symbols(exchange=exchange, keyword=q)
    rows = await repo.list_symbols(
        page=page,
        page_size=page_size,
        exchange=exchange,
        keyword=q,
    )

    data = {
        "items": [
            {
                "symbol": row.symbol,
                "name": row.name,
                "exchange": row.exchange,
                "instrument_type": row.instrument_type,
                "industry": row.industry,
                "sector": row.sector,
                "market_cap": row.market_cap,
                "shares_outstanding": row.shares_outstanding,
                "foreign_room": row.foreign_room,
                "trading_status": row.trading_status,
                "source": row.source,
                "is_active": row.is_active,
                "updated_at": row.updated_at,
            }
            for row in rows
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size,
    }
    return ApiEnvelope(data=data)


@router.get("/symbols/search", response_model=ApiEnvelope)
async def search_symbols(
    q: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=100),
    repo: MarketReadRepository = Depends(get_repo),
):
    rows = await repo.search_symbols(q, limit=limit)
    data = [
        {
            "symbol": row.symbol,
            "name": row.name,
            "exchange": row.exchange,
            "instrument_type": row.instrument_type,
            "industry": row.industry,
            "sector": row.sector,
            "market_cap": row.market_cap,
            "shares_outstanding": row.shares_outstanding,
            "foreign_room": row.foreign_room,
            "trading_status": row.trading_status,
            "updated_at": row.updated_at,
        }
        for row in rows
    ]
    return ApiEnvelope(data=data)


@router.post("/symbols/{symbol}/candles/resample", response_model=ApiEnvelope)
async def resample_symbol_candles(
    symbol: str,
    timeframe: str = Query(default="5m", pattern="^(1m|5m|15m|1h|1d)$"),
    limit: int = Query(default=20000, ge=100, le=100000),
):
    async with SessionLocal() as session:
        try:
            data = await CandleService(session).resample_symbol(symbol=symbol, timeframe=timeframe, limit=limit)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        await session.commit()
    return ApiEnvelope(data=data)


@router.get("/symbols/{symbol}/candles", response_model=ApiEnvelope)
async def list_symbol_candles(
    symbol: str,
    timeframe: str = Query(default="5m", pattern="^(1m|5m|15m|1h|1d)$"),
    limit: int = Query(default=500, ge=1, le=5000),
):
    async with SessionLocal() as session:
        data = await CandleService(session).list_candles(symbol=symbol, timeframe=timeframe, limit=limit)
    return ApiEnvelope(data=data)


@router.get("/symbols/{symbol}/quote", response_model=ApiEnvelope)
async def get_symbol_quote(symbol: str, repo: MarketReadRepository = Depends(get_repo)):
    row = await repo.get_latest_quote(symbol)
    data = None
    if row:
        data = {
            "symbol": row.symbol,
            "exchange": row.exchange,
            "price": row.price,
            "reference_price": getattr(row, "reference_price", None),
            "change_value": row.change_value,
            "change_percent": row.change_percent,
            "volume": row.volume,
            "trading_value": row.trading_value,
            "open_price": getattr(row, "open_price", None),
            "high_price": getattr(row, "high_price", None),
            "low_price": getattr(row, "low_price", None),
            "quote_time": getattr(row, "quote_time", None),
            "captured_at": row.captured_at,
        }
    return ApiEnvelope(data=data)


@router.get("/symbols/{symbol}/intraday", response_model=ApiEnvelope)
async def get_symbol_intraday(
    symbol: str,
    limit: int = Query(default=500, ge=1, le=5000),
    repo: MarketReadRepository = Depends(get_repo),
):
    rows = await repo.get_intraday_points(symbol, limit=limit)
    data = [
        {
            "time": row.point_time,
            "price": row.price,
            "change_value": row.change_value,
            "change_percent": row.change_percent,
            "volume": row.volume,
            "trading_value": row.trading_value,
        }
        for row in rows
    ]
    return ApiEnvelope(data=data)


@router.post("/data-quality/scan", response_model=ApiEnvelope)
async def scan_data_quality(
    exchange: str | None = Query(default=None),
    limit: int = Query(default=500, ge=50, le=5000),
):
    async with SessionLocal() as session:
        data = await DataQualityService(session).scan(exchange=exchange, limit=limit)
        await session.commit()
    return ApiEnvelope(data=data)


@router.get("/data-quality/issues", response_model=ApiEnvelope)
async def list_data_quality_issues(limit: int = Query(default=100, ge=1, le=500)):
    async with SessionLocal() as session:
        data = await DataQualityService(session).list_open(limit=limit)
    return ApiEnvelope(data=data)


@router.get("/indices/{index_symbol}/history", response_model=ApiEnvelope)
async def get_index_history(
    index_symbol: str,
    period: str = Query(default="6M"),
    repo: MarketReadRepository = Depends(get_repo),
):
    period = period.upper()
    days_map = {"10D": 14, "1M": 31, "3M": 93, "6M": 186, "1Y": 366}
    days = days_map.get(period, 186)
    rows = await repo.get_index_history(index_symbol, days=days)
    data = [
        {
            "date": row.point_date,
            "open": row.open_price,
            "high": row.high_price,
            "low": row.low_price,
            "close": row.close_price,
            "volume": row.volume,
            "value": row.trading_value,
        }
        for row in rows
    ]
    return ApiEnvelope(data=data)
