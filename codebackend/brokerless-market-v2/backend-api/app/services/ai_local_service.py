from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from app.core.cache import cache_service
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.market_read_repo import MarketReadRepository
from app.schemas.ai_agent import AiChatMessage, AiChatRequest, AiForecastCard, AiStatusItem
from app.schemas.ai_local import (
    AiLocalAnalysisSection,
    AiLocalChatResponse,
    AiLocalDataStat,
    AiLocalNewsItem,
    AiLocalOverviewResponse,
    AiLocalStorageStatus,
)
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
        forecast_cards, analysis_sections, used_fallback = await self._generate_overview_cards(
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
            analysis_sections=analysis_sections,
            cafef_storage=AiLocalStorageStatus.model_validate(context.get("cafef_storage") or {}),
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
        context["actives"] = await self._get_stock_board(exchange, "actives", limit=10)
        context["gainers"] = await self._get_stock_board(exchange, "gainers", limit=10)
        context["losers"] = await self._get_stock_board(exchange, "losers", limit=10)
        symbols = await self.repo.get_symbols_by_exchange(exchange)
        news_items = await self.cafef_news_service.fetch_latest_news(limit=10, repo=self.repo)
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
        context["symbol_preview"] = [
            item.symbol if hasattr(item, "symbol") else item.get("symbol")
            for item in (symbols or [])[:20]
        ]
        storage_status = await self._build_cafef_storage_status()
        context["cafef_storage"] = storage_status.model_dump(mode="json")
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
    ) -> tuple[list[AiForecastCard], list[AiLocalAnalysisSection], bool]:
        if not connected or not model_available:
            return self._build_fallback_forecast_cards(context), self._build_fallback_analysis_sections(context), True

        prompt_context = self._build_prompt_context_local(context)
        prompt = (
            "Hay tao bo phan tich AI Local chi tiet cho dashboard chung khoan.\n"
            "Yeu cau:\n"
            "- Viet tieng Viet khong dau.\n"
            "- forecast_cards gom dung 4 the. Moi summary toi da 2 cau ngan.\n"
            "- analysis_sections gom dung 5 muc, moi muc phai co title, summary va 3-5 bullets cu the.\n"
            "- Can phan tich sau hon ve: index/chi so, dong tien, top movers, watchlist, tin CafeF, rui ro ngan han, va tinh trang du lieu.\n"
            "- Phai neu ro tinh trang luu tru CafeF trong detail neu context co thong tin nay.\n"
            "- direction chi duoc la up, down, neutral.\n"
            "- confidence la so nguyen 55-95.\n"
            "- Chi duoc dung du lieu trong CONTEXT_JSON.\n"
            "- Tra ve JSON thuan theo dang {\"forecast_cards\":[...],\"analysis_sections\":[...]}.\n\n"
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
                max_output_tokens=1800,
            )
            payload = self._load_json(raw)
            cards = payload.get("forecast_cards") if isinstance(payload, dict) else payload
            sections = payload.get("analysis_sections") if isinstance(payload, dict) else []
            parsed = self._normalize_forecast_cards(cards)
            parsed_sections = self._normalize_analysis_sections(sections)
            if parsed:
                return parsed[:4], parsed_sections or self._build_fallback_analysis_sections(context), False
        except Exception as exc:  # pragma: no cover
            logger.warning("ollama overview fallback: %s", exc)

        return self._build_fallback_forecast_cards(context), self._build_fallback_analysis_sections(context), True

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
                helper="Tin tuc CafeF duoc dong bo vao bang market_news_articles va nap lai cho AI Local",
            ),
            AiLocalDataStat(
                label="Focus symbols",
                value=f"{len(context.get('focus_symbols') or [])} ma",
                helper="Ma duoc trich tu prompt va watchlist hien tai",
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

    def _build_fallback_analysis_sections(self, context: dict[str, Any]) -> list[AiLocalAnalysisSection]:
        selected_index = context.get("selected_index") or {}
        actives = context.get("actives") or []
        gainers = context.get("gainers") or []
        losers = context.get("losers") or []
        watchlist = context.get("watchlist") or []
        news_items = context.get("cafef_news") or []
        storage = context.get("cafef_storage") or {}

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
                title="Tinh trang luu tru du lieu",
                summary="Nguon tin CafeF duoc uu tien doc tu database sau khi dong bo tu luong fetch.",
                bullets=[
                    f"Stored in DB: {'Co' if storage.get('stored_in_db') else 'Khong'}",
                    f"Nguon hien tai: {storage.get('source') or '--'}",
                    f"Chi tiet: {storage.get('detail') or '--'}",
                ],
            ),
        ]
        return sections

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
