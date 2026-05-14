from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import asyncpg
from dotenv import dotenv_values


ROOT = Path(__file__).resolve().parents[1]
ENV_PATH = ROOT / "backend-api" / ".env"


def load_database_url() -> str:
    env = dotenv_values(ENV_PATH)
    url = str(env.get("DATABASE_URL") or "").strip()
    if not url:
        raise RuntimeError(f"Missing DATABASE_URL in {ENV_PATH}")
    return url.replace("postgresql+asyncpg://", "postgresql://", 1)


def ok(label: str, value: Any) -> None:
    print(f"OK {label:<34}: {value}")


def warn(label: str, value: Any) -> None:
    print(f"WARN {label:<32}: {value}")


async def fetch_rows(conn: asyncpg.Connection, query: str) -> list[asyncpg.Record]:
    return await conn.fetch(query)


async def main() -> None:
    conn = await asyncpg.connect(load_database_url())
    try:
        workflows = await fetch_rows(
            conn,
            """
            select
              w.id,
              w.symbol,
              w.status,
              w.execution_mode,
              w.action_code,
              w.resolution_type,
              w.handled_price,
              w.handled_quantity,
              w.completed_at,
              w.updated_at,
              w.journal_entry_id,
              j.entry_price,
              j.exit_price,
              j.notes,
              j.result_snapshot_json
            from strategy_action_workflow_entries w
            left join strategy_trade_journal_entries j on j.id = w.journal_entry_id
            where w.execution_mode = 'automatic'
            order by coalesce(w.completed_at, w.updated_at) desc
            limit 500
            """,
        )
        audit_logs = await fetch_rows(
            conn,
            """
            select entity_id, action
            from strategy_audit_logs
            where entity_type = 'workflow'
            order by changed_at desc
            limit 2000
            """,
        )

        audit_actions_by_workflow: dict[str, set[str]] = {}
        for row in audit_logs:
            audit_actions_by_workflow.setdefault(str(row["entity_id"]), set()).add(str(row["action"]))

        auto_total = len(workflows)
        auto_with_journal = 0
        completed_sell_missing_exit = 0
        completed_buy_missing_entry = 0
        missing_auto_note = 0
        missing_snapshot = 0
        dismissed_missing_trace = 0
        missing_audit = 0

        for row in workflows:
            workflow_id = str(row["id"])
            action_code = str(row["action_code"] or "").lower()
            status = str(row["status"] or "").lower()
            entry_price = row["entry_price"]
            exit_price = row["exit_price"]
            notes = str(row["notes"] or "")
            snapshot_raw = row["result_snapshot_json"]
            if isinstance(snapshot_raw, str):
                try:
                    snapshot_raw = json.loads(snapshot_raw)
                except Exception:
                    snapshot_raw = {}
            snapshot = snapshot_raw if isinstance(snapshot_raw, dict) else {}
            auto_snapshot = snapshot.get("autoWorkflow") if isinstance(snapshot, dict) else None
            has_journal = row["journal_entry_id"] is not None
            if has_journal:
                auto_with_journal += 1

            if has_journal and status == "completed" and action_code in {"take_profit", "cut_loss"} and not exit_price:
                completed_sell_missing_exit += 1
            if has_journal and status == "completed" and action_code in {"probe_buy", "add_position"} and not entry_price:
                completed_buy_missing_entry += 1
            if has_journal and "[AUTO]" not in notes:
                missing_auto_note += 1
            if has_journal and not isinstance(auto_snapshot, dict):
                missing_snapshot += 1
            if has_journal and status == "dismissed" and not isinstance(auto_snapshot, dict):
                dismissed_missing_trace += 1
            if workflow_id not in audit_actions_by_workflow:
                missing_audit += 1

        journal_stats = await conn.fetchrow(
            """
            select
              count(*) as total,
              count(*) filter (where exit_price is null) as open_count,
              count(*) filter (where exit_price is not null) as closed_count,
              count(*) filter (where (result_snapshot_json::jsonb ? 'autoWorkflow')) as snapshot_linked
            from strategy_trade_journal_entries
            """
        )

        print("=== WORKFLOW CONSISTENCY ===")
        ok("Automatic workflows checked", auto_total)
        ok("Automatic workflows with journal", auto_with_journal)
        if completed_sell_missing_exit:
            warn("Auto TP/SL missing journal exit", completed_sell_missing_exit)
        else:
            ok("Auto TP/SL missing journal exit", 0)
        if completed_buy_missing_entry:
            warn("Auto buy/add missing journal entry", completed_buy_missing_entry)
        else:
            ok("Auto buy/add missing journal entry", 0)
        if missing_auto_note:
            warn("Auto workflows missing note trace", missing_auto_note)
        else:
            ok("Auto workflows missing note trace", 0)
        if missing_snapshot:
            warn("Auto workflows missing snapshot", missing_snapshot)
        else:
            ok("Auto workflows missing snapshot", 0)
        if dismissed_missing_trace:
            warn("Dismissed auto missing trace", dismissed_missing_trace)
        else:
            ok("Dismissed auto missing trace", 0)
        if missing_audit:
            warn("Workflows missing audit log", missing_audit)
        else:
            ok("Workflows missing audit log", 0)

        print("\n=== JOURNAL STATE ===")
        ok("Journal total", journal_stats["total"])
        ok("Journal open", journal_stats["open_count"])
        ok("Journal closed", journal_stats["closed_count"])
        ok("Journal linked auto snapshot", journal_stats["snapshot_linked"])

    finally:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
