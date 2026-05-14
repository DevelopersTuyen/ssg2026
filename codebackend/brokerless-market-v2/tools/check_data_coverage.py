from __future__ import annotations

import argparse
import asyncio
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import asyncpg


ROOT = Path(__file__).resolve().parents[1]
BACKEND_API_ENV = ROOT / "backend-api" / ".env"


def load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def resolve_database_url(cli_value: str | None) -> str:
    if cli_value:
        return cli_value
    if os.getenv("DATABASE_URL"):
        return str(os.getenv("DATABASE_URL"))
    env_values = load_env_file(BACKEND_API_ENV)
    database_url = env_values.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("Cannot resolve DATABASE_URL from CLI, environment, or backend-api/.env")
    return database_url


def to_asyncpg_dsn(database_url: str) -> str:
    return database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


@dataclass
class CoverageTargets:
    quote_pct: float = 98.0
    intraday_pct: float = 20.0
    financial_pct: float = 95.0
    cash_flow_pct: float = 80.0


async def fetch_value(conn: asyncpg.Connection, query: str, *args: Any) -> Any:
    return await conn.fetchval(query, *args)


async def fetch_row(conn: asyncpg.Connection, query: str, *args: Any) -> dict[str, Any] | None:
    row = await conn.fetchrow(query, *args)
    return dict(row) if row else None


def pct(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return round((numerator / denominator) * 100, 2)


def status_icon(ok: bool) -> str:
    return "OK" if ok else "WARN"


def print_section(title: str) -> None:
    print(f"\n=== {title} ===")


async def main() -> None:
    parser = argparse.ArgumentParser(description="Check market data coverage and background sync status.")
    parser.add_argument("--dsn", help="PostgreSQL DSN. Defaults to backend-api/.env DATABASE_URL.")
    parser.add_argument("--quote-target", type=float, default=98.0)
    parser.add_argument("--intraday-target", type=float, default=20.0)
    parser.add_argument("--financial-target", type=float, default=95.0)
    parser.add_argument("--cashflow-target", type=float, default=80.0)
    args = parser.parse_args()

    dsn = to_asyncpg_dsn(resolve_database_url(args.dsn))
    targets = CoverageTargets(
        quote_pct=args.quote_target,
        intraday_pct=args.intraday_target,
        financial_pct=args.financial_target,
        cash_flow_pct=args.cashflow_target,
    )

    conn = await asyncpg.connect(dsn)
    try:
        total_symbols = int(await fetch_value(conn, "select count(*) from market_symbols where is_active = true") or 0)
        quote_symbols = int(
            await fetch_value(
                conn,
                """
                select count(distinct symbol)
                from market_quote_snapshots
                where captured_at >= now() - interval '1 day'
                """,
            )
            or 0
        )
        intraday_symbols = int(
            await fetch_value(
                conn,
                """
                select count(distinct symbol)
                from market_intraday_points
                where point_time >= date_trunc('day', now())
                """,
            )
            or 0
        )
        financial_symbols = int(await fetch_value(conn, "select count(distinct symbol) from market_financial_balance_sheets") or 0)
        cash_flow_symbols = int(await fetch_value(conn, "select count(distinct symbol) from market_financial_cash_flows") or 0)
        news_rows = int(await fetch_value(conn, "select count(*) from market_news_articles") or 0)
        signal_rows_today = int(
            await fetch_value(
                conn,
                "select count(*) from strategy_signal_snapshots where computed_at >= now() - interval '1 day'",
            )
            or 0
        )

        quote_pct = pct(quote_symbols, total_symbols)
        intraday_pct = pct(intraday_symbols, total_symbols)
        financial_pct = pct(financial_symbols, total_symbols)
        cash_flow_pct = pct(cash_flow_symbols, total_symbols)

        print_section("COVERAGE")
        print(f"{status_icon(quote_pct >= targets.quote_pct)} Quote coverage      : {quote_symbols}/{total_symbols} ({quote_pct}%)")
        print(f"{status_icon(intraday_pct >= targets.intraday_pct)} Intraday coverage   : {intraday_symbols}/{total_symbols} ({intraday_pct}%)")
        print(f"{status_icon(financial_pct >= targets.financial_pct)} Financial coverage : {financial_symbols}/{total_symbols} ({financial_pct}%)")
        print(f"{status_icon(cash_flow_pct >= targets.cash_flow_pct)} Cash flow coverage : {cash_flow_symbols}/{total_symbols} ({cash_flow_pct}%)")
        print(f"OK News rows            : {news_rows}")
        print(f"OK Signal snapshots 1d  : {signal_rows_today}")

        print_section("BY EXCHANGE")
        by_exchange = await conn.fetch(
            """
            select exchange,
                   count(*) as total,
                   count(*) filter (
                     where symbol in (
                       select distinct symbol from market_quote_snapshots
                       where captured_at >= now() - interval '1 day'
                     )
                   ) as quoted,
                   count(*) filter (
                     where symbol in (
                       select distinct symbol from market_financial_balance_sheets
                     )
                   ) as financial
            from market_symbols
            where is_active = true
            group by exchange
            order by exchange
            """
        )
        for row in by_exchange:
            item = dict(row)
            print(
                f"{item['exchange']}: quote {item['quoted']}/{item['total']} ({pct(int(item['quoted']), int(item['total']))}%)"
                f" | financial {item['financial']}/{item['total']} ({pct(int(item['financial']), int(item['total']))}%)"
            )

        print_section("LATEST JOBS")
        jobs = [
            "collect_quotes",
            "collect_intraday",
            "collect_intraday_backfill",
            "collect_index_daily",
            "collect_financial_statements",
            "collect_financial_statements_backfill",
            "collect_financial_cash_flow_backfill",
            "collect_news",
            "seed_symbols",
            "foundation_candles",
            "foundation_data_quality",
            "foundation_alert_delivery",
            "workflow_auto_executor",
        ]
        for job_name in jobs:
            row = await fetch_row(
                conn,
                """
                select job_name, status, started_at, finished_at, message
                from market_sync_logs
                where job_name = $1
                order by started_at desc
                limit 1
                """,
                job_name,
            )
            if not row:
                print(f"WARN {job_name}: no log yet")
                continue
            print(
                f"{status_icon(str(row.get('status')) in {'success', 'partial'})} {job_name}: "
                f"{row.get('status')} | started={row.get('started_at')} | finished={row.get('finished_at')}"
            )
            if row.get("message"):
                print(f"   {row['message']}")

        print_section("NEXT ACTION")
        next_actions: list[str] = []
        if quote_pct < targets.quote_pct:
            next_actions.append("Increase quote coverage or inspect collect_quotes batch throughput.")
        if intraday_pct < targets.intraday_pct:
            next_actions.append("Increase intraday coverage or inspect collect_intraday rotation/rate limit.")
        if financial_pct < targets.financial_pct:
            next_actions.append("Let financial backfill run longer or increase financial batch sizes.")
        if cash_flow_pct < targets.cash_flow_pct:
            next_actions.append("Cash flow is still weak; confirm upstream source or implement dedicated cash flow collector.")
        if not next_actions:
            next_actions.append("Core data coverage has met current targets. Move on to workflow/journal consistency checks.")

        for idx, action in enumerate(next_actions, 1):
            print(f"{idx}. {action}")
    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
