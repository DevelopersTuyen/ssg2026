from __future__ import annotations

import json
import re
from datetime import date, datetime
from typing import Any

from app.core.cache import cache_service
from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.market_read_repo import MarketReadRepository
from app.schemas.ai_agent import (
    AiActivityItem,
    AiChatRequest,
    AiChatResponse,
    AiChatMessage,
    AiForecastCard,
    AiOverviewResponse,
    AiSkillItem,
    AiStatusItem,
    AiTaskItem,
)
from app.services.gemini_service import GeminiService, GeminiServiceError

logger = get_logger(__name__)


class AiAgentService:
    QUICK_PROMPTS = [
        "Tóm tắt thị trường hôm nay",
        "Mã nào trong watchlist đang yếu hơn VN-Index?",
        "Giải thích vì sao mã dẫn đầu tăng mạnh",
        "Tóm tắt tin tức nhóm ngân hàng",
        "Lọc mã có volume đột biến",
        "So sánh hai mã tôi đang quan tâm",
    ]

    TASKS = [
        AiTaskItem(
            name="Báo cáo đầu phiên",
            schedule="08:30 mỗi ngày",
            status="Sẵn sàng",
            target="Toàn thị trường",
        ),
        AiTaskItem(
            name="Giám sát watchlist",
            schedule="Liên tục",
            status="Sẵn sàng",
            target="Watchlist hiện tại",
        ),
        AiTaskItem(
            name="Digest tin tức giữa phiên",
            schedule="11:30 mỗi ngày",
            status="Sẵn sàng",
            target="Nhóm cổ phiếu nổi bật",
        ),
        AiTaskItem(
            name="Tóm tắt cuối phiên",
            schedule="14:45 mỗi ngày",
            status="Sẵn sàng",
            target="HSX / HNX / UPCOM",
        ),
    ]

    SKILLS = [
        AiSkillItem(
            title="Tóm tắt thị trường",
            description="AI gom chỉ số, độ rộng, dòng tiền và biến động nổi bật để viết bản tóm tắt ngắn.",
            icon="analytics-outline",
        ),
        AiSkillItem(
            title="Giải thích biến động mã",
            description="AI bám vào giá, phần trăm thay đổi, thanh khoản và dữ liệu watchlist để diễn giải nhanh.",
            icon="pulse-outline",
        ),
        AiSkillItem(
            title="Theo dõi watchlist",
            description="AI rà các mã đang theo dõi để chỉ ra mã mạnh lên, yếu đi hoặc lệch nhịp so với chỉ số.",
            icon="eye-outline",
        ),
        AiSkillItem(
            title="Đọc tin dữ liệu hệ thống",
            description="AI tóm tắt các log đồng bộ gần nhất để chỉ ra nguồn dữ liệu vừa được cập nhật gì.",
            icon="newspaper-outline",
        ),
        AiSkillItem(
            title="So sánh cổ phiếu",
            description="AI đặt hai mã cạnh nhau theo giá, biên độ và thanh khoản để trả lời ngay trong chat.",
            icon="git-compare-outline",
        ),
        AiSkillItem(
            title="Sàng lọc cơ hội",
            description="AI lọc các mã mạnh về giá hoặc volume trong exchange hiện tại để gợi ý vùng cần quan sát.",
            icon="filter-outline",
        ),
    ]

    ASSISTANT_GREETING = (
        "Xin chào. Tôi là AI Agent của Market Watch. Tôi có thể tóm tắt thị trường, "
        "giải thích biến động mã, theo dõi watchlist và trả lời dựa trên dữ liệu live hiện có."
    )

    _IGNORED_SYMBOLS = {"HSX", "HNX", "UPCOM", "VNINDEX", "HNXINDEX", "UPCOMINDEX", "AI"}

    def __init__(self, repo: MarketReadRepository, gemini: GeminiService | None = None) -> None:
        self.repo = repo
        self.gemini = gemini or GeminiService()

    async def get_overview(self, exchange: str = "HSX") -> dict[str, Any]:
        exchange = self._normalize_exchange(exchange)
        cache_key = f"ai-agent:overview:{exchange}:{settings.gemini_model}"
        cached = await cache_service.get_json(cache_key)
        if cached is not None:
            return cached

        context = await self._build_market_context(exchange=exchange, prompt="", focus_symbols=[])
        forecast_cards, used_fallback = await self._generate_forecast_cards(context)
        recent_activities = self._build_recent_activities(context)
        history = self._build_history(context)
        generated_at = datetime.now()

        response = AiOverviewResponse(
            exchange=exchange,
            provider="gemini" if not used_fallback else "fallback",
            model=settings.gemini_model,
            used_fallback=used_fallback,
            generated_at=generated_at,
            summary_items=self._build_summary_items(context, forecast_cards, used_fallback),
            quick_prompts=self.QUICK_PROMPTS,
            forecast_cards=forecast_cards,
            recent_activities=recent_activities,
            tasks=self.TASKS,
            skills=self.SKILLS,
            history=history,
            assistant_greeting=self.ASSISTANT_GREETING,
        )
        data = response.model_dump(mode="json")
        await cache_service.set_json(cache_key, data, ttl=settings.ai_agent_overview_ttl_seconds)
        return data

    async def chat(self, body: AiChatRequest) -> dict[str, Any]:
        exchange = self._normalize_exchange(body.exchange)
        context = await self._build_market_context(
            exchange=exchange,
            prompt=body.prompt,
            focus_symbols=body.focus_symbols,
        )

        generated_at = datetime.now()
        answer, used_fallback = await self._generate_chat_answer(
            prompt=body.prompt,
            context=context,
            history=[item.model_dump(mode="json") for item in body.history[-6:]],
        )

        response = AiChatResponse(
            exchange=exchange,
            provider="gemini" if not used_fallback else "fallback",
            model=settings.gemini_model,
            used_fallback=used_fallback,
            generated_at=generated_at,
            focus_symbols=[item["symbol"] for item in context["focus_symbols"]],
            message=AiChatMessage(
                content=answer,
                time=self._clock(generated_at),
            ),
        )
        return response.model_dump(mode="json")

    async def _build_market_context(
        self,
        *,
        exchange: str,
        prompt: str,
        focus_symbols: list[str],
    ) -> dict[str, Any]:
        selected_exchange = self._normalize_exchange(exchange)
        active_watchlist = await self._build_watchlist_snapshot(limit=12)
        resolved_symbols = self._resolve_focus_symbols(prompt, focus_symbols)

        context = {
            "exchange": selected_exchange,
            "index_cards": await self.repo.get_index_cards(),
            "hourly_trading": await self.repo.get_exchange_intraday_hourly(exchange=selected_exchange),
            "actives": await self._get_stock_board(selected_exchange, "actives", limit=6),
            "gainers": await self._get_stock_board(selected_exchange, "gainers", limit=6),
            "losers": await self._get_stock_board(selected_exchange, "losers", limit=6),
            "watchlist": active_watchlist,
            "news": self._serialize_logs(await self.repo.get_latest_sync_logs(limit=8)),
            "focus_symbols": await self._build_focus_symbol_snapshots(resolved_symbols[:4]),
        }
        context["selected_index"] = next(
            (item for item in context["index_cards"] if (item.get("exchange") or "").upper() == selected_exchange),
            None,
        )
        return context

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
        items = items[:limit]
        symbols = [item.symbol.upper() for item in items]
        intraday_map = await self.repo.get_latest_intraday_map(symbols)
        quote_map = await self.repo.get_latest_quote_map(symbols)

        rows: list[dict[str, Any]] = []
        for item in items:
            symbol = item.symbol.upper()
            intraday = intraday_map.get(symbol)
            quote = quote_map.get(symbol)

            price = self._pick_value(getattr(intraday, "price", None), getattr(quote, "price", None))
            change_value = self._pick_value(
                getattr(intraday, "change_value", None),
                getattr(quote, "change_value", None),
            )
            change_percent = self._pick_value(
                getattr(intraday, "change_percent", None),
                getattr(quote, "change_percent", None),
            )
            volume = self._pick_value(getattr(intraday, "volume", None), getattr(quote, "volume", None))
            trading_value = self._pick_value(
                getattr(intraday, "trading_value", None),
                getattr(quote, "trading_value", None),
            )
            updated_at = self._pick_value(
                getattr(intraday, "point_time", None),
                getattr(quote, "quote_time", None),
                getattr(quote, "captured_at", None),
                item.updated_at,
            )

            rows.append(
                {
                    "symbol": symbol,
                    "exchange": item.exchange,
                    "note": item.note,
                    "price": price,
                    "change_value": change_value,
                    "change_percent": change_percent,
                    "volume": volume,
                    "trading_value": trading_value,
                    "updated_at": self._iso(updated_at),
                }
            )
        return rows

    async def _build_focus_symbol_snapshots(self, symbols: list[str]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for symbol in symbols:
            quote = await self.repo.get_latest_quote(symbol)
            hourly = await self.repo.get_symbol_intraday_hourly(symbol=symbol)
            if quote is None and not hourly:
                continue

            results.append(
                {
                    "symbol": symbol.upper(),
                    "exchange": getattr(quote, "exchange", None),
                    "price": getattr(quote, "price", None),
                    "reference_price": getattr(quote, "reference_price", None),
                    "change_value": getattr(quote, "change_value", None),
                    "change_percent": getattr(quote, "change_percent", None),
                    "volume": getattr(quote, "volume", None),
                    "trading_value": getattr(quote, "trading_value", None),
                    "quote_time": self._iso(getattr(quote, "quote_time", None)),
                    "captured_at": self._iso(getattr(quote, "captured_at", None)),
                    "hourly": [
                        {
                            "time": self._iso(item.get("time")),
                            "open": item.get("open"),
                            "high": item.get("high"),
                            "low": item.get("low"),
                            "close": item.get("close"),
                            "volume": item.get("volume"),
                            "trading_value": item.get("trading_value"),
                        }
                        for item in hourly[-8:]
                    ],
                }
            )
        return results

    async def _generate_forecast_cards(self, context: dict[str, Any]) -> tuple[list[AiForecastCard], bool]:
        prompt_context = self._build_prompt_context(context)
        prompt = (
            "Bạn là AI analyst cho dashboard chứng khoán Việt Nam.\n"
            "Hãy tạo đúng 3 forecast cards cho giao diện.\n"
            "Quy tắc:\n"
            "- Viết tiếng Việt tự nhiên, ngắn, dễ scan.\n"
            "- Mỗi summary tối đa 2 câu.\n"
            "- direction chỉ được là up, down hoặc neutral.\n"
            "- confidence là số nguyên từ 55 đến 95.\n"
            "- Không bịa dữ liệu nằm ngoài context.\n"
            "- Nếu dữ liệu chưa đủ mạnh, giảm confidence.\n"
            '- Trả về JSON thuần theo dạng {"forecast_cards":[...]}, không dùng markdown.\n\n'
            f"CONTEXT_JSON:\n{json.dumps(prompt_context, ensure_ascii=False, indent=2, default=str)}"
        )

        try:
            raw = await self.gemini.generate_text(
                prompt=prompt,
                temperature=0.25,
                max_output_tokens=700,
                response_mime_type="application/json",
            )
            payload = self._load_json(raw)
            cards = payload.get("forecast_cards") if isinstance(payload, dict) else payload
            parsed = self._normalize_forecast_cards(cards)
            if parsed:
                return parsed[:3], False
        except GeminiServiceError as exc:
            logger.warning("ai overview fallback: %s", exc)
        except Exception as exc:  # pragma: no cover
            logger.warning("cannot parse gemini forecast cards: %s", exc)

        return self._build_fallback_forecast_cards(context), True

    async def _generate_chat_answer(
        self,
        *,
        prompt: str,
        context: dict[str, Any],
        history: list[dict[str, str]],
    ) -> tuple[str, bool]:
        llm_prompt = (
            "Bạn là AI Agent của hệ thống market watch chứng khoán Việt Nam.\n"
            "Quy tắc trả lời:\n"
            "- Trả lời bằng tiếng Việt.\n"
            "- Chỉ dùng dữ liệu trong CONTEXT_JSON và hội thoại gần nhất.\n"
            "- Nếu thiếu dữ liệu, phải nói rõ phần nào chưa có.\n"
            "- Không khẳng định chắc chắn việc mua/bán; đây chỉ là phân tích tham khảo.\n"
            "- Ưu tiên nêu diễn biến chỉ số, nhóm/mã nổi bật, watchlist liên quan và rủi ro cần theo dõi.\n"
            "- Trả lời gọn, rõ, có thể chia đoạn ngắn.\n\n"
            f"USER_REQUEST:\n{prompt}\n\n"
            f"CONTEXT_JSON:\n{json.dumps(self._build_prompt_context(context), ensure_ascii=False, indent=2, default=str)}"
        )

        try:
            answer = await self.gemini.generate_text(
                prompt=llm_prompt,
                history=history,
                temperature=0.35,
                max_output_tokens=900,
            )
            return answer.strip(), False
        except GeminiServiceError as exc:
            logger.warning("ai chat fallback: %s", exc)
            return self._build_fallback_chat_answer(prompt, context), True

    def _build_prompt_context(self, context: dict[str, Any]) -> dict[str, Any]:
        return {
            "exchange": context["exchange"],
            "selected_index": context.get("selected_index"),
            "index_cards": context.get("index_cards"),
            "exchange_hourly_trading_tail": (context.get("hourly_trading") or [])[-6:],
            "most_active": context.get("actives") or [],
            "top_gainers": context.get("gainers") or [],
            "top_losers": context.get("losers") or [],
            "watchlist": context.get("watchlist") or [],
            "focus_symbols": context.get("focus_symbols") or [],
            "recent_sync_logs": context.get("news") or [],
        }

    def _build_summary_items(
        self,
        context: dict[str, Any],
        forecast_cards: list[AiForecastCard],
        used_fallback: bool,
    ) -> list[AiStatusItem]:
        last_run_dt = self._resolve_last_run(context)
        signal_count = self._count_signals(context)
        watchlist_count = len(context.get("watchlist") or [])
        status_label = "Đang hoạt động" if not used_fallback else "Fallback từ dữ liệu hệ thống"

        return [
            AiStatusItem(label="Model", value=settings.gemini_model),
            AiStatusItem(
                label="Trạng thái",
                value=status_label,
                tone="positive" if not used_fallback else "warning",
            ),
            AiStatusItem(label="Watchlist đang theo dõi", value=f"{watchlist_count} mã"),
            AiStatusItem(label="Lần chạy gần nhất", value=self._clock(last_run_dt)),
            AiStatusItem(label="Cảnh báo AI hôm nay", value=f"{signal_count} tín hiệu"),
            AiStatusItem(label="Tóm tắt đã tạo", value=f"{max(1, len(forecast_cards))} bản"),
        ]

    def _build_recent_activities(self, context: dict[str, Any]) -> list[AiActivityItem]:
        items: list[AiActivityItem] = []
        gainers = context.get("gainers") or []
        losers = context.get("losers") or []
        actives = context.get("actives") or []
        watchlist = context.get("watchlist") or []
        logs = context.get("news") or []

        if gainers:
            item = gainers[0]
            items.append(
                AiActivityItem(
                    time=self._clock(item.get("point_time") or item.get("captured_at")),
                    text=(
                        f"{item['symbol']} đang dẫn đầu tăng với biên độ "
                        f"{self._format_pct(item.get('change_percent'))} và thanh khoản {self._format_compact(item.get('volume'))}."
                    ),
                )
            )

        if losers:
            item = losers[0]
            items.append(
                AiActivityItem(
                    time=self._clock(item.get("point_time") or item.get("captured_at")),
                    text=f"{item['symbol']} đang là mã yếu nhất trên {context['exchange']} với mức {self._format_pct(item.get('change_percent'))}.",
                )
            )

        if actives:
            item = actives[0]
            items.append(
                AiActivityItem(
                    time=self._clock(item.get("point_time") or item.get("captured_at")),
                    text=(
                        f"Dòng tiền tập trung vào {item['symbol']} với volume "
                        f"{self._format_compact(item.get('volume'))} và giá {self._format_price(item.get('price'))}."
                    ),
                )
            )

        watch_signal = next(
            (item for item in watchlist if abs(float(item.get("change_percent") or 0)) >= 2),
            None,
        )
        if watch_signal:
            items.append(
                AiActivityItem(
                    time=self._clock(watch_signal.get("updated_at")),
                    text=(
                        f"Watchlist ghi nhận {watch_signal['symbol']} biến động "
                        f"{self._format_pct(watch_signal.get('change_percent'))}, cần theo dõi thêm."
                    ),
                )
            )

        for log in logs[:2]:
            items.append(
                AiActivityItem(
                    time=self._clock(log.get("started_at")),
                    text=log.get("message") or f"{log.get('job_name')} vừa chạy trạng thái {log.get('status')}.",
                )
            )

        return items[:4]

    def _build_history(self, context: dict[str, Any]) -> list[AiActivityItem]:
        logs = context.get("news") or []
        if logs:
            return [
                AiActivityItem(
                    time=self._clock(item.get("finished_at") or item.get("started_at")),
                    text=item.get("message") or f"{item.get('job_name')} {item.get('status')}.",
                )
                for item in logs[:6]
            ]
        return [
            AiActivityItem(
                time=self._clock(datetime.now()),
                text="Chưa có lịch sử AI riêng. Hệ thống đang dùng log đồng bộ dữ liệu để dựng context.",
            )
        ]

    def _build_fallback_forecast_cards(self, context: dict[str, Any]) -> list[AiForecastCard]:
        cards: list[AiForecastCard] = []
        selected_index = context.get("selected_index") or {}
        gainers = context.get("gainers") or []
        actives = context.get("actives") or []
        watchlist = context.get("watchlist") or []

        if selected_index:
            index_change = float(selected_index.get("change_percent") or 0)
            cards.append(
                AiForecastCard(
                    title=f"Nhịp {context['exchange']} hiện tại",
                    summary=(
                        f"{selected_index.get('symbol')} đang {self._movement_word(index_change)} "
                        f"{self._format_pct(index_change)}. Theo dõi thêm nhịp duy trì trong các khung giờ cuối."
                    ),
                    direction=self._to_direction(index_change),
                    confidence=self._confidence_from_change(index_change),
                )
            )

        if gainers:
            top = gainers[0]
            pct = float(top.get("change_percent") or 0)
            cards.append(
                AiForecastCard(
                    title="Mã dẫn dắt nổi bật",
                    summary=(
                        f"{top['symbol']} đang nổi bật hơn phần còn lại với {self._format_pct(pct)} "
                        f"và volume {self._format_compact(top.get('volume'))}."
                    ),
                    direction=self._to_direction(pct),
                    confidence=self._confidence_from_change(pct),
                )
            )

        watch_signal = next(
            (item for item in watchlist if abs(float(item.get("change_percent") or 0)) >= 2),
            None,
        )
        if watch_signal:
            pct = float(watch_signal.get("change_percent") or 0)
            cards.append(
                AiForecastCard(
                    title="Watchlist cần chú ý",
                    summary=(
                        f"{watch_signal['symbol']} đang lệch nhịp {self._format_pct(pct)}. "
                        "Nếu đây là mã trọng tâm thì nên theo dõi thêm volume và phản ứng giá kế tiếp."
                    ),
                    direction=self._to_direction(pct),
                    confidence=self._confidence_from_change(pct),
                )
            )

        if len(cards) < 3 and actives:
            top = actives[0]
            cards.append(
                AiForecastCard(
                    title="Dòng tiền ngắn hạn",
                    summary=(
                        f"Dòng tiền hiện nghiêng về {top['symbol']} với thanh khoản {self._format_compact(top.get('volume'))}. "
                        "Ưu tiên quan sát nhóm cổ phiếu đang hút giao dịch mạnh."
                    ),
                    direction="neutral",
                    confidence=68,
                )
            )

        while len(cards) < 3:
            cards.append(
                AiForecastCard(
                    title="Dữ liệu đang được cập nhật",
                    summary="Gemini chưa sẵn sàng nên hệ thống đang dựng insight từ dữ liệu thị trường hiện có.",
                    direction="neutral",
                    confidence=60,
                )
            )
        return cards[:3]

    def _build_fallback_chat_answer(self, prompt: str, context: dict[str, Any]) -> str:
        selected_index = context.get("selected_index") or {}
        focus_symbols = context.get("focus_symbols") or []
        actives = context.get("actives") or []
        gainers = context.get("gainers") or []
        losers = context.get("losers") or []
        watchlist = context.get("watchlist") or []

        parts = [
            "Gemini hiện chưa phản hồi nên đây là phần phân tích fallback từ dữ liệu backend hiện có."
        ]

        if selected_index:
            parts.append(
                f"{selected_index.get('symbol')} trên {context['exchange']} đang {self._movement_word(selected_index.get('change_percent'))} "
                f"{self._format_pct(selected_index.get('change_percent'))} tại mức {self._format_price(selected_index.get('close'))}."
            )

        prompt_lower = prompt.lower()
        if "watchlist" in prompt_lower and watchlist:
            strongest = max(watchlist, key=lambda item: float(item.get("change_percent") or -9999))
            weakest = min(watchlist, key=lambda item: float(item.get("change_percent") or 9999))
            parts.append(
                f"Trong watchlist, mã mạnh nhất là {strongest['symbol']} ({self._format_pct(strongest.get('change_percent'))}), "
                f"mã yếu nhất là {weakest['symbol']} ({self._format_pct(weakest.get('change_percent'))})."
            )

        if "so sánh" in prompt_lower and len(focus_symbols) >= 2:
            a, b = focus_symbols[0], focus_symbols[1]
            parts.append(
                f"So sánh nhanh: {a['symbol']} đang {self._format_pct(a.get('change_percent'))} với volume {self._format_compact(a.get('volume'))}; "
                f"{b['symbol']} đang {self._format_pct(b.get('change_percent'))} với volume {self._format_compact(b.get('volume'))}."
            )
        elif focus_symbols:
            details = []
            for item in focus_symbols[:2]:
                details.append(
                    f"{item['symbol']}: giá {self._format_price(item.get('price'))}, biến động {self._format_pct(item.get('change_percent'))}, "
                    f"volume {self._format_compact(item.get('volume'))}"
                )
            parts.append(" | ".join(details))
        else:
            if gainers:
                parts.append(
                    f"Mã tăng nổi bật nhất hiện là {gainers[0]['symbol']} ({self._format_pct(gainers[0].get('change_percent'))})."
                )
            if losers:
                parts.append(
                    f"Mã yếu nhất hiện là {losers[0]['symbol']} ({self._format_pct(losers[0].get('change_percent'))})."
                )
            if actives:
                parts.append(
                    f"Dòng tiền đang tập trung ở {actives[0]['symbol']} với volume {self._format_compact(actives[0].get('volume'))}."
                )

        parts.append("Nếu bạn cấu hình `GEMINI_API_KEY`, phần chat sẽ chuyển sang phân tích sinh ngôn ngữ từ Gemini trên cùng context này.")
        return "\n\n".join(parts)

    def _serialize_logs(self, logs: list[Any]) -> list[dict[str, Any]]:
        return [
            {
                "job_name": log.job_name,
                "status": log.status,
                "message": log.message,
                "started_at": self._iso(log.started_at),
                "finished_at": self._iso(log.finished_at),
            }
            for log in logs
        ]

    def _resolve_focus_symbols(self, prompt: str, focus_symbols: list[str]) -> list[str]:
        candidates = [symbol.upper().strip() for symbol in focus_symbols if symbol and symbol.strip()]
        candidates.extend(re.findall(r"\b[A-Z]{2,6}\b", (prompt or "").upper()))

        result: list[str] = []
        for symbol in candidates:
            if symbol in self._IGNORED_SYMBOLS:
                continue
            if symbol not in result:
                result.append(symbol)
        return result

    def _count_signals(self, context: dict[str, Any]) -> int:
        watchlist = context.get("watchlist") or []
        gainers = context.get("gainers") or []
        losers = context.get("losers") or []

        total = sum(1 for item in watchlist if abs(float(item.get("change_percent") or 0)) >= 2)
        total += sum(1 for item in gainers[:3] if abs(float(item.get("change_percent") or 0)) >= 3)
        total += sum(1 for item in losers[:3] if abs(float(item.get("change_percent") or 0)) >= 3)
        return total

    def _resolve_last_run(self, context: dict[str, Any]) -> datetime | None:
        candidates: list[datetime] = []
        selected_index = context.get("selected_index") or {}
        logs = context.get("news") or []

        for value in [
            selected_index.get("updated_at"),
            *[log.get("finished_at") or log.get("started_at") for log in logs],
        ]:
            dt = self._coerce_datetime(value)
            if dt is not None:
                candidates.append(dt)

        return max(candidates) if candidates else None

    def _normalize_forecast_cards(self, cards: Any) -> list[AiForecastCard]:
        if not isinstance(cards, list):
            return []

        results: list[AiForecastCard] = []
        for item in cards[:3]:
            if not isinstance(item, dict):
                continue
            try:
                results.append(
                    AiForecastCard(
                        title=str(item.get("title") or "").strip() or "Insight",
                        summary=str(item.get("summary") or "").strip() or "Chưa có mô tả.",
                        direction=self._normalize_direction(item.get("direction")),
                        confidence=max(55, min(95, int(item.get("confidence") or 60))),
                    )
                )
            except Exception:
                continue
        return results

    @staticmethod
    def _normalize_exchange(exchange: str | None) -> str:
        if not exchange:
            return "HSX"
        value = exchange.upper()
        if value in {"HSX", "HNX", "UPCOM"}:
            return value
        return "HSX"

    @staticmethod
    def _load_json(text: str) -> Any:
        raw = text.strip()
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw, flags=re.IGNORECASE | re.DOTALL).strip()

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            start_obj = raw.find("{")
            end_obj = raw.rfind("}")
            if start_obj != -1 and end_obj != -1 and end_obj > start_obj:
                return json.loads(raw[start_obj : end_obj + 1])

            start_arr = raw.find("[")
            end_arr = raw.rfind("]")
            if start_arr != -1 and end_arr != -1 and end_arr > start_arr:
                return json.loads(raw[start_arr : end_arr + 1])
            raise

    @staticmethod
    def _pick_value(*values: Any) -> Any:
        for value in values:
            if value is not None:
                return value
        return None

    @staticmethod
    def _normalize_direction(value: Any) -> str:
        if isinstance(value, str):
            lowered = value.lower().strip()
            if lowered in {"up", "down", "neutral"}:
                return lowered
        return "neutral"

    @staticmethod
    def _to_direction(value: Any) -> str:
        num = float(value or 0)
        if num > 0.3:
            return "up"
        if num < -0.3:
            return "down"
        return "neutral"

    @staticmethod
    def _confidence_from_change(value: Any) -> int:
        magnitude = abs(float(value or 0))
        return max(60, min(90, int(60 + (magnitude * 6))))

    @staticmethod
    def _movement_word(value: Any) -> str:
        num = float(value or 0)
        if num > 0.15:
            return "tăng"
        if num < -0.15:
            return "giảm"
        return "đi ngang"

    @staticmethod
    def _format_pct(value: Any) -> str:
        if value is None:
            return "--"
        num = float(value)
        return f"{num:+.2f}%"

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
