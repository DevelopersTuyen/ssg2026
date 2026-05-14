from __future__ import annotations

from datetime import date, datetime, time
import re

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


def _normalize_text(value: str | None) -> str:
    return (value or "").strip()


POSITIVE_NEWS_KEYWORDS = (
    "tăng trưởng",
    "lợi nhuận",
    "lãi",
    "cổ tức",
    "mở rộng",
    "hợp đồng",
    "đầu tư",
    "bứt phá",
    "mua ròng",
    "tích cực",
    "khởi công",
    "nâng hạng",
)

NEGATIVE_NEWS_KEYWORDS = (
    "lỗ",
    "giảm mạnh",
    "suy giảm",
    "xử phạt",
    "khởi tố",
    "điều tra",
    "bán ròng",
    "áp lực",
    "nợ",
    "hủy",
    "trì hoãn",
    "rủi ro",
)

HIGH_IMPACT_KEYWORDS = (
    "kết quả kinh doanh",
    "báo cáo tài chính",
    "lợi nhuận",
    "cổ tức",
    "phát hành",
    "mua lại",
    "sáp nhập",
    "thoái vốn",
    "room ngoại",
    "hợp đồng",
    "dự án",
    "khởi tố",
    "xử phạt",
    "trái phiếu",
)


def _symbol_related(article_title: str, article_summary: str | None, symbol: str, company_name: str | None) -> bool:
    haystack = f"{_normalize_text(article_title)} {_normalize_text(article_summary)}"
    if not haystack:
        return False

    symbol_pattern = rf"\b{re.escape(symbol.upper())}\b"
    if re.search(symbol_pattern, haystack.upper()):
        return True

    cleaned_name = _normalize_text(company_name)
    if cleaned_name and len(cleaned_name) >= 5 and cleaned_name.lower() in haystack.lower():
        return True

    return False


def _score_news_sentiment(title: str, summary: str | None) -> int:
    text = f"{_normalize_text(title)} {_normalize_text(summary)}".lower()
    score = 0
    for keyword in POSITIVE_NEWS_KEYWORDS:
        if keyword in text:
            score += 1
    for keyword in NEGATIVE_NEWS_KEYWORDS:
        if keyword in text:
            score -= 1
    return score


def _sentiment_label(score: int) -> str:
    if score > 0:
        return "Tích cực"
    if score < 0:
        return "Tiêu cực"
    return "Trung tính"


def _impact_payload(title: str, summary: str | None, symbol: str, company_name: str | None) -> tuple[int, str, list[str]]:
    title_text = _normalize_text(title)
    summary_text = _normalize_text(summary)
    title_upper = title_text.upper()
    summary_upper = summary_text.upper()
    title_lower = title_text.lower()
    summary_lower = summary_text.lower()
    company_lower = _normalize_text(company_name).lower()

    score = 25
    reasons: list[str] = []
    symbol_pattern = rf"\b{re.escape(symbol.upper())}\b"

    if re.search(symbol_pattern, title_upper):
        score += 35
        reasons.append("Mã xuất hiện trực tiếp trong tiêu đề")
    if re.search(symbol_pattern, summary_upper):
        score += 20
        reasons.append("Mã xuất hiện trong nội dung tóm tắt")
    if company_lower and len(company_lower) >= 5 and company_lower in title_lower:
        score += 25
        reasons.append("Tên công ty xuất hiện trong tiêu đề")
    elif company_lower and len(company_lower) >= 5 and company_lower in summary_lower:
        score += 15
        reasons.append("Tên công ty xuất hiện trong tóm tắt")

    full_text = f"{title_lower} {summary_lower}"
    matched_keywords = [keyword for keyword in HIGH_IMPACT_KEYWORDS if keyword in full_text]
    if matched_keywords:
        score += min(30, len(matched_keywords) * 8)
        reasons.append(f"Chứa từ khóa ảnh hưởng mạnh: {', '.join(matched_keywords[:3])}")

    score = max(0, min(100, score))
    if score >= 75:
        return score, "Cao", reasons or ["Tin bám rất sát vào mã và sự kiện doanh nghiệp"]
    if score >= 45:
        return score, "Vừa", reasons or ["Tin có liên quan tới mã nhưng cần xác nhận thêm"]
    return score, "Thấp", reasons or ["Tin chỉ liên quan gián tiếp tới mã"]


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
    limit_per_section: int = Query(default=40, ge=6, le=200),
    repo: MarketReadRepository = Depends(get_repo),
):
    return await repo.get_symbol_financial_bundle(symbol=symbol, limit_per_section=limit_per_section)


@router.get("/symbols/{symbol}/news")
async def get_symbol_news(
    symbol: str,
    limit: int = Query(default=20, ge=1, le=100),
    repo: MarketReadRepository = Depends(get_repo),
):
    normalized_symbol = symbol.strip().upper()
    symbol_rows = await repo.search_symbols(normalized_symbol, limit=5)
    exact_row = next((row for row in symbol_rows if (row.symbol or "").upper() == normalized_symbol), None)
    company_name = getattr(exact_row, "name", None)
    exchange = getattr(exact_row, "exchange", None)

    articles = await repo.get_latest_news_articles(source="CafeF", limit=250)
    matched_items = []
    for index, article in enumerate(articles, start=1):
        if not _symbol_related(article.title, article.summary, normalized_symbol, company_name):
            continue
        sentiment_score = _score_news_sentiment(article.title, article.summary)
        impact_score, impact_label, impact_reasons = _impact_payload(
            article.title,
            article.summary,
            normalized_symbol,
            company_name,
        )
        matched_items.append(
            {
                "id": str(article.id or index),
                "symbol": normalized_symbol,
                "exchange": exchange,
                "title": article.title,
                "summary": article.summary,
                "publishedAt": _to_iso(article.published_at),
                "capturedAt": _to_iso(article.captured_at),
                "url": article.url,
                "source": article.source,
                "relatedSymbols": [normalized_symbol],
                "sentimentScore": sentiment_score,
                "sentimentLabel": _sentiment_label(sentiment_score),
                "impactScore": impact_score,
                "impactLabel": impact_label,
                "impactReasons": impact_reasons,
            }
        )
        if len(matched_items) >= limit:
            break

    return {
        "symbol": normalized_symbol,
        "exchange": exchange,
        "companyName": company_name,
        "items": matched_items,
        "total": len(matched_items),
    }


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
