from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
API_ROOT = ROOT / "backend-api"
if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.core.db import SessionLocal
from app.models.market import StrategyActionWorkflowEntry, StrategyTradeJournalEntry
from app.services.strategy_service import StrategyService


async def main() -> None:
    repaired = 0

    async with SessionLocal() as session:
        service = StrategyService(session)
        rows = (
            await session.execute(
                select(StrategyActionWorkflowEntry, StrategyTradeJournalEntry)
                .join(
                    StrategyTradeJournalEntry,
                    StrategyTradeJournalEntry.id == StrategyActionWorkflowEntry.journal_entry_id,
                )
                .where(StrategyActionWorkflowEntry.execution_mode == "automatic")
                .where(StrategyActionWorkflowEntry.journal_entry_id.is_not(None))
                .order_by(StrategyActionWorkflowEntry.updated_at.desc())
            )
        ).all()

        for workflow, journal in rows:
            notes = str(journal.notes or "")
            snapshot = journal.result_snapshot_json if isinstance(journal.result_snapshot_json, dict) else {}
            auto_snapshot = snapshot.get("autoWorkflow") if isinstance(snapshot, dict) else None

            action_code = str(workflow.action_code or "").strip().lower()
            needs_exit = (
                str(workflow.status or "").strip().lower() == "completed"
                and action_code in {"take_profit", "cut_loss"}
                and not journal.exit_price
            )
            needs_entry = (
                str(workflow.status or "").strip().lower() == "completed"
                and action_code in {"probe_buy", "add_position"}
                and not journal.entry_price
            )
            needs_note = "[AUTO]" not in notes
            needs_snapshot = not isinstance(auto_snapshot, dict)

            if not any((needs_exit, needs_entry, needs_note, needs_snapshot)):
                continue

            await service._sync_workflow_to_journal(workflow)
            repaired += 1

        await session.commit()

    print(f"repaired_workflows={repaired}")


if __name__ == "__main__":
    asyncio.run(main())
