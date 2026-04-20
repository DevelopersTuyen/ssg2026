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
