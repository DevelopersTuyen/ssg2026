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
