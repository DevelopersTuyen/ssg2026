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
    industry: Mapped[str | None] = mapped_column(String(120), index=True)
    sector: Mapped[str | None] = mapped_column(String(120), index=True)
    market_cap: Mapped[float | None] = mapped_column(Float)
    shares_outstanding: Mapped[float | None] = mapped_column(Float)
    foreign_room: Mapped[float | None] = mapped_column(Float)
    trading_status: Mapped[str | None] = mapped_column(String(50), index=True)
    source: Mapped[str] = mapped_column(String(30), default="vnstock", index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    raw_json: Mapped[dict | list | None] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketExchangeRule(Base):
    __tablename__ = "market_exchange_rules"
    __table_args__ = (
        UniqueConstraint("exchange", name="uq_market_exchange_rules_exchange"),
        Index("ix_market_exchange_rules_active", "is_active", "exchange"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exchange: Mapped[str] = mapped_column(String(20), index=True)
    timezone: Mapped[str] = mapped_column(String(80), default="Asia/Ho_Chi_Minh")
    trading_sessions_json: Mapped[dict | list | None] = mapped_column(JSON)
    tick_size_rules_json: Mapped[dict | list | None] = mapped_column(JSON)
    lot_size: Mapped[int] = mapped_column(Integer, default=100)
    odd_lot_size: Mapped[int] = mapped_column(Integer, default=1)
    price_limit_percent: Mapped[float | None] = mapped_column(Float)
    holiday_calendar_json: Mapped[dict | list | None] = mapped_column(JSON)
    supported_order_types_json: Mapped[dict | list | None] = mapped_column(JSON)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
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


class MarketCandle(Base):
    __tablename__ = "market_candles"
    __table_args__ = (
        UniqueConstraint("symbol", "timeframe", "candle_time", "source", name="uq_market_candle_symbol_timeframe_time_source"),
        Index("ix_market_candle_lookup", "symbol", "timeframe", "candle_time"),
        Index("ix_market_candle_exchange_timeframe", "exchange", "timeframe", "candle_time"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    timeframe: Mapped[str] = mapped_column(String(10), index=True)
    source: Mapped[str] = mapped_column(String(30), default="resample", index=True)
    candle_time: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    open_price: Mapped[float | None] = mapped_column(Float)
    high_price: Mapped[float | None] = mapped_column(Float)
    low_price: Mapped[float | None] = mapped_column(Float)
    close_price: Mapped[float | None] = mapped_column(Float)
    volume: Mapped[float | None] = mapped_column(Float)
    trading_value: Mapped[float | None] = mapped_column(Float)
    point_count: Mapped[int] = mapped_column(Integer, default=0)
    quality_flags_json: Mapped[dict | list | None] = mapped_column(JSON)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)


class MarketDataQualityIssue(Base):
    __tablename__ = "market_data_quality_issues"
    __table_args__ = (
        UniqueConstraint("issue_key", name="uq_market_data_quality_issue_key"),
        Index("ix_market_data_quality_status", "status", "severity", "detected_at"),
        Index("ix_market_data_quality_symbol", "symbol", "detected_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    issue_key: Mapped[str] = mapped_column(String(255), index=True)
    scope: Mapped[str] = mapped_column(String(50), index=True)
    symbol: Mapped[str | None] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    severity: Mapped[str] = mapped_column(String(30), default="warning", index=True)
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)
    message: Mapped[str] = mapped_column(Text)
    details_json: Mapped[dict | list | None] = mapped_column(JSON)
    detected_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), index=True)


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


class MarketAlertEvent(Base):
    __tablename__ = "market_alert_events"
    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_market_alert_event_dedupe"),
        Index("ix_market_alert_event_status", "status", "severity", "created_at"),
        Index("ix_market_alert_event_symbol", "symbol", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    dedupe_key: Mapped[str] = mapped_column(String(255), index=True)
    scope: Mapped[str] = mapped_column(String(50), index=True)
    symbol: Mapped[str | None] = mapped_column(String(30), index=True)
    exchange: Mapped[str | None] = mapped_column(String(20), index=True)
    severity: Mapped[str] = mapped_column(String(30), default="info", index=True)
    title: Mapped[str] = mapped_column(String(255))
    message: Mapped[str] = mapped_column(Text)
    delivery_channels_json: Mapped[dict | list | None] = mapped_column(JSON)
    payload_json: Mapped[dict | list | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), index=True)
