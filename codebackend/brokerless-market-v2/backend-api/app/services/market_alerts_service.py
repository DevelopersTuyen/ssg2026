from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Any

from app.core.cache import cache_service
from app.core.config import settings
from app.core.logging import get_logger
from app.models.market import StrategySignalSnapshot
from app.repositories.market_read_repo import MarketReadRepository
from app.services.cafef_news_service import CafeFNewsArticle, CafeFNewsService
from app.services.gemini_service import GeminiService, GeminiServiceError
from sqlalchemy import select

logger = get_logger(__name__)


class MarketAlertsService:
    STRATEGY_SIGNAL_CATEGORIES = ("money_flow", "candlestick", "footprint", "execution", "volume")
    POSITIVE_NEWS_KEYWORDS = (
        "lai",
        "co tuc",
        "thuong",
        "mo rong",
        "tang truong",
        "mua",
        "ke hoach",
        "dot bien",
    )
    NEGATIVE_NEWS_KEYWORDS = (
        "rui ro",
        "giam",
        "lo",
        "ap luc",
        "ban",
        "thanh tra",
        "canh bao",
        "margin",
    )

    def __init__(
        self,
        repo: MarketReadRepository,
        gemini: GeminiService | None = None,
        news_service: CafeFNewsService | None = None,
    ) -> None:
        self.repo = repo
        self.gemini = gemini or GeminiService()
        self.news_service = news_service or CafeFNewsService()

    async def get_overview(self, exchange: str = "HSX") -> dict[str, Any]:
        selected_exchange = self._normalize_exchange(exchange)
        cache_key = f"market-alerts:{selected_exchange}:{settings.gemini_model}"
        cached = await cache_service.get_json(cache_key)
        if cached is not None:
            return cached

        context = await self._build_context(selected_exchange)
        alerts = self._build_base_alerts(context)
        (
            headline,
            watchlist_headline,
            outlook,
            enriched_alerts,
            used_fallback,
        ) = await self._enrich_with_gemini(context, alerts)

        response = {
            "exchange": selected_exchange,
            "provider": "gemini" if not used_fallback else "fallback",
            "model": settings.gemini_model,
            "used_fallback": used_fallback,
            "generated_at": datetime.now().isoformat(),
            "headline": headline,
            "watchlist_headline": watchlist_headline,
            "summary_cards": self._build_summary_cards(context, enriched_alerts, used_fallback),
            "market_outlook": outlook,
            "alerts": enriched_alerts,
            "news_items": context["news_items"],
            "watchlist_symbols": [item["symbol"] for item in context["watchlist"]],
            "alert_count": len(enriched_alerts),
            "watchlist_alert_count": sum(1 for item in enriched_alerts if item["watchlist"]),
        }
        await cache_service.set_json(cache_key, response, ttl=settings.market_alerts_ttl_seconds)
        return response

    async def _build_context(self, exchange: str) -> dict[str, Any]:
        index_cards = await self.repo.get_index_cards()
        actives = await self._get_stock_board(exchange, "actives", limit=50)
        gainers = await self._get_stock_board(exchange, "gainers", limit=50)
        losers = await self._get_stock_board(exchange, "losers", limit=50)
        watchlist = await self._build_watchlist_snapshot(limit=None)
        news = await self.news_service.fetch_latest_news(limit=50, repo=self.repo)
        strategy_signals = await self._load_strategy_signal_items(
            exchange=exchange,
            watchlist_symbols={item["symbol"] for item in watchlist},
            limit=50,
        )

        tracked_symbols = self._collect_tracked_symbols(watchlist, actives, gainers, losers)
        news_items = self._build_news_items(news, tracked_symbols, {item["symbol"] for item in watchlist})

        return {
            "exchange": exchange,
            "index_cards": index_cards,
            "selected_index": next(
                (item for item in index_cards if (item.get("exchange") or "").upper() == exchange),
                None,
            ),
            "actives": actives,
            "gainers": gainers,
            "losers": losers,
            "watchlist": watchlist,
            "strategy_signals": strategy_signals,
            "news_items": news_items,
        }

    async def _load_strategy_signal_items(
        self,
        *,
        exchange: str,
        watchlist_symbols: set[str],
        limit: int = 8,
    ) -> list[dict[str, Any]]:
        latest_date_stmt = (
            select(StrategySignalSnapshot.trading_date)
            .where(
                StrategySignalSnapshot.exchange == exchange,
                StrategySignalSnapshot.category.in_(self.STRATEGY_SIGNAL_CATEGORIES),
                StrategySignalSnapshot.detected.is_(True),
            )
            .order_by(StrategySignalSnapshot.trading_date.desc())
            .limit(1)
        )
        latest_date = (await self.repo.session.execute(latest_date_stmt)).scalar_one_or_none()
        if latest_date is None:
            return []

        stmt = (
            select(StrategySignalSnapshot)
            .where(
                StrategySignalSnapshot.exchange == exchange,
                StrategySignalSnapshot.category.in_(self.STRATEGY_SIGNAL_CATEGORIES),
                StrategySignalSnapshot.detected.is_(True),
                StrategySignalSnapshot.trading_date == latest_date,
            )
            .order_by(
                StrategySignalSnapshot.computed_at.desc(),
                StrategySignalSnapshot.signal_score.desc().nullslast(),
            )
            .limit(limit * 3)
        )
        rows = (await self.repo.session.execute(stmt)).scalars().all()
        items: list[dict[str, Any]] = []
        seen: set[str] = set()
        for row in rows:
            key = f"{row.symbol}|{row.signal_code}"
            if key in seen:
                continue
            seen.add(key)
            detail = row.detail_json if isinstance(row.detail_json, dict) else {}
            signal_score = float(row.signal_score or 0)
            bias = self._normalize_direction(detail.get("bias"), "neutral")
            items.append(
                {
                    "symbol": row.symbol,
                    "exchange": row.exchange,
                    "category": row.category,
                    "signal_code": row.signal_code,
                    "signal_label": row.signal_label,
                    "signal_score": signal_score,
                    "detail": str(detail.get("detail") or "").strip(),
                    "bias": bias,
                    "computed_at": self._iso(row.computed_at),
                    "watchlist": row.symbol in watchlist_symbols,
                }
            )
            if len(items) >= limit:
                break
        return items

    async def _get_stock_board(self, exchange: str, sort: str, limit: int) -> list[dict[str, Any]]:
        result = await self.repo.get_market_stocks(
            exchange=exchange,
            sort=sort,
            page=1,
            page_size=limit,
        )
        items = result.get("items") or []
        return [
            {
                "symbol": item.get("symbol"),
                "name": item.get("name"),
                "exchange": item.get("exchange"),
                "price": item.get("price"),
                "change_value": item.get("change_value"),
                "change_percent": item.get("change_percent"),
                "volume": item.get("volume"),
                "trading_value": item.get("trading_value"),
                "point_time": self._iso(item.get("point_time")),
                "captured_at": self._iso(item.get("captured_at")),
            }
            for item in items[:limit]
        ]

    async def _build_watchlist_snapshot(self, limit: int = 12) -> list[dict[str, Any]]:
        items = await self.repo.get_active_watchlist_items()
        if limit is not None:
            items = items[:limit]
        symbols = [item.symbol.upper() for item in items]
        intraday_map = await self.repo.get_latest_intraday_map(symbols)
        quote_map = await self.repo.get_latest_quote_map(symbols)

        rows: list[dict[str, Any]] = []
        for item in items:
            symbol = item.symbol.upper()
            intraday = intraday_map.get(symbol)
            quote = quote_map.get(symbol)
            rows.append(
                {
                    "symbol": symbol,
                    "exchange": item.exchange,
                    "note": item.note,
                    "price": self._pick_value(getattr(intraday, "price", None), getattr(quote, "price", None)),
                    "change_value": self._pick_value(
                        getattr(intraday, "change_value", None),
                        getattr(quote, "change_value", None),
                    ),
                    "change_percent": self._pick_value(
                        getattr(intraday, "change_percent", None),
                        getattr(quote, "change_percent", None),
                    ),
                    "volume": self._pick_value(getattr(intraday, "volume", None), getattr(quote, "volume", None)),
                    "trading_value": self._pick_value(
                        getattr(intraday, "trading_value", None),
                        getattr(quote, "trading_value", None),
                    ),
                    "updated_at": self._iso(
                        self._pick_value(
                            getattr(intraday, "point_time", None),
                            getattr(quote, "quote_time", None),
                            getattr(quote, "captured_at", None),
                            item.updated_at,
                        )
                    ),
                }
            )
        return rows

    def _collect_tracked_symbols(
        self,
        watchlist: list[dict[str, Any]],
        actives: list[dict[str, Any]],
        gainers: list[dict[str, Any]],
        losers: list[dict[str, Any]],
    ) -> list[str]:
        symbols: list[str] = []
        for source in (watchlist, actives, gainers, losers):
            for item in source:
                symbol = str(item.get("symbol") or "").upper()
                if symbol and symbol not in symbols:
                    symbols.append(symbol)
        return symbols

    def _build_news_items(
        self,
        news: list[CafeFNewsArticle],
        tracked_symbols: list[str],
        watchlist_symbols: set[str],
    ) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        for article in news:
            related_symbols = self._extract_symbols_from_text(
                f"{article.title} {article.summary}",
                tracked_symbols,
            )
            items.append(
                {
                    "title": article.title,
                    "summary": article.summary,
                    "url": article.url,
                    "published_at": article.published_at,
                    "related_symbols": related_symbols,
                    "watchlist_hit": any(symbol in watchlist_symbols for symbol in related_symbols),
                }
            )
        return items

    def _build_base_alerts(self, context: dict[str, Any]) -> list[dict[str, Any]]:
        alerts: list[dict[str, Any]] = []
        selected_index = context.get("selected_index") or {}
        exchange = context["exchange"]
        watchlist_symbols = {item["symbol"] for item in context["watchlist"]}

        if selected_index:
            index_change = float(selected_index.get("change_percent") or 0)
            if abs(index_change) >= 0.8:
                alerts.append(
                    self._make_alert(
                        scope="market",
                        severity="critical" if abs(index_change) >= 1.5 else "warning",
                        symbol=selected_index.get("symbol") or exchange,
                        title=f"Nhip chi so {exchange} dang mo rong bien do",
                        message=(
                            f"Chi so {selected_index.get('symbol')} dang {self._movement_word(index_change)} "
                            f"{self._format_pct(index_change)} tai muc {self._format_price(selected_index.get('close'))}."
                        ),
                        prediction=self._movement_prediction(index_change),
                        source="Market data",
                        source_url=None,
                        time=self._clock(selected_index.get("updated_at")),
                        price=selected_index.get("close"),
                        change_value=selected_index.get("change_value"),
                        change_percent=index_change,
                        volume=selected_index.get("volume"),
                        trading_value=selected_index.get("trading_value"),
                        confidence=self._confidence_from_change(index_change, bonus=8),
                        direction=self._to_direction(index_change),
                        watchlist=False,
                        tags=[exchange, "index"],
                    )
                )

        for item in context.get("gainers") or []:
            pct = float(item.get("change_percent") or 0)
            if pct < 3:
                continue
            alerts.append(
                self._make_alert(
                    scope="market",
                    severity="warning" if pct < 5 else "critical",
                    symbol=item["symbol"],
                    title="Co phieu tang manh kem thanh khoan",
                    message=(
                        f"{item['symbol']} tang {self._format_pct(pct)} voi volume "
                        f"{self._format_compact(item.get('volume'))} tren {exchange}."
                    ),
                    prediction=self._movement_prediction(pct),
                    source="Market data",
                    source_url=None,
                    time=self._clock(item.get("point_time") or item.get("captured_at")),
                    price=item.get("price"),
                    change_value=item.get("change_value"),
                    change_percent=pct,
                    volume=item.get("volume"),
                    trading_value=item.get("trading_value"),
                    confidence=self._confidence_from_change(pct),
                    direction="up",
                    watchlist=item["symbol"] in watchlist_symbols,
                    tags=[exchange, "gainer"],
                )
            )

        for item in context.get("losers") or []:
            pct = float(item.get("change_percent") or 0)
            if pct > -3:
                continue
            alerts.append(
                self._make_alert(
                    scope="market",
                    severity="warning" if pct > -5 else "critical",
                    symbol=item["symbol"],
                    title="Co phieu giam manh can quan sat them",
                    message=(
                        f"{item['symbol']} dang giam {self._format_pct(pct)} voi volume "
                        f"{self._format_compact(item.get('volume'))}."
                    ),
                    prediction=self._movement_prediction(pct),
                    source="Market data",
                    source_url=None,
                    time=self._clock(item.get("point_time") or item.get("captured_at")),
                    price=item.get("price"),
                    change_value=item.get("change_value"),
                    change_percent=pct,
                    volume=item.get("volume"),
                    trading_value=item.get("trading_value"),
                    confidence=self._confidence_from_change(pct),
                    direction="down",
                    watchlist=item["symbol"] in watchlist_symbols,
                    tags=[exchange, "loser"],
                )
            )

        for item in context.get("watchlist") or []:
            pct = float(item.get("change_percent") or 0)
            if abs(pct) < 2:
                continue
            alerts.append(
                self._make_alert(
                    scope="watchlist",
                    severity="warning" if abs(pct) < 4 else "critical",
                    symbol=item["symbol"],
                    title="Watchlist dang co bien dong lon",
                    message=(
                        f"{item['symbol']} trong watchlist dang bien dong {self._format_pct(pct)}. "
                        f"Gia hien tai {self._format_price(item.get('price'))}."
                    ),
                    prediction=self._watchlist_prediction(pct, item.get("note")),
                    source="Watchlist",
                    source_url=None,
                    time=self._clock(item.get("updated_at")),
                    price=item.get("price"),
                    change_value=item.get("change_value"),
                    change_percent=pct,
                    volume=item.get("volume"),
                    trading_value=item.get("trading_value"),
                    confidence=self._confidence_from_change(pct, bonus=6),
                    direction=self._to_direction(pct),
                    watchlist=True,
                    tags=["watchlist"],
                )
            )

        for signal in context.get("strategy_signals") or []:
            severity = "critical" if signal["signal_score"] >= 80 else "warning"
            title = f"Tín hiệu chiến lược: {signal['signal_label']}"
            detail = signal.get("detail") or "Engine tiền thông minh đang phát hiện tín hiệu sớm."
            alerts.append(
                self._make_alert(
                    scope="watchlist" if signal["watchlist"] else "market",
                    severity=severity,
                    symbol=signal["symbol"],
                    title=title,
                    message=detail,
                    prediction=self._strategy_signal_prediction(signal),
                    source="Strategy engine",
                    source_url=None,
                    time=self._clock(signal.get("computed_at")),
                    price=None,
                    change_value=None,
                    change_percent=None,
                    volume=None,
                    trading_value=None,
                    confidence=max(60, min(92, int(round(signal["signal_score"] or 60)))),
                    direction=signal.get("bias") or "neutral",
                    watchlist=signal["watchlist"],
                    tags=[exchange, "strategy", signal.get("category") or "signal", signal["signal_code"]],
                )
            )

        for news_item in context.get("news_items") or []:
            related_symbols = news_item.get("related_symbols") or []
            symbol = related_symbols[0] if related_symbols else "NEWS"
            watchlist_hit = bool(news_item.get("watchlist_hit"))
            sentiment = self._score_news_sentiment(news_item["title"], news_item["summary"])
            alerts.append(
                self._make_alert(
                    scope="watchlist" if watchlist_hit else "news",
                    severity=self._severity_from_sentiment(sentiment, watchlist_hit),
                    symbol=symbol,
                    title="Tin CafeF co the tac dong den gia",
                    message=(
                        f"{news_item['title']}"
                        if not related_symbols
                        else f"{news_item['title']} | lien quan: {', '.join(related_symbols[:3])}"
                    ),
                    prediction=self._news_prediction(sentiment, watchlist_hit, related_symbols),
                    source="CafeF",
                    source_url=news_item.get("url"),
                    time=self._clock(news_item.get("published_at")),
                    price=None,
                    change_value=None,
                    change_percent=None,
                    volume=None,
                    trading_value=None,
                    confidence=68 if watchlist_hit else 60,
                    direction=self._sentiment_to_direction(sentiment),
                    watchlist=watchlist_hit,
                    tags=["cafef", *related_symbols[:3]],
                )
            )

        deduped: list[dict[str, Any]] = []
        seen: set[str] = set()
        for item in alerts:
            key = f"{item['scope']}|{item['symbol']}|{item['title']}"
            if key in seen:
                continue
            seen.add(key)
            deduped.append(item)

        deduped.sort(
            key=lambda item: (
                0 if item["watchlist"] else 1,
                self._severity_rank(item["severity"]),
                -int(item["confidence"]),
            )
        )

        for index, item in enumerate(deduped, start=1):
            item["id"] = f"alert-{index}"
        return deduped[:12]

    async def _enrich_with_gemini(
        self,
        context: dict[str, Any],
        alerts: list[dict[str, Any]],
    ) -> tuple[str, str, dict[str, Any], list[dict[str, Any]], bool]:
        fallback_headline = self._fallback_headline(context, alerts)
        fallback_watchlist_headline = self._fallback_watchlist_headline(context, alerts)
        fallback_outlook = self._fallback_outlook(context, alerts)

        if not alerts:
            return (
                fallback_headline,
                fallback_watchlist_headline,
                fallback_outlook,
                alerts,
                True,
            )

        prompt = (
            "Ban la AI analyst cho man hinh market alerts cua dashboard chung khoan Viet Nam.\n"
            "Hay tra ve dung dinh dang text sau, khong markdown, khong giai thich them:\n"
            "HEADLINE: ...\n"
            "WATCHLIST_HEADLINE: ...\n"
            "OUTLOOK_TITLE: ...\n"
            "OUTLOOK_SUMMARY: ...\n"
            "OUTLOOK_DIRECTION: up|down|neutral\n"
            "OUTLOOK_CONFIDENCE: 78\n"
            "ALERT_UPDATE: alert-1 || prediction ngan gon || 78 || warning || neutral\n"
            "ALERT_UPDATE: alert-2 || prediction ngan gon || 74 || info || up\n"
            "Quy tac:\n"
            "- Chi duoc dua vao CONTEXT_JSON va BASE_ALERTS_JSON.\n"
            "- headline va watchlist_headline toi da 2 cau.\n"
            "- prediction moi alert toi da 2 cau, co tinh du bao ngan han, khong dua lenh mua ban.\n"
            "- Khong dung ky tu || trong prediction.\n"
            "- Neu du lieu chua du, giam confidence.\n"
            "- Khong phat minh them ma co phieu ngoai context.\n\n"
            f"CONTEXT_JSON:\n{json.dumps(self._build_llm_context(context), ensure_ascii=False, indent=2, default=str)}\n\n"
            f"BASE_ALERTS_JSON:\n{json.dumps(alerts[:6], ensure_ascii=False, indent=2, default=str)}"
        )

        try:
            raw = await self.gemini.generate_text(
                prompt=prompt,
                temperature=0.25,
                max_output_tokens=900,
            )
            payload = self._parse_llm_text_payload(raw)
            enriched_alerts = self._merge_alert_updates(alerts, payload.get("alert_updates"))
            outlook = self._normalize_outlook(payload.get("market_outlook"), fallback_outlook)
            headline = str(payload.get("headline") or fallback_headline).strip() or fallback_headline
            watchlist_headline = (
                str(payload.get("watchlist_headline") or fallback_watchlist_headline).strip()
                or fallback_watchlist_headline
            )
            return headline, watchlist_headline, outlook, enriched_alerts, False
        except GeminiServiceError as exc:
            logger.warning("market alerts fallback: %s", exc)
        except Exception as exc:  # pragma: no cover
            logger.warning("market alerts parse fallback: %s", exc)

        return fallback_headline, fallback_watchlist_headline, fallback_outlook, alerts, True

    def _build_prompt_context(self, context: dict[str, Any]) -> dict[str, Any]:
        return {
            "exchange": context["exchange"],
            "selected_index": context.get("selected_index"),
            "actives": context.get("actives"),
            "gainers": context.get("gainers"),
            "losers": context.get("losers"),
            "watchlist": context.get("watchlist"),
            "strategy_signals": context.get("strategy_signals"),
            "news_items": context.get("news_items"),
        }

    def _build_llm_context(self, context: dict[str, Any]) -> dict[str, Any]:
        return {
            "exchange": context["exchange"],
            "selected_index": context.get("selected_index"),
            "actives": (context.get("actives") or [])[:3],
            "gainers": (context.get("gainers") or [])[:3],
            "losers": (context.get("losers") or [])[:3],
            "watchlist": (context.get("watchlist") or [])[:6],
            "strategy_signals": (context.get("strategy_signals") or [])[:6],
            "news_items": (context.get("news_items") or [])[:4],
        }

    def _merge_alert_updates(self, alerts: list[dict[str, Any]], updates: Any) -> list[dict[str, Any]]:
        if not isinstance(updates, list):
            return alerts

        mapped = {item["id"]: item for item in alerts}
        for item in updates:
            if not isinstance(item, dict):
                continue
            alert = mapped.get(str(item.get("id") or ""))
            if not alert:
                continue
            prediction = str(item.get("prediction") or "").strip()
            if prediction:
                alert["prediction"] = prediction
            alert["confidence"] = max(55, min(95, int(item.get("confidence") or alert["confidence"])))
            alert["severity"] = self._normalize_severity(item.get("severity"), alert["severity"])
            alert["direction"] = self._normalize_direction(item.get("direction"), alert["direction"])
        return alerts

    def _build_summary_cards(
        self,
        context: dict[str, Any],
        alerts: list[dict[str, Any]],
        used_fallback: bool,
    ) -> list[dict[str, str]]:
        watchlist_alerts = [item for item in alerts if item["watchlist"]]
        critical_alerts = [item for item in alerts if item["severity"] == "critical"]
        cafef_hits = [
            item
            for item in context.get("news_items") or []
            if item.get("watchlist_hit") or item.get("related_symbols")
        ]
        return [
            {
                "label": "Provider",
                "value": "Gemini" if not used_fallback else "Fallback",
                "tone": "positive" if not used_fallback else "warning",
                "helper": settings.gemini_model,
            },
            {
                "label": "Tong canh bao",
                "value": str(len(alerts)),
                "tone": "default",
                "helper": context["exchange"],
            },
            {
                "label": "Watchlist",
                "value": str(len(watchlist_alerts)),
                "tone": "warning" if watchlist_alerts else "default",
                "helper": f"{len(context.get('watchlist') or [])} ma theo doi",
            },
            {
                "label": "Muc uu tien cao",
                "value": str(len(critical_alerts)),
                "tone": "danger" if critical_alerts else "default",
                "helper": "critical",
            },
            {
                "label": "Tin CafeF lien quan",
                "value": str(len(cafef_hits)),
                "tone": "positive" if cafef_hits else "default",
                "helper": "news-linked",
            },
            {
                "label": "Tin hieu chien luoc",
                "value": str(len(context.get("strategy_signals") or [])),
                "tone": "warning" if context.get("strategy_signals") else "default",
                "helper": "strategy engine",
            },
        ]

    def _fallback_headline(self, context: dict[str, Any], alerts: list[dict[str, Any]]) -> str:
        selected_index = context.get("selected_index") or {}
        first_alert = alerts[0] if alerts else None
        if selected_index:
            return (
                f"{context['exchange']} dang {self._movement_word(selected_index.get('change_percent'))} "
                f"{self._format_pct(selected_index.get('change_percent'))}. "
                f"Tam diem canh bao hien tai la {first_alert['symbol'] if first_alert else 'dong tien ngan han'}."
            )
        return "He thong dang tong hop tin CafeF, bien dong gia va watchlist de tao canh bao ngan han."

    def _fallback_watchlist_headline(self, context: dict[str, Any], alerts: list[dict[str, Any]]) -> str:
        watchlist_alerts = [item for item in alerts if item["watchlist"]]
        if watchlist_alerts:
            top = watchlist_alerts[0]
            return (
                f"Watchlist hien co {len(watchlist_alerts)} canh bao. "
                f"Ma can uu tien theo doi la {top['symbol']} voi muc do {top['severity']}."
            )
        return "Chua co ma watchlist nao vuot nguong canh bao lon trong lan quet nay."

    def _fallback_outlook(self, context: dict[str, Any], alerts: list[dict[str, Any]]) -> dict[str, Any]:
        selected_index = context.get("selected_index") or {}
        index_change = float(selected_index.get("change_percent") or 0)
        critical_count = sum(1 for item in alerts if item["severity"] == "critical")
        summary = (
            f"Chi so {selected_index.get('symbol', context['exchange'])} dang {self._movement_word(index_change)} "
            f"{self._format_pct(index_change)}. "
            f"He thong dang ghi nhan {critical_count} canh bao muc cao tu gia, thanh khoan va tin CafeF."
        )
        return {
            "title": f"Outlook {context['exchange']}",
            "summary": summary,
            "direction": self._to_direction(index_change),
            "confidence": max(60, min(88, 62 + (critical_count * 4))),
        }

    def _normalize_outlook(self, payload: Any, fallback: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict):
            return fallback
        title = str(payload.get("title") or fallback["title"]).strip() or fallback["title"]
        summary = str(payload.get("summary") or fallback["summary"]).strip() or fallback["summary"]
        return {
            "title": title,
            "summary": summary,
            "direction": self._normalize_direction(payload.get("direction"), fallback["direction"]),
            "confidence": max(55, min(95, int(payload.get("confidence") or fallback["confidence"]))),
        }

    def _parse_llm_text_payload(self, raw: str) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "headline": "",
            "watchlist_headline": "",
            "market_outlook": {},
            "alert_updates": [],
        }

        for line in [item.strip() for item in raw.splitlines() if item.strip()]:
            if line.startswith("HEADLINE:"):
                payload["headline"] = line.split(":", 1)[1].strip()
                continue
            if line.startswith("WATCHLIST_HEADLINE:"):
                payload["watchlist_headline"] = line.split(":", 1)[1].strip()
                continue
            if line.startswith("OUTLOOK_TITLE:"):
                payload["market_outlook"]["title"] = line.split(":", 1)[1].strip()
                continue
            if line.startswith("OUTLOOK_SUMMARY:"):
                payload["market_outlook"]["summary"] = line.split(":", 1)[1].strip()
                continue
            if line.startswith("OUTLOOK_DIRECTION:"):
                payload["market_outlook"]["direction"] = line.split(":", 1)[1].strip()
                continue
            if line.startswith("OUTLOOK_CONFIDENCE:"):
                payload["market_outlook"]["confidence"] = line.split(":", 1)[1].strip()
                continue
            if line.startswith("ALERT_UPDATE:"):
                body = line.split(":", 1)[1].strip()
                parts = [item.strip() for item in body.split("||")]
                if len(parts) != 5:
                    continue
                payload["alert_updates"].append(
                    {
                        "id": parts[0],
                        "prediction": parts[1],
                        "confidence": parts[2],
                        "severity": parts[3],
                        "direction": parts[4],
                    }
                )

        return payload

    def _make_alert(
        self,
        *,
        scope: str,
        severity: str,
        symbol: str,
        title: str,
        message: str,
        prediction: str,
        source: str,
        source_url: str | None,
        time: str,
        price: Any,
        change_value: Any,
        change_percent: Any,
        volume: Any,
        trading_value: Any,
        confidence: int,
        direction: str,
        watchlist: bool,
        tags: list[str],
    ) -> dict[str, Any]:
        return {
            "id": "",
            "scope": scope,
            "severity": severity,
            "symbol": symbol,
            "title": title,
            "message": message,
            "prediction": prediction,
            "source": source,
            "source_url": source_url,
            "time": time,
            "price": price,
            "change_value": change_value,
            "change_percent": change_percent,
            "volume": volume,
            "trading_value": trading_value,
            "confidence": max(55, min(95, confidence)),
            "direction": direction,
            "watchlist": watchlist,
            "tags": tags,
        }

    def _extract_symbols_from_text(self, text: str, symbols: list[str]) -> list[str]:
        haystack = text.upper()
        results: list[str] = []
        for symbol in symbols:
            if re.search(rf"\b{re.escape(symbol.upper())}\b", haystack):
                results.append(symbol.upper())
        return results[:4]

    def _score_news_sentiment(self, title: str, summary: str) -> int:
        text = f"{title} {summary}".lower()
        score = 0
        for keyword in self.POSITIVE_NEWS_KEYWORDS:
            if keyword in text:
                score += 1
        for keyword in self.NEGATIVE_NEWS_KEYWORDS:
            if keyword in text:
                score -= 1
        return score

    def _strategy_signal_prediction(self, signal: dict[str, Any]) -> str:
        code = str(signal.get("signal_code") or "").strip().lower()
        symbol = signal.get("symbol") or "Mã này"
        if code == "smart_money_before_news":
            return f"{symbol} đang có dấu hiệu dòng tiền đi trước tin, nên ưu tiên theo dõi phản ứng giá kế tiếp."
        if code == "pre_news_accumulation":
            return f"{symbol} có xu hướng tích lũy trước tin, phù hợp đặt vào danh sách theo dõi sớm."
        if code == "obv_distribution":
            return f"{symbol} đang cho thấy khả năng phân phối, cần tránh đuổi theo các nhịp tăng thiếu xác nhận."
        if code == "weak_news_chase":
            return f"{symbol} dễ rơi vào trạng thái hưng phấn theo tin nhưng thiếu nền dòng tiền đủ mạnh."
        if code == "obv_breakout_confirmation":
            return f"{symbol} có xác nhận OBV đi cùng breakout, có thể ưu tiên kiểm tra thêm volume và vùng giá."
        if code in {"long_lower_wick", "long_upper_wick", "doji", "marubozu"}:
            return f"{symbol} vừa xuất hiện mẫu nến đáng chú ý, nên đối chiếu thêm volume và phản ứng giá phiên kế tiếp."
        if code in {"spring_shakeout", "absorption", "pullback_retest", "breakout_confirmation"}:
            return f"{symbol} đang cho thấy dấu chân dòng tiền tổ chức, phù hợp đưa vào danh sách theo dõi chủ động."
        return f"{symbol} vừa phát sinh tín hiệu chiến lược mới từ engine dòng tiền và OBV."

    def _severity_from_sentiment(self, sentiment: int, watchlist_hit: bool) -> str:
        if watchlist_hit and sentiment < 0:
            return "critical"
        if watchlist_hit or sentiment != 0:
            return "warning"
        return "info"

    def _sentiment_to_direction(self, sentiment: int) -> str:
        if sentiment > 0:
            return "up"
        if sentiment < 0:
            return "down"
        return "neutral"

    def _news_prediction(self, sentiment: int, watchlist_hit: bool, related_symbols: list[str]) -> str:
        scope = "watchlist" if watchlist_hit else "nhip giao dich ke tiep"
        if sentiment > 0:
            if related_symbols:
                return f"Tin moi co the giu tam ly tich cuc cho {scope}, nhung can xac nhan them bang gia va volume."
            return "Tin moi nghieng ve tich cuc, co the tang muc quan tam ngan han cua dong tien."
        if sentiment < 0:
            if related_symbols:
                return f"Tin moi co the tao ap luc len {scope}, uu tien theo doi phan ung gia dau phien sau."
            return "Tin moi nghieng ve rui ro, de phong bien do rung lac tang trong cac nhiep tiep theo."
        return "Tin moi chua du mot chieu, can doi xac nhan them tu gia, volume va do rong thi truong."

    def _movement_prediction(self, change_percent: float) -> str:
        if change_percent >= 4:
            return "Dong luc gia dang manh, nhung xac suat rung lac ngan han cung tang neu luc chot loi xuat hien."
        if change_percent > 0:
            return "Nhip tang dang duoc duy tri. Can theo doi xem thanh khoan co giu duoc den cuoi phien hay khong."
        if change_percent <= -4:
            return "Ap luc ban dang lon. Neu khoi luong tiep tuc tang, rui ro dieu chinh ngan han van cao."
        return "Nhip giam dang ro dan. Can theo doi xem co xuat hien luc cau do gia trong khung tiep theo hay khong."

    def _watchlist_prediction(self, change_percent: float, note: Any) -> str:
        suffix = f" Ghi chu hien tai: {note}." if note else ""
        if change_percent > 0:
            return f"Ma trong watchlist dang co uu the ngan han, phu hop de dat uu tien quan sat tiep.{suffix}"
        return f"Ma trong watchlist dang yeu di, can uu tien quan sat rui ro thay vi tim diem mua moi.{suffix}"

    @staticmethod
    def _normalize_exchange(exchange: str | None) -> str:
        if not exchange:
            return "HSX"
        value = exchange.upper()
        if value in {"HSX", "HNX", "UPCOM"}:
            return value
        return "HSX"

    @staticmethod
    def _normalize_severity(value: Any, fallback: str = "info") -> str:
        if isinstance(value, str):
            lowered = value.lower().strip()
            if lowered in {"critical", "warning", "info"}:
                return lowered
        return fallback

    @staticmethod
    def _normalize_direction(value: Any, fallback: str = "neutral") -> str:
        if isinstance(value, str):
            lowered = value.lower().strip()
            if lowered in {"up", "down", "neutral"}:
                return lowered
        return fallback

    @staticmethod
    def _severity_rank(value: str) -> int:
        order = {"critical": 0, "warning": 1, "info": 2}
        return order.get(value, 3)

    @staticmethod
    def _to_direction(value: Any) -> str:
        num = float(value or 0)
        if num > 0.3:
            return "up"
        if num < -0.3:
            return "down"
        return "neutral"

    @staticmethod
    def _confidence_from_change(value: Any, bonus: int = 0) -> int:
        magnitude = abs(float(value or 0))
        return max(58, min(92, int(58 + (magnitude * 6) + bonus)))

    @staticmethod
    def _movement_word(value: Any) -> str:
        num = float(value or 0)
        if num > 0.15:
            return "tang"
        if num < -0.15:
            return "giam"
        return "di ngang"

    @staticmethod
    def _pick_value(*values: Any) -> Any:
        for value in values:
            if value is not None:
                return value
        return None

    @staticmethod
    def _format_pct(value: Any) -> str:
        if value is None:
            return "--"
        return f"{float(value):+.2f}%"

    @staticmethod
    def _format_price(value: Any) -> str:
        if value is None:
            return "--"
        return f"{float(value):,.2f}"

    @staticmethod
    def _format_compact(value: Any) -> str:
        if value is None:
            return "--"
        num = float(value)
        abs_num = abs(num)
        if abs_num >= 1_000_000_000:
            return f"{num / 1_000_000_000:.2f}B"
        if abs_num >= 1_000_000:
            return f"{num / 1_000_000:.2f}M"
        if abs_num >= 1_000:
            return f"{num / 1_000:.1f}K"
        return f"{num:.0f}"

    @staticmethod
    def _iso(value: Any) -> str | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.replace(tzinfo=None).isoformat()
        if isinstance(value, date):
            return value.isoformat()
        return str(value)

    def _clock(self, value: Any) -> str:
        dt = self._coerce_datetime(value)
        if dt is None:
            return "--:--"
        return dt.strftime("%H:%M")

    @staticmethod
    def _coerce_datetime(value: Any) -> datetime | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.replace(tzinfo=None)
        if isinstance(value, date):
            return datetime.combine(value, datetime.min.time())
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
            except ValueError:
                return None
        return None
