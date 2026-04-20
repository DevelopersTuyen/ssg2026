from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from app.core.cache import cache_service
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.market_read_repo import MarketReadRepository
from app.schemas.ai_agent import AiChatMessage, AiChatRequest, AiForecastCard, AiStatusItem
from app.schemas.ai_local import AiLocalChatResponse, AiLocalDataStat, AiLocalNewsItem, AiLocalOverviewResponse
from app.services.ai_agent_service import AiAgentService
from app.services.cafef_news_service import CafeFNewsService
from app.services.ollama_service import OllamaService, OllamaServiceError

logger = get_logger(__name__)


class AiLocalService(AiAgentService):
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

    async def get_overview(self, exchange: str = "HSX") -> dict[str, Any]:
        exchange = self._normalize_exchange(exchange)
        cache_key = f"ai-local:overview:{exchange}:{settings.ollama_model}"
        cached = await cache_service.get_json(cache_key)
        if cached is not None:
            return cached

        context = await self._build_local_context(exchange=exchange, prompt="", focus_symbols=[])
        connected, model_available, installed_models = await self._get_provider_status()
        forecast_cards, used_fallback = await self._generate_overview_cards(
            context=context,
            connected=connected,
            model_available=model_available,
        )
        generated_at = datetime.now()

        response = AiLocalOverviewResponse(
            exchange=exchange,
            provider="ollama",
            model=settings.ollama_model,
            connected=connected,
            model_available=model_available,
            used_fallback=used_fallback,
            generated_at=generated_at,
            summary_items=self._build_summary_items_local(
                context=context,
                connected=connected,
                model_available=model_available,
                installed_models=installed_models,
                used_fallback=used_fallback,
            ),
            quick_prompts=self.QUICK_PROMPTS,
            forecast_cards=forecast_cards,
            recent_activities=self._build_recent_activities_local(context),
            dataset_stats=self._build_dataset_stats(context),
            focus_symbols=self._build_focus_symbol_list(context),
            news_items=context.get("cafef_news") or [],
            assistant_greeting=self.ASSISTANT_GREETING,
        )
        data = response.model_dump(mode="json")
        await cache_service.set_json(cache_key, data, ttl=settings.ai_local_overview_ttl_seconds)
        return data

    async def chat(self, body: AiChatRequest) -> dict[str, Any]:
        exchange = self._normalize_exchange(body.exchange)
        context = await self._build_local_context(
            exchange=exchange,
            prompt=body.prompt,
            focus_symbols=body.focus_symbols,
        )
        connected, model_available, _ = await self._get_provider_status()
        generated_at = datetime.now()

        answer, used_fallback = await self._generate_chat_answer_local(
            prompt=body.prompt,
            context=context,
            history=[item.model_dump(mode="json") for item in body.history[-8:]],
            connected=connected,
            model_available=model_available,
        )

        response = AiLocalChatResponse(
            exchange=exchange,
            provider="ollama",
            model=settings.ollama_model,
            connected=connected,
            model_available=model_available,
            used_fallback=used_fallback,
            generated_at=generated_at,
            focus_symbols=[item["symbol"] for item in context["focus_symbols"]],
            context_summary=self._build_dataset_stats(context)[:4],
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
    ) -> dict[str, Any]:
        context = await self._build_market_context(exchange=exchange, prompt=prompt, focus_symbols=focus_symbols)
        symbols = await self.repo.get_symbols_by_exchange(exchange)
        news_items = await self.cafef_news_service.fetch_latest_news(limit=6)
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
        return context

    async def _get_provider_status(self) -> tuple[bool, bool, list[str]]:
        try:
            installed_models = await self.ollama.list_models()
        except OllamaServiceError as exc:
            logger.warning("ollama status fallback: %s", exc)
            return False, False, []

        normalized_installed = {item.lower() for item in installed_models}
        target_model = settings.ollama_model.lower()
        model_available = target_model in normalized_installed or any(
            item.split(":")[0] == target_model.split(":")[0] for item in normalized_installed
        )
        return True, model_available, installed_models

    async def _generate_overview_cards(
        self,
        *,
        context: dict[str, Any],
        connected: bool,
        model_available: bool,
    ) -> tuple[list[AiForecastCard], bool]:
        if not connected or not model_available:
            return self._build_fallback_forecast_cards(context), True

        prompt_context = self._build_prompt_context_local(context)
        prompt = (
            "Hay tao dung 4 the insight cho dashboard AI Local.\n"
            "Yeu cau:\n"
            "- Viet tieng Viet khong dau.\n"
            "- Moi summary toi da 2 cau ngan.\n"
            "- direction chi duoc la up, down, neutral.\n"
            "- confidence la so nguyen 55-95.\n"
            "- Chi duoc dung du lieu trong CONTEXT_JSON.\n"
            "- Tra ve JSON thuan theo dang {\"forecast_cards\":[...]}.\n\n"
            f"CONTEXT_JSON:\n{json.dumps(prompt_context, ensure_ascii=False, indent=2, default=str)}"
        )

        system_prompt = (
            "Ban la AI Local chay tren Ollama cho he thong chung khoan Viet Nam. "
            "Khong duoc bo sung thong tin ngoai context. Tap trung vao index, dong tien, watchlist va tin CafeF."
        )

        try:
            raw = await self.ollama.generate_text(
                prompt=prompt,
                system_prompt=system_prompt,
                temperature=0.15,
                max_output_tokens=900,
            )
            payload = self._load_json(raw)
            cards = payload.get("forecast_cards") if isinstance(payload, dict) else payload
            parsed = self._normalize_forecast_cards(cards)
            if parsed:
                return parsed[:4], False
        except Exception as exc:  # pragma: no cover
            logger.warning("ollama overview fallback: %s", exc)

        return self._build_fallback_forecast_cards(context), True

    async def _generate_chat_answer_local(
        self,
        *,
        prompt: str,
        context: dict[str, Any],
        history: list[dict[str, str]],
        connected: bool,
        model_available: bool,
    ) -> tuple[str, bool]:
        if not connected:
            return self._build_ollama_unavailable_answer(context, reason="Ollama local server chua san sang."), True
        if not model_available:
            return self._build_ollama_unavailable_answer(
                context,
                reason=f"Model {settings.ollama_model} chua co trong Ollama local.",
            ), True

        system_prompt = (
            "Ban la AI Local cua nen tang chung khoan. "
            "Tra loi bang tieng Viet khong dau, ngan gon, ro rang, dua tren du lieu local trong context. "
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
                history=history,
                temperature=0.2,
                max_output_tokens=1200,
            )
            return answer.strip(), False
        except Exception as exc:  # pragma: no cover
            logger.warning("ollama chat fallback: %s", exc)
            return self._build_ollama_unavailable_answer(context, reason="Khong lay duoc phan hoi tu model local."), True

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
            "cafef_news": context.get("cafef_news") or [],
            "sync_logs": context.get("news") or [],
            "symbol_count": context.get("symbol_count") or 0,
        }

    def _build_summary_items_local(
        self,
        *,
        context: dict[str, Any],
        connected: bool,
        model_available: bool,
        installed_models: list[str],
        used_fallback: bool,
    ) -> list[AiStatusItem]:
        return [
            AiStatusItem(label="Provider", value="Ollama local"),
            AiStatusItem(label="Model", value=settings.ollama_model),
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
        ]

    def _build_dataset_stats(self, context: dict[str, Any]) -> list[AiLocalDataStat]:
        watchlist = context.get("watchlist") or []
        gainers = context.get("gainers") or []
        losers = context.get("losers") or []
        news_items = context.get("cafef_news") or []
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
                helper="Tin tuc moi nhat duoc keo ve va dua vao local context",
            ),
            AiLocalDataStat(
                label="Focus symbols",
                value=f"{len(context.get('focus_symbols') or [])} ma",
                helper="Ma duoc trich tu prompt va watchlist hien tai",
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

    def _build_ollama_unavailable_answer(self, context: dict[str, Any], *, reason: str) -> str:
        fallback = self._build_fallback_chat_answer("local", context)
        return (
            f"{reason}\n\n"
            f"Hay dam bao da chay `ollama serve` va da pull model `{settings.ollama_model}`.\n\n"
            f"{fallback}"
        )
