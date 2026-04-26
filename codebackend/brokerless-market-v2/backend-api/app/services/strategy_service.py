from __future__ import annotations

import ast
import time
from collections import defaultdict
from copy import deepcopy
from datetime import date, datetime, timedelta
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.market import (
    AppUser,
    StrategyAlertRule,
    StrategyAuditLog,
    StrategyChecklistItem,
    StrategyFormulaDefinition,
    StrategyFormulaParameter,
    StrategyProfile,
    StrategyScreenRule,
    StrategySignalSnapshot,
    StrategyStockScoreSnapshot,
    StrategyTradeJournalEntry,
    StrategyVersion,
    MarketFinancialBalanceSheet,
    MarketFinancialIncomeStatement,
    MarketFinancialRatio,
    MarketQuoteSnapshot,
    MarketSymbol,
)
from app.repositories.market_read_repo import MarketReadRepository
from app.services.auth_service import require_permission


DEFAULT_STRATEGY_PROFILE: dict[str, Any] = {
    "code": "default-growth",
    "name": "Growth Discipline",
    "description": "Bo chuan mac dinh cho chien luoc loc co phieu, canh bao som va ky luat vao lenh.",
    "formulas": [
        {
            "formula_code": "q_score",
            "label": "Q Score",
            "description": "Chat luong va suc khoe van hanh cua ma trong du lieu hien co.",
            "expression": "(w_liquidity * liquidity_score) + (w_stability * stability_score) + (w_news * news_score) + (w_watchlist * watchlist_bonus)",
            "display_order": 1,
            "parameters": [
                {"param_key": "w_liquidity", "label": "Trong so thanh khoan", "value_number": 0.35, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_stability", "label": "Trong so on dinh gia", "value_number": 0.25, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_news", "label": "Trong so tin tuc", "value_number": 0.20, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_watchlist", "label": "Trong so watchlist", "value_number": 0.20, "min": 0, "max": 1, "step": 0.05},
            ],
        },
        {
            "formula_code": "l_score",
            "label": "L Score",
            "description": "Muc do lanh dao dong tien va suc manh so voi thi truong.",
            "expression": "(w_leadership * leadership_score) + (w_market * market_trend_score) + (w_volume * volume_score) + (w_price * momentum_score)",
            "display_order": 2,
            "parameters": [
                {"param_key": "w_leadership", "label": "Trong so leadership", "value_number": 0.35, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_market", "label": "Trong so xu huong san", "value_number": 0.20, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_volume", "label": "Trong so volume", "value_number": 0.25, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_price", "label": "Trong so gia", "value_number": 0.20, "min": 0, "max": 1, "step": 0.05},
            ],
        },
        {
            "formula_code": "m_score",
            "label": "M Score",
            "description": "Dong luc va do dong thuan cua breakout.",
            "expression": "(w_momentum * momentum_score) + (w_confirmation * volume_confirmation_score) + (w_money_flow * money_flow_score) + (w_market * market_trend_score)",
            "display_order": 3,
            "parameters": [
                {"param_key": "w_momentum", "label": "Trong so dong luc gia", "value_number": 0.30, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_confirmation", "label": "Trong so xac nhan volume", "value_number": 0.25, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_money_flow", "label": "Trong so dong tien truoc tin", "value_number": 0.25, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_market", "label": "Trong so thi truong", "value_number": 0.20, "min": 0, "max": 1, "step": 0.05},
            ],
        },
        {
            "formula_code": "p_score",
            "label": "P Score",
            "description": "He so gia/rui ro. Diem cao hon nghia la dang nong hon va lam giam Winning Score.",
            "expression": "max(min_price_divisor, (w_price_risk * price_risk_score) + (w_hotness * hotness_score) + (w_volatility * volatility_score))",
            "display_order": 4,
            "parameters": [
                {"param_key": "min_price_divisor", "label": "Divisor toi thieu", "value_number": 10, "min": 1, "max": 100, "step": 1},
                {"param_key": "w_price_risk", "label": "Trong so rui ro gia", "value_number": 0.45, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_hotness", "label": "Trong so qua nong", "value_number": 0.30, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_volatility", "label": "Trong so bien dong", "value_number": 0.25, "min": 0, "max": 1, "step": 0.05},
            ],
        },
        {
            "formula_code": "winning_score",
            "label": "Winning Score",
            "description": "Cong thuc tong hop uu tien doanh nghiep tot, su dong thuan va gia mua hop ly.",
            "expression": "(Q * L * M) / P",
            "display_order": 5,
            "parameters": [
                {"param_key": "base_fair_value_premium", "label": "Premium fair value nen", "value_number": 0.12, "min": 0, "max": 0.5, "step": 0.01},
                {"param_key": "quality_fair_value_bonus", "label": "Bonus fair value theo chat luong", "value_number": 0.10, "min": 0, "max": 0.5, "step": 0.01},
                {"param_key": "news_fair_value_bonus", "label": "Bonus fair value theo tin", "value_number": 0.05, "min": 0, "max": 0.3, "step": 0.01},
                {"param_key": "min_margin_of_safety", "label": "Bien an toan toi thieu", "value_number": 0.20, "min": 0, "max": 0.5, "step": 0.01},
            ],
        },
    ],
    "screen_rules": [
        {"layer_code": "qualitative", "rule_code": "leader", "label": "Doanh nghiep dan dau dong tien", "expression": "leadership_score >= min_leadership_score", "severity": "info", "is_required": True, "display_order": 1},
        {"layer_code": "qualitative", "rule_code": "trend", "label": "Nam trong xu huong thuan thi truong", "expression": "market_trend_score >= min_market_trend_score", "severity": "info", "is_required": True, "display_order": 2},
        {"layer_code": "qualitative", "rule_code": "quality_flags", "label": "Co du quality flags co ban", "expression": "quality_flag_count >= min_quality_flag_count", "severity": "info", "is_required": True, "display_order": 3},
        {"layer_code": "quantitative", "rule_code": "liquidity", "label": "Thanh khoan du suc chiu lenh", "expression": "liquidity_score >= min_liquidity_score", "severity": "warning", "is_required": True, "display_order": 4},
        {"layer_code": "quantitative", "rule_code": "eps_growth", "label": "EPS growth quy/nam dat nguong", "expression": "eps_growth_year >= min_eps_growth_year and eps_growth_quarter >= min_eps_growth_quarter", "severity": "warning", "is_required": True, "display_order": 5},
        {"layer_code": "quantitative", "rule_code": "valuation", "label": "P/E nam sat trung binh nhom", "expression": "pe_gap_to_peer <= max_pe_gap_to_peer", "severity": "warning", "is_required": True, "display_order": 6},
        {"layer_code": "quantitative", "rule_code": "score", "label": "Winning Score vuot nguong", "expression": "winning_score >= min_winning_score", "severity": "warning", "is_required": True, "display_order": 7},
        {"layer_code": "technical", "rule_code": "ema_gap", "label": "Khoang cach EMA10/20 khong qua xa", "expression": "ema_gap_pct <= max_ema_gap_pct", "severity": "critical", "is_required": True, "display_order": 8},
        {"layer_code": "technical", "rule_code": "price_action", "label": "Gia van nam tren diem mo cua nhip hien tai", "expression": "price_vs_open_ratio >= min_price_vs_open_ratio", "severity": "critical", "is_required": True, "display_order": 9},
        {"layer_code": "technical", "rule_code": "breakout_volume", "label": "Volume xac nhan breakout", "expression": "volume_spike_ratio >= min_volume_spike_ratio and breakout_confirmation", "severity": "critical", "is_required": True, "display_order": 10},
        {"layer_code": "technical", "rule_code": "money_flow_context", "label": "Dong tien truoc tin va boi canh gia dat nguong", "expression": "money_flow_score >= min_money_flow_score and obv_above_ma and price_context_score >= min_price_context_score", "severity": "critical", "is_required": True, "display_order": 11},
    ],
    "screen_rule_parameters": [
        {"rule_code": "leader", "param_key": "min_leadership_score", "label": "Leadership toi thieu", "value_number": 55},
        {"rule_code": "trend", "param_key": "min_market_trend_score", "label": "Xu huong san toi thieu", "value_number": 45},
        {"rule_code": "quality_flags", "param_key": "min_quality_flag_count", "label": "So quality flags toi thieu", "value_number": 3},
        {"rule_code": "liquidity", "param_key": "min_liquidity_score", "label": "Thanh khoan toi thieu", "value_number": 50},
        {"rule_code": "eps_growth", "param_key": "min_eps_growth_year", "label": "EPS growth nam toi thieu (%)", "value_number": 25},
        {"rule_code": "eps_growth", "param_key": "min_eps_growth_quarter", "label": "EPS growth quy toi thieu (%)", "value_number": 25},
        {"rule_code": "valuation", "param_key": "max_pe_gap_to_peer", "label": "Do lech P/E toi da so voi nhom", "value_number": 0.35},
        {"rule_code": "score", "param_key": "min_winning_score", "label": "Winning Score toi thieu", "value_number": 140},
        {"rule_code": "ema_gap", "param_key": "max_ema_gap_pct", "label": "Khoang cach EMA toi da (%)", "value_number": 5},
        {"rule_code": "price_action", "param_key": "min_price_vs_open_ratio", "label": "Ti le gia/open toi thieu", "value_number": 1.005},
        {"rule_code": "breakout_volume", "param_key": "min_volume_spike_ratio", "label": "Volume spike toi thieu (x)", "value_number": 1.5},
        {"rule_code": "money_flow_context", "param_key": "min_money_flow_score", "label": "Money flow score toi thieu", "value_number": 60},
        {"rule_code": "money_flow_context", "param_key": "min_price_context_score", "label": "Price context score toi thieu", "value_number": 55},
    ],
    "alert_rules": [
        {"rule_code": "volume_spike_no_price", "label": "Volume tang ma gia khong tang", "expression": "volume_score >= volume_spike_threshold and momentum_score <= weak_price_threshold", "message_template": "{symbol}: volume bat thuong nhung gia khong xac nhan.", "severity": "warning", "cooldown_minutes": 20, "notify_in_app": True, "notify_telegram": False, "display_order": 1},
        {"rule_code": "too_hot_vs_open", "label": "Gia qua nong", "expression": "hotness_score >= overheat_threshold", "message_template": "{symbol}: gia dang qua nong, can tranh mua cam xuc.", "severity": "critical", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": True, "display_order": 2},
        {"rule_code": "margin_safety_low", "label": "Bien an toan thap", "expression": "margin_of_safety < min_margin_of_safety", "message_template": "{symbol}: bien an toan hien duoi nguong cau hinh.", "severity": "warning", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": False, "display_order": 3},
        {"rule_code": "smart_money_inflow", "label": "Smart Money Inflow", "expression": "smart_money_inflow", "message_template": "{symbol}: volume > 2x MA10 va gia dang vuot khang cu.", "severity": "info", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": False, "display_order": 4},
        {"rule_code": "surge_trap", "label": "Surge Trap", "expression": "surge_trap", "message_template": "{symbol}: volume qua lon nhung rau tren dai, can tranh mua duoi.", "severity": "critical", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": True, "display_order": 5},
        {"rule_code": "no_supply", "label": "No Supply", "expression": "no_supply", "message_template": "{symbol}: pullback ve EMA voi volume kho, co the la nhan day cung.", "severity": "info", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": False, "display_order": 6},
        {"rule_code": "volume_divergence", "label": "Volume Divergence", "expression": "volume_divergence", "message_template": "{symbol}: gia lap dinh nhung volume kem hon dinh truoc.", "severity": "warning", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": False, "display_order": 7},
        {"rule_code": "pre_news_accumulation", "label": "Tich luy dong tien truoc tin", "expression": "pre_news_accumulation and obv_trend_score >= min_obv_trend_score and news_pressure_score <= max_news_pressure_score", "message_template": "{symbol}: OBV dang di len truoc khi tin tuc bung no, gia van giu nen chat.", "severity": "info", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": False, "display_order": 8},
        {"rule_code": "obv_breakout_confirmation", "label": "OBV xac nhan breakout", "expression": "obv_breakout_confirmation and price_context_score >= min_price_context_score", "message_template": "{symbol}: OBV dong thuan voi volume va boi canh gia dang sat vung break.", "severity": "info", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": False, "display_order": 9},
        {"rule_code": "smart_money_before_news", "label": "Smart Money truoc tin", "expression": "smart_money_before_news and money_flow_score >= min_money_flow_score", "message_template": "{symbol}: dong tien lon dang vao truoc khi news pressure tang len.", "severity": "warning", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": True, "display_order": 10},
        {"rule_code": "obv_distribution", "label": "Phan phoi truoc tin", "expression": "obv_distribution and news_pressure_score <= max_distribution_news_pressure", "message_template": "{symbol}: gia giu duoc nhung OBV dang suy, canh bao phan phoi truoc tin.", "severity": "critical", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": True, "display_order": 11},
        {"rule_code": "weak_news_chase", "label": "Tin nhieu nhung dong tien khong dong thuan", "expression": "weak_news_chase", "message_template": "{symbol}: news pressure cao nhung dong tien va boi canh gia khong dong thuan.", "severity": "warning", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": False, "display_order": 12},
    ],
    "alert_rule_parameters": [
        {"rule_code": "volume_spike_no_price", "param_key": "volume_spike_threshold", "label": "Nguong volume spike", "value_number": 70},
        {"rule_code": "volume_spike_no_price", "param_key": "weak_price_threshold", "label": "Nguong gia yeu", "value_number": 52},
        {"rule_code": "too_hot_vs_open", "param_key": "overheat_threshold", "label": "Nguong qua nong", "value_number": 60},
        {"rule_code": "margin_safety_low", "param_key": "min_margin_of_safety", "label": "Bien an toan toi thieu", "value_number": 0.20},
        {"rule_code": "pre_news_accumulation", "param_key": "min_obv_trend_score", "label": "OBV trend toi thieu", "value_number": 55},
        {"rule_code": "pre_news_accumulation", "param_key": "max_news_pressure_score", "label": "News pressure toi da", "value_number": 35},
        {"rule_code": "obv_breakout_confirmation", "param_key": "min_price_context_score", "label": "Price context toi thieu", "value_number": 55},
        {"rule_code": "smart_money_before_news", "param_key": "min_money_flow_score", "label": "Money flow score toi thieu", "value_number": 60},
        {"rule_code": "obv_distribution", "param_key": "max_distribution_news_pressure", "label": "News pressure toi da khi canh bao phan phoi", "value_number": 35},
    ],
    "checklists": [
        {"checklist_type": "pre_buy", "item_code": "business_quality", "label": "Doanh nghiep va dong tien dat chat luong toi thieu", "expression": "Q >= min_q_check", "is_required": True, "display_order": 1},
        {"checklist_type": "pre_buy", "item_code": "winning_score", "label": "Winning Score dat nguong vao lenh", "expression": "winning_score >= min_winning_check", "is_required": True, "display_order": 2},
        {"checklist_type": "pre_buy", "item_code": "margin", "label": "Bien an toan dat nguong", "expression": "margin_of_safety >= min_margin_check", "is_required": True, "display_order": 3},
        {"checklist_type": "pre_buy", "item_code": "eps_growth", "label": "EPS quy va nam deu tang tren 25%", "expression": "eps_growth_year >= min_eps_check and eps_growth_quarter >= min_eps_check", "is_required": True, "display_order": 4},
        {"checklist_type": "pre_buy", "item_code": "story", "label": "Co cau chuyen doanh nghiep/tin moi ho tro", "expression": "news_score >= min_story_score", "is_required": False, "display_order": 5},
        {"checklist_type": "pre_buy", "item_code": "ema_trend", "label": "Gia nam tren EMA10 va EMA20, do lech nho", "expression": "close_above_ema10 and close_above_ema20 and ema_gap_pct <= max_ema_gap_check", "is_required": True, "display_order": 6},
        {"checklist_type": "pre_buy", "item_code": "volume_burst", "label": "Khoi luong bung no tren 50% trung binh 20 phien", "expression": "volume_spike_ratio >= min_volume_burst_ratio", "is_required": True, "display_order": 7},
        {"checklist_type": "pre_buy", "item_code": "base_pattern", "label": "Mo hinh nen chat hoac breakout dang xac nhan", "expression": "breakout_confirmation or absorption or spring_shakeout", "is_required": False, "display_order": 8},
        {"checklist_type": "pre_buy", "item_code": "stop_loss", "label": "Stop-loss nam trong vung -5% den -8%", "expression": "stop_loss_pct >= min_stop_loss_pct and stop_loss_pct <= max_stop_loss_pct", "is_required": True, "display_order": 9},
        {"checklist_type": "pre_buy", "item_code": "flow_before_news", "label": "Dong tien truoc tin duoc xac nhan boi OBV va boi canh gia", "expression": "money_flow_score >= min_money_flow_check and (pre_news_accumulation or smart_money_before_news)", "is_required": False, "display_order": 10},
        {"checklist_type": "end_of_day", "item_code": "journal", "label": "Da cap nhat trade journal", "expression": "journal_entries_today >= min_journal_entries", "is_required": False, "display_order": 10},
    ],
    "checklist_parameters": [
        {"item_code": "business_quality", "param_key": "min_q_check", "label": "Q toi thieu", "value_number": 55},
        {"item_code": "winning_score", "param_key": "min_winning_check", "label": "Winning Score toi thieu", "value_number": 140},
        {"item_code": "margin", "param_key": "min_margin_check", "label": "Margin toi thieu", "value_number": 0.20},
        {"item_code": "eps_growth", "param_key": "min_eps_check", "label": "EPS growth toi thieu (%)", "value_number": 25},
        {"item_code": "story", "param_key": "min_story_score", "label": "News/story score toi thieu", "value_number": 20},
        {"item_code": "ema_trend", "param_key": "max_ema_gap_check", "label": "EMA gap toi da (%)", "value_number": 5},
        {"item_code": "volume_burst", "param_key": "min_volume_burst_ratio", "label": "Volume burst toi thieu (x)", "value_number": 1.5},
        {"item_code": "stop_loss", "param_key": "min_stop_loss_pct", "label": "Stop-loss toi thieu (%)", "value_number": 5},
        {"item_code": "stop_loss", "param_key": "max_stop_loss_pct", "label": "Stop-loss toi da (%)", "value_number": 8},
        {"item_code": "flow_before_news", "param_key": "min_money_flow_check", "label": "Money flow score toi thieu", "value_number": 60},
        {"item_code": "journal", "param_key": "min_journal_entries", "label": "Nhat ky toi thieu", "value_number": 1},
    ],
}


ALLOWED_FUNCTIONS = {
    "abs": abs,
    "max": max,
    "min": min,
    "round": round,
}


def _normalize_expression(expression: str) -> str:
    return (
        str(expression or "")
        .replace("AND", "and")
        .replace("OR", "or")
        .replace("NOT", "not")
        .replace(" true", " True")
        .replace(" false", " False")
    )


def _safe_eval(expression: str, context: dict[str, Any]) -> Any:
    expr = _normalize_expression(expression)
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError:
        return None

    def _eval(node: ast.AST) -> Any:
        if isinstance(node, ast.Expression):
            return _eval(node.body)
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            return context.get(node.id)
        if isinstance(node, ast.BinOp):
            left = _eval(node.left)
            right = _eval(node.right)
            if left is None or right is None:
                return None
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right if right not in (None, 0) else None
            if isinstance(node.op, ast.Pow):
                return left ** right
        if isinstance(node, ast.UnaryOp):
            value = _eval(node.operand)
            if isinstance(node.op, ast.USub):
                return -value
            if isinstance(node.op, ast.UAdd):
                return +value
            if isinstance(node.op, ast.Not):
                return not bool(value)
        if isinstance(node, ast.BoolOp):
            values = [_eval(item) for item in node.values]
            if isinstance(node.op, ast.And):
                return all(bool(item) for item in values)
            if isinstance(node.op, ast.Or):
                return any(bool(item) for item in values)
        if isinstance(node, ast.Compare):
            left = _eval(node.left)
            for op, comp in zip(node.ops, node.comparators):
                right = _eval(comp)
                if left is None or right is None:
                    return False
                if isinstance(op, ast.Gt) and not left > right:
                    return False
                if isinstance(op, ast.GtE) and not left >= right:
                    return False
                if isinstance(op, ast.Lt) and not left < right:
                    return False
                if isinstance(op, ast.LtE) and not left <= right:
                    return False
                if isinstance(op, ast.Eq) and not left == right:
                    return False
                if isinstance(op, ast.NotEq) and not left != right:
                    return False
                left = right
            return True
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            fn = ALLOWED_FUNCTIONS.get(node.func.id)
            if not fn:
                return None
            args = [_eval(arg) for arg in node.args]
            return fn(*args)
        return None

    return _eval(tree)


def _clamp(value: float | None, low: float = 0, high: float = 100) -> float:
    if value is None:
        return low
    return max(low, min(high, float(value)))


def _float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _coerce_date_value(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return datetime.fromisoformat(str(value)).date()
    except ValueError:
        return None


class StrategyService:
    _shared_scored_universe_cache: dict[tuple[Any, ...], tuple[float, list[dict[str, Any]]]] = {}
    _shared_cache_ttl_seconds = 120.0

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = MarketReadRepository(session)
        self._scored_universe_cache: dict[tuple[Any, ...], list[dict[str, Any]]] = {}

    async def list_profiles(self, actor: AppUser) -> list[dict[str, Any]]:
        require_permission(actor, "strategy-hub.view")
        result = await self.session.execute(
            select(StrategyProfile)
            .where(StrategyProfile.company_code == actor.company_code, StrategyProfile.is_active.is_(True))
            .order_by(desc(StrategyProfile.is_default), StrategyProfile.name.asc())
        )
        return [self._serialize_profile(item) for item in result.scalars().all()]

    async def get_overview(self, actor: AppUser, profile_id: int | None = None) -> dict[str, Any]:
        require_permission(actor, "strategy-hub.view")
        profile = await self._get_profile(actor.company_code, profile_id)
        profiles = await self.list_profiles(actor)
        rankings = await self.get_rankings(actor, profile.id, page=1, page_size=8)
        config_summary = await self._get_profile_config_summary(profile.id)
        rankings["items"] = [self._to_overview_score_item(item) for item in rankings.get("items", [])]
        risk = {
            "profile": self._serialize_profile(profile),
            "summaryCards": [],
            "highRiskItems": [],
        }
        return {
            "profiles": profiles,
            "activeProfile": self._serialize_profile(profile),
            "configSummary": config_summary,
            "rankings": rankings,
            "screener": None,
            "risk": risk,
            "journal": [],
        }

    async def get_profile_config(self, actor: AppUser, profile_id: int) -> dict[str, Any]:
        require_permission(actor, "strategy-settings.view")
        profile = await self._get_profile(actor.company_code, profile_id)
        formulas = await self._list_formulas(profile.id)
        screen_rules = await self._list_rules(StrategyScreenRule, profile.id)
        alert_rules = await self._list_rules(StrategyAlertRule, profile.id)
        checklists = await self._list_rules(StrategyChecklistItem, profile.id)
        versions = await self._list_versions(profile.id)
        return {
            "profile": self._serialize_profile(profile),
            "formulas": formulas,
            "screenRules": screen_rules,
            "alertRules": alert_rules,
            "checklists": checklists,
            "versions": versions,
        }

    async def _get_profile_config_summary(self, profile_id: int) -> dict[str, int]:
        formula_count = await self.session.scalar(
            select(func.count()).select_from(StrategyFormulaDefinition).where(StrategyFormulaDefinition.profile_id == profile_id)
        )
        screen_rule_count = await self.session.scalar(
            select(func.count()).select_from(StrategyScreenRule).where(StrategyScreenRule.profile_id == profile_id)
        )
        alert_rule_count = await self.session.scalar(
            select(func.count()).select_from(StrategyAlertRule).where(StrategyAlertRule.profile_id == profile_id)
        )
        checklist_count = await self.session.scalar(
            select(func.count()).select_from(StrategyChecklistItem).where(StrategyChecklistItem.profile_id == profile_id)
        )
        version_count = await self.session.scalar(
            select(func.count()).select_from(StrategyVersion).where(StrategyVersion.profile_id == profile_id)
        )
        return {
            "formulaCount": int(formula_count or 0),
            "screenRuleCount": int(screen_rule_count or 0),
            "alertRuleCount": int(alert_rule_count or 0),
            "checklistCount": int(checklist_count or 0),
            "versionCount": int(version_count or 0),
        }

    @staticmethod
    def _to_overview_score_item(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "symbol": item.get("symbol"),
            "name": item.get("name"),
            "exchange": item.get("exchange"),
            "price": item.get("price"),
            "changePercent": item.get("changePercent"),
            "winningScore": item.get("winningScore"),
            "riskScore": item.get("riskScore"),
            "passedLayer1": item.get("passedLayer1"),
            "passedLayer2": item.get("passedLayer2"),
            "passedLayer3": item.get("passedLayer3"),
        }

    async def save_profile_config(self, actor: AppUser, profile_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        require_permission(actor, "strategy-settings.update")
        profile = await self._get_profile(actor.company_code, profile_id)
        before = await self.get_profile_config(actor, profile.id)
        now = datetime.now()

        profile_payload = payload.get("profile") or {}
        if "name" in profile_payload:
            profile.name = str(profile_payload.get("name") or profile.name)
        if "description" in profile_payload:
            profile.description = str(profile_payload.get("description") or "")
        profile.updated_at = now

        await self._sync_formulas(profile.id, list(payload.get("formulas") or []), now)
        await self._sync_rules(StrategyScreenRule, profile.id, list(payload.get("screenRules") or []), now)
        await self._sync_rules(StrategyAlertRule, profile.id, list(payload.get("alertRules") or []), now)
        await self._sync_rules(StrategyChecklistItem, profile.id, list(payload.get("checklists") or []), now)
        await self.session.flush()

        after = await self.get_profile_config(actor, profile.id)
        await self._add_audit_log(profile.id, "profile", str(profile.id), "update", before, after, actor.username)
        self._invalidate_shared_scored_universe_cache(actor.company_code, profile.id)
        return after

    async def activate_profile(self, actor: AppUser, profile_id: int) -> dict[str, Any]:
        require_permission(actor, "strategy-settings.update")
        profile = await self._get_profile(actor.company_code, profile_id)
        result = await self.session.execute(
            select(StrategyProfile).where(StrategyProfile.company_code == actor.company_code, StrategyProfile.is_active.is_(True))
        )
        now = datetime.now()
        for row in result.scalars().all():
            row.is_default = row.id == profile.id
            row.updated_at = now
        await self.session.flush()
        return self._serialize_profile(profile)

    async def create_profile(self, actor: AppUser, payload: dict[str, Any]) -> dict[str, Any]:
        require_permission(actor, "strategy-settings.update")
        code = str(payload.get("code") or "").strip().lower().replace(" ", "-")
        name = str(payload.get("name") or "").strip()
        if not code or not name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing code or name")

        existing = await self.session.execute(
            select(StrategyProfile).where(
                StrategyProfile.company_code == actor.company_code,
                StrategyProfile.code == code,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Profile code already exists")

        now = datetime.now()
        profile = StrategyProfile(
            company_code=actor.company_code,
            code=code,
            name=name,
            description=str(payload.get("description") or ""),
            is_default=False,
            is_active=True,
            created_by=actor.username,
            created_at=now,
            updated_at=now,
        )
        self.session.add(profile)
        await self.session.flush()
        await _seed_profile_config(self.session, profile.id, now)
        await self.session.flush()
        return self._serialize_profile(profile)

    async def publish_profile(self, actor: AppUser, profile_id: int, summary: str | None = None) -> dict[str, Any]:
        require_permission(actor, "strategy-settings.update")
        profile = await self._get_profile(actor.company_code, profile_id)
        config = await self.get_profile_config(actor, profile.id)
        result = await self.session.execute(
            select(func.max(StrategyVersion.version_no)).where(StrategyVersion.profile_id == profile.id)
        )
        latest = result.scalar() or 0
        version = StrategyVersion(
            profile_id=profile.id,
            version_no=int(latest) + 1,
            change_summary=summary or "Publish strategy profile",
            snapshot_json=config,
            created_by=actor.username,
            created_at=datetime.now(),
        )
        self.session.add(version)
        await self.session.flush()
        return {"versionId": version.id, "versionNo": version.version_no}

    async def get_rankings(
        self,
        actor: AppUser,
        profile_id: int,
        exchange: str | None = None,
        keyword: str | None = None,
        watchlist_only: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        require_permission(actor, "scoring.view")
        profile = await self._get_profile(actor.company_code, profile_id)
        snapshot_universe = await self._load_score_snapshot_universe(
            actor.company_code,
            profile,
            exchange=exchange,
            keyword=keyword,
            watchlist_only=watchlist_only,
        )
        if snapshot_universe is not None:
            return self._paginate([self._to_ranking_score_item(item) for item in snapshot_universe], page, page_size)

        bundle = await self._build_profile_bundle(profile.id)
        universe = await self._get_scored_universe_cached(
            actor,
            profile.id,
            bundle,
            exchange=exchange,
            keyword=keyword,
            watchlist_only=watchlist_only,
        )
        return self._paginate([self._to_ranking_score_item(item) for item in universe], page, page_size)

    async def run_screener(
        self,
        actor: AppUser,
        profile_id: int,
        exchange: str | None = None,
        keyword: str | None = None,
        watchlist_only: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> dict[str, Any]:
        require_permission(actor, "screener.view")
        profile = await self._get_profile(actor.company_code, profile_id)
        snapshot_universe = await self._load_score_snapshot_universe(
            actor.company_code,
            profile,
            exchange=exchange,
            keyword=keyword,
            watchlist_only=watchlist_only,
        )
        if snapshot_universe is not None:
            passed_items = [item for item in snapshot_universe if item["passedAllLayers"]]
            response = self._paginate([self._to_ranking_score_item(item) for item in passed_items], page, page_size)
            response["summary"] = {
                "passed": len(passed_items),
                "total": len(snapshot_universe),
                "passRate": round((len(passed_items) / len(snapshot_universe)) * 100, 2) if snapshot_universe else 0,
            }
            return response

        bundle = await self._build_profile_bundle(profile.id)
        universe = await self._get_scored_universe_cached(
            actor,
            profile.id,
            bundle,
            exchange=exchange,
            keyword=keyword,
            watchlist_only=watchlist_only,
        )
        passed_items = [item for item in universe if item["passedAllLayers"]]
        response = self._paginate([self._to_ranking_score_item(item) for item in passed_items], page, page_size)
        response["summary"] = {
            "passed": len(passed_items),
            "total": len(universe),
            "passRate": round((len(passed_items) / len(universe)) * 100, 2) if universe else 0,
        }
        return response

    async def get_symbol_scoring(self, actor: AppUser, profile_id: int, symbol: str) -> dict[str, Any]:
        require_permission(actor, "scoring.view")
        profile = await self._get_profile(actor.company_code, profile_id)
        snapshot_item = await self._load_symbol_score_snapshot(actor.company_code, profile, symbol)
        if snapshot_item is not None:
            return snapshot_item

        bundle = await self._build_profile_bundle(profile.id)
        universe = await self._get_scored_universe_cached(actor, profile.id, bundle, keyword=symbol.upper())
        item = next((row for row in universe if row["symbol"] == symbol.upper()), None)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Symbol not found in scored universe")
        return item

    async def get_risk_overview(self, actor: AppUser, profile_id: int) -> dict[str, Any]:
        require_permission(actor, "risk.view")
        profile = await self._get_profile(actor.company_code, profile_id)
        bundle = await self._build_profile_bundle(profile.id)
        universe = await self._get_scored_universe_cached(actor, profile.id, bundle, watchlist_only=False)
        top_risk = sorted(universe, key=lambda x: (-x["riskScore"], x["symbol"]))[:8]
        watchlist_items = [item for item in universe if item["isWatchlist"]]
        avg_watchlist_score = round(sum(item["winningScore"] for item in watchlist_items) / len(watchlist_items), 2) if watchlist_items else 0
        return {
            "profile": self._serialize_profile(profile),
            "summaryCards": [
                {"label": "Watchlist", "value": len(watchlist_items), "helper": "So ma dang theo doi"},
                {"label": "Avg Winning Score", "value": avg_watchlist_score, "helper": "Trung binh watchlist"},
                {"label": "High Risk Names", "value": sum(1 for item in universe if item["riskScore"] >= 65), "helper": "Can review ky"},
            ],
            "highRiskItems": top_risk,
        }

    async def list_journal(self, actor: AppUser, limit: int = 50, exchange: str | None = None) -> list[dict[str, Any]]:
        require_permission(actor, "journal.view")
        normalized_exchange = str(exchange or "").upper()
        stmt = (
            select(StrategyTradeJournalEntry, MarketSymbol.exchange)
            .outerjoin(MarketSymbol, MarketSymbol.symbol == StrategyTradeJournalEntry.symbol)
            .where(StrategyTradeJournalEntry.company_code == actor.company_code)
            .order_by(desc(StrategyTradeJournalEntry.created_at))
            .limit(limit)
        )
        if normalized_exchange in {"HSX", "HNX", "UPCOM"}:
            stmt = stmt.where(MarketSymbol.exchange == normalized_exchange)

        result = await self.session.execute(stmt)
        return [self._serialize_journal(row, exchange=symbol_exchange) for row, symbol_exchange in result.all()]

    async def create_journal_entry(self, actor: AppUser, payload: dict[str, Any]) -> dict[str, Any]:
        require_permission(actor, "journal.create")
        now = datetime.now()
        item = StrategyTradeJournalEntry(
            user_id=actor.id,
            company_code=actor.company_code,
            profile_id=int(payload.get("profile_id") or 0) or None,
            symbol=str(payload.get("symbol") or "").upper(),
            trade_date=_coerce_date_value(payload.get("trade_date")) or now.date(),
            classification=str(payload.get("classification") or "").strip() or None,
            trade_side=str(payload.get("trade_side") or "buy").lower(),
            entry_price=_float(payload.get("entry_price"), None),
            exit_price=_float(payload.get("exit_price"), None),
            stop_loss_price=_float(payload.get("stop_loss_price"), None),
            take_profit_price=_float(payload.get("take_profit_price"), None),
            quantity=_float(payload.get("quantity"), None),
            position_size=_float(payload.get("position_size"), None),
            total_capital=_float(payload.get("total_capital"), None),
            strategy_name=str(payload.get("strategy_name") or "").strip() or None,
            psychology=str(payload.get("psychology") or "").strip() or None,
            checklist_result_json=payload.get("checklist_result_json") or {},
            signal_snapshot_json=payload.get("signal_snapshot_json") or {},
            result_snapshot_json=payload.get("result_snapshot_json") or {},
            notes=str(payload.get("notes") or ""),
            mistake_tags_json=payload.get("mistake_tags_json") or [],
            created_at=now,
            updated_at=now,
        )
        self.session.add(item)
        await self.session.flush()
        return self._serialize_journal(item)

    async def update_journal_entry(self, actor: AppUser, entry_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        require_permission(actor, "journal.create")
        item = await self._get_journal_entry(actor.company_code, entry_id)
        now = datetime.now()
        item.profile_id = int(payload.get("profile_id") or 0) or None
        item.symbol = str(payload.get("symbol") or item.symbol or "").upper()
        item.trade_date = _coerce_date_value(payload.get("trade_date")) or item.trade_date or now.date()
        item.classification = str(payload.get("classification") or "").strip() or None
        item.trade_side = str(payload.get("trade_side") or item.trade_side or "buy").lower()
        item.entry_price = _float(payload.get("entry_price"), None)
        item.exit_price = _float(payload.get("exit_price"), None)
        item.stop_loss_price = _float(payload.get("stop_loss_price"), None)
        item.take_profit_price = _float(payload.get("take_profit_price"), None)
        item.quantity = _float(payload.get("quantity"), None)
        item.position_size = _float(payload.get("position_size"), None)
        item.total_capital = _float(payload.get("total_capital"), None)
        item.strategy_name = str(payload.get("strategy_name") or "").strip() or None
        item.psychology = str(payload.get("psychology") or "").strip() or None
        item.checklist_result_json = payload.get("checklist_result_json") or {}
        item.signal_snapshot_json = payload.get("signal_snapshot_json") or {}
        item.result_snapshot_json = payload.get("result_snapshot_json") or {}
        item.notes = str(payload.get("notes") or "")
        item.mistake_tags_json = payload.get("mistake_tags_json") or []
        item.updated_at = now
        await self.session.flush()
        return self._serialize_journal(item)

    async def delete_journal_entry(self, actor: AppUser, entry_id: int) -> dict[str, Any]:
        require_permission(actor, "journal.create")
        item = await self._get_journal_entry(actor.company_code, entry_id)
        data = self._serialize_journal(item)
        await self.session.delete(item)
        await self.session.flush()
        return data

    async def _build_profile_bundle(self, profile_id: int) -> dict[str, Any]:
        formulas = await self._list_formulas(profile_id)
        screen_rules = await self._list_rules(StrategyScreenRule, profile_id)
        alert_rules = await self._list_rules(StrategyAlertRule, profile_id)
        checklists = await self._list_rules(StrategyChecklistItem, profile_id)
        return {
            "formulas": formulas,
            "screenRules": screen_rules,
            "alertRules": alert_rules,
            "checklists": checklists,
        }

    async def _get_scored_universe_cached(
        self,
        actor: AppUser,
        profile_id: int,
        bundle: dict[str, Any],
        *,
        exchange: str | None = None,
        keyword: str | None = None,
        watchlist_only: bool = False,
    ) -> list[dict[str, Any]]:
        cache_key = (
            actor.company_code,
            profile_id,
            (exchange or "ALL").upper(),
            (keyword or "").strip().upper(),
            bool(watchlist_only),
        )
        cached = self._scored_universe_cache.get(cache_key)
        if cached is not None:
            return cached
        shared_cached = self._shared_scored_universe_cache.get(cache_key)
        if shared_cached is not None:
            cached_at, shared_universe = shared_cached
            if time.monotonic() - cached_at <= self._shared_cache_ttl_seconds:
                self._scored_universe_cache[cache_key] = shared_universe
                return shared_universe
            self._shared_scored_universe_cache.pop(cache_key, None)
        universe = await self._score_universe(actor, bundle, exchange=exchange, keyword=keyword, watchlist_only=watchlist_only)
        self._scored_universe_cache[cache_key] = universe
        self._shared_scored_universe_cache[cache_key] = (time.monotonic(), universe)
        return universe

    async def _load_score_snapshot_universe(
        self,
        company_code: str,
        profile: StrategyProfile,
        *,
        exchange: str | None = None,
        keyword: str | None = None,
        watchlist_only: bool = False,
    ) -> list[dict[str, Any]] | None:
        latest_date_result = await self.session.execute(
            select(func.max(StrategyStockScoreSnapshot.trading_date)).where(
                StrategyStockScoreSnapshot.company_code == company_code,
                StrategyStockScoreSnapshot.profile_id == profile.id,
                StrategyStockScoreSnapshot.computed_at >= profile.updated_at,
            )
        )
        latest_date = latest_date_result.scalar()
        if latest_date is None:
            return None

        stmt = select(StrategyStockScoreSnapshot).where(
            StrategyStockScoreSnapshot.company_code == company_code,
            StrategyStockScoreSnapshot.profile_id == profile.id,
            StrategyStockScoreSnapshot.trading_date == latest_date,
            StrategyStockScoreSnapshot.computed_at >= profile.updated_at,
        )
        normalized_exchange = str(exchange or "").upper()
        if normalized_exchange in {"HSX", "HNX", "UPCOM"}:
            stmt = stmt.where(StrategyStockScoreSnapshot.exchange == normalized_exchange)
            stmt = stmt.order_by(
                StrategyStockScoreSnapshot.rank_overall.asc().nullslast(),
                StrategyStockScoreSnapshot.winning_score.desc().nullslast(),
                StrategyStockScoreSnapshot.symbol.asc(),
            )
        else:
            stmt = stmt.order_by(
                StrategyStockScoreSnapshot.winning_score.desc().nullslast(),
                StrategyStockScoreSnapshot.margin_of_safety.desc().nullslast(),
                StrategyStockScoreSnapshot.symbol.asc(),
            )

        result = await self.session.execute(stmt)
        items = [self._snapshot_to_score_item(row) for row in result.scalars().all()]
        normalized_keyword = str(keyword or "").strip().upper()
        if normalized_keyword:
            items = [item for item in items if normalized_keyword in str(item.get("symbol") or "").upper()]
        if watchlist_only:
            items = [item for item in items if item.get("isWatchlist")]
        for idx, item in enumerate(items, 1):
            item["rank"] = idx
        return items

    async def _load_symbol_score_snapshot(
        self,
        company_code: str,
        profile: StrategyProfile,
        symbol: str,
    ) -> dict[str, Any] | None:
        normalized_symbol = str(symbol or "").strip().upper()
        if not normalized_symbol:
            return None

        result = await self.session.execute(
            select(StrategyStockScoreSnapshot)
            .where(
                StrategyStockScoreSnapshot.company_code == company_code,
                StrategyStockScoreSnapshot.profile_id == profile.id,
                StrategyStockScoreSnapshot.symbol == normalized_symbol,
                StrategyStockScoreSnapshot.computed_at >= profile.updated_at,
            )
            .order_by(
                StrategyStockScoreSnapshot.trading_date.desc(),
                StrategyStockScoreSnapshot.computed_at.desc(),
            )
            .limit(1)
        )
        row = result.scalar_one_or_none()
        return self._snapshot_to_score_item(row) if row else None

    def _snapshot_to_score_item(self, row: StrategyStockScoreSnapshot) -> dict[str, Any]:
        metrics = row.metrics_json if isinstance(row.metrics_json, dict) else {}
        explanation = row.explanation_json if isinstance(row.explanation_json, dict) else {}
        layer_results = list(explanation.get("ruleResults") or [])
        alert_results = list(explanation.get("alerts") or [])
        checklist_results = list(explanation.get("checklists") or [])
        risk_score = self._compute_risk_score(metrics, alert_results)
        current_price = _float(row.current_price, _float(metrics.get("current_price"), 0))
        return {
            "rank": row.rank_overall or 0,
            "symbol": row.symbol,
            "name": metrics.get("name"),
            "exchange": row.exchange,
            "price": current_price,
            "changePercent": _float(metrics.get("change_percent"), 0),
            "tradingValue": _float(metrics.get("trading_value"), 0),
            "volume": _float(metrics.get("volume"), 0),
            "currentPrice": current_price,
            "fairValue": row.fair_value,
            "marginOfSafety": _float(row.margin_of_safety, 0),
            "qScore": _float(row.q_score, 0),
            "lScore": _float(row.l_score, 0),
            "mScore": _float(row.m_score, 0),
            "pScore": _float(row.p_score, 0),
            "winningScore": _float(row.winning_score, 0),
            "fundamentalMetrics": explanation.get("fundamentalMetrics"),
            "volumeIntelligence": explanation.get("volumeIntelligence"),
            "candlestickSignals": explanation.get("candlestickSignals") or [],
            "footprintSignals": explanation.get("footprintSignals") or [],
            "executionPlan": explanation.get("executionPlan") or {},
            "metrics": metrics,
            "layerResults": layer_results,
            "alertResults": alert_results,
            "checklistResults": checklist_results,
            "passedLayer1": bool(row.passed_layer_1),
            "passedLayer2": bool(row.passed_layer_2),
            "passedLayer3": bool(row.passed_layer_3),
            "passedAllLayers": bool(row.passed_layer_1 and row.passed_layer_2 and row.passed_layer_3),
            "riskScore": round(risk_score, 2),
            "isWatchlist": bool(metrics.get("watchlist_bonus")),
            "newsMentions": int(_float(metrics.get("news_mentions"), 0)),
            "explanation": {
                "topDrivers": explanation.get("topDrivers") or [],
                "ruleResults": layer_results,
                "alerts": alert_results,
                "checklists": checklist_results,
            },
        }

    @staticmethod
    def _to_ranking_score_item(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "rank": item.get("rank") or 0,
            "symbol": item.get("symbol"),
            "name": item.get("name"),
            "exchange": item.get("exchange"),
            "price": item.get("price") or item.get("currentPrice") or 0,
            "changePercent": item.get("changePercent") or 0,
            "tradingValue": item.get("tradingValue") or 0,
            "volume": item.get("volume") or 0,
            "currentPrice": item.get("currentPrice") or item.get("price") or 0,
            "fairValue": item.get("fairValue"),
            "marginOfSafety": item.get("marginOfSafety") or 0,
            "qScore": item.get("qScore") or 0,
            "lScore": item.get("lScore") or 0,
            "mScore": item.get("mScore") or 0,
            "pScore": item.get("pScore") or 0,
            "winningScore": item.get("winningScore") or 0,
            "riskScore": item.get("riskScore") or 0,
            "isWatchlist": bool(item.get("isWatchlist")),
            "newsMentions": item.get("newsMentions") or 0,
            "passedLayer1": bool(item.get("passedLayer1")),
            "passedLayer2": bool(item.get("passedLayer2")),
            "passedLayer3": bool(item.get("passedLayer3")),
            "passedAllLayers": bool(item.get("passedAllLayers")),
            "metrics": {},
            "layerResults": [],
            "alertResults": [],
            "checklistResults": [],
            "candlestickSignals": [],
            "footprintSignals": [],
            "executionPlan": {},
            "explanation": {
                "topDrivers": [],
                "ruleResults": [],
                "alerts": [],
                "checklists": [],
            },
        }

    @classmethod
    def _invalidate_shared_scored_universe_cache(cls, company_code: str, profile_id: int | None = None) -> None:
        for key in list(cls._shared_scored_universe_cache.keys()):
            key_company = key[0] if len(key) > 0 else None
            key_profile = key[1] if len(key) > 1 else None
            if key_company != company_code:
                continue
            if profile_id is not None and key_profile != profile_id:
                continue
            cls._shared_scored_universe_cache.pop(key, None)

    async def _score_universe(
        self,
        actor: AppUser,
        bundle: dict[str, Any],
        *,
        exchange: str | None = None,
        keyword: str | None = None,
        watchlist_only: bool = False,
    ) -> list[dict[str, Any]]:
        trading_date = datetime.now().date()
        universe = await self._build_universe(exchange=exchange, keyword=keyword, watchlist_only=watchlist_only)
        if not universe:
            return []

        peer_pe: dict[str, list[float]] = defaultdict(list)
        peer_pb: dict[str, list[float]] = defaultdict(list)
        for item in universe:
            exchange_code = str(item.get("exchange") or "").upper()
            pe_current = item["metrics"].get("pe_current")
            pb_current = item["metrics"].get("pb_current")
            if pe_current not in (None, 0):
                peer_pe[exchange_code].append(_float(pe_current))
            if pb_current not in (None, 0):
                peer_pb[exchange_code].append(_float(pb_current))

        scored: list[dict[str, Any]] = []
        for item in universe:
            metrics = item["metrics"]
            exchange_code = str(item.get("exchange") or "").upper()
            peer_pe_avg = (sum(peer_pe[exchange_code]) / len(peer_pe[exchange_code])) if peer_pe.get(exchange_code) else None
            peer_pb_avg = (sum(peer_pb[exchange_code]) / len(peer_pb[exchange_code])) if peer_pb.get(exchange_code) else None
            current_pe = _float(metrics.get("pe_current"), None)
            current_pb = _float(metrics.get("pb_current"), None)
            metrics["industry_pe_average"] = peer_pe_avg
            metrics["industry_pb_average"] = peer_pb_avg
            metrics["industry_average_source"] = "exchange-proxy"
            metrics["pe_gap_to_peer"] = (
                abs(current_pe - peer_pe_avg) / max(abs(peer_pe_avg), 0.0001)
                if current_pe not in (None, 0) and peer_pe_avg not in (None, 0)
                else 1
            )
            metrics["pb_gap_to_peer"] = (
                abs(current_pb - peer_pb_avg) / max(abs(peer_pb_avg), 0.0001)
                if current_pb not in (None, 0) and peer_pb_avg not in (None, 0)
                else 1
            )
            formulas = {formula["formulaCode"]: formula for formula in bundle["formulas"] if formula.get("isEnabled")}

            q_score = self._evaluate_formula(formulas.get("q_score"), metrics)
            l_score = self._evaluate_formula(formulas.get("l_score"), metrics)
            m_score = self._evaluate_formula(formulas.get("m_score"), metrics)
            p_score = self._evaluate_formula(formulas.get("p_score"), metrics)

            metrics.update({
                "Q": q_score or 0,
                "L": l_score or 0,
                "M": m_score or 0,
                "P": p_score or 1,
            })

            winning_formula = formulas.get("winning_score")
            winning_score = self._evaluate_formula(winning_formula, metrics)
            pricing_params = {param["paramKey"]: param["value"] for param in (winning_formula or {}).get("parameters", [])}
            fair_value = self._estimate_fair_value(metrics, pricing_params)
            current_price = _float(item.get("price"), 0)
            margin_of_safety = ((fair_value - current_price) / fair_value) if fair_value not in (None, 0) and current_price else 0
            metrics["margin_of_safety"] = margin_of_safety
            metrics["winning_score"] = winning_score or 0

            layer_results = self._evaluate_rules(bundle["screenRules"], metrics)
            alert_results = self._evaluate_rules(bundle["alertRules"], metrics)
            checklist_results = self._evaluate_rules(bundle["checklists"], metrics)

            explanation = {
                "topDrivers": self._build_top_drivers(metrics),
                "ruleResults": layer_results,
                "alerts": alert_results,
                "checklists": checklist_results,
                "fundamentalMetrics": item.get("fundamentalMetrics"),
                "volumeIntelligence": item.get("volumeIntelligence"),
                "candlestickSignals": item.get("candlestickSignals", {}).get("items", []),
                "footprintSignals": item.get("footprintSignals", {}).get("items", []),
                "executionPlan": item.get("executionPlan", {}).get("summary", {}),
            }

            scored.append({
                "symbol": item["symbol"],
                "name": item["name"],
                "exchange": item["exchange"],
                "price": current_price,
                "changePercent": _float(item.get("changePercent")),
                "tradingValue": _float(item.get("tradingValue")),
                "volume": _float(item.get("volume")),
                "currentPrice": current_price,
                "fairValue": round(fair_value, 2) if fair_value else None,
                "marginOfSafety": round(margin_of_safety, 4),
                "qScore": round(q_score or 0, 2),
                "lScore": round(l_score or 0, 2),
                "mScore": round(m_score or 0, 2),
                "pScore": round(p_score or 0, 2),
                "winningScore": round(winning_score or 0, 2),
                "fundamentalMetrics": item.get("fundamentalMetrics"),
                "volumeIntelligence": item.get("volumeIntelligence"),
                "candlestickSignals": item.get("candlestickSignals", {}).get("items", []),
                "footprintSignals": item.get("footprintSignals", {}).get("items", []),
                "executionPlan": item.get("executionPlan", {}).get("summary", {}),
                "metrics": metrics,
                "layerResults": layer_results,
                "alertResults": alert_results,
                "checklistResults": checklist_results,
                "passedLayer1": self._layer_passed(layer_results, "qualitative"),
                "passedLayer2": self._layer_passed(layer_results, "quantitative"),
                "passedLayer3": self._layer_passed(layer_results, "technical"),
                "passedAllLayers": all(self._layer_passed(layer_results, layer) for layer in ["qualitative", "quantitative", "technical"]),
                "riskScore": round(self._compute_risk_score(metrics, alert_results), 2),
                "isWatchlist": bool(metrics.get("watchlist_bonus")),
                "newsMentions": int(metrics.get("news_mentions", 0)),
                "explanation": explanation,
            })

        scored.sort(
            key=lambda x: (
                -(x["winningScore"]),
                -(x["marginOfSafety"]),
                -(x["tradingValue"]),
                x["symbol"],
            )
        )
        for idx, item in enumerate(scored, 1):
            item["rank"] = idx
        await self._upsert_snapshots(actor.company_code, bundle, scored, trading_date)
        await self._upsert_signal_snapshots(actor.company_code, bundle, scored, trading_date)
        return scored

    async def _build_universe(
        self,
        *,
        exchange: str | None = None,
        keyword: str | None = None,
        watchlist_only: bool = False,
    ) -> list[dict[str, Any]]:
        normalized_keyword = str(keyword or "").strip().upper() or None
        exchanges = [exchange.upper()] if exchange and exchange.upper() in {"HSX", "HNX", "UPCOM"} else ["HSX", "HNX", "UPCOM"]
        if normalized_keyword and exchange is None:
            symbol_matches = await self.repo.search_symbols(normalized_keyword, limit=120)
            matched_exchanges = sorted(
                {
                    str(item.exchange or "").upper()
                    for item in symbol_matches
                    if str(item.exchange or "").upper() in {"HSX", "HNX", "UPCOM"}
                }
            )
            if matched_exchanges:
                exchanges = matched_exchanges

        per_exchange_limit = 120 if normalized_keyword else 300
        stock_sort = "all" if normalized_keyword else "actives"
        items: list[dict[str, Any]] = []
        for ex in exchanges:
            data = await self.repo.get_market_stocks(
                exchange=ex,
                sort=stock_sort,
                page=1,
                page_size=per_exchange_limit,
                keyword=normalized_keyword,
            )
            items.extend(data.get("items") or [])

        if not items:
            return []

        if normalized_keyword:
            deduped_items: dict[str, dict[str, Any]] = {}
            for row in items:
                symbol = str(row.get("symbol") or "").upper()
                if symbol and symbol not in deduped_items:
                    deduped_items[symbol] = row
            items = list(deduped_items.values())

        watchlist_rows = await self.repo.get_active_watchlist_items()
        watchlist_set = {item.symbol.upper() for item in watchlist_rows}
        if watchlist_only:
            items = [item for item in items if str(item.get("symbol") or "").upper() in watchlist_set]

        if not items:
            return []

        news_rows = await self.repo.get_latest_news_articles(limit=50)
        news_blob = " ".join(f"{item.title} {item.summary or ''}".upper() for item in news_rows)
        news_mentions: dict[str, int] = defaultdict(int)
        for row in items:
            symbol = str(row.get("symbol") or "").upper()
            if symbol and symbol in news_blob:
                news_mentions[symbol] += news_blob.count(symbol)

        index_cards = await self.repo.get_index_cards()
        market_trend_lookup = {
            str(item.get("exchange") or "").upper(): _clamp(50 + (_float(item.get("change_percent")) * 10))
            for item in index_cards
        }

        symbols = [str(row.get("symbol") or "").upper() for row in items if row.get("symbol")]
        daily_history_map = await self._load_daily_quote_history(symbols)
        financial_context_map = await self._load_financial_context(symbols)

        trading_value_sorted = sorted((_float(item.get("trading_value")) for item in items), reverse=True)
        volume_sorted = sorted((_float(item.get("volume")) for item in items), reverse=True)

        def percentile(value: float, values: list[float]) -> float:
            if not values:
                return 0
            higher = sum(1 for item in values if item > value)
            return round((1 - (higher / len(values))) * 100, 2)

        scored_input: list[dict[str, Any]] = []
        for row in items:
            price = _float(row.get("price"))
            change_percent = _float(row.get("change_percent"))
            trading_value = _float(row.get("trading_value"))
            volume = _float(row.get("volume"))
            exchange_code = str(row.get("exchange") or "").upper()
            symbol = str(row.get("symbol") or "").upper()
            liquidity_score = percentile(trading_value, trading_value_sorted)
            volume_score = percentile(volume, volume_sorted)
            market_trend_score = market_trend_lookup.get(exchange_code, 50)
            momentum_score = _clamp(50 + (change_percent * 10))
            stability_score = _clamp(100 - (abs(change_percent) * 15))
            leadership_score = _clamp((liquidity_score * 0.45) + (momentum_score * 0.35) + (market_trend_score * 0.20))
            watchlist_bonus = 100 if symbol in watchlist_set else 0
            news_score = min(100, news_mentions.get(symbol, 0) * 25)
            volume_confirmation_score = _clamp((volume_score * 0.6) + (liquidity_score * 0.25) + (news_score * 0.15))
            price_risk_score = _clamp(20 + max(change_percent, 0) * 12)
            hotness_score = _clamp(max(change_percent - 3, 0) * 18)
            volatility_score = _clamp(abs(change_percent) * 10)
            price_vs_open_ratio = 1 + (change_percent / 100)
            daily_history = daily_history_map.get(symbol, [])
            financial_context = financial_context_map.get(symbol, {})

            fundamental = self._build_fundamental_metrics(
                symbol=symbol,
                exchange=exchange_code,
                current_price=price,
                financial_context=financial_context,
            )
            volume_intelligence = self._build_volume_intelligence(
                history=daily_history,
                current_price=price,
                current_volume=volume,
            )
            candlestick_signals = self._build_candlestick_signals(daily_history)
            footprint_signals = self._build_footprint_signals(
                history=daily_history,
                volume_intelligence=volume_intelligence,
                candlestick_signals=candlestick_signals,
            )
            money_flow_intelligence = self._build_money_flow_intelligence(
                history=daily_history,
                current_price=price,
                current_volume=volume,
                news_mentions=news_mentions.get(symbol, 0),
                volume_intelligence=volume_intelligence,
                footprint_signals=footprint_signals,
            )
            execution_plan = self._build_execution_plan(
                current_price=price,
                fundamental=fundamental,
                volume_intelligence=volume_intelligence,
                candlestick_signals=candlestick_signals,
                footprint_signals=footprint_signals,
                money_flow_intelligence=money_flow_intelligence,
            )

            scored_input.append({
                "symbol": symbol,
                "name": row.get("name"),
                "exchange": exchange_code,
                "price": price,
                "changePercent": change_percent,
                "tradingValue": trading_value,
                "volume": volume,
                "fundamentalMetrics": fundamental["summary"],
                "volumeIntelligence": volume_intelligence["summary"],
                "moneyFlowIntelligence": money_flow_intelligence["summary"],
                "candlestickSignals": candlestick_signals,
                "footprintSignals": footprint_signals,
                "executionPlan": execution_plan,
                "metrics": {
                    "price": price,
                    "current_price": price,
                    "change_percent": change_percent,
                    "trading_value": trading_value,
                    "volume": volume,
                    "liquidity_score": liquidity_score,
                    "volume_score": volume_score,
                    "market_trend_score": market_trend_score,
                    "momentum_score": momentum_score,
                    "stability_score": stability_score,
                    "leadership_score": leadership_score,
                    "watchlist_bonus": watchlist_bonus,
                    "news_score": news_score,
                    "news_mentions": news_mentions.get(symbol, 0),
                    "volume_confirmation_score": volume_confirmation_score,
                    "price_risk_score": price_risk_score,
                    "hotness_score": hotness_score,
                    "volatility_score": volatility_score,
                    "price_vs_open_ratio": price_vs_open_ratio,
                    "pe_current": fundamental["metrics"]["pe_current"],
                    "pb_current": fundamental["metrics"]["pb_current"],
                    "bv_current": fundamental["metrics"]["bv_current"],
                    "eps_current": fundamental["metrics"]["eps_current"],
                    "eps_growth_year": fundamental["metrics"]["eps_growth_year"],
                    "eps_growth_quarter": fundamental["metrics"]["eps_growth_quarter"],
                    "roe_current": fundamental["metrics"]["roe_current"],
                    "dar_current": fundamental["metrics"]["dar_current"],
                    "gross_margin_current": fundamental["metrics"]["gross_margin_current"],
                    "gross_margin_change": fundamental["metrics"]["gross_margin_change"],
                    "quality_flag_count": fundamental["metrics"]["quality_flag_count"],
                    "ma10_volume": volume_intelligence["metrics"]["ma10_volume"],
                    "ma20_volume": volume_intelligence["metrics"]["ma20_volume"],
                    "volume_spike_ratio": volume_intelligence["metrics"]["volume_spike_ratio"],
                    "ema10": volume_intelligence["metrics"]["ema10"],
                    "ema20": volume_intelligence["metrics"]["ema20"],
                    "ema_gap_pct": volume_intelligence["metrics"]["ema_gap_pct"],
                    "close_above_ema10": volume_intelligence["metrics"]["close_above_ema10"],
                    "close_above_ema20": volume_intelligence["metrics"]["close_above_ema20"],
                    "smart_money_inflow": volume_intelligence["metrics"]["smart_money_inflow"],
                    "surge_trap": volume_intelligence["metrics"]["surge_trap"],
                    "no_supply": volume_intelligence["metrics"]["no_supply"],
                    "volume_divergence": volume_intelligence["metrics"]["volume_divergence"],
                    "breakout_confirmation": footprint_signals["metrics"]["breakout_confirmation"],
                    "spring_shakeout": footprint_signals["metrics"]["spring_shakeout"],
                    "absorption": footprint_signals["metrics"]["absorption"],
                    "pullback_retest": footprint_signals["metrics"]["pullback_retest"],
                    "obv_value": money_flow_intelligence["metrics"]["obv_value"],
                    "obv_ma10": money_flow_intelligence["metrics"]["obv_ma10"],
                    "obv_slope_pct": money_flow_intelligence["metrics"]["obv_slope_pct"],
                    "obv_trend_score": money_flow_intelligence["metrics"]["obv_trend_score"],
                    "obv_above_ma": money_flow_intelligence["metrics"]["obv_above_ma"],
                    "price_context_score": money_flow_intelligence["metrics"]["price_context_score"],
                    "near_breakout_zone": money_flow_intelligence["metrics"]["near_breakout_zone"],
                    "base_tightness_pct": money_flow_intelligence["metrics"]["base_tightness_pct"],
                    "base_is_tight": money_flow_intelligence["metrics"]["base_is_tight"],
                    "news_pressure_score": money_flow_intelligence["metrics"]["news_pressure_score"],
                    "pre_news_accumulation": money_flow_intelligence["metrics"]["pre_news_accumulation"],
                    "obv_breakout_confirmation": money_flow_intelligence["metrics"]["obv_breakout_confirmation"],
                    "smart_money_before_news": money_flow_intelligence["metrics"]["smart_money_before_news"],
                    "obv_distribution": money_flow_intelligence["metrics"]["obv_distribution"],
                    "weak_news_chase": money_flow_intelligence["metrics"]["weak_news_chase"],
                    "money_flow_score": money_flow_intelligence["metrics"]["money_flow_score"],
                    "bullish_pattern_score": candlestick_signals["metrics"]["bullish_pattern_score"],
                    "bearish_pattern_score": candlestick_signals["metrics"]["bearish_pattern_score"],
                    "stop_loss_pct": execution_plan["metrics"]["stop_loss_pct"],
                    "journal_entries_today": 0,
                },
            })
        return scored_input

    async def _load_daily_quote_history(self, symbols: list[str], days: int = 35) -> dict[str, list[dict[str, Any]]]:
        if not symbols:
            return {}
        cutoff = datetime.now() - timedelta(days=days)
        result = await self.session.execute(
            select(MarketQuoteSnapshot)
            .where(
                MarketQuoteSnapshot.symbol.in_(symbols),
                MarketQuoteSnapshot.captured_at >= cutoff,
                MarketQuoteSnapshot.price.is_not(None),
            )
            .order_by(MarketQuoteSnapshot.symbol.asc(), MarketQuoteSnapshot.captured_at.asc())
        )
        rows = result.scalars().all()
        grouped: dict[str, dict[date, dict[str, Any]]] = defaultdict(dict)
        for row in rows:
            symbol = str(row.symbol or "").upper()
            point_date = row.captured_at.date()
            bucket = grouped[symbol].get(point_date)
            price = _float(row.price, 0)
            open_price = row.open_price if row.open_price is not None else price
            high_price = row.high_price if row.high_price is not None else price
            low_price = row.low_price if row.low_price is not None else price
            if bucket is None:
                grouped[symbol][point_date] = {
                    "date": point_date,
                    "open": open_price,
                    "high": high_price,
                    "low": low_price,
                    "close": price,
                    "volume": _float(row.volume, 0),
                    "trading_value": _float(row.trading_value, 0),
                }
            else:
                bucket["close"] = price
                bucket["high"] = max(_float(bucket["high"], price), _float(high_price, price))
                bucket["low"] = min(_float(bucket["low"], price), _float(low_price, price))
                bucket["volume"] = max(_float(bucket["volume"], 0), _float(row.volume, 0))
                bucket["trading_value"] = max(_float(bucket["trading_value"], 0), _float(row.trading_value, 0))

        return {
            symbol: [grouped[symbol][day] for day in sorted(grouped[symbol].keys())][-25:]
            for symbol in grouped
        }

    async def _load_financial_context(self, symbols: list[str]) -> dict[str, dict[str, Any]]:
        if not symbols:
            return {}

        context: dict[str, dict[str, dict[str, list[dict[str, Any]]]]] = {
            symbol: {
                "ratios": defaultdict(list),
                "income": defaultdict(list),
                "balance": defaultdict(list),
            }
            for symbol in symbols
        }

        ratio_rows = (
            await self.session.execute(
                select(MarketFinancialRatio).where(
                    MarketFinancialRatio.symbol.in_(symbols),
                    MarketFinancialRatio.metric_key.in_(["PE", "EPS", "BV", "ROE", "DAR", "GOS"]),
                )
            )
        ).scalars().all()
        for row in ratio_rows:
            context[row.symbol.upper()]["ratios"][row.metric_key].append(self._serialize_financial_row(row))

        income_rows = (
            await self.session.execute(
                select(MarketFinancialIncomeStatement).where(
                    MarketFinancialIncomeStatement.symbol.in_(symbols),
                    MarketFinancialIncomeStatement.metric_key.in_(["NetIncome", "LNSTTNDN", "DTTBHCCDV", "LNGBHCCDV"]),
                )
            )
        ).scalars().all()
        for row in income_rows:
            context[row.symbol.upper()]["income"][row.metric_key].append(self._serialize_financial_row(row))

        balance_rows = (
            await self.session.execute(
                select(MarketFinancialBalanceSheet).where(
                    MarketFinancialBalanceSheet.symbol.in_(symbols),
                    MarketFinancialBalanceSheet.metric_key.in_(["TotalOwnerCapital", "TotalDebt", "TotalAsset"]),
                )
            )
        ).scalars().all()
        for row in balance_rows:
            context[row.symbol.upper()]["balance"][row.metric_key].append(self._serialize_financial_row(row))

        for symbol_context in context.values():
            for family in symbol_context.values():
                for key, rows in family.items():
                    rows.sort(key=self._financial_row_sort_key, reverse=True)
                    family[key] = rows
        return context

    @staticmethod
    def _serialize_financial_row(row: Any) -> dict[str, Any]:
        return {
            "metric_key": row.metric_key,
            "metric_label": row.metric_label,
            "value_number": row.value_number,
            "report_period": row.report_period,
            "period_type": row.period_type,
            "fiscal_year": row.fiscal_year,
            "fiscal_quarter": row.fiscal_quarter,
            "statement_date": row.statement_date,
            "exchange": getattr(row, "exchange", None),
        }

    def _build_fundamental_metrics(
        self,
        *,
        symbol: str,
        exchange: str,
        current_price: float,
        financial_context: dict[str, Any],
    ) -> dict[str, Any]:
        ratios = financial_context.get("ratios", {})
        income = financial_context.get("income", {})

        pe_current = self._latest_financial_value(ratios.get("PE"))
        eps_current = self._latest_financial_value(ratios.get("EPS"))
        bv_current = self._latest_financial_value(ratios.get("BV"))
        roe_current = self._latest_financial_value(ratios.get("ROE"))
        dar_current = self._latest_financial_value(ratios.get("DAR"))
        pb_current = (current_price / bv_current) if current_price and bv_current not in (None, 0) else None

        eps_series = ratios.get("EPS") or []
        eps_prev_year = self._previous_annual_value(eps_series)
        eps_growth_year = self._growth_pct(eps_current, eps_prev_year)

        net_income_series = income.get("NetIncome") or income.get("LNSTTNDN") or []
        revenue_series = income.get("DTTBHCCDV") or []
        gross_profit_series = income.get("LNGBHCCDV") or []
        latest_net_income = self._latest_period_row(net_income_series)
        comparable_net_income = self._find_comparable_quarter_row(net_income_series, latest_net_income)
        eps_growth_quarter = self._growth_pct(
            latest_net_income.get("value_number") if latest_net_income else None,
            comparable_net_income.get("value_number") if comparable_net_income else None,
        )

        latest_revenue = self._latest_period_row(revenue_series)
        latest_gross = self._find_row_by_period(gross_profit_series, latest_revenue) if latest_revenue else None
        prev_revenue = self._find_comparable_quarter_row(revenue_series, latest_revenue)
        prev_gross = self._find_row_by_period(gross_profit_series, prev_revenue) if prev_revenue else None
        gross_margin_current = self._margin_pct(
            latest_gross.get("value_number") if latest_gross else None,
            latest_revenue.get("value_number") if latest_revenue else None,
        )
        gross_margin_prev = self._margin_pct(
            prev_gross.get("value_number") if prev_gross else None,
            prev_revenue.get("value_number") if prev_revenue else None,
        )
        gross_margin_change = (
            gross_margin_current - gross_margin_prev
            if gross_margin_current is not None and gross_margin_prev is not None
            else None
        )

        quality_flags = [
            {"code": "eps_growth_year", "label": "EPS nam > 25%", "passed": eps_growth_year is not None and eps_growth_year >= 25},
            {"code": "eps_growth_quarter", "label": "EPS quy > 25%", "passed": eps_growth_quarter is not None and eps_growth_quarter >= 25},
            {"code": "roe", "label": "ROE > 15%", "passed": roe_current is not None and roe_current >= 15},
            {"code": "debt", "label": "DAR < 60%", "passed": dar_current is not None and dar_current <= 60},
            {
                "code": "gross_margin",
                "label": "Bien gop cai thien",
                "passed": gross_margin_change is not None and gross_margin_change >= 0,
            },
        ]
        quality_flag_count = sum(1 for item in quality_flags if item["passed"])

        return {
            "summary": {
                "symbol": symbol,
                "exchange": exchange,
                "pe": round(pe_current, 2) if pe_current is not None else None,
                "pb": round(pb_current, 2) if pb_current is not None else None,
                "bv": round(bv_current, 2) if bv_current is not None else None,
                "eps": round(eps_current, 2) if eps_current is not None else None,
                "epsGrowthYear": round(eps_growth_year, 2) if eps_growth_year is not None else None,
                "epsGrowthQuarter": round(eps_growth_quarter, 2) if eps_growth_quarter is not None else None,
                "roe": round(roe_current, 2) if roe_current is not None else None,
                "dar": round(dar_current, 2) if dar_current is not None else None,
                "grossMargin": round(gross_margin_current, 2) if gross_margin_current is not None else None,
                "grossMarginChange": round(gross_margin_change, 2) if gross_margin_change is not None else None,
                "qualityFlags": quality_flags,
                "qualityFlagCount": quality_flag_count,
            },
            "metrics": {
                "pe_current": pe_current,
                "pb_current": pb_current,
                "bv_current": bv_current,
                "eps_current": eps_current,
                "eps_growth_year": eps_growth_year if eps_growth_year is not None else -999,
                "eps_growth_quarter": eps_growth_quarter if eps_growth_quarter is not None else -999,
                "roe_current": roe_current if roe_current is not None else 0,
                "dar_current": dar_current if dar_current is not None else 100,
                "gross_margin_current": gross_margin_current if gross_margin_current is not None else 0,
                "gross_margin_change": gross_margin_change if gross_margin_change is not None else -999,
                "quality_flag_count": quality_flag_count,
            },
        }

    def _build_volume_intelligence(
        self,
        *,
        history: list[dict[str, Any]],
        current_price: float,
        current_volume: float,
    ) -> dict[str, Any]:
        closes = [float(item.get("close") or 0) for item in history if item.get("close") is not None]
        volumes = [float(item.get("volume") or 0) for item in history if item.get("volume") is not None]
        latest = history[-1] if history else {}
        previous = history[-2] if len(history) >= 2 else {}
        ma10_volume = self._moving_average(volumes, 10)
        ma20_volume = self._moving_average(volumes, 20)
        ema10 = self._ema(closes, 10)
        ema20 = self._ema(closes, 20)
        reference_ema = ema10 or ema20
        ema_gap_pct = (
            abs((current_price - reference_ema) / reference_ema) * 100
            if current_price and reference_ema not in (None, 0)
            else None
        )
        volume_spike_ratio = (current_volume / ma20_volume) if current_volume and ma20_volume not in (None, 0) else 0
        recent_high = max([float(item.get("high") or 0) for item in history[-11:-1]], default=0)
        smart_money_inflow = bool(current_price and volume_spike_ratio >= 2 and current_price > recent_high > 0)

        open_price = _float(latest.get("open"), current_price)
        high_price = _float(latest.get("high"), current_price)
        low_price = _float(latest.get("low"), current_price)
        close_price = _float(latest.get("close"), current_price)
        candle_range = max(high_price - low_price, 0.0001)
        body = abs(close_price - open_price)
        upper_wick = max(high_price - max(open_price, close_price), 0)
        surge_trap = bool(volume_spike_ratio >= 3 and upper_wick > max(body * 0.5, candle_range * 0.35))
        no_supply = bool(
            reference_ema
            and abs(close_price - reference_ema) / max(reference_ema, 0.0001) <= 0.02
            and ma10_volume
            and current_volume <= ma10_volume * 0.5
        )
        previous_high = _float(previous.get("high"), 0)
        previous_volume = _float(previous.get("volume"), 0)
        volume_divergence = bool(current_price > previous_high > 0 and current_volume < previous_volume)

        return {
            "summary": {
                "ma10Volume": round(ma10_volume, 2) if ma10_volume is not None else None,
                "ma20Volume": round(ma20_volume, 2) if ma20_volume is not None else None,
                "volumeSpikeRatio": round(volume_spike_ratio, 2),
                "ema10": round(ema10, 2) if ema10 is not None else None,
                "ema20": round(ema20, 2) if ema20 is not None else None,
                "emaGapPct": round(ema_gap_pct, 2) if ema_gap_pct is not None else None,
                "smartMoneyInflow": smart_money_inflow,
                "surgeTrap": surge_trap,
                "noSupply": no_supply,
                "volumeDivergence": volume_divergence,
            },
            "metrics": {
                "ma10_volume": ma10_volume,
                "ma20_volume": ma20_volume,
                "volume_spike_ratio": volume_spike_ratio,
                "ema10": ema10,
                "ema20": ema20,
                "ema_gap_pct": ema_gap_pct if ema_gap_pct is not None else 999,
                "close_above_ema10": bool(ema10 and current_price >= ema10),
                "close_above_ema20": bool(ema20 and current_price >= ema20),
                "smart_money_inflow": smart_money_inflow,
                "surge_trap": surge_trap,
                "no_supply": no_supply,
                "volume_divergence": volume_divergence,
            },
        }

    def _build_candlestick_signals(self, history: list[dict[str, Any]]) -> dict[str, Any]:
        latest = history[-1] if history else None
        previous = history[-2] if len(history) >= 2 else None
        third = history[-3] if len(history) >= 3 else None
        signals: list[dict[str, Any]] = []
        bullish_score = 0
        bearish_score = 0

        if latest:
            open_price = _float(latest.get("open"))
            high_price = _float(latest.get("high"))
            low_price = _float(latest.get("low"))
            close_price = _float(latest.get("close"))
            candle_range = max(high_price - low_price, 0.0001)
            body = abs(close_price - open_price)
            upper_wick = max(high_price - max(open_price, close_price), 0)
            lower_wick = max(min(open_price, close_price) - low_price, 0)
            bullish = close_price > open_price

            marubozu = body / candle_range >= 0.8
            long_upper = upper_wick / candle_range >= 0.35
            long_lower = lower_wick / candle_range >= 0.35
            doji = body / candle_range <= 0.1

            signals.extend(
                [
                    self._signal("marubozu", "Marubozu", marubozu, "bullish" if bullish else "bearish", "Nen than dai, gan nhu khong co rau."),
                    self._signal("long_upper_wick", "Long upper wick", long_upper, "bearish", "Rau tren dai, de bi chot loi/trap."),
                    self._signal("long_lower_wick", "Long lower wick", long_lower, "bullish", "Rau duoi dai, tu choi giam gia."),
                    self._signal("doji", "Doji", doji, "neutral", "Nen luong lu, than nho so voi bien do."),
                ]
            )
            bullish_score += 18 if marubozu and bullish else 0
            bullish_score += 14 if long_lower else 0
            bearish_score += 14 if long_upper else 0
            bearish_score += 8 if doji else 0

        if latest and previous:
            prev_open = _float(previous.get("open"))
            prev_close = _float(previous.get("close"))
            curr_open = _float(latest.get("open"))
            curr_close = _float(latest.get("close"))
            bullish_engulfing = prev_close < prev_open and curr_close > curr_open and curr_close >= prev_open and curr_open <= prev_close
            bearish_engulfing = prev_close > prev_open and curr_close < curr_open and curr_open >= prev_close and curr_close <= prev_open
            signals.extend(
                [
                    self._signal("bullish_engulfing", "Bullish engulfing", bullish_engulfing, "bullish", "Nen hien tai bao trum than nen giam truoc do."),
                    self._signal("bearish_engulfing", "Bearish engulfing", bearish_engulfing, "bearish", "Nen hien tai bao trum than nen tang truoc do."),
                ]
            )
            bullish_score += 20 if bullish_engulfing else 0
            bearish_score += 20 if bearish_engulfing else 0

        if latest and previous and third:
            t_open = _float(third.get("open"))
            t_close = _float(third.get("close"))
            p_open = _float(previous.get("open"))
            p_close = _float(previous.get("close"))
            l_open = _float(latest.get("open"))
            l_close = _float(latest.get("close"))
            morning_star = t_close < t_open and abs(p_close - p_open) <= abs(t_close - t_open) * 0.4 and l_close > l_open and l_close >= (t_open + t_close) / 2
            evening_star = t_close > t_open and abs(p_close - p_open) <= abs(t_close - t_open) * 0.4 and l_close < l_open and l_close <= (t_open + t_close) / 2
            signals.extend(
                [
                    self._signal("morning_star", "Morning star", morning_star, "bullish", "Bo 3 nen dao chieu tang."),
                    self._signal("evening_star", "Evening star", evening_star, "bearish", "Bo 3 nen dao chieu giam."),
                ]
            )
            bullish_score += 18 if morning_star else 0
            bearish_score += 18 if evening_star else 0

        return {
            "items": [item for item in signals if item["detected"]],
            "metrics": {
                "bullish_pattern_score": _clamp(bullish_score),
                "bearish_pattern_score": _clamp(bearish_score),
            },
        }

    def _build_footprint_signals(
        self,
        *,
        history: list[dict[str, Any]],
        volume_intelligence: dict[str, Any],
        candlestick_signals: dict[str, Any],
    ) -> dict[str, Any]:
        latest = history[-1] if history else None
        previous_window = history[-6:-1] if len(history) >= 6 else history[:-1]
        signals: list[dict[str, Any]] = []

        spring_shakeout = False
        absorption = False
        breakout_confirmation = False
        pullback_retest = False

        if latest:
            low_price = _float(latest.get("low"))
            close_price = _float(latest.get("close"))
            open_price = _float(latest.get("open"))
            high_price = _float(latest.get("high"))
            recent_support = min((_float(item.get("low")) for item in previous_window), default=0)
            recent_resistance = max((_float(item.get("high")) for item in previous_window), default=0)
            lower_wick = max(min(open_price, close_price) - low_price, 0)
            upper_wick = max(high_price - max(open_price, close_price), 0)
            body = abs(close_price - open_price)

            spring_shakeout = bool(
                recent_support
                and low_price < recent_support
                and close_price > recent_support
                and lower_wick > max(body, (high_price - low_price) * 0.35)
            )
            breakout_confirmation = bool(
                recent_resistance
                and close_price > recent_resistance
                and volume_intelligence["metrics"]["volume_spike_ratio"] >= 1.5
            )
            pullback_retest = bool(
                recent_resistance
                and abs(close_price - recent_resistance) / max(recent_resistance, 0.0001) <= 0.02
                and volume_intelligence["metrics"]["volume_spike_ratio"] <= 1.0
                and close_price >= open_price
            )

        if len(history) >= 3:
            last_three = history[-3:]
            ranges = [abs(_float(item.get("high")) - _float(item.get("low"))) for item in last_three]
            volumes = [_float(item.get("volume")) for item in last_three]
            closes = [_float(item.get("close")) for item in last_three]
            avg_close = sum(closes) / len(closes) if closes else 0
            absorption = bool(
                max(ranges, default=0) <= max(avg_close * 0.03, 0.5)
                and volumes[0] <= volumes[1] <= volumes[2]
                and (max(closes) - min(closes)) <= max(avg_close * 0.025, 0.5)
            )

        signals.extend(
            [
                self._signal("spring_shakeout", "Spring / Shakeout", spring_shakeout, "bullish", "Rau duoi dai, thu ho tro roi rut chan nhanh."),
                self._signal("absorption", "Absorption", absorption, "bullish", "Nen nho di ngang, volume tang dan."),
                self._signal("breakout_confirmation", "Breakout confirmation", breakout_confirmation, "bullish", "Gia vuot khang cu va volume xac nhan."),
                self._signal("pullback_retest", "Pullback retest", pullback_retest, "bullish", "Gia retest vung breakout/EMA voi volume thap."),
            ]
        )

        return {
            "items": [item for item in signals if item["detected"]],
            "metrics": {
                "spring_shakeout": spring_shakeout,
                "absorption": absorption,
                "breakout_confirmation": breakout_confirmation,
                "pullback_retest": pullback_retest,
            },
        }

    def _build_money_flow_intelligence(
        self,
        *,
        history: list[dict[str, Any]],
        current_price: float,
        current_volume: float,
        news_mentions: int,
        volume_intelligence: dict[str, Any],
        footprint_signals: dict[str, Any],
    ) -> dict[str, Any]:
        closes = [_float(item.get("close")) for item in history if item.get("close") is not None]
        volumes = [_float(item.get("volume")) for item in history if item.get("volume") is not None]
        highs = [_float(item.get("high")) for item in history if item.get("high") is not None]
        lows = [_float(item.get("low")) for item in history if item.get("low") is not None]
        previous = history[-2] if len(history) >= 2 else {}

        obv_series: list[float] = []
        if closes and volumes:
            running_obv = 0.0
            previous_close = closes[0]
            for close, volume in zip(closes, volumes):
                if close > previous_close:
                    running_obv += volume
                elif close < previous_close:
                    running_obv -= volume
                obv_series.append(running_obv)
                previous_close = close

        obv_value = obv_series[-1] if obv_series else 0.0
        obv_ma10 = self._moving_average(obv_series, 10)
        obv_reference = self._moving_average(obv_series[:-5], 10) if len(obv_series) > 5 else None
        obv_slope_pct = (
            ((obv_value - obv_reference) / abs(obv_reference)) * 100
            if obv_reference not in (None, 0)
            else 0.0
        )
        obv_trend_score = _clamp(50 + (obv_slope_pct * 0.6))
        obv_above_ma = bool(obv_ma10 not in (None, 0) and obv_value >= obv_ma10)

        recent_high = max(highs[-10:-1], default=0.0)
        recent_window_high = max(highs[-6:], default=0.0)
        recent_window_low = min(lows[-6:], default=0.0)
        avg_recent_close = (sum(closes[-6:]) / len(closes[-6:])) if closes[-6:] else 0.0
        near_breakout_zone = bool(
            recent_high
            and current_price
            and abs(current_price - recent_high) / max(recent_high, 0.0001) <= 0.02
        )
        base_tightness_pct = (
            ((recent_window_high - recent_window_low) / avg_recent_close) * 100
            if avg_recent_close not in (None, 0)
            else 999.0
        )
        base_is_tight = bool(base_tightness_pct <= 6.0)

        price_context_score = _clamp(
            (20 if volume_intelligence["metrics"]["close_above_ema10"] else 0)
            + (20 if volume_intelligence["metrics"]["close_above_ema20"] else 0)
            + (20 if near_breakout_zone else 0)
            + (20 if footprint_signals["metrics"]["breakout_confirmation"] else 0)
            + (20 if base_is_tight else 0)
        )

        news_pressure_score = _clamp(news_mentions * 20)
        pre_news_accumulation = bool(
            obv_trend_score >= 55
            and obv_above_ma
            and base_is_tight
            and news_pressure_score <= 35
            and not volume_intelligence["metrics"]["surge_trap"]
        )
        obv_breakout_confirmation = bool(
            footprint_signals["metrics"]["breakout_confirmation"]
            and obv_above_ma
            and obv_trend_score >= 55
        )
        smart_money_before_news = bool(
            pre_news_accumulation
            and near_breakout_zone
            and current_volume > 0
            and volume_intelligence["metrics"]["volume_spike_ratio"] >= 1.2
        )

        previous_close = _float(previous.get("close"), current_price)
        price_flat_or_up = current_price >= previous_close * 0.995 if previous_close else False
        obv_distribution = bool(
            price_flat_or_up
            and obv_trend_score <= 42
            and news_pressure_score <= 35
        )
        weak_news_chase = bool(
            news_pressure_score >= 55
            and obv_trend_score < 50
            and not volume_intelligence["metrics"]["smart_money_inflow"]
        )

        money_flow_score = _clamp(
            (obv_trend_score * 0.35)
            + (price_context_score * 0.35)
            + (15 if pre_news_accumulation else 0)
            + (10 if smart_money_before_news else 0)
            + (5 if obv_breakout_confirmation else 0)
            - (10 if obv_distribution else 0)
            - (15 if weak_news_chase else 0)
        )

        items = [
            self._signal(
                "pre_news_accumulation",
                "Pre-news accumulation",
                pre_news_accumulation,
                "bullish",
                "OBV di len, nen gia giu chat va news pressure van thap.",
            ),
            self._signal(
                "obv_breakout_confirmation",
                "OBV breakout confirmation",
                obv_breakout_confirmation,
                "bullish",
                "OBV dong thuan voi breakout va gia dang o boi canh tot.",
            ),
            self._signal(
                "smart_money_before_news",
                "Smart Money before news",
                smart_money_before_news,
                "bullish",
                "Dong tien vao truoc khi tin tuc bung no, volume va OBV dang dong thuan.",
            ),
            self._signal(
                "obv_distribution",
                "OBV distribution",
                obv_distribution,
                "bearish",
                "Gia chua gay vo nhung OBV suy, canh bao phan phoi som.",
            ),
            self._signal(
                "weak_news_chase",
                "Weak news chase",
                weak_news_chase,
                "bearish",
                "Tin tuc nhieu nhung dong tien va OBV khong dong thuan.",
            ),
        ]

        return {
            "summary": {
                "obvValue": round(obv_value, 2),
                "obvMa10": round(obv_ma10, 2) if obv_ma10 is not None else None,
                "obvSlopePct": round(obv_slope_pct, 2),
                "obvTrendScore": round(obv_trend_score, 2),
                "obvAboveMa": obv_above_ma,
                "priceContextScore": round(price_context_score, 2),
                "nearBreakoutZone": near_breakout_zone,
                "baseTightnessPct": round(base_tightness_pct, 2) if base_tightness_pct is not None else None,
                "baseIsTight": base_is_tight,
                "newsPressureScore": round(news_pressure_score, 2),
                "moneyFlowScore": round(money_flow_score, 2),
                "preNewsAccumulation": pre_news_accumulation,
                "obvBreakoutConfirmation": obv_breakout_confirmation,
                "smartMoneyBeforeNews": smart_money_before_news,
                "obvDistribution": obv_distribution,
                "weakNewsChase": weak_news_chase,
                "items": [item for item in items if item["detected"]],
            },
            "metrics": {
                "obv_value": obv_value,
                "obv_ma10": obv_ma10,
                "obv_slope_pct": obv_slope_pct,
                "obv_trend_score": obv_trend_score,
                "obv_above_ma": obv_above_ma,
                "price_context_score": price_context_score,
                "near_breakout_zone": near_breakout_zone,
                "base_tightness_pct": base_tightness_pct if base_tightness_pct is not None else 999,
                "base_is_tight": base_is_tight,
                "news_pressure_score": news_pressure_score,
                "pre_news_accumulation": pre_news_accumulation,
                "obv_breakout_confirmation": obv_breakout_confirmation,
                "smart_money_before_news": smart_money_before_news,
                "obv_distribution": obv_distribution,
                "weak_news_chase": weak_news_chase,
                "money_flow_score": money_flow_score,
            },
        }

    def _build_execution_plan(
        self,
        *,
        current_price: float,
        fundamental: dict[str, Any],
        volume_intelligence: dict[str, Any],
        candlestick_signals: dict[str, Any],
        footprint_signals: dict[str, Any],
        money_flow_intelligence: dict[str, Any],
    ) -> dict[str, Any]:
        stop_loss_low_pct = 5.0
        stop_loss_high_pct = 8.0
        probe_buy = bool(
            footprint_signals["metrics"]["breakout_confirmation"]
            and volume_intelligence["metrics"]["volume_spike_ratio"] >= 1.5
            and not volume_intelligence["metrics"]["surge_trap"]
            and not money_flow_intelligence["metrics"]["obv_distribution"]
        )
        add_buy = bool(
            footprint_signals["metrics"]["pullback_retest"]
            and volume_intelligence["metrics"]["no_supply"]
            and candlestick_signals["metrics"]["bullish_pattern_score"] >= 12
            and money_flow_intelligence["metrics"]["obv_trend_score"] >= 50
        )
        take_profit_signal = bool(
            volume_intelligence["metrics"]["volume_divergence"]
            or volume_intelligence["metrics"]["surge_trap"]
            or money_flow_intelligence["metrics"]["obv_distribution"]
        )
        stand_aside = bool(
            volume_intelligence["metrics"]["surge_trap"]
            or fundamental["metrics"]["quality_flag_count"] < 2
            or money_flow_intelligence["metrics"]["weak_news_chase"]
        )
        rationale = []
        if probe_buy:
            rationale.append("Co breakout kèm volume xác nhận > 1.5x.")
        if add_buy:
            rationale.append("Nhịp retest/EMA có volume thấp và xuất hiện nến hồi phục.")
        if take_profit_signal:
            rationale.append("Xuất hiện tín hiệu thoát lệnh theo volume divergence hoặc surge trap.")
        if stand_aside:
            rationale.append("Nên đứng ngoài vì xuất hiện trap hoặc chất lượng nền chưa đủ.")

        if money_flow_intelligence["metrics"]["pre_news_accumulation"]:
            rationale.append("Dong tien truoc tin dang tich luy va OBV dang di len.")
        if money_flow_intelligence["metrics"]["weak_news_chase"]:
            rationale.append("Tin tuc tang nhung dong tien chua xac nhan, tranh mua duoi.")

        stop_loss_min = current_price * (1 - stop_loss_low_pct / 100) if current_price else None
        stop_loss_max = current_price * (1 - stop_loss_high_pct / 100) if current_price else None

        return {
            "summary": {
                "probeBuy30": probe_buy,
                "addBuy70": add_buy,
                "takeProfitSignal": take_profit_signal,
                "standAside": stand_aside,
                "stopLossMin": round(stop_loss_min, 2) if stop_loss_min is not None else None,
                "stopLossMax": round(stop_loss_max, 2) if stop_loss_max is not None else None,
                "rationale": rationale,
            },
            "metrics": {
                "stop_loss_pct": 6.5,
            },
        }

    @staticmethod
    def _financial_row_sort_key(row: dict[str, Any]) -> tuple[int, int]:
        report_period = str(row.get("report_period") or "")
        fiscal_year = row.get("fiscal_year")
        fiscal_quarter = row.get("fiscal_quarter")
        if isinstance(fiscal_year, int):
            return fiscal_year, fiscal_quarter or 0
        if report_period.startswith("Q"):
            quarter_part, _, year_part = report_period.partition("-")
            try:
                return int(year_part or 0), int(quarter_part.replace("Q", ""))
            except ValueError:
                return 0, 0
        try:
            return int(report_period), fiscal_quarter or 0
        except ValueError:
            return 0, 0

    def _latest_financial_value(self, rows: list[dict[str, Any]] | None) -> float | None:
        if not rows:
            return None
        return _float(rows[0].get("value_number"), None)

    def _previous_annual_value(self, rows: list[dict[str, Any]]) -> float | None:
        if len(rows) < 2:
            return None
        return _float(rows[1].get("value_number"), None)

    def _latest_period_row(self, rows: list[dict[str, Any]]) -> dict[str, Any] | None:
        return rows[0] if rows else None

    def _find_comparable_quarter_row(
        self,
        rows: list[dict[str, Any]],
        latest_row: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if not rows or not latest_row:
            return None
        period = str(latest_row.get("report_period") or "")
        if not period.startswith("Q"):
            return rows[1] if len(rows) > 1 else None
        quarter_part, _, year_part = period.partition("-")
        try:
            previous_period = f"{quarter_part}-{int(year_part) - 1}"
        except ValueError:
            return rows[1] if len(rows) > 1 else None
        return next((row for row in rows if str(row.get("report_period")) == previous_period), None)

    def _find_row_by_period(self, rows: list[dict[str, Any]], target_row: dict[str, Any] | None) -> dict[str, Any] | None:
        if not rows or not target_row:
            return None
        target_period = str(target_row.get("report_period") or "")
        return next((row for row in rows if str(row.get("report_period") or "") == target_period), None)

    @staticmethod
    def _growth_pct(current: float | None, previous: float | None) -> float | None:
        if current is None or previous in (None, 0):
            return None
        return ((current - previous) / abs(previous)) * 100

    @staticmethod
    def _margin_pct(numerator: float | None, denominator: float | None) -> float | None:
        if numerator is None or denominator in (None, 0):
            return None
        return (numerator / denominator) * 100

    @staticmethod
    def _moving_average(values: list[float], window: int) -> float | None:
        if not values:
            return None
        effective = values[-window:] if len(values) >= window else values
        if not effective:
            return None
        return sum(effective) / len(effective)

    @staticmethod
    def _ema(values: list[float], period: int) -> float | None:
        if not values:
            return None
        multiplier = 2 / (period + 1)
        ema = values[0]
        for value in values[1:]:
            ema = (value - ema) * multiplier + ema
        return ema

    @staticmethod
    def _signal(code: str, label: str, detected: bool, bias: str, detail: str) -> dict[str, Any]:
        return {
            "code": code,
            "label": label,
            "detected": bool(detected),
            "bias": bias,
            "detail": detail,
        }

    async def _upsert_snapshots(self, company_code: str, bundle: dict[str, Any], items: list[dict[str, Any]], trading_date: date) -> None:
        if not items:
            return
        active_formulas = bundle["formulas"]
        winning_formula = next((item for item in active_formulas if item["formulaCode"] == "winning_score"), None)
        profile_id = int(active_formulas[0]["profileId"]) if active_formulas else 0
        result = await self.session.execute(
            select(StrategyStockScoreSnapshot).where(
                StrategyStockScoreSnapshot.company_code == company_code,
                StrategyStockScoreSnapshot.profile_id == profile_id,
                StrategyStockScoreSnapshot.trading_date == trading_date,
            )
        )
        existing = {row.symbol: row for row in result.scalars().all()}
        now = datetime.now()
        for row in items[:300]:
            current = existing.get(row["symbol"])
            if current is None:
                current = StrategyStockScoreSnapshot(
                    company_code=company_code,
                    profile_id=profile_id,
                    symbol=row["symbol"],
                    trading_date=trading_date,
                    computed_at=now,
                )
                self.session.add(current)
            current.exchange = row.get("exchange")
            current.current_price = row.get("currentPrice")
            current.fair_value = row.get("fairValue")
            current.margin_of_safety = row.get("marginOfSafety")
            current.q_score = row.get("qScore")
            current.l_score = row.get("lScore")
            current.m_score = row.get("mScore")
            current.p_score = row.get("pScore")
            current.winning_score = row.get("winningScore")
            current.passed_layer_1 = row.get("passedLayer1")
            current.passed_layer_2 = row.get("passedLayer2")
            current.passed_layer_3 = row.get("passedLayer3")
            current.rank_overall = row.get("rank")
            current.metrics_json = row.get("metrics")
            current.explanation_json = row.get("explanation")
            current.computed_at = now
        if winning_formula:
            await self.session.flush()

    async def _upsert_signal_snapshots(
        self,
        company_code: str,
        bundle: dict[str, Any],
        items: list[dict[str, Any]],
        trading_date: date,
    ) -> None:
        if not items or not bundle.get("formulas"):
            return
        profile_id = int(bundle["formulas"][0]["profileId"])
        exchanges = {
            str(row.get("exchange") or "").upper()
            for row in items
            if str(row.get("exchange") or "").upper()
        }
        delete_stmt = StrategySignalSnapshot.__table__.delete().where(
            StrategySignalSnapshot.company_code == company_code,
            StrategySignalSnapshot.profile_id == profile_id,
            StrategySignalSnapshot.trading_date == trading_date,
        )
        if exchanges:
            delete_stmt = delete_stmt.where(StrategySignalSnapshot.exchange.in_(exchanges))
        await self.session.execute(delete_stmt)

        now = datetime.now()
        for row in items[:300]:
            signal_groups = [
                ("volume", row.get("volumeIntelligence") or {}),
                ("money_flow", row.get("moneyFlowIntelligence") or {}),
                ("candlestick", {"items": row.get("candlestickSignals") or []}),
                ("footprint", {"items": row.get("footprintSignals") or []}),
            ]
            for category, payload in signal_groups:
                for signal in payload.get("items") or []:
                    self.session.add(
                        StrategySignalSnapshot(
                            company_code=company_code,
                            profile_id=profile_id,
                            symbol=row["symbol"],
                            exchange=row.get("exchange"),
                            trading_date=trading_date,
                            category=category,
                            signal_code=str(signal.get("code") or signal.get("label") or "signal"),
                            signal_label=str(signal.get("label") or signal.get("code") or "Signal"),
                            detected=bool(signal.get("detected", True)),
                            signal_score=_float(row.get("winningScore"), None),
                            detail_json=signal,
                            computed_at=now,
                        )
                    )
        await self.session.flush()

    def _evaluate_formula(self, formula: dict[str, Any] | None, metrics: dict[str, Any]) -> float:
        if not formula or not formula.get("isEnabled"):
            return 0.0
        context = dict(metrics)
        for item in formula.get("parameters", []):
            context[item["paramKey"]] = item["value"]
        result = _safe_eval(str(formula.get("expression") or ""), context)
        return round(_float(result), 4)

    def _evaluate_rules(self, rules: list[dict[str, Any]], metrics: dict[str, Any]) -> list[dict[str, Any]]:
        results: list[dict[str, Any]] = []
        for rule in rules:
            if not rule.get("isEnabled"):
                continue
            context = dict(metrics)
            for item in rule.get("parameters", []):
                context[item["paramKey"]] = item["value"]
            passed = bool(_safe_eval(str(rule.get("expression") or ""), context))
            results.append({
                "id": rule["id"],
                "layerCode": rule.get("layerCode"),
                "ruleCode": rule.get("ruleCode") or rule.get("itemCode"),
                "label": rule["label"],
                "expression": rule["expression"],
                "severity": rule.get("severity", "info"),
                "isRequired": rule.get("isRequired", True),
                "passed": passed,
                "parameters": rule.get("parameters", []),
                "message": self._format_rule_message(rule, metrics, passed),
            })
        return results

    @staticmethod
    def _layer_passed(results: list[dict[str, Any]], layer_code: str) -> bool:
        layer_items = [item for item in results if item.get("layerCode") == layer_code]
        required_items = [item for item in layer_items if item.get("isRequired", True)]
        if not required_items:
            return True
        return all(item["passed"] for item in required_items)

    @staticmethod
    def _format_rule_message(rule: dict[str, Any], metrics: dict[str, Any], passed: bool) -> str:
        label = rule.get("label") or rule.get("ruleCode") or "rule"
        suffix = "dat" if passed else "chua dat"
        if rule.get("message_template"):
            try:
                return str(rule["message_template"]).format(**metrics)
            except Exception:
                pass
        return f"{label}: {suffix}"

    @staticmethod
    def _build_top_drivers(metrics: dict[str, Any]) -> list[dict[str, Any]]:
        drivers = [
            ("Thanh khoan", metrics.get("liquidity_score")),
            ("Dong luc gia", metrics.get("momentum_score")),
            ("Leadership", metrics.get("leadership_score")),
            ("Tin tuc", metrics.get("news_score")),
            ("Volume xac nhan", metrics.get("volume_confirmation_score")),
            ("Money flow", metrics.get("money_flow_score")),
            ("OBV trend", metrics.get("obv_trend_score")),
            ("EPS growth nam", metrics.get("eps_growth_year")),
            ("EPS growth quy", metrics.get("eps_growth_quarter")),
            ("Volume spike", (_float(metrics.get("volume_spike_ratio")) * 20)),
            ("Bullish pattern", metrics.get("bullish_pattern_score")),
        ]
        drivers.sort(key=lambda item: -_float(item[1]))
        return [{"label": label, "value": round(_float(value), 2)} for label, value in drivers[:4]]

    @staticmethod
    def _compute_risk_score(metrics: dict[str, Any], alert_results: list[dict[str, Any]]) -> float:
        alert_penalty = sum(12 if item["severity"] == "critical" else 7 for item in alert_results if item["passed"])
        return _clamp((_float(metrics.get("hotness_score")) * 0.45) + (_float(metrics.get("volatility_score")) * 0.35) + alert_penalty)

    @staticmethod
    def _estimate_fair_value(metrics: dict[str, Any], params: dict[str, Any]) -> float | None:
        price = _float(metrics.get("current_price"), 0)
        if price <= 0:
            return None
        base = _float(params.get("base_fair_value_premium"), 0.12)
        quality_bonus = (_float(metrics.get("Q"), 0) / 100) * _float(params.get("quality_fair_value_bonus"), 0.10)
        news_bonus = (_float(metrics.get("news_score"), 0) / 100) * _float(params.get("news_fair_value_bonus"), 0.05)
        premium = max(0.01, base + quality_bonus + news_bonus)
        return price * (1 + premium)

    async def _get_profile(self, company_code: str, profile_id: int | None) -> StrategyProfile:
        stmt = select(StrategyProfile).where(StrategyProfile.company_code == company_code, StrategyProfile.is_active.is_(True))
        if profile_id is not None:
            stmt = stmt.where(StrategyProfile.id == profile_id)
        else:
            stmt = stmt.order_by(desc(StrategyProfile.is_default), StrategyProfile.name.asc())
        result = await self.session.execute(stmt)
        profile = result.scalars().first()
        if profile is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy profile not found")
        return profile

    async def _get_journal_entry(self, company_code: str, entry_id: int) -> StrategyTradeJournalEntry:
        result = await self.session.execute(
            select(StrategyTradeJournalEntry).where(
                StrategyTradeJournalEntry.company_code == company_code,
                StrategyTradeJournalEntry.id == entry_id,
            )
        )
        item = result.scalar_one_or_none()
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Journal entry not found")
        return item

    async def _list_formulas(self, profile_id: int) -> list[dict[str, Any]]:
        result = await self.session.execute(
            select(StrategyFormulaDefinition)
            .where(StrategyFormulaDefinition.profile_id == profile_id)
            .order_by(StrategyFormulaDefinition.display_order.asc(), StrategyFormulaDefinition.id.asc())
        )
        formulas = result.scalars().all()
        if not formulas:
            return []
        formula_ids = [item.id for item in formulas]
        param_result = await self.session.execute(
            select(StrategyFormulaParameter)
            .where(StrategyFormulaParameter.formula_id.in_(formula_ids))
            .order_by(StrategyFormulaParameter.id.asc())
        )
        params_map: dict[int, list[StrategyFormulaParameter]] = defaultdict(list)
        for item in param_result.scalars().all():
            params_map[item.formula_id].append(item)
        return [
            {
                "id": item.id,
                "profileId": item.profile_id,
                "formulaCode": item.formula_code,
                "label": item.label,
                "description": item.description,
                "expression": item.expression,
                "resultType": item.result_type,
                "displayOrder": item.display_order,
                "isEditable": item.is_editable,
                "isEnabled": item.is_enabled,
                "parameters": [self._serialize_parameter(param) for param in params_map.get(item.id, [])],
            }
            for item in formulas
        ]

    async def _list_rules(self, model: Any, profile_id: int) -> list[dict[str, Any]]:
        result = await self.session.execute(
            select(model)
            .where(model.profile_id == profile_id)
            .order_by(model.display_order.asc(), model.id.asc())
        )
        rows = result.scalars().all()
        if not rows:
            return []

        keys = [self._rule_lookup_key(item) for item in rows]
        param_result = await self.session.execute(
            select(StrategyFormulaParameter)
            .where(
                StrategyFormulaParameter.formula_id.is_(None),
                StrategyFormulaParameter.value_text.in_(keys),
            )
        )
        param_map: dict[str, list[StrategyFormulaParameter]] = defaultdict(list)
        for item in param_result.scalars().all():
            if item.value_text:
                param_map[item.value_text].append(item)

        payload: list[dict[str, Any]] = []
        for item in rows:
            base = {
                "id": item.id,
                "profileId": item.profile_id,
                "label": item.label,
                "expression": item.expression,
                "displayOrder": item.display_order,
                "isEnabled": item.is_enabled,
                "parameters": [self._serialize_parameter(param) for param in param_map.get(self._rule_lookup_key(item), [])],
            }
            if isinstance(item, StrategyScreenRule):
                base.update({
                    "layerCode": item.layer_code,
                    "ruleCode": item.rule_code,
                    "severity": item.severity,
                    "isRequired": item.is_required,
                })
            elif isinstance(item, StrategyAlertRule):
                base.update({
                    "ruleCode": item.rule_code,
                    "severity": item.severity,
                    "cooldownMinutes": item.cooldown_minutes,
                    "notifyTelegram": item.notify_telegram,
                    "notifyInApp": item.notify_in_app,
                    "messageTemplate": item.message_template,
                })
            else:
                base.update({
                    "checklistType": item.checklist_type,
                    "itemCode": item.item_code,
                    "isRequired": item.is_required,
                })
            payload.append(base)
        return payload

    async def _list_versions(self, profile_id: int) -> list[dict[str, Any]]:
        result = await self.session.execute(
            select(StrategyVersion)
            .where(StrategyVersion.profile_id == profile_id)
            .order_by(desc(StrategyVersion.version_no), desc(StrategyVersion.created_at))
            .limit(20)
        )
        return [
            {
                "id": row.id,
                "versionNo": row.version_no,
                "changeSummary": row.change_summary,
                "createdBy": row.created_by,
                "createdAt": row.created_at.isoformat() if row.created_at else None,
            }
            for row in result.scalars().all()
        ]

    async def _sync_formulas(self, profile_id: int, formulas: list[dict[str, Any]], now: datetime) -> None:
        existing_result = await self.session.execute(
            select(StrategyFormulaDefinition).where(StrategyFormulaDefinition.profile_id == profile_id)
        )
        existing_map = {row.id: row for row in existing_result.scalars().all()}
        for idx, payload in enumerate(formulas, 1):
            row = existing_map.get(int(payload.get("id") or 0))
            if row is None:
                row = StrategyFormulaDefinition(
                    profile_id=profile_id,
                    formula_code=str(payload.get("formulaCode") or f"formula-{idx}"),
                    label=str(payload.get("label") or f"Formula {idx}"),
                    expression=str(payload.get("expression") or "0"),
                    result_type=str(payload.get("resultType") or "number"),
                    description=str(payload.get("description") or ""),
                    display_order=idx,
                    is_editable=bool(payload.get("isEditable", True)),
                    is_enabled=bool(payload.get("isEnabled", True)),
                    created_at=now,
                    updated_at=now,
                )
                self.session.add(row)
                await self.session.flush()
            else:
                row.label = str(payload.get("label") or row.label)
                row.expression = str(payload.get("expression") or row.expression)
                row.description = str(payload.get("description") or row.description or "")
                row.result_type = str(payload.get("resultType") or row.result_type)
                row.display_order = int(payload.get("displayOrder") or idx)
                row.is_editable = bool(payload.get("isEditable", row.is_editable))
                row.is_enabled = bool(payload.get("isEnabled", row.is_enabled))
                row.updated_at = now
            await self._sync_parameters(row.id, list(payload.get("parameters") or []), now)

    async def _sync_rules(self, model: Any, profile_id: int, items: list[dict[str, Any]], now: datetime) -> None:
        result = await self.session.execute(select(model).where(model.profile_id == profile_id))
        existing_map = {row.id: row for row in result.scalars().all()}
        for idx, payload in enumerate(items, 1):
            row = existing_map.get(int(payload.get("id") or 0))
            if row is None:
                if model is StrategyScreenRule:
                    row = StrategyScreenRule(
                        profile_id=profile_id,
                        layer_code=str(payload.get("layerCode") or "qualitative"),
                        rule_code=str(payload.get("ruleCode") or f"rule-{idx}"),
                        label=str(payload.get("label") or f"Rule {idx}"),
                        expression=str(payload.get("expression") or "False"),
                        severity=str(payload.get("severity") or "info"),
                        is_required=bool(payload.get("isRequired", True)),
                        is_enabled=bool(payload.get("isEnabled", True)),
                        display_order=int(payload.get("displayOrder") or idx),
                        created_at=now,
                        updated_at=now,
                    )
                elif model is StrategyAlertRule:
                    row = StrategyAlertRule(
                        profile_id=profile_id,
                        rule_code=str(payload.get("ruleCode") or f"alert-{idx}"),
                        label=str(payload.get("label") or f"Alert {idx}"),
                        expression=str(payload.get("expression") or "False"),
                        message_template=str(payload.get("messageTemplate") or ""),
                        severity=str(payload.get("severity") or "info"),
                        cooldown_minutes=int(payload.get("cooldownMinutes") or 15),
                        notify_telegram=bool(payload.get("notifyTelegram", False)),
                        notify_in_app=bool(payload.get("notifyInApp", True)),
                        is_enabled=bool(payload.get("isEnabled", True)),
                        display_order=int(payload.get("displayOrder") or idx),
                        created_at=now,
                        updated_at=now,
                    )
                else:
                    row = StrategyChecklistItem(
                        profile_id=profile_id,
                        checklist_type=str(payload.get("checklistType") or "pre_buy"),
                        item_code=str(payload.get("itemCode") or f"check-{idx}"),
                        label=str(payload.get("label") or f"Checklist {idx}"),
                        expression=str(payload.get("expression") or "False"),
                        is_required=bool(payload.get("isRequired", True)),
                        is_enabled=bool(payload.get("isEnabled", True)),
                        display_order=int(payload.get("displayOrder") or idx),
                        created_at=now,
                        updated_at=now,
                    )
                self.session.add(row)
                await self.session.flush()
            else:
                row.label = str(payload.get("label") or row.label)
                row.expression = str(payload.get("expression") or row.expression)
                row.display_order = int(payload.get("displayOrder") or idx)
                row.is_enabled = bool(payload.get("isEnabled", row.is_enabled))
                row.updated_at = now
                if isinstance(row, StrategyScreenRule):
                    row.layer_code = str(payload.get("layerCode") or row.layer_code)
                    row.rule_code = str(payload.get("ruleCode") or row.rule_code)
                    row.severity = str(payload.get("severity") or row.severity)
                    row.is_required = bool(payload.get("isRequired", row.is_required))
                elif isinstance(row, StrategyAlertRule):
                    row.rule_code = str(payload.get("ruleCode") or row.rule_code)
                    row.message_template = str(payload.get("messageTemplate") or row.message_template or "")
                    row.severity = str(payload.get("severity") or row.severity)
                    row.cooldown_minutes = int(payload.get("cooldownMinutes") or row.cooldown_minutes)
                    row.notify_telegram = bool(payload.get("notifyTelegram", row.notify_telegram))
                    row.notify_in_app = bool(payload.get("notifyInApp", row.notify_in_app))
                else:
                    row.checklist_type = str(payload.get("checklistType") or row.checklist_type)
                    row.item_code = str(payload.get("itemCode") or row.item_code)
                    row.is_required = bool(payload.get("isRequired", row.is_required))
            await self._sync_rule_parameters(self._rule_lookup_key(row), list(payload.get("parameters") or []), now)

    async def _sync_parameters(self, formula_id: int, parameters: list[dict[str, Any]], now: datetime) -> None:
        result = await self.session.execute(
            select(StrategyFormulaParameter).where(StrategyFormulaParameter.formula_id == formula_id)
        )
        existing_map = {row.param_key: row for row in result.scalars().all()}
        for payload in parameters:
            key = str(payload.get("paramKey") or "").strip()
            if not key:
                continue
            row = existing_map.get(key)
            if row is None:
                row = StrategyFormulaParameter(
                    formula_id=formula_id,
                    param_key=key,
                    label=str(payload.get("label") or key),
                    created_at=now,
                    updated_at=now,
                )
                self.session.add(row)
            row.label = str(payload.get("label") or row.label)
            self._fill_parameter_value(row, payload, now)
        await self.session.flush()

    async def _sync_rule_parameters(self, owner_key: str, parameters: list[dict[str, Any]], now: datetime) -> None:
        result = await self.session.execute(
            select(StrategyFormulaParameter).where(
                StrategyFormulaParameter.formula_id.is_(None),
                StrategyFormulaParameter.value_text == owner_key,
            )
        )
        existing_map = {row.param_key: row for row in result.scalars().all()}
        for payload in parameters:
            key = str(payload.get("paramKey") or "").strip()
            if not key:
                continue
            row = existing_map.get(key)
            if row is None:
                row = StrategyFormulaParameter(
                    formula_id=None,
                    param_key=key,
                    label=str(payload.get("label") or key),
                    value_text=owner_key,
                    created_at=now,
                    updated_at=now,
                )
                self.session.add(row)
            row.label = str(payload.get("label") or row.label)
            row.value_text = owner_key
            self._fill_parameter_value(row, payload, now)
        await self.session.flush()

    @staticmethod
    def _fill_parameter_value(row: StrategyFormulaParameter, payload: dict[str, Any], now: datetime) -> None:
        value = payload.get("value")
        data_type = str(payload.get("dataType") or payload.get("data_type") or row.data_type or "number")
        row.data_type = data_type
        row.ui_control = str(payload.get("uiControl") or payload.get("ui_control") or ("toggle" if data_type == "boolean" else "input"))
        row.min_value = payload.get("minValue") if payload.get("minValue") is not None else payload.get("min")
        row.max_value = payload.get("maxValue") if payload.get("maxValue") is not None else payload.get("max")
        row.step_value = payload.get("stepValue") if payload.get("stepValue") is not None else payload.get("step")
        row.value_number = None
        row.value_bool = None
        if data_type == "boolean":
            row.value_bool = bool(value)
        elif data_type == "text":
            row.value_text = str(value or row.value_text or "")
        else:
            row.value_number = _float(value)
        row.updated_at = now

    async def _add_audit_log(
        self,
        profile_id: int,
        entity_type: str,
        entity_id: str,
        action: str,
        before_json: Any,
        after_json: Any,
        changed_by: str,
    ) -> None:
        self.session.add(
            StrategyAuditLog(
                profile_id=profile_id,
                entity_type=entity_type,
                entity_id=entity_id,
                action=action,
                before_json=before_json,
                after_json=after_json,
                changed_by=changed_by,
                changed_at=datetime.now(),
            )
        )
        await self.session.flush()

    @staticmethod
    def _serialize_parameter(item: StrategyFormulaParameter) -> dict[str, Any]:
        if item.data_type == "boolean":
            value: Any = bool(item.value_bool)
        elif item.data_type == "text":
            value = item.value_text
        else:
            value = item.value_number
        return {
            "id": item.id,
            "paramKey": item.param_key,
            "label": item.label,
            "value": value,
            "dataType": item.data_type,
            "minValue": item.min_value,
            "maxValue": item.max_value,
            "stepValue": item.step_value,
            "uiControl": item.ui_control,
        }

    @staticmethod
    def _serialize_profile(item: StrategyProfile) -> dict[str, Any]:
        return {
            "id": item.id,
            "code": item.code,
            "name": item.name,
            "description": item.description,
            "isDefault": item.is_default,
            "isActive": item.is_active,
            "createdBy": item.created_by,
            "createdAt": item.created_at.isoformat() if item.created_at else None,
            "updatedAt": item.updated_at.isoformat() if item.updated_at else None,
        }

    @staticmethod
    def _serialize_journal(item: StrategyTradeJournalEntry, exchange: str | None = None) -> dict[str, Any]:
        snapshot_exchange = (
            (item.result_snapshot_json or {}).get("exchange")
            or (item.signal_snapshot_json or {}).get("exchange")
            or exchange
        )
        return {
            "id": item.id,
            "profileId": item.profile_id,
            "symbol": item.symbol,
            "exchange": str(snapshot_exchange).upper() if snapshot_exchange else None,
            "tradeDate": item.trade_date.isoformat() if item.trade_date else None,
            "classification": item.classification,
            "tradeSide": item.trade_side,
            "entryPrice": item.entry_price,
            "exitPrice": item.exit_price,
            "stopLossPrice": item.stop_loss_price,
            "takeProfitPrice": item.take_profit_price,
            "quantity": item.quantity,
            "positionSize": item.position_size,
            "totalCapital": item.total_capital,
            "strategyName": item.strategy_name,
            "psychology": item.psychology,
            "checklistResult": item.checklist_result_json or {},
            "signalSnapshot": item.signal_snapshot_json or {},
            "resultSnapshot": item.result_snapshot_json or {},
            "notes": item.notes,
            "mistakeTags": item.mistake_tags_json or [],
            "createdAt": item.created_at.isoformat() if item.created_at else None,
            "updatedAt": item.updated_at.isoformat() if item.updated_at else None,
        }

    @staticmethod
    def _paginate(items: list[dict[str, Any]], page: int, page_size: int) -> dict[str, Any]:
        total = len(items)
        safe_page = max(1, int(page or 1))
        safe_page_size = max(1, min(int(page_size or 20), 200))
        start = (safe_page - 1) * safe_page_size
        end = start + safe_page_size
        return {
            "page": safe_page,
            "pageSize": safe_page_size,
            "total": total,
            "items": items[start:end],
        }

    @staticmethod
    def _rule_lookup_key(item: Any) -> str:
        if isinstance(item, StrategyScreenRule):
            return f"screen::{item.rule_code}"
        if isinstance(item, StrategyAlertRule):
            return f"alert::{item.rule_code}"
        return f"check::{item.item_code}"


async def seed_default_strategy_data(session: AsyncSession) -> None:
    result = await session.execute(
        select(StrategyProfile).where(
            StrategyProfile.company_code == "MW",
            StrategyProfile.code == DEFAULT_STRATEGY_PROFILE["code"],
        )
    )
    profile = result.scalar_one_or_none()
    now = datetime.now()
    if profile is None:
        profile = StrategyProfile(
            company_code="MW",
            code=DEFAULT_STRATEGY_PROFILE["code"],
            name=DEFAULT_STRATEGY_PROFILE["name"],
            description=DEFAULT_STRATEGY_PROFILE["description"],
            is_default=True,
            is_active=True,
            created_by="system",
            created_at=now,
            updated_at=now,
        )
        session.add(profile)
        await session.flush()
        await _seed_profile_config(session, profile.id, now)
    else:
        profile.name = DEFAULT_STRATEGY_PROFILE["name"]
        profile.description = DEFAULT_STRATEGY_PROFILE["description"]
        profile.is_default = True
        profile.is_active = True
        profile.updated_at = now
        await session.flush()
        await _seed_profile_config(session, profile.id, now, ensure_existing=True)


async def _seed_profile_config(
    session: AsyncSession,
    profile_id: int,
    now: datetime,
    ensure_existing: bool = False,
) -> None:
    formula_result = await session.execute(select(StrategyFormulaDefinition).where(StrategyFormulaDefinition.profile_id == profile_id))
    existing_formulas = {row.formula_code: row for row in formula_result.scalars().all()}

    for idx, formula in enumerate(DEFAULT_STRATEGY_PROFILE["formulas"], 1):
        row = existing_formulas.get(formula["formula_code"])
        if row is None:
            row = StrategyFormulaDefinition(
                profile_id=profile_id,
                formula_code=formula["formula_code"],
                label=formula["label"],
                expression=formula["expression"],
                result_type="number",
                description=formula.get("description"),
                display_order=formula.get("display_order", idx),
                is_editable=True,
                is_enabled=True,
                created_at=now,
                updated_at=now,
            )
            session.add(row)
            await session.flush()
        elif ensure_existing:
            row.label = formula["label"]
            row.expression = formula["expression"]
            row.description = formula.get("description")
            row.display_order = formula.get("display_order", idx)
            row.updated_at = now
        await _seed_parameters(session, row.id, formula.get("parameters") or [], now)

    await _seed_rule_family(session, StrategyScreenRule, profile_id, DEFAULT_STRATEGY_PROFILE["screen_rules"], now, DEFAULT_STRATEGY_PROFILE["screen_rule_parameters"], ensure_existing)
    await _seed_rule_family(session, StrategyAlertRule, profile_id, DEFAULT_STRATEGY_PROFILE["alert_rules"], now, DEFAULT_STRATEGY_PROFILE["alert_rule_parameters"], ensure_existing)
    await _seed_rule_family(session, StrategyChecklistItem, profile_id, DEFAULT_STRATEGY_PROFILE["checklists"], now, DEFAULT_STRATEGY_PROFILE["checklist_parameters"], ensure_existing)
    await session.flush()


async def _seed_parameters(session: AsyncSession, formula_id: int, parameters: list[dict[str, Any]], now: datetime) -> None:
    result = await session.execute(select(StrategyFormulaParameter).where(StrategyFormulaParameter.formula_id == formula_id))
    existing = {row.param_key: row for row in result.scalars().all()}
    for payload in parameters:
        row = existing.get(payload["param_key"])
        if row is None:
            row = StrategyFormulaParameter(
                formula_id=formula_id,
                param_key=payload["param_key"],
                label=payload["label"],
                value_number=payload.get("value_number"),
                data_type="number",
                min_value=payload.get("min"),
                max_value=payload.get("max"),
                step_value=payload.get("step"),
                ui_control="input",
                created_at=now,
                updated_at=now,
            )
            session.add(row)
        else:
            row.label = payload["label"]
            row.value_number = payload.get("value_number")
            row.min_value = payload.get("min")
            row.max_value = payload.get("max")
            row.step_value = payload.get("step")
            row.updated_at = now


async def _seed_rule_family(
    session: AsyncSession,
    model: Any,
    profile_id: int,
    rows: list[dict[str, Any]],
    now: datetime,
    parameter_rows: list[dict[str, Any]],
    ensure_existing: bool,
) -> None:
    result = await session.execute(select(model).where(model.profile_id == profile_id))
    existing = {}
    for row in result.scalars().all():
        key = getattr(row, "rule_code", None) or getattr(row, "item_code", None)
        existing[key] = row

    for idx, payload in enumerate(rows, 1):
        key = payload.get("rule_code") or payload.get("item_code")
        row = existing.get(key)
        if row is None:
            if model is StrategyScreenRule:
                row = StrategyScreenRule(
                    profile_id=profile_id,
                    layer_code=payload["layer_code"],
                    rule_code=payload["rule_code"],
                    label=payload["label"],
                    expression=payload["expression"],
                    severity=payload.get("severity", "info"),
                    is_required=payload.get("is_required", True),
                    is_enabled=True,
                    display_order=payload.get("display_order", idx),
                    created_at=now,
                    updated_at=now,
                )
            elif model is StrategyAlertRule:
                row = StrategyAlertRule(
                    profile_id=profile_id,
                    rule_code=payload["rule_code"],
                    label=payload["label"],
                    expression=payload["expression"],
                    message_template=payload.get("message_template"),
                    severity=payload.get("severity", "info"),
                    cooldown_minutes=payload.get("cooldown_minutes", 15),
                    notify_telegram=payload.get("notify_telegram", False),
                    notify_in_app=payload.get("notify_in_app", True),
                    is_enabled=True,
                    display_order=payload.get("display_order", idx),
                    created_at=now,
                    updated_at=now,
                )
            else:
                row = StrategyChecklistItem(
                    profile_id=profile_id,
                    checklist_type=payload["checklist_type"],
                    item_code=payload["item_code"],
                    label=payload["label"],
                    expression=payload["expression"],
                    is_required=payload.get("is_required", True),
                    is_enabled=True,
                    display_order=payload.get("display_order", idx),
                    created_at=now,
                    updated_at=now,
                )
            session.add(row)
            await session.flush()
        elif ensure_existing:
            row.label = payload["label"]
            row.expression = payload["expression"]
            row.display_order = payload.get("display_order", idx)
            row.is_enabled = True
            row.updated_at = now
            if isinstance(row, StrategyScreenRule):
                row.layer_code = payload["layer_code"]
                row.severity = payload.get("severity", row.severity)
                row.is_required = payload.get("is_required", row.is_required)
            elif isinstance(row, StrategyAlertRule):
                row.message_template = payload.get("message_template")
                row.severity = payload.get("severity", row.severity)
                row.cooldown_minutes = payload.get("cooldown_minutes", row.cooldown_minutes)
                row.notify_telegram = payload.get("notify_telegram", row.notify_telegram)
                row.notify_in_app = payload.get("notify_in_app", row.notify_in_app)
            else:
                row.checklist_type = payload["checklist_type"]
                row.is_required = payload.get("is_required", row.is_required)

        owner_key = f"{'screen' if model is StrategyScreenRule else 'alert' if model is StrategyAlertRule else 'check'}::{key}"
        parameter_payloads = [item for item in parameter_rows if item.get("rule_code") == key or item.get("item_code") == key]
        param_result = await session.execute(
            select(StrategyFormulaParameter).where(
                StrategyFormulaParameter.formula_id.is_(None),
                StrategyFormulaParameter.value_text == owner_key,
            )
        )
        existing_params = {item.param_key: item for item in param_result.scalars().all()}
        for param in parameter_payloads:
            row_param = existing_params.get(param["param_key"])
            if row_param is None:
                row_param = StrategyFormulaParameter(
                    formula_id=None,
                    param_key=param["param_key"],
                    label=param["label"],
                    value_number=param.get("value_number"),
                    value_text=owner_key,
                    data_type="number",
                    ui_control="input",
                    created_at=now,
                    updated_at=now,
                )
                session.add(row_param)
            else:
                row_param.label = param["label"]
                row_param.value_number = param.get("value_number")
                row_param.updated_at = now
