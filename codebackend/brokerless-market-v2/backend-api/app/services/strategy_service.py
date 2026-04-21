from __future__ import annotations

import ast
from collections import defaultdict
from copy import deepcopy
from datetime import date, datetime
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
    StrategyStockScoreSnapshot,
    StrategyTradeJournalEntry,
    StrategyVersion,
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
            "expression": "(w_momentum * momentum_score) + (w_confirmation * volume_confirmation_score) + (w_news * news_score) + (w_market * market_trend_score)",
            "display_order": 3,
            "parameters": [
                {"param_key": "w_momentum", "label": "Trong so dong luc gia", "value_number": 0.35, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_confirmation", "label": "Trong so xac nhan volume", "value_number": 0.30, "min": 0, "max": 1, "step": 0.05},
                {"param_key": "w_news", "label": "Trong so xung luc tin", "value_number": 0.15, "min": 0, "max": 1, "step": 0.05},
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
        {"layer_code": "quantitative", "rule_code": "liquidity", "label": "Thanh khoan du suc chiu lenh", "expression": "liquidity_score >= min_liquidity_score", "severity": "warning", "is_required": True, "display_order": 3},
        {"layer_code": "quantitative", "rule_code": "score", "label": "Winning Score vuot nguong", "expression": "winning_score >= min_winning_score", "severity": "warning", "is_required": True, "display_order": 4},
        {"layer_code": "technical", "rule_code": "price_action", "label": "Gia van nam tren diem mo cua nhip hien tai", "expression": "price_vs_open_ratio >= min_price_vs_open_ratio", "severity": "critical", "is_required": True, "display_order": 5},
        {"layer_code": "technical", "rule_code": "breakout_volume", "label": "Volume xac nhan breakout", "expression": "volume_confirmation_score >= min_breakout_volume_score", "severity": "critical", "is_required": True, "display_order": 6},
    ],
    "screen_rule_parameters": [
        {"rule_code": "leader", "param_key": "min_leadership_score", "label": "Leadership toi thieu", "value_number": 55},
        {"rule_code": "trend", "param_key": "min_market_trend_score", "label": "Xu huong san toi thieu", "value_number": 45},
        {"rule_code": "liquidity", "param_key": "min_liquidity_score", "label": "Thanh khoan toi thieu", "value_number": 50},
        {"rule_code": "score", "param_key": "min_winning_score", "label": "Winning Score toi thieu", "value_number": 140},
        {"rule_code": "price_action", "param_key": "min_price_vs_open_ratio", "label": "Ti le gia/open toi thieu", "value_number": 1.005},
        {"rule_code": "breakout_volume", "param_key": "min_breakout_volume_score", "label": "Volume confirmation toi thieu", "value_number": 55},
    ],
    "alert_rules": [
        {"rule_code": "volume_spike_no_price", "label": "Volume tang ma gia khong tang", "expression": "volume_score >= volume_spike_threshold and momentum_score <= weak_price_threshold", "message_template": "{symbol}: volume bat thuong nhung gia khong xac nhan.", "severity": "warning", "cooldown_minutes": 20, "notify_in_app": True, "notify_telegram": False, "display_order": 1},
        {"rule_code": "too_hot_vs_open", "label": "Gia qua nong", "expression": "hotness_score >= overheat_threshold", "message_template": "{symbol}: gia dang qua nong, can tranh mua cam xuc.", "severity": "critical", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": True, "display_order": 2},
        {"rule_code": "margin_safety_low", "label": "Bien an toan thap", "expression": "margin_of_safety < min_margin_of_safety", "message_template": "{symbol}: bien an toan hien duoi nguong cau hinh.", "severity": "warning", "cooldown_minutes": 30, "notify_in_app": True, "notify_telegram": False, "display_order": 3},
    ],
    "alert_rule_parameters": [
        {"rule_code": "volume_spike_no_price", "param_key": "volume_spike_threshold", "label": "Nguong volume spike", "value_number": 70},
        {"rule_code": "volume_spike_no_price", "param_key": "weak_price_threshold", "label": "Nguong gia yeu", "value_number": 52},
        {"rule_code": "too_hot_vs_open", "param_key": "overheat_threshold", "label": "Nguong qua nong", "value_number": 60},
        {"rule_code": "margin_safety_low", "param_key": "min_margin_of_safety", "label": "Bien an toan toi thieu", "value_number": 0.20},
    ],
    "checklists": [
        {"checklist_type": "pre_buy", "item_code": "business_quality", "label": "Doanh nghiep va dong tien dat chat luong toi thieu", "expression": "Q >= min_q_check", "is_required": True, "display_order": 1},
        {"checklist_type": "pre_buy", "item_code": "winning_score", "label": "Winning Score dat nguong vao lenh", "expression": "winning_score >= min_winning_check", "is_required": True, "display_order": 2},
        {"checklist_type": "pre_buy", "item_code": "margin", "label": "Bien an toan dat nguong", "expression": "margin_of_safety >= min_margin_check", "is_required": True, "display_order": 3},
        {"checklist_type": "end_of_day", "item_code": "journal", "label": "Da cap nhat trade journal", "expression": "journal_entries_today >= min_journal_entries", "is_required": False, "display_order": 1},
    ],
    "checklist_parameters": [
        {"item_code": "business_quality", "param_key": "min_q_check", "label": "Q toi thieu", "value_number": 55},
        {"item_code": "winning_score", "param_key": "min_winning_check", "label": "Winning Score toi thieu", "value_number": 140},
        {"item_code": "margin", "param_key": "min_margin_check", "label": "Margin toi thieu", "value_number": 0.20},
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


class StrategyService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = MarketReadRepository(session)

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
        rankings = await self.get_rankings(actor, profile.id, page=1, page_size=12)
        screener = await self.run_screener(actor, profile.id, page=1, page_size=12)
        journal = await self.list_journal(actor, limit=5)
        risk = await self.get_risk_overview(actor, profile.id)
        config = await self.get_profile_config(actor, profile.id)
        return {
            "profiles": await self.list_profiles(actor),
            "activeProfile": self._serialize_profile(profile),
            "configSummary": {
                "formulaCount": len(config["formulas"]),
                "screenRuleCount": len(config["screenRules"]),
                "alertRuleCount": len(config["alertRules"]),
                "checklistCount": len(config["checklists"]),
                "versionCount": len(config["versions"]),
            },
            "rankings": rankings,
            "screener": screener,
            "risk": risk,
            "journal": journal,
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
        bundle = await self._build_profile_bundle(profile.id)
        universe = await self._score_universe(actor, bundle, exchange=exchange, keyword=keyword, watchlist_only=watchlist_only)
        return self._paginate(universe, page, page_size)

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
        bundle = await self._build_profile_bundle(profile.id)
        universe = await self._score_universe(actor, bundle, exchange=exchange, keyword=keyword, watchlist_only=watchlist_only)
        passed_items = [item for item in universe if item["passedAllLayers"]]
        response = self._paginate(passed_items, page, page_size)
        response["summary"] = {
            "passed": len(passed_items),
            "total": len(universe),
            "passRate": round((len(passed_items) / len(universe)) * 100, 2) if universe else 0,
        }
        return response

    async def get_symbol_scoring(self, actor: AppUser, profile_id: int, symbol: str) -> dict[str, Any]:
        require_permission(actor, "scoring.view")
        profile = await self._get_profile(actor.company_code, profile_id)
        bundle = await self._build_profile_bundle(profile.id)
        universe = await self._score_universe(actor, bundle, keyword=symbol.upper())
        item = next((row for row in universe if row["symbol"] == symbol.upper()), None)
        if item is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Symbol not found in scored universe")
        return item

    async def get_risk_overview(self, actor: AppUser, profile_id: int) -> dict[str, Any]:
        require_permission(actor, "risk.view")
        profile = await self._get_profile(actor.company_code, profile_id)
        bundle = await self._build_profile_bundle(profile.id)
        universe = await self._score_universe(actor, bundle, watchlist_only=False)
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

    async def list_journal(self, actor: AppUser, limit: int = 50) -> list[dict[str, Any]]:
        require_permission(actor, "journal.view")
        result = await self.session.execute(
            select(StrategyTradeJournalEntry)
            .where(StrategyTradeJournalEntry.company_code == actor.company_code)
            .order_by(desc(StrategyTradeJournalEntry.created_at))
            .limit(limit)
        )
        return [self._serialize_journal(row) for row in result.scalars().all()]

    async def create_journal_entry(self, actor: AppUser, payload: dict[str, Any]) -> dict[str, Any]:
        require_permission(actor, "journal.create")
        now = datetime.now()
        item = StrategyTradeJournalEntry(
            user_id=actor.id,
            company_code=actor.company_code,
            profile_id=int(payload.get("profile_id") or 0) or None,
            symbol=str(payload.get("symbol") or "").upper(),
            trade_side=str(payload.get("trade_side") or "buy").lower(),
            entry_price=_float(payload.get("entry_price"), None),
            exit_price=_float(payload.get("exit_price"), None),
            stop_loss_price=_float(payload.get("stop_loss_price"), None),
            position_size=_float(payload.get("position_size"), None),
            checklist_result_json=payload.get("checklist_result_json") or {},
            notes=str(payload.get("notes") or ""),
            mistake_tags_json=payload.get("mistake_tags_json") or [],
            created_at=now,
            updated_at=now,
        )
        self.session.add(item)
        await self.session.flush()
        return self._serialize_journal(item)

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

        scored: list[dict[str, Any]] = []
        for item in universe:
            metrics = item["metrics"]
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
        return scored

    async def _build_universe(
        self,
        *,
        exchange: str | None = None,
        keyword: str | None = None,
        watchlist_only: bool = False,
    ) -> list[dict[str, Any]]:
        exchanges = [exchange.upper()] if exchange and exchange.upper() in {"HSX", "HNX", "UPCOM"} else ["HSX", "HNX", "UPCOM"]
        items: list[dict[str, Any]] = []
        for ex in exchanges:
            data = await self.repo.get_market_stocks(exchange=ex, sort="actives", page=1, page_size=8000, keyword=keyword)
            items.extend(data.get("items") or [])

        if not items:
            return []

        watchlist_rows = await self.repo.get_active_watchlist_items()
        watchlist_set = {item.symbol.upper() for item in watchlist_rows}
        if watchlist_only:
            items = [item for item in items if str(item.get("symbol") or "").upper() in watchlist_set]

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
            liquidity_score = percentile(trading_value, trading_value_sorted)
            volume_score = percentile(volume, volume_sorted)
            market_trend_score = market_trend_lookup.get(exchange_code, 50)
            momentum_score = _clamp(50 + (change_percent * 10))
            stability_score = _clamp(100 - (abs(change_percent) * 15))
            leadership_score = _clamp((liquidity_score * 0.45) + (momentum_score * 0.35) + (market_trend_score * 0.20))
            watchlist_bonus = 100 if str(row.get("symbol") or "").upper() in watchlist_set else 0
            news_score = min(100, news_mentions.get(str(row.get("symbol") or "").upper(), 0) * 25)
            volume_confirmation_score = _clamp((volume_score * 0.6) + (liquidity_score * 0.25) + (news_score * 0.15))
            price_risk_score = _clamp(20 + max(change_percent, 0) * 12)
            hotness_score = _clamp(max(change_percent - 3, 0) * 18)
            volatility_score = _clamp(abs(change_percent) * 10)
            price_vs_open_ratio = 1 + (change_percent / 100)

            scored_input.append({
                "symbol": str(row.get("symbol") or "").upper(),
                "name": row.get("name"),
                "exchange": exchange_code,
                "price": price,
                "changePercent": change_percent,
                "tradingValue": trading_value,
                "volume": volume,
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
                    "news_mentions": news_mentions.get(str(row.get("symbol") or "").upper(), 0),
                    "volume_confirmation_score": volume_confirmation_score,
                    "price_risk_score": price_risk_score,
                    "hotness_score": hotness_score,
                    "volatility_score": volatility_score,
                    "price_vs_open_ratio": price_vs_open_ratio,
                    "journal_entries_today": 0,
                },
            })
        return scored_input

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
    def _serialize_journal(item: StrategyTradeJournalEntry) -> dict[str, Any]:
        return {
            "id": item.id,
            "profileId": item.profile_id,
            "symbol": item.symbol,
            "tradeSide": item.trade_side,
            "entryPrice": item.entry_price,
            "exitPrice": item.exit_price,
            "stopLossPrice": item.stop_loss_price,
            "positionSize": item.position_size,
            "checklistResult": item.checklist_result_json or {},
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
