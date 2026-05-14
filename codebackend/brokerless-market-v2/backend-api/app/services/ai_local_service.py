from __future__ import annotations

import json
import time
from copy import deepcopy
from datetime import datetime
from typing import Any

from app.core.cache import cache_service
from app.core.config import settings
from app.core.logging import get_logger
from app.models.market import StrategySignalSnapshot
from app.repositories.market_read_repo import MarketReadRepository
from app.schemas.ai_agent import AiChatMessage, AiChatRequest, AiForecastCard, AiStatusItem
from app.schemas.ai_local import (
    AiLocalAnalysisSection,
    AiLocalChatResponse,
    AiLocalDataStat,
    AiLocalFinancialMetric,
    AiLocalFinancialReport,
    AiLocalNewsItem,
    AiLocalOverviewResponse,
    AiLocalSymbolOutlook,
    AiLocalStorageStatus,
)
from app.services.ai_agent_service import AiAgentService
from app.services.cafef_news_service import CafeFNewsService
from app.services.ollama_service import OllamaService, OllamaServiceError
from sqlalchemy import select

logger = get_logger(__name__)


class AiLocalService(AiAgentService):
    STRATEGY_SIGNAL_CATEGORIES = ("money_flow", "candlestick", "footprint", "execution", "volume")
    _overview_cache: dict[tuple[str, bool, str], tuple[float, dict[str, Any]]] = {}
    _provider_status_cache: dict[str, tuple[float, tuple[bool, bool, list[str]]]] = {}
    _provider_status_ttl_seconds = 30.0
    _overview_cache_ttl_seconds = 30.0

    QUICK_PROMPTS = [
        "Tom tat thi truong bang local AI",
        "Phan tich watchlist dang co rui ro gi",
        "Tom tat tin CafeF va lien he den dong tien",
        "Ma nao trong san nay dang hut thanh khoan",
        "So sanh 2 ma toi quan tam bang local model",
        "Du bao ngan han cho nhom dang noi bat",
    ]

    ASSISTANT_GREETING = (
        "AI Local dang chay bang Ollama tren may cua ban. "
        "Toi phan tich du lieu watchlist, tin CafeF va thi truong tu backend local ma khong can goi cloud."
    )

    def __init__(
        self,
        repo: MarketReadRepository,
        ollama: OllamaService | None = None,
        cafef_news_service: CafeFNewsService | None = None,
    ) -> None:
        super().__init__(repo)
        self.ollama = ollama or OllamaService()
        self.cafef_news_service = cafef_news_service or CafeFNewsService()

    def _resolve_local_model(self, user_settings: dict[str, Any] | None) -> str:
        value = str((user_settings or {}).get("aiLocalModel") or settings.ollama_model).strip()
        return value or settings.ollama_model

    async def get_overview(
        self,
        exchange: str = "HSX",
        *,
        include_financial_analysis: bool = False,
        user_settings: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        exchange = self._normalize_exchange(exchange)
        local_model = self._resolve_local_model(user_settings)
        local_cache_key = (exchange, bool(include_financial_analysis), local_model)
        now = time.monotonic()
        cached_local = self._overview_cache.get(local_cache_key)
        if cached_local and now - cached_local[0] <= self._overview_cache_ttl_seconds:
            return deepcopy(cached_local[1])

        cache_key = (
            f"ai-local:overview:{exchange}:{local_model}:"
            f"financial:{int(include_financial_analysis)}"
        )
        cached = await cache_service.get_json(cache_key)
        if cached is not None:
            self._overview_cache[local_cache_key] = (now, deepcopy(cached))
            return cached

        context = await self._build_local_context(
            exchange=exchange,
            prompt="",
            focus_symbols=[],
            include_financial_analysis=include_financial_analysis,
        )
        connected, model_available, installed_models = await self._get_provider_status(local_model)
        forecast_cards, analysis_sections, symbol_outlooks, used_fallback = await self._generate_overview_cards(
            context=context,
            connected=connected,
            model_available=model_available,
            include_financial_analysis=include_financial_analysis,
            local_model=local_model,
        )
        generated_at = datetime.now()

        response = AiLocalOverviewResponse(
            exchange=exchange,
            provider="ollama",
            model=local_model,
            connected=connected,
            model_available=model_available,
            include_financial_analysis=include_financial_analysis,
            used_fallback=used_fallback,
            generated_at=generated_at,
            summary_items=self._build_summary_items_local(
                context=context,
                connected=connected,
                model_available=model_available,
                installed_models=installed_models,
                used_fallback=used_fallback,
                include_financial_analysis=include_financial_analysis,
                local_model=local_model,
            ),
            quick_prompts=self.QUICK_PROMPTS,
            forecast_cards=forecast_cards,
            recent_activities=self._build_recent_activities_local(context),
            dataset_stats=self._build_dataset_stats(
                context,
                include_financial_analysis=include_financial_analysis,
            ),
            focus_symbols=self._build_focus_symbol_list(context),
            news_items=context.get("cafef_news") or [],
            financial_reports=context.get("financial_reports") or [],
            symbol_outlooks=symbol_outlooks,
            analysis_sections=analysis_sections,
            cafef_storage=AiLocalStorageStatus.model_validate(context.get("cafef_storage") or {}),
            assistant_greeting=self.ASSISTANT_GREETING,
        )
        data = response.model_dump(mode="json")
        self._overview_cache[local_cache_key] = (now, deepcopy(data))
        await cache_service.set_json(cache_key, data, ttl=settings.ai_local_overview_ttl_seconds)
        return data

    async def chat(self, body: AiChatRequest, *, user_settings: dict[str, Any] | None = None) -> dict[str, Any]:
        exchange = self._normalize_exchange(body.exchange)
        local_model = self._resolve_local_model(user_settings)
        context = await self._build_local_context(
            exchange=exchange,
            prompt=body.prompt,
            focus_symbols=body.focus_symbols,
            include_financial_analysis=body.include_financial_analysis,
        )
        connected, model_available, _ = await self._get_provider_status(local_model)
        generated_at = datetime.now()

        answer, used_fallback = await self._generate_chat_answer_local(
            prompt=body.prompt,
            context=context,
            history=[item.model_dump(mode="json") for item in body.history[-8:]],
            connected=connected,
            model_available=model_available,
            local_model=local_model,
        )

        response = AiLocalChatResponse(
            exchange=exchange,
            provider="ollama",
            model=local_model,
            connected=connected,
            model_available=model_available,
            used_fallback=used_fallback,
            generated_at=generated_at,
            focus_symbols=[item["symbol"] for item in context["focus_symbols"]],
            context_summary=self._build_dataset_stats(
                context,
                include_financial_analysis=body.include_financial_analysis,
            )[:4],
            message=AiChatMessage(
                content=answer,
                time=self._clock(generated_at),
            ),
        )
        return response.model_dump(mode="json")

    async def _build_local_context(
        self,
        *,
        exchange: str,
        prompt: str,
        focus_symbols: list[str],
        include_financial_analysis: bool,
    ) -> dict[str, Any]:
        context = await self._build_market_context(exchange=exchange, prompt=prompt, focus_symbols=focus_symbols)
        context["actives"] = await self._get_stock_board(exchange, "actives", limit=10)
        context["gainers"] = await self._get_stock_board(exchange, "gainers", limit=10)
        context["losers"] = await self._get_stock_board(exchange, "losers", limit=10)
        symbols = await self.repo.get_symbols_by_exchange(exchange)
        news_items = await self.cafef_news_service.fetch_latest_news(limit=20, repo=self.repo)
        financial_reports: list[AiLocalFinancialReport] = []
        if include_financial_analysis:
            focus_report_symbols = self._resolve_financial_focus_symbols(context)
            financial_reports = await self._build_financial_reports(focus_report_symbols)
        strategy_signals = await self._build_strategy_signal_context(context)
        context["cafef_news"] = [
            AiLocalNewsItem(
                title=item.title,
                summary=item.summary or "",
                source=item.source,
                published_at=item.published_at,
                url=item.url,
            ).model_dump(mode="json")
            for item in news_items
        ]
        context["symbol_count"] = len(symbols or [])
        context["include_financial_analysis"] = include_financial_analysis
        context["symbol_preview"] = [
            item.symbol if hasattr(item, "symbol") else item.get("symbol")
            for item in (symbols or [])[:20]
        ]
        context["strategy_signals"] = strategy_signals
        context["financial_reports"] = [item.model_dump(mode="json") for item in financial_reports]
        storage_status = await self._build_cafef_storage_status()
        context["cafef_storage"] = storage_status.model_dump(mode="json")
        return context

    async def _get_provider_status(self, local_model: str) -> tuple[bool, bool, list[str]]:
        cache_key = (local_model or settings.ollama_model).strip() or settings.ollama_model
        cached = self._provider_status_cache.get(cache_key)
        now = time.monotonic()
        if cached and now - cached[0] <= self._provider_status_ttl_seconds:
            return cached[1]
        try:
            installed_models = await self.ollama.list_models()
        except OllamaServiceError as exc:
            logger.warning("ollama status fallback: %s", exc)
            result = (False, False, [])
            self._provider_status_cache[cache_key] = (now, result)
            return result

        normalized_installed = {item.lower() for item in installed_models}
        target_model = cache_key.lower()
        model_available = target_model in normalized_installed or any(
            item.split(":")[0] == target_model.split(":")[0] for item in normalized_installed
        )
        result = (True, model_available, installed_models)
        self._provider_status_cache[cache_key] = (now, result)
        return result

    async def _generate_overview_cards(
        self,
        *,
        context: dict[str, Any],
        connected: bool,
        model_available: bool,
        include_financial_analysis: bool,
        local_model: str,
    ) -> tuple[list[AiForecastCard], list[AiLocalAnalysisSection], list[AiLocalSymbolOutlook], bool]:
        if not connected or not model_available:
            return (
                self._build_fallback_forecast_cards(context),
                self._build_fallback_analysis_sections(context),
                self._build_symbol_outlooks(
                    context,
                    include_financial_analysis=include_financial_analysis,
                ),
                True,
            )

        prompt_context = self._build_prompt_context_local(context)
        requested_scope = (
            "- Can phan tich sau hon ve: index/chi so, dong tien, top movers, watchlist, tin CafeF, "
            "bao cao tai chinh doanh nghiep, rui ro ngan han, va tinh trang du lieu.\n"
            "- symbol_outlooks gom 2-4 muc, moi muc phai co symbol, exchange, direction, confidence, horizon, summary va basis.\n"
            "- symbol_outlooks chi duoc dua tren cac ma dang co trong financial_reports hoac focus_symbols.\n"
            if include_financial_analysis
            else "- Can phan tich sau hon ve: index/chi so, dong tien, top movers, watchlist, tin CafeF, rui ro ngan han, va tinh trang du lieu.\n"
            "- symbol_outlooks tra ve mang rong [].\n"
        )
        prompt = (
            "Hay tao bo phan tich AI Local chi tiet cho dashboard chung khoan.\n"
            "Yeu cau:\n"
            "- Viet tieng Viet khong dau.\n"
            "- forecast_cards gom dung 4 the. Moi summary toi da 2 cau ngan.\n"
            "- analysis_sections gom dung 5 muc, moi muc phai co title, summary va 3-5 bullets cu the.\n"
            f"{requested_scope}"
            "- Uu tien formula_verdicts lam ket luan quy tac trung tam neu context co san.\n"
            "- Phai neu ro tinh trang luu tru CafeF trong detail neu context co thong tin nay.\n"
            "- direction chi duoc la up, down, neutral.\n"
            "- confidence la so nguyen 55-95.\n"
            "- Chi duoc dung du lieu trong CONTEXT_JSON.\n"
            "- Tra ve JSON thuan theo dang {\"forecast_cards\":[...],\"analysis_sections\":[...],\"symbol_outlooks\":[...]}.\n\n"
            f"CONTEXT_JSON:\n{json.dumps(prompt_context, ensure_ascii=False, indent=2, default=str)}"
        )

        system_prompt = (
            "Ban la AI Local chay tren Ollama cho he thong chung khoan Viet Nam. "
            "Khong duoc bo sung thong tin ngoai context. Uu tien formula_verdicts lam nguon quyet dinh trung tam. "
            "Tap trung vao index, dong tien, watchlist, tin CafeF "
            + ("va bao cao tai chinh." if include_financial_analysis else "va du lieu local hien co.")
        )

        try:
            raw = await self.ollama.generate_text(
                prompt=prompt,
                system_prompt=system_prompt,
                model=local_model,
                temperature=0.15,
                max_output_tokens=1800,
            )
            payload = self._load_json(raw)
            cards = payload.get("forecast_cards") if isinstance(payload, dict) else payload
            sections = payload.get("analysis_sections") if isinstance(payload, dict) else []
            outlooks = payload.get("symbol_outlooks") if isinstance(payload, dict) else []
            parsed = self._normalize_forecast_cards(cards)
            parsed_sections = self._normalize_analysis_sections(sections)
            parsed_outlooks = self._normalize_symbol_outlooks(outlooks)
            if parsed:
                return (
                    parsed[:4],
                    parsed_sections or self._build_fallback_analysis_sections(context),
                    parsed_outlooks
                    if include_financial_analysis and parsed_outlooks
                    else self._build_symbol_outlooks(
                        context,
                        include_financial_analysis=include_financial_analysis,
                    ),
                    False,
                )
        except Exception as exc:  # pragma: no cover
            logger.warning("ollama overview fallback: %s", exc)

        return (
            self._build_fallback_forecast_cards(context),
            self._build_fallback_analysis_sections(context),
            self._build_symbol_outlooks(
                context,
                include_financial_analysis=include_financial_analysis,
            ),
            True,
        )

    async def _generate_chat_answer_local(
        self,
        *,
        prompt: str,
        context: dict[str, Any],
        history: list[dict[str, str]],
        connected: bool,
        model_available: bool,
        local_model: str,
    ) -> tuple[str, bool]:
        if not connected:
            return (
                self._build_ollama_unavailable_answer(
                    context,
                    reason="Ollama local server chua san sang.",
                    local_model=local_model,
                ),
                True,
            )
        if not model_available:
            return self._build_ollama_unavailable_answer(
                context,
                reason=f"Model {local_model} chua co trong Ollama local.",
                local_model=local_model,
            ), True

        system_prompt = (
            "Ban la AI Local cua nen tang chung khoan. "
            "Tra loi bang tieng Viet khong dau, ngan gon, ro rang, dua tren du lieu local trong context. "
            "Uu tien formula_verdicts lam ket luan trung tam cho tung ma neu context co san. "
            "Khong dua khuyen nghi mua ban tuyet doi."
        )
        llm_prompt = (
            f"USER_REQUEST:\n{prompt}\n\n"
            f"CONTEXT_JSON:\n{json.dumps(self._build_prompt_context_local(context), ensure_ascii=False, indent=2, default=str)}"
        )

        try:
            answer = await self.ollama.generate_text(
                prompt=llm_prompt,
                system_prompt=system_prompt,
                model=local_model,
                history=history,
                temperature=0.2,
                max_output_tokens=1200,
            )
            return answer.strip(), False
        except Exception as exc:  # pragma: no cover
            logger.warning("ollama chat fallback: %s", exc)
            return (
                self._build_ollama_unavailable_answer(
                    context,
                    reason="Khong lay duoc phan hoi tu model local.",
                    local_model=local_model,
                ),
                True,
            )

    def _build_prompt_context_local(self, context: dict[str, Any]) -> dict[str, Any]:
        return {
            "exchange": context["exchange"],
            "selected_index": context.get("selected_index"),
            "hourly_trading_tail": (context.get("hourly_trading") or [])[-6:],
            "most_active": context.get("actives") or [],
            "top_gainers": context.get("gainers") or [],
            "top_losers": context.get("losers") or [],
            "watchlist": context.get("watchlist") or [],
            "focus_symbols": context.get("focus_symbols") or [],
            "formula_verdicts": context.get("formula_verdicts") or [],
            "cafef_news": context.get("cafef_news") or [],
            "strategy_signals": context.get("strategy_signals") or [],
            "financial_reports": context.get("financial_reports") or [],
            "include_financial_analysis": bool(context.get("include_financial_analysis")),
            "sync_logs": context.get("news") or [],
            "symbol_count": context.get("symbol_count") or 0,
            "symbol_preview": context.get("symbol_preview") or [],
            "all_index_cards": context.get("index_cards") or [],
            "cafef_storage": context.get("cafef_storage") or {},
        }

    def _build_summary_items_local(
        self,
        *,
        context: dict[str, Any],
        connected: bool,
        model_available: bool,
        installed_models: list[str],
        used_fallback: bool,
        include_financial_analysis: bool,
        local_model: str,
    ) -> list[AiStatusItem]:
        return [
            AiStatusItem(label="Provider", value="Ollama local"),
            AiStatusItem(label="Model", value=local_model),
            AiStatusItem(
                label="Trang thai",
                value="San sang" if connected and model_available and not used_fallback else "Fallback local",
                tone="positive" if connected and model_available and not used_fallback else "warning",
            ),
            AiStatusItem(
                label="Model da cai",
                value="Co" if model_available else "Chua thay",
                tone="positive" if model_available else "warning",
            ),
            AiStatusItem(label="So model local", value=str(len(installed_models))),
            AiStatusItem(label="So ma trong san", value=str(context.get("symbol_count") or 0)),
            AiStatusItem(
                label="Phan tich BCTC",
                value="Bat" if include_financial_analysis else "Tat",
                tone="positive" if include_financial_analysis else "default",
            ),
        ]

    def _build_dataset_stats(
        self,
        context: dict[str, Any],
        *,
        include_financial_analysis: bool,
    ) -> list[AiLocalDataStat]:
        watchlist = context.get("watchlist") or []
        gainers = context.get("gainers") or []
        losers = context.get("losers") or []
        news_items = context.get("cafef_news") or []
        strategy_signals = context.get("strategy_signals") or []
        return [
            AiLocalDataStat(
                label="Thi truong",
                value=f"{context.get('symbol_count') or 0} ma",
                helper=f"Du lieu dang xem tren san {context.get('exchange')}",
            ),
            AiLocalDataStat(
                label="Watchlist",
                value=f"{len(watchlist)} ma",
                helper="Lay tu backend local va duoc enrich bang quote moi nhat",
            ),
            AiLocalDataStat(
                label="Top tang",
                value=f"{len(gainers)} ma",
                helper="Danh sach gainers dang co trong bo nho dashboard",
            ),
            AiLocalDataStat(
                label="Top giam",
                value=f"{len(losers)} ma",
                helper="Danh sach losers de doi chieu rui ro ngan han",
            ),
            AiLocalDataStat(
                label="Tin CafeF",
                value=f"{len(news_items)} tin",
                helper="Tin tuc CafeF duoc dong bo vao bang market_news_articles va nap lai cho AI Local",
            ),
            AiLocalDataStat(
                label="Focus symbols",
                value=f"{len(context.get('focus_symbols') or [])} ma",
                helper="Ma duoc trich tu prompt va watchlist hien tai",
            ),
            AiLocalDataStat(
                label="Tin hieu chien luoc",
                value=f"{len(strategy_signals)} tin hieu",
                helper="Lay tu strategy_signal_snapshots: money-flow / candle / footprint / execution",
            ),
            AiLocalDataStat(
                label="Bao cao tai chinh",
                value=(
                    f"{len(context.get('financial_reports') or [])} doanh nghiep"
                    if include_financial_analysis
                    else "Dang tat"
                ),
                helper=(
                    "Lay tu collector va luu vao cac bang market_financial_*"
                    if include_financial_analysis
                    else "Bat toggle phan tich bao cao tai chinh de dua du lieu BCTC vao AI Local"
                ),
            ),
            AiLocalDataStat(
                label="CafeF DB",
                value="Da luu DB" if (context.get("cafef_storage") or {}).get("stored_in_db") else "Dang cho du lieu",
                helper=(context.get("cafef_storage") or {}).get("detail")
                or "Trang thai luu tru CafeF trong database",
            ),
        ]

    def _build_recent_activities_local(self, context: dict[str, Any]) -> list[dict[str, str]]:
        items = [item.model_dump(mode="json") for item in self._build_recent_activities(context)]
        for news_item in (context.get("cafef_news") or [])[:2]:
            items.append(
                {
                    "time": self._clock(news_item.get("published_at")),
                    "text": f"CafeF: {news_item.get('title')}",
                }
            )
        for signal in (context.get("strategy_signals") or [])[:2]:
            items.append(
                {
                    "time": self._clock(signal.get("computed_at")),
                    "text": f"Strategy: {signal.get('symbol')} - {signal.get('signal_label')}",
                }
            )
        return items[:6]

    def _build_focus_symbol_list(self, context: dict[str, Any]) -> list[str]:
        focus_symbols = [item.get("symbol") for item in context.get("focus_symbols") or [] if item.get("symbol")]
        if focus_symbols:
            return focus_symbols[:5]

        symbols: list[str] = []
        for source in [context.get("watchlist") or [], context.get("actives") or [], context.get("gainers") or []]:
            for item in source:
                symbol = (item.get("symbol") or "").strip()
                if symbol and symbol not in symbols:
                    symbols.append(symbol)
        return symbols[:5]

    def _build_ollama_unavailable_answer(
        self,
        context: dict[str, Any],
        *,
        reason: str,
        local_model: str,
    ) -> str:
        fallback = self._build_local_fallback_chat_answer(context, local_model=local_model)
        return (
            f"{reason}\n\n"
            f"Hay dam bao da chay `ollama serve` va da pull model `{local_model}`.\n\n"
            f"{fallback}"
        )

    def _build_local_fallback_chat_answer(self, context: dict[str, Any], *, local_model: str) -> str:
        selected_index = context.get("selected_index") or {}
        focus_symbols = context.get("focus_symbols") or []
        actives = context.get("actives") or []
        gainers = context.get("gainers") or []
        losers = context.get("losers") or []
        watchlist = context.get("watchlist") or []
        storage = context.get("cafef_storage") or {}

        parts = [
            "AI Local dang tra ve phan tich du phong tu du lieu da co trong backend, khong can goi model cloud."
        ]

        if selected_index:
            parts.append(
                f"{selected_index.get('symbol')} tren {context.get('exchange')} dang "
                f"{self._movement_word(selected_index.get('change_percent'))} "
                f"{self._format_pct(selected_index.get('change_percent'))} tai muc "
                f"{self._format_price(selected_index.get('close'))}."
            )

        if focus_symbols:
            details: list[str] = []
            for item in focus_symbols[:2]:
                details.append(
                    f"{item.get('symbol')}: gia {self._format_price(item.get('price'))}, "
                    f"bien dong {self._format_pct(item.get('change_percent'))}, "
                    f"volume {self._format_compact(item.get('volume'))}"
                )
            parts.append(" | ".join(details))
        else:
            if actives:
                parts.append(
                    f"Ma hut dong tien nhat hien tai la {actives[0].get('symbol')} "
                    f"voi volume {self._format_compact(actives[0].get('volume'))}."
                )
            if gainers:
                parts.append(
                    f"Top tang dang dan dau la {gainers[0].get('symbol')} "
                    f"({self._format_pct(gainers[0].get('change_percent'))})."
                )
            if losers:
                parts.append(
                    f"Ma yeu nhat hien tai la {losers[0].get('symbol')} "
                    f"({self._format_pct(losers[0].get('change_percent'))})."
                )

        if watchlist:
            strongest = max(watchlist, key=lambda item: float(item.get("change_percent") or -9999))
            weakest = min(watchlist, key=lambda item: float(item.get("change_percent") or 9999))
            parts.append(
                f"Trong watchlist, ma manh nhat la {strongest.get('symbol')} "
                f"({self._format_pct(strongest.get('change_percent'))}), "
                f"ma yeu nhat la {weakest.get('symbol')} "
                f"({self._format_pct(weakest.get('change_percent'))})."
            )

        if storage.get("stored_in_db"):
            parts.append(
                "Tin CafeF va cac nguon local van dang co san trong database de AI Local tiep tuc tong hop."
            )

        parts.append(
            f"Khi Ollama phan hoi on dinh tro lai, he thong se tiep tuc dung model `{local_model}` "
            "de sinh nhan dinh chi tiet hon."
        )
        return "\n\n".join(parts)

    def _normalize_analysis_sections(self, sections: Any) -> list[AiLocalAnalysisSection]:
        if not isinstance(sections, list):
            return []

        results: list[AiLocalAnalysisSection] = []
        for item in sections[:5]:
            if not isinstance(item, dict):
                continue
            title = str(item.get("title") or "").strip()
            summary = str(item.get("summary") or "").strip()
            bullets_raw = item.get("bullets") or []
            bullets = [str(bullet).strip() for bullet in bullets_raw if str(bullet).strip()]
            if not title or not summary:
                continue
            results.append(
                AiLocalAnalysisSection(
                    title=title,
                    summary=summary,
                    bullets=bullets[:5],
                )
            )
        return results

    def _normalize_symbol_outlooks(self, outlooks: Any) -> list[AiLocalSymbolOutlook]:
        if not isinstance(outlooks, list):
            return []

        results: list[AiLocalSymbolOutlook] = []
        for item in outlooks[:4]:
            if not isinstance(item, dict):
                continue
            symbol = str(item.get("symbol") or "").strip().upper()
            summary = str(item.get("summary") or "").strip()
            if not symbol or not summary:
                continue
            basis_raw = item.get("basis") or []
            basis = [str(value).strip() for value in basis_raw if str(value).strip()]
            results.append(
                AiLocalSymbolOutlook(
                    symbol=symbol,
                    exchange=str(item.get("exchange") or "").strip() or None,
                    direction=self._normalize_direction(item.get("direction")),
                    confidence=max(55, min(95, int(item.get("confidence") or 60))),
                    horizon=str(item.get("horizon") or "1-4 tuan").strip() or "1-4 tuan",
                    summary=summary,
                    basis=basis[:4],
                )
            )
        return results

    def _build_fallback_analysis_sections(self, context: dict[str, Any]) -> list[AiLocalAnalysisSection]:
        selected_index = context.get("selected_index") or {}
        actives = context.get("actives") or []
        gainers = context.get("gainers") or []
        losers = context.get("losers") or []
        watchlist = context.get("watchlist") or []
        news_items = context.get("cafef_news") or []
        strategy_signals = context.get("strategy_signals") or []
        formula_verdicts = context.get("formula_verdicts") or []
        storage = context.get("cafef_storage") or {}
        include_financial_analysis = bool(context.get("include_financial_analysis"))

        sections: list[AiLocalAnalysisSection] = [
            AiLocalAnalysisSection(
                title="Buc tranh thi truong",
                summary=(
                    f"San {context.get('exchange')} dang duoc theo doi qua {selected_index.get('symbol') or 'index chinh'} "
                    f"voi bien dong {self._format_pct(selected_index.get('change_percent'))}."
                ),
                bullets=[
                    f"Muc diem hien tai: {self._format_price(selected_index.get('close'))}",
                    f"Dong du lieu index dang co {len(context.get('index_cards') or [])} the tong hop.",
                    f"Du lieu intraday exchange tail: {len(context.get('hourly_trading') or [])} moc thoi gian.",
                ],
            ),
            AiLocalAnalysisSection(
                title="Dong tien va movers",
                summary="Nhip dong tien duoc suy ra tu nhom actives, gainers va losers trong san dang xem.",
                bullets=[
                    f"Ma hut dong tien: {(actives[0].get('symbol') if actives else '--')}",
                    f"Ma tang noi bat: {(gainers[0].get('symbol') if gainers else '--')}",
                    f"Ma giam can chu y: {(losers[0].get('symbol') if losers else '--')}",
                ],
            ),
            AiLocalAnalysisSection(
                title="Watchlist chi tiet",
                summary=f"He thong dang co {len(watchlist)} ma watchlist trong local context.",
                bullets=[
                    *[
                        f"{item.get('symbol')}: {self._format_pct(item.get('change_percent'))}, volume {self._format_compact(item.get('volume'))}"
                        for item in watchlist[:4]
                    ],
                ],
            ),
            AiLocalAnalysisSection(
                title="Tin CafeF va tac dong",
                summary=f"Co {len(news_items)} tin CafeF dang duoc nap vao AI Local de doi chieu voi thi truong.",
                bullets=[
                    *[
                        f"{item.get('title')}"
                        for item in news_items[:4]
                    ],
                ],
            ),
            AiLocalAnalysisSection(
                title="Dong tien truoc tin",
                summary=(
                    f"He thong dang co {len(strategy_signals)} tin hieu chien luoc "
                    "de doc dong tien som, OBV, nen gia, mau nen va boi canh vao lenh."
                ),
                bullets=[
                    *[
                        f"{item.get('symbol')}: {(item.get('formulaVerdict') or {}).get('headline') or '--'}"
                        for item in formula_verdicts[:3]
                    ],
                    *[
                        f"{item.get('symbol')}: {item.get('signal_label')} | "
                        f"{item.get('detail') or 'Tin hieu duoc phat hien boi Strategy engine'}"
                        for item in strategy_signals[:4]
                    ],
                ]
                or ["Chua co tin hieu money-flow / OBV nao vuot nguong trong lan quet nay."],
            ),
            AiLocalAnalysisSection(
                title="Tinh trang luu tru du lieu",
                summary="Nguon tin CafeF duoc uu tien doc tu database sau khi dong bo tu luong fetch.",
                bullets=[
                    f"Stored in DB: {'Co' if storage.get('stored_in_db') else 'Khong'}",
                    f"Nguon hien tai: {storage.get('source') or '--'}",
                    f"Chi tiet: {storage.get('detail') or '--'}",
                ],
            ),
        ]
        if include_financial_analysis:
            sections.insert(
                4,
                AiLocalAnalysisSection(
                    title="Bao cao tai chinh doanh nghiep",
                    summary=(
                        f"Co {len(context.get('financial_reports') or [])} bo du lieu bao cao tai chinh "
                        "dang duoc dua vao local context de doi chieu them ve suc khoe doanh nghiep."
                    ),
                    bullets=[
                        *[
                            f"{report.get('symbol')}: "
                            + ", ".join(
                                f"{metric.get('label')} {metric.get('value')}"
                                for metric in (report.get('highlights') or [])[:3]
                            )
                            for report in (context.get('financial_reports') or [])[:3]
                        ],
                    ]
                    or ["Chua co du lieu bao cao tai chinh cho nhom ma dang focus."],
                ),
            )
        return sections

    def _build_symbol_outlooks(
        self,
        context: dict[str, Any],
        *,
        include_financial_analysis: bool,
    ) -> list[AiLocalSymbolOutlook]:
        if not include_financial_analysis:
            return []

        focus_map = {
            str(item.get("symbol") or "").upper(): item
            for item in (context.get("focus_symbols") or [])
            if item.get("symbol")
        }
        formula_verdict_map = {
            str(item.get("symbol") or "").upper(): item
            for item in (context.get("formula_verdicts") or [])
            if item.get("symbol")
        }
        outlooks: list[AiLocalSymbolOutlook] = []
        for report in (context.get("financial_reports") or [])[:4]:
            symbol = str(report.get("symbol") or "").upper()
            if not symbol:
                continue
            focus = focus_map.get(symbol, {})
            verdict_snapshot = formula_verdict_map.get(symbol, {})
            formula_verdict = verdict_snapshot.get("formulaVerdict") if isinstance(verdict_snapshot, dict) else {}
            change_percent = float(focus.get("change_percent") or 0)
            direction = self._to_direction(change_percent)
            confidence = self._confidence_from_change(change_percent)
            if len(report.get("highlights") or []) >= 3:
                confidence = min(88, confidence + 8)
            if isinstance(formula_verdict, dict) and formula_verdict:
                direction = self._formula_verdict_direction(formula_verdict)
                confidence = max(confidence, max(55, min(95, int(formula_verdict.get("confidence") or confidence))))

            basis: list[str] = []
            if isinstance(formula_verdict, dict) and formula_verdict.get("headline"):
                basis.append(
                    f"Cong thuc: {formula_verdict.get('headline')} "
                    f"(action {self._humanize_formula_action(formula_verdict.get('action'))})"
                )
            for metric in (report.get("highlights") or [])[:3]:
                label = str(metric.get("label") or "").strip()
                value = str(metric.get("value") or "").strip()
                helper = str(metric.get("helper") or "").strip()
                if label and value:
                    basis.append(f"{label}: {value}" + (f" ({helper})" if helper else ""))
            if focus.get("price") is not None:
                basis.append(
                    f"Gia hien tai {self._format_price(focus.get('price'))}, bien dong {self._format_pct(change_percent)}"
                )
            signal_basis = self._summarize_symbol_strategy_signals(context, symbol)
            basis.extend(signal_basis[:2])

            if isinstance(formula_verdict, dict) and formula_verdict.get("summary"):
                summary = str(formula_verdict.get("summary") or "").strip()
            elif direction == "up":
                summary = (
                    "Bao cao tai chinh dang duoc AI Local xem la khong xau, va gia hien tai "
                    "dang giu nhip tich cuc cho kha nang duy tri ngan han."
                )
            elif direction == "down":
                summary = (
                    "Du lieu tai chinh da co nhung gia dang yeu hon trong ngan han, "
                    "can uu tien quan sat pha hoi cua dong tien truoc khi tang ky vong."
                )
            else:
                summary = (
                    "Bao cao tai chinh da duoc dua vao context, nhung gia hien tai chua cho thay xu huong ro. "
                    "Phu hop de theo doi them 1-4 tuan toi."
                )

            outlooks.append(
                AiLocalSymbolOutlook(
                    symbol=symbol,
                    exchange=report.get("exchange"),
                    direction=direction,
                    confidence=confidence,
                    horizon="1-4 tuan",
                    summary=summary,
                    basis=basis[:4],
                )
            )
        return outlooks

    def _resolve_financial_focus_symbols(self, context: dict[str, Any]) -> list[str]:
        symbols: list[str] = []
        for collection in [
            context.get("focus_symbols") or [],
            context.get("watchlist") or [],
            context.get("actives") or [],
            context.get("gainers") or [],
        ]:
            for item in collection:
                symbol = (item.get("symbol") if isinstance(item, dict) else None) or ""
                symbol = str(symbol).strip().upper()
                if symbol and symbol not in symbols:
                    symbols.append(symbol)
        return symbols[:4]

    async def _build_financial_reports(self, symbols: list[str]) -> list[AiLocalFinancialReport]:
        reports: list[AiLocalFinancialReport] = []
        for symbol in symbols:
            bundle = await self.repo.get_symbol_financial_bundle(symbol, limit_per_section=12)
            highlights = bundle.get("highlights") or []
            if not highlights:
                continue
            reports.append(
                AiLocalFinancialReport(
                    symbol=bundle.get("symbol") or symbol,
                    exchange=bundle.get("exchange"),
                    updated_at=bundle.get("updatedAt"),
                    highlights=[
                        AiLocalFinancialMetric(
                            label=item.get("label") or "--",
                            value=item.get("value") or "--",
                            helper=item.get("helper") or "",
                        )
                        for item in highlights[:5]
                    ],
                    note=f"{len(bundle.get('sections') or [])} nhom bao cao tai chinh da duoc tai vao local context.",
                )
            )
        return reports

    async def _build_strategy_signal_context(self, context: dict[str, Any]) -> list[dict[str, Any]]:
        exchange = self._normalize_exchange(context.get("exchange") or "HSX")
        focus_symbols = self._resolve_signal_focus_symbols(context)

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
            .limit(24)
        )
        rows = (await self.repo.session.execute(stmt)).scalars().all()

        prioritized: list[StrategySignalSnapshot] = []
        secondary: list[StrategySignalSnapshot] = []
        for row in rows:
            if row.symbol in focus_symbols:
                prioritized.append(row)
            else:
                secondary.append(row)

        items: list[dict[str, Any]] = []
        seen: set[str] = set()
        for row in [*prioritized, *secondary]:
            key = f"{row.symbol}|{row.signal_code}"
            if key in seen:
                continue
            seen.add(key)
            detail = row.detail_json if isinstance(row.detail_json, dict) else {}
            items.append(
                {
                    "symbol": row.symbol,
                    "exchange": row.exchange,
                    "category": row.category,
                    "signal_code": row.signal_code,
                    "signal_label": row.signal_label,
                    "signal_score": float(row.signal_score or 0),
                    "detail": str(detail.get("detail") or "").strip(),
                    "bias": self._normalize_direction(detail.get("bias")),
                    "computed_at": row.computed_at.isoformat() if isinstance(row.computed_at, datetime) else None,
                }
            )
            if len(items) >= 8:
                break
        return items

    def _resolve_signal_focus_symbols(self, context: dict[str, Any]) -> list[str]:
        symbols: list[str] = []
        for collection in [
            context.get("focus_symbols") or [],
            context.get("watchlist") or [],
            context.get("actives") or [],
            context.get("gainers") or [],
        ]:
            for item in collection:
                symbol = (item.get("symbol") if isinstance(item, dict) else None) or ""
                symbol = str(symbol).strip().upper()
                if symbol and symbol not in symbols:
                    symbols.append(symbol)
        return symbols[:10]

    def _summarize_symbol_strategy_signals(self, context: dict[str, Any], symbol: str) -> list[str]:
        basis: list[str] = []
        for item in context.get("strategy_signals") or []:
            if str(item.get("symbol") or "").upper() != symbol.upper():
                continue
            label = str(item.get("signal_label") or "").strip()
            detail = str(item.get("detail") or "").strip()
            if label:
                basis.append(label if not detail else f"{label}: {detail}")
        return basis[:3]

    async def _build_cafef_storage_status(self) -> AiLocalStorageStatus:
        latest_rows = await self.repo.get_latest_news_articles(source="CafeF", limit=5)
        if latest_rows:
            latest = latest_rows[0]
            published_text = getattr(latest, "published_text", None)
            captured_at = getattr(latest, "captured_at", None)
            updated_at = getattr(latest, "updated_at", None)
            time_marker = published_text
            if not time_marker and isinstance(captured_at, datetime):
                time_marker = captured_at.strftime("%d/%m/%Y %H:%M")

            detail_parts = [f"Da luu {len(latest_rows)} ban ghi CafeF moi nhat trong market_news_articles"]
            if time_marker:
                detail_parts.append(f"ban tin moi nhat: {time_marker}")
            if isinstance(updated_at, datetime):
                detail_parts.append(f"dong bo luc {updated_at.strftime('%H:%M:%S %d/%m/%Y')}")

            return AiLocalStorageStatus(
                stored_in_db=True,
                source="postgres.market_news_articles",
                detail=". ".join(detail_parts),
                checked_at=datetime.now(),
            )

        return AiLocalStorageStatus(
            stored_in_db=False,
            source="postgres.market_news_articles",
            detail="Chua co ban ghi CafeF trong database. Can goi /api/live/news hoac cac service lien quan de nap du lieu dau tien.",
            checked_at=datetime.now(),
        )
