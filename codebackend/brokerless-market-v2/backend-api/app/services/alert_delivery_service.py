from __future__ import annotations

import smtplib
from email.message import EmailMessage
from urllib import parse, request
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.json_utils import make_json_safe
from app.core.logging import get_logger
from app.models.market import MarketAlertEvent
from app.repositories.market_read_repo import MarketReadRepository
from app.services.market_alerts_service import MarketAlertsService

logger = get_logger(__name__)


class AlertDeliveryService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def materialize_market_alerts(self, *, exchange: str = "HSX") -> dict[str, Any]:
        exchange = exchange.upper().strip()
        repo = MarketReadRepository(self.session)
        overview = await MarketAlertsService(repo).get_overview(exchange=exchange)
        alerts = overview.get("alerts") or []
        created = 0
        now = datetime.now()

        for alert in alerts:
            payload = make_json_safe(dict(alert))
            symbol = str(alert.get("symbol") or "").upper() or None
            title = str(alert.get("title") or alert.get("headline") or "Market alert").strip()
            message = str(alert.get("message") or alert.get("detail") or title).strip()
            severity = str(alert.get("severity") or "info").lower()
            dedupe_key = self._dedupe_key(exchange, alert)
            channels = ["in_app"]
            if severity in {"critical", "high"}:
                channels.append("telegram")
            if settings.alert_delivery_email_to:
                channels.append("email")

            stmt = insert(MarketAlertEvent).values(
                dedupe_key=dedupe_key,
                scope="market_alert",
                symbol=symbol,
                exchange=exchange,
                severity=severity,
                title=title[:255],
                message=message,
                delivery_channels_json=channels,
                payload_json=payload,
                status="pending",
                created_at=now,
                delivered_at=None,
            )
            stmt = stmt.on_conflict_do_nothing(constraint="uq_market_alert_event_dedupe")
            result = await self.session.execute(stmt)
            created += int(result.rowcount or 0)

        return {
            "exchange": exchange,
            "alerts_seen": len(alerts),
            "events_created": created,
            "status": "pending",
            "materialized_at": now,
        }

    async def list_events(self, *, status: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        stmt = select(MarketAlertEvent).order_by(MarketAlertEvent.created_at.desc()).limit(limit)
        if status:
            stmt = stmt.where(MarketAlertEvent.status == status)
        rows = (await self.session.execute(stmt)).scalars().all()
        return [self._to_dict(row) for row in rows]

    async def deliver_pending(self, *, limit: int | None = None) -> dict[str, Any]:
        if not settings.alert_delivery_enabled:
            return {"enabled": False, "checked": 0, "sent": 0, "failed": 0}

        batch_size = limit or settings.alert_delivery_batch_size
        stmt = (
            select(MarketAlertEvent)
            .where(MarketAlertEvent.status == "pending")
            .order_by(MarketAlertEvent.created_at.asc())
            .limit(batch_size)
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        sent = 0
        failed = 0
        for event in rows:
            results = await self._deliver_event(event)
            event.payload_json = make_json_safe({
                **(event.payload_json or {}),
                "delivery_results": results,
                "delivery_attempted_at": datetime.now().isoformat(),
            })
            has_failure = any(item.get("status") == "failed" for item in results)
            has_delivery = any(item.get("status") in {"sent", "stored"} for item in results)
            if has_failure and not has_delivery:
                event.status = "failed"
                failed += 1
            else:
                event.status = "sent"
                event.delivered_at = datetime.now()
                sent += 1

        return {
            "enabled": True,
            "checked": len(rows),
            "sent": sent,
            "failed": failed,
        }

    def _dedupe_key(self, exchange: str, alert: dict[str, Any]) -> str:
        symbol = str(alert.get("symbol") or "market").upper()
        code = str(alert.get("id") or alert.get("signal_code") or alert.get("title") or "alert")
        bucket = str(alert.get("computed_at") or alert.get("updated_at") or datetime.now().date().isoformat())
        return f"{exchange}:{symbol}:{code}:{bucket}"[:255]

    async def _deliver_event(self, event: MarketAlertEvent) -> list[dict[str, Any]]:
        channels = list(dict.fromkeys(event.delivery_channels_json or ["in_app"]))
        results: list[dict[str, Any]] = []
        for channel in channels:
            try:
                if channel == "in_app":
                    results.append({"channel": channel, "status": "stored"})
                elif channel == "telegram":
                    results.append(self._send_telegram(event))
                elif channel == "email":
                    results.append(self._send_email(event))
                else:
                    results.append({"channel": channel, "status": "skipped", "reason": "unsupported channel"})
            except Exception as exc:
                logger.exception("alert delivery failed | channel=%s event=%s", channel, event.id)
                results.append({"channel": channel, "status": "failed", "reason": str(exc)})
        return results

    def _send_telegram(self, event: MarketAlertEvent) -> dict[str, Any]:
        if not settings.telegram_bot_token or not settings.telegram_chat_id:
            return {"channel": "telegram", "status": "skipped", "reason": "missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID"}

        text = self._format_delivery_text(event)
        url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
        body = parse.urlencode({"chat_id": settings.telegram_chat_id, "text": text}).encode("utf-8")
        req = request.Request(url, data=body, method="POST")
        with request.urlopen(req, timeout=12) as resp:
            status_code = getattr(resp, "status", 200)
        if status_code >= 400:
            return {"channel": "telegram", "status": "failed", "reason": f"http {status_code}"}
        return {"channel": "telegram", "status": "sent"}

    def _send_email(self, event: MarketAlertEvent) -> dict[str, Any]:
        required = [
            settings.smtp_host,
            settings.smtp_from_email,
            settings.alert_delivery_email_to,
        ]
        if not all(required):
            return {"channel": "email", "status": "skipped", "reason": "missing SMTP_HOST, SMTP_FROM_EMAIL or ALERT_DELIVERY_EMAIL_TO"}

        msg = EmailMessage()
        msg["Subject"] = f"[SSG2026] {event.title}"
        msg["From"] = settings.smtp_from_email or ""
        msg["To"] = settings.alert_delivery_email_to or ""
        msg.set_content(self._format_delivery_text(event))

        with smtplib.SMTP(settings.smtp_host or "", settings.smtp_port, timeout=15) as smtp:
            smtp.starttls()
            if settings.smtp_username and settings.smtp_password:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(msg)
        return {"channel": "email", "status": "sent"}

    def _format_delivery_text(self, event: MarketAlertEvent) -> str:
        symbol = event.symbol or event.exchange or "MARKET"
        return "\n".join(
            [
                f"{event.severity.upper()} | {symbol}",
                event.title,
                event.message,
                f"Exchange: {event.exchange or '--'}",
                f"Created: {event.created_at}",
            ]
        )

    def _to_dict(self, row: MarketAlertEvent) -> dict[str, Any]:
        return {
            "id": row.id,
            "scope": row.scope,
            "symbol": row.symbol,
            "exchange": row.exchange,
            "severity": row.severity,
            "title": row.title,
            "message": row.message,
            "delivery_channels": row.delivery_channels_json or [],
            "payload": row.payload_json or {},
            "status": row.status,
            "created_at": row.created_at,
            "delivered_at": row.delivered_at,
        }
