from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class MarketSymbol(Base):
    __tablename__ = "market_symbols"

    symbol: Mapped[str] = mapped_column(String(30), primary_key=True)
    name: Mapped[str | None] = mapped_column(String(255), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    instrument_type: Mapped[str | None] = mapped_column(String(50), index=True)
    source: Mapped[str] = mapped_column(String(30), default="vnstock", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    raw_json: Mapped[dict | list | None] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketQuoteSnapshot(Base):
    __tablename__ = "market_quote_snapshots"
    __table_args__ = (
        Index("ix_market_quote_lookup", "symbol", "captured_at"),
        Index("ix_market_quote_exchange_lookup", "exchange", "captured_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    source: Mapped[str] = mapped_column(String(30), default="vnstock", index=True)

    price: Mapped[float | None] = mapped_column(Float)
    reference_price: Mapped[float | None] = mapped_column(Float)
    open_price: Mapped[float | None] = mapped_column(Float)
    high_price: Mapped[float | None] = mapped_column(Float)
    low_price: Mapped[float | None] = mapped_column(Float)
    change_value: Mapped[float | None] = mapped_column(Float)
    change_percent: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[float | None] = mapped_column(Float)
    trading_value: Mapped[float | None] = mapped_column(Float)

    quote_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), index=True)
    raw_json: Mapped[dict | list | None] = mapped_column(JSON)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketIntradayPoint(Base):
    __tablename__ = "market_intraday_points"
    __table_args__ = (
        UniqueConstraint("symbol", "point_time", "source", name="uq_market_intraday_symbol_time_source"),
        Index("ix_market_intraday_lookup", "symbol", "point_time"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    source: Mapped[str] = mapped_column(String(30), default="vnstock", index=True)

    point_time: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    price: Mapped[float | None] = mapped_column(Float)
    change_value: Mapped[float | None] = mapped_column(Float)
    change_percent: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[float | None] = mapped_column(Float)
    trading_value: Mapped[float | None] = mapped_column(Float)
    raw_json: Mapped[dict | list | None] = mapped_column(JSON)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketIndexDailyPoint(Base):
    __tablename__ = "market_index_daily_points"
    __table_args__ = (
        UniqueConstraint("index_symbol", "point_date", name="uq_market_index_daily_symbol_date"),
        Index("ix_market_index_daily_lookup", "index_symbol", "point_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    index_symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    source: Mapped[str] = mapped_column(String(30), default="vnstock", index=True)

    point_date: Mapped[date] = mapped_column(Date, index=True)
    open_price: Mapped[float | None] = mapped_column(Float)
    high_price: Mapped[float | None] = mapped_column(Float)
    low_price: Mapped[float | None] = mapped_column(Float)
    close_price: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[float | None] = mapped_column(Float)
    trading_value: Mapped[float | None] = mapped_column(Float)
    raw_json: Mapped[dict | list | None] = mapped_column(JSON)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketIndexIntradayPoint(Base):
    __tablename__ = "market_index_intraday_points"
    __table_args__ = (
        UniqueConstraint("index_symbol", "point_time", "source", name="uq_market_index_intraday_symbol_time_source"),
        Index("ix_market_index_intraday_lookup", "index_symbol", "point_time"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    index_symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    source: Mapped[str] = mapped_column(String(30), default="vnstock", index=True)

    point_time: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    price: Mapped[float | None] = mapped_column(Float)
    change_value: Mapped[float | None] = mapped_column(Float)
    change_percent: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[float | None] = mapped_column(Float)
    trading_value: Mapped[float | None] = mapped_column(Float)
    raw_json: Mapped[dict | list | None] = mapped_column(JSON)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketSyncLog(Base):
    __tablename__ = "market_sync_logs"
    __table_args__ = (
        Index("ix_market_sync_logs_job_started", "job_name", "started_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    job_name: Mapped[str] = mapped_column(String(100), index=True)
    status: Mapped[str] = mapped_column(String(30), index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), index=True)
    message: Mapped[str | None] = mapped_column(Text)
    extra_json: Mapped[dict | list | None] = mapped_column(JSON)


class MarketNewsArticle(Base):
    __tablename__ = "market_news_articles"
    __table_args__ = (
        UniqueConstraint("source", "url", name="uq_market_news_source_url"),
        Index("ix_market_news_source_captured", "source", "captured_at"),
        Index("ix_market_news_published", "published_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(50), index=True)
    title: Mapped[str] = mapped_column(String(500), index=True)
    summary: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str] = mapped_column(String(1000))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), index=True)
    published_text: Mapped[str | None] = mapped_column(String(255))
    raw_json: Mapped[dict | list | None] = mapped_column(JSON)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketFinancialBalanceSheet(Base):
    __tablename__ = "market_financial_balance_sheets"
    __table_args__ = (
        UniqueConstraint(
            "symbol",
            "period_type",
            "report_period",
            "metric_key",
            "source",
            name="uq_market_financial_balance_sheet_metric",
        ),
        Index("ix_market_financial_balance_sheet_lookup", "symbol", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    source: Mapped[str] = mapped_column(String(30), default="vnstock", index=True)
    period_type: Mapped[str] = mapped_column(String(20), index=True)
    report_period: Mapped[str] = mapped_column(String(50), index=True)
    fiscal_year: Mapped[int | None] = mapped_column(Integer, index=True)
    fiscal_quarter: Mapped[int | None] = mapped_column(Integer, index=True)
    statement_date: Mapped[date | None] = mapped_column(Date, index=True)
    metric_key: Mapped[str] = mapped_column(String(120), index=True)
    metric_label: Mapped[str] = mapped_column(String(255))
    value_number: Mapped[float | None] = mapped_column(Float)
    value_text: Mapped[str | None] = mapped_column(Text)
    raw_json: Mapped[dict | list | None] = mapped_column(JSON)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketFinancialIncomeStatement(Base):
    __tablename__ = "market_financial_income_statements"
    __table_args__ = (
        UniqueConstraint(
            "symbol",
            "period_type",
            "report_period",
            "metric_key",
            "source",
            name="uq_market_financial_income_statement_metric",
        ),
        Index("ix_market_financial_income_statement_lookup", "symbol", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    source: Mapped[str] = mapped_column(String(30), default="vnstock", index=True)
    period_type: Mapped[str] = mapped_column(String(20), index=True)
    report_period: Mapped[str] = mapped_column(String(50), index=True)
    fiscal_year: Mapped[int | None] = mapped_column(Integer, index=True)
    fiscal_quarter: Mapped[int | None] = mapped_column(Integer, index=True)
    statement_date: Mapped[date | None] = mapped_column(Date, index=True)
    metric_key: Mapped[str] = mapped_column(String(120), index=True)
    metric_label: Mapped[str] = mapped_column(String(255))
    value_number: Mapped[float | None] = mapped_column(Float)
    value_text: Mapped[str | None] = mapped_column(Text)
    raw_json: Mapped[dict | list | None] = mapped_column(JSON)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketFinancialCashFlow(Base):
    __tablename__ = "market_financial_cash_flows"
    __table_args__ = (
        UniqueConstraint(
            "symbol",
            "period_type",
            "report_period",
            "metric_key",
            "source",
            name="uq_market_financial_cash_flow_metric",
        ),
        Index("ix_market_financial_cash_flow_lookup", "symbol", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    source: Mapped[str] = mapped_column(String(30), default="vnstock", index=True)
    period_type: Mapped[str] = mapped_column(String(20), index=True)
    report_period: Mapped[str] = mapped_column(String(50), index=True)
    fiscal_year: Mapped[int | None] = mapped_column(Integer, index=True)
    fiscal_quarter: Mapped[int | None] = mapped_column(Integer, index=True)
    statement_date: Mapped[date | None] = mapped_column(Date, index=True)
    metric_key: Mapped[str] = mapped_column(String(120), index=True)
    metric_label: Mapped[str] = mapped_column(String(255))
    value_number: Mapped[float | None] = mapped_column(Float)
    value_text: Mapped[str | None] = mapped_column(Text)
    raw_json: Mapped[dict | list | None] = mapped_column(JSON)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketFinancialRatio(Base):
    __tablename__ = "market_financial_ratios"
    __table_args__ = (
        UniqueConstraint(
            "symbol",
            "period_type",
            "report_period",
            "metric_key",
            "source",
            name="uq_market_financial_ratio_metric",
        ),
        Index("ix_market_financial_ratio_lookup", "symbol", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    source: Mapped[str] = mapped_column(String(30), default="vnstock", index=True)
    period_type: Mapped[str] = mapped_column(String(20), index=True)
    report_period: Mapped[str] = mapped_column(String(50), index=True)
    fiscal_year: Mapped[int | None] = mapped_column(Integer, index=True)
    fiscal_quarter: Mapped[int | None] = mapped_column(Integer, index=True)
    statement_date: Mapped[date | None] = mapped_column(Date, index=True)
    metric_key: Mapped[str] = mapped_column(String(120), index=True)
    metric_label: Mapped[str] = mapped_column(String(255))
    value_number: Mapped[float | None] = mapped_column(Float)
    value_text: Mapped[str | None] = mapped_column(Text)
    raw_json: Mapped[dict | list | None] = mapped_column(JSON)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketFinancialNote(Base):
    __tablename__ = "market_financial_notes"
    __table_args__ = (
        UniqueConstraint(
            "symbol",
            "period_type",
            "report_period",
            "metric_key",
            "source",
            name="uq_market_financial_note_metric",
        ),
        Index("ix_market_financial_note_lookup", "symbol", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    source: Mapped[str] = mapped_column(String(30), default="vnstock", index=True)
    period_type: Mapped[str] = mapped_column(String(20), index=True)
    report_period: Mapped[str] = mapped_column(String(50), index=True)
    fiscal_year: Mapped[int | None] = mapped_column(Integer, index=True)
    fiscal_quarter: Mapped[int | None] = mapped_column(Integer, index=True)
    statement_date: Mapped[date | None] = mapped_column(Date, index=True)
    metric_key: Mapped[str] = mapped_column(String(120), index=True)
    metric_label: Mapped[str] = mapped_column(String(255))
    value_number: Mapped[float | None] = mapped_column(Float)
    value_text: Mapped[str | None] = mapped_column(Text)
    raw_json: Mapped[dict | list | None] = mapped_column(JSON)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketWatchlistItem(Base):
    __tablename__ = "market_watchlist_items"
    __table_args__ = (
        UniqueConstraint("symbol", name="uq_market_watchlist_symbol"),
        Index("ix_market_watchlist_active_order", "is_active", "sort_order", "updated_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    note: Mapped[str | None] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(Integer, default=0, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class AppUser(Base):
    __tablename__ = "app_users"
    __table_args__ = (
        UniqueConstraint("company_code", "username", name="uq_app_users_company_username"),
        Index("ix_app_users_active_lookup", "is_active", "company_code", "username"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_code: Mapped[str] = mapped_column(String(30), index=True)
    username: Mapped[str] = mapped_column(String(100), index=True)
    full_name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(255), index=True)
    department: Mapped[str | None] = mapped_column(String(120), index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(100), index=True)
    permissions: Mapped[dict | list | None] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class AppRole(Base):
    __tablename__ = "app_roles"
    __table_args__ = (
        UniqueConstraint("company_code", "role_key", name="uq_app_roles_company_role_key"),
        Index("ix_app_roles_company_active", "company_code", "is_active", "role_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_code: Mapped[str] = mapped_column(String(30), index=True)
    role_key: Mapped[str] = mapped_column(String(100), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    permissions: Mapped[dict | list | None] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class AppPermissionLog(Base):
    __tablename__ = "app_permission_logs"
    __table_args__ = (
        Index("ix_app_permission_logs_company_created", "company_code", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_code: Mapped[str] = mapped_column(String(30), index=True)
    actor_username: Mapped[str] = mapped_column(String(100), index=True)
    action: Mapped[str] = mapped_column(String(100), index=True)
    target: Mapped[str] = mapped_column(String(255))
    detail: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class AppUserSetting(Base):
    __tablename__ = "app_user_settings"
    __table_args__ = (
        UniqueConstraint("user_id", name="uq_app_user_settings_user_id"),
        Index("ix_app_user_settings_user", "user_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    settings_json: Mapped[dict | list | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class StrategyProfile(Base):
    __tablename__ = "strategy_profiles"
    __table_args__ = (
        UniqueConstraint("company_code", "code", name="uq_strategy_profiles_company_code"),
        Index("ix_strategy_profiles_company_active", "company_code", "is_active", "is_default"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_code: Mapped[str] = mapped_column(String(30), index=True)
    code: Mapped[str] = mapped_column(String(100), index=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    created_by: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class StrategyFormulaDefinition(Base):
    __tablename__ = "strategy_formula_definitions"
    __table_args__ = (
        UniqueConstraint("profile_id", "formula_code", name="uq_strategy_formula_profile_code"),
        Index("ix_strategy_formula_profile_order", "profile_id", "display_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(Integer, index=True)
    formula_code: Mapped[str] = mapped_column(String(100), index=True)
    label: Mapped[str] = mapped_column(String(255))
    expression: Mapped[str] = mapped_column(Text)
    result_type: Mapped[str] = mapped_column(String(50), default="number")
    description: Mapped[str | None] = mapped_column(Text)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    is_editable: Mapped[bool] = mapped_column(Boolean, default=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class StrategyFormulaParameter(Base):
    __tablename__ = "strategy_formula_parameters"
    __table_args__ = (
        UniqueConstraint("formula_id", "param_key", name="uq_strategy_formula_param_key"),
        Index("ix_strategy_formula_param_formula", "formula_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    formula_id: Mapped[int | None] = mapped_column(Integer, index=True)
    param_key: Mapped[str] = mapped_column(String(100), index=True)
    label: Mapped[str] = mapped_column(String(255))
    value_number: Mapped[float | None] = mapped_column(Float)
    value_text: Mapped[str | None] = mapped_column(String(255))
    value_bool: Mapped[bool | None] = mapped_column(Boolean)
    data_type: Mapped[str] = mapped_column(String(30), default="number")
    min_value: Mapped[float | None] = mapped_column(Float)
    max_value: Mapped[float | None] = mapped_column(Float)
    step_value: Mapped[float | None] = mapped_column(Float)
    ui_control: Mapped[str | None] = mapped_column(String(30))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class StrategyScreenRule(Base):
    __tablename__ = "strategy_screen_rules"
    __table_args__ = (
        UniqueConstraint("profile_id", "layer_code", "rule_code", name="uq_strategy_screen_rule"),
        Index("ix_strategy_screen_profile_order", "profile_id", "layer_code", "display_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(Integer, index=True)
    layer_code: Mapped[str] = mapped_column(String(50), index=True)
    rule_code: Mapped[str] = mapped_column(String(100), index=True)
    label: Mapped[str] = mapped_column(String(255))
    expression: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(30), default="info")
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class StrategyAlertRule(Base):
    __tablename__ = "strategy_alert_rules"
    __table_args__ = (
        UniqueConstraint("profile_id", "rule_code", name="uq_strategy_alert_rule"),
        Index("ix_strategy_alert_profile_order", "profile_id", "display_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(Integer, index=True)
    rule_code: Mapped[str] = mapped_column(String(100), index=True)
    label: Mapped[str] = mapped_column(String(255))
    expression: Mapped[str] = mapped_column(Text)
    message_template: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(30), default="info")
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=15)
    notify_telegram: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_in_app: Mapped[bool] = mapped_column(Boolean, default=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class StrategyChecklistItem(Base):
    __tablename__ = "strategy_checklist_items"
    __table_args__ = (
        UniqueConstraint("profile_id", "checklist_type", "item_code", name="uq_strategy_checklist_item"),
        Index("ix_strategy_checklist_profile_order", "profile_id", "checklist_type", "display_order"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(Integer, index=True)
    checklist_type: Mapped[str] = mapped_column(String(50), index=True)
    item_code: Mapped[str] = mapped_column(String(100), index=True)
    label: Mapped[str] = mapped_column(String(255))
    expression: Mapped[str] = mapped_column(Text)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class StrategyVersion(Base):
    __tablename__ = "strategy_versions"
    __table_args__ = (
        Index("ix_strategy_version_profile_created", "profile_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(Integer, index=True)
    version_no: Mapped[int] = mapped_column(Integer, index=True)
    change_summary: Mapped[str | None] = mapped_column(Text)
    snapshot_json: Mapped[dict | list | None] = mapped_column(JSON)
    created_by: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class StrategyAuditLog(Base):
    __tablename__ = "strategy_audit_logs"
    __table_args__ = (
        Index("ix_strategy_audit_profile_changed", "profile_id", "changed_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    profile_id: Mapped[int] = mapped_column(Integer, index=True)
    entity_type: Mapped[str] = mapped_column(String(50), index=True)
    entity_id: Mapped[str] = mapped_column(String(100), index=True)
    action: Mapped[str] = mapped_column(String(50), index=True)
    before_json: Mapped[dict | list | None] = mapped_column(JSON)
    after_json: Mapped[dict | list | None] = mapped_column(JSON)
    changed_by: Mapped[str | None] = mapped_column(String(100))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class StrategyStockScoreSnapshot(Base):
    __tablename__ = "strategy_stock_score_snapshots"
    __table_args__ = (
        UniqueConstraint("company_code", "profile_id", "symbol", "trading_date", name="uq_strategy_score_symbol_date"),
        Index("ix_strategy_score_profile_date_rank", "profile_id", "trading_date", "rank_overall"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_code: Mapped[str] = mapped_column(String(30), index=True)
    profile_id: Mapped[int] = mapped_column(Integer, index=True)
    symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    trading_date: Mapped[date] = mapped_column(Date, index=True)
    current_price: Mapped[float | None] = mapped_column(Float)
    fair_value: Mapped[float | None] = mapped_column(Float)
    margin_of_safety: Mapped[float | None] = mapped_column(Float)
    q_score: Mapped[float | None] = mapped_column(Float)
    l_score: Mapped[float | None] = mapped_column(Float)
    m_score: Mapped[float | None] = mapped_column(Float)
    p_score: Mapped[float | None] = mapped_column(Float)
    winning_score: Mapped[float | None] = mapped_column(Float)
    passed_layer_1: Mapped[bool] = mapped_column(Boolean, default=False)
    passed_layer_2: Mapped[bool] = mapped_column(Boolean, default=False)
    passed_layer_3: Mapped[bool] = mapped_column(Boolean, default=False)
    rank_overall: Mapped[int | None] = mapped_column(Integer)
    metrics_json: Mapped[dict | list | None] = mapped_column(JSON)
    explanation_json: Mapped[dict | list | None] = mapped_column(JSON)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class StrategySignalSnapshot(Base):
    __tablename__ = "strategy_signal_snapshots"
    __table_args__ = (
        Index("ix_strategy_signal_profile_symbol_date", "profile_id", "symbol", "trading_date"),
        Index("ix_strategy_signal_category_detected", "category", "detected", "computed_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_code: Mapped[str] = mapped_column(String(30), index=True)
    profile_id: Mapped[int] = mapped_column(Integer, index=True)
    symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    trading_date: Mapped[date] = mapped_column(Date, index=True)
    category: Mapped[str] = mapped_column(String(50), index=True)
    signal_code: Mapped[str] = mapped_column(String(100), index=True)
    signal_label: Mapped[str] = mapped_column(String(255))
    detected: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    signal_score: Mapped[float | None] = mapped_column(Float)
    detail_json: Mapped[dict | list | None] = mapped_column(JSON)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class StrategyTradeJournalEntry(Base):
    __tablename__ = "strategy_trade_journal_entries"
    __table_args__ = (
        Index("ix_strategy_journal_user_created", "user_id", "created_at"),
        Index("ix_strategy_journal_profile_created", "profile_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    company_code: Mapped[str] = mapped_column(String(30), index=True)
    profile_id: Mapped[int | None] = mapped_column(Integer, index=True)
    symbol: Mapped[str] = mapped_column(String(30), index=True)
    trade_date: Mapped[date | None] = mapped_column(Date, index=True)
    classification: Mapped[str | None] = mapped_column(String(100), index=True)
    trade_side: Mapped[str] = mapped_column(String(20), index=True)
    entry_price: Mapped[float | None] = mapped_column(Float)
    exit_price: Mapped[float | None] = mapped_column(Float)
    stop_loss_price: Mapped[float | None] = mapped_column(Float)
    take_profit_price: Mapped[float | None] = mapped_column(Float)
    quantity: Mapped[float | None] = mapped_column(Float)
    position_size: Mapped[float | None] = mapped_column(Float)
    total_capital: Mapped[float | None] = mapped_column(Float)
    strategy_name: Mapped[str | None] = mapped_column(String(255))
    psychology: Mapped[str | None] = mapped_column(Text)
    checklist_result_json: Mapped[dict | list | None] = mapped_column(JSON)
    signal_snapshot_json: Mapped[dict | list | None] = mapped_column(JSON)
    result_snapshot_json: Mapped[dict | list | None] = mapped_column(JSON)
    notes: Mapped[str | None] = mapped_column(Text)
    mistake_tags_json: Mapped[dict | list | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
