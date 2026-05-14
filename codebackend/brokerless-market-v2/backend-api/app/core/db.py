from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base

from app.core.config import settings

Base = declarative_base()
engine = create_async_engine(settings.database_url, future=True, pool_pre_ping=True)
SessionLocal = async_sessionmaker(bind=engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    from app.models.market import (  # noqa: F401
        AppPermissionLog,
        AppRole,
        AppUser,
        AppUserSetting,
        MarketAlertEvent,
        MarketCandle,
        MarketDataQualityIssue,
        MarketExchangeRule,
        MarketFinancialBalanceSheet,
        MarketFinancialCashFlow,
        MarketFinancialIncomeStatement,
        MarketFinancialNote,
        MarketFinancialRatio,
        MarketSymbol,
        MarketQuoteSnapshot,
        MarketIntradayPoint,
        MarketIndexDailyPoint,
        MarketIndexIntradayPoint,
        MarketNewsArticle,
        MarketSyncLog,
        MarketWatchlistItem,
        StrategyAlertRule,
        StrategyActionWorkflowEntry,
        StrategyAuditLog,
        StrategyChecklistItem,
        StrategyFormulaDefinition,
        StrategyFormulaParameter,
        StrategyOrderStatementEntry,
        StrategyProfile,
        StrategyScreenRule,
        StrategySignalSnapshot,
        StrategyStockScoreSnapshot,
        StrategyTradeJournalEntry,
        StrategyVersion,
    )
    from app.repositories.auth_repo import AuthRepository
    from app.services.auth_service import seed_authorization_data
    from app.services.exchange_rules_service import seed_exchange_rules
    from app.services.strategy_service import seed_default_strategy_data

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.exec_driver_sql("ALTER TABLE market_symbols ADD COLUMN IF NOT EXISTS industry VARCHAR(120)")
        await conn.exec_driver_sql("ALTER TABLE market_symbols ADD COLUMN IF NOT EXISTS sector VARCHAR(120)")
        await conn.exec_driver_sql("ALTER TABLE market_symbols ADD COLUMN IF NOT EXISTS market_cap DOUBLE PRECISION")
        await conn.exec_driver_sql("ALTER TABLE market_symbols ADD COLUMN IF NOT EXISTS shares_outstanding DOUBLE PRECISION")
        await conn.exec_driver_sql("ALTER TABLE market_symbols ADD COLUMN IF NOT EXISTS foreign_room DOUBLE PRECISION")
        await conn.exec_driver_sql("ALTER TABLE market_symbols ADD COLUMN IF NOT EXISTS trading_status VARCHAR(50)")
        await conn.exec_driver_sql("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS email VARCHAR(255)")
        await conn.exec_driver_sql("ALTER TABLE app_users ADD COLUMN IF NOT EXISTS department VARCHAR(120)")
        await conn.exec_driver_sql("ALTER TABLE strategy_formula_parameters ALTER COLUMN formula_id DROP NOT NULL")
        await conn.exec_driver_sql("ALTER TABLE strategy_trade_journal_entries ADD COLUMN IF NOT EXISTS trade_date DATE")
        await conn.exec_driver_sql("ALTER TABLE strategy_trade_journal_entries ADD COLUMN IF NOT EXISTS classification VARCHAR(100)")
        await conn.exec_driver_sql("ALTER TABLE strategy_trade_journal_entries ADD COLUMN IF NOT EXISTS take_profit_price DOUBLE PRECISION")
        await conn.exec_driver_sql("ALTER TABLE strategy_trade_journal_entries ADD COLUMN IF NOT EXISTS quantity DOUBLE PRECISION")
        await conn.exec_driver_sql("ALTER TABLE strategy_trade_journal_entries ADD COLUMN IF NOT EXISTS total_capital DOUBLE PRECISION")
        await conn.exec_driver_sql("ALTER TABLE strategy_trade_journal_entries ADD COLUMN IF NOT EXISTS strategy_name VARCHAR(255)")
        await conn.exec_driver_sql("ALTER TABLE strategy_trade_journal_entries ADD COLUMN IF NOT EXISTS psychology TEXT")
        await conn.exec_driver_sql("ALTER TABLE strategy_trade_journal_entries ADD COLUMN IF NOT EXISTS signal_snapshot_json JSON")
        await conn.exec_driver_sql("ALTER TABLE strategy_trade_journal_entries ADD COLUMN IF NOT EXISTS result_snapshot_json JSON")
        await conn.exec_driver_sql("ALTER TABLE strategy_order_statement_entries ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER")
        await conn.exec_driver_sql("ALTER TABLE strategy_order_statement_entries ADD COLUMN IF NOT EXISTS settlement_date DATE")
        await conn.exec_driver_sql("ALTER TABLE strategy_order_statement_entries ADD COLUMN IF NOT EXISTS trade_side VARCHAR(20)")
        await conn.exec_driver_sql("ALTER TABLE strategy_order_statement_entries ADD COLUMN IF NOT EXISTS order_type VARCHAR(100)")
        await conn.exec_driver_sql("ALTER TABLE strategy_order_statement_entries ADD COLUMN IF NOT EXISTS channel VARCHAR(50)")
        await conn.exec_driver_sql("ALTER TABLE strategy_order_statement_entries ADD COLUMN IF NOT EXISTS gross_value DOUBLE PRECISION")
        await conn.exec_driver_sql("ALTER TABLE strategy_order_statement_entries ADD COLUMN IF NOT EXISTS transfer_fee DOUBLE PRECISION")
        await conn.exec_driver_sql("ALTER TABLE strategy_order_statement_entries ADD COLUMN IF NOT EXISTS net_amount DOUBLE PRECISION")
        await conn.exec_driver_sql("ALTER TABLE strategy_order_statement_entries ADD COLUMN IF NOT EXISTS broker_reference VARCHAR(120)")
        await conn.exec_driver_sql("ALTER TABLE strategy_order_statement_entries ADD COLUMN IF NOT EXISTS metadata_json JSON")
        await conn.exec_driver_sql("ALTER TABLE strategy_action_workflow_entries ADD COLUMN IF NOT EXISTS execution_mode VARCHAR(30) DEFAULT 'manual'")

    async with SessionLocal() as session:
        await seed_authorization_data(AuthRepository(session))
        await seed_default_strategy_data(session)
        await seed_exchange_rules(session)
        await session.commit()
