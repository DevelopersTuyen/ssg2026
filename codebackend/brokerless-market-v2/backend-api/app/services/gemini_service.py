from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timedelta
from typing import Any
from urllib import error, parse, request

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class GeminiServiceError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        retry_after_seconds: int | None = None,
        detail: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.retry_after_seconds = retry_after_seconds
        self.detail = detail


class GeminiService:
    _cooldowns: dict[str, datetime] = {}

    @property
    def enabled(self) -> bool:
        return bool(settings.gemini_api_key)

    @property
    def model(self) -> str:
        return settings.gemini_model

    async def generate_text(
        self,
        *,
        prompt: str,
        history: list[dict[str, str]] | None = None,
        temperature: float = 0.3,
        max_output_tokens: int = 1024,
        response_mime_type: str | None = None,
        model: str | None = None,
    ) -> str:
        if not self.enabled:
            raise GeminiServiceError("GEMINI_API_KEY is not configured")

        effective_model = (model or settings.gemini_model).strip() or settings.gemini_model
        cooldown_remaining = self.get_cooldown_remaining(effective_model)
        if cooldown_remaining > 0:
            raise GeminiServiceError(
                f"Gemini cooldown active for {cooldown_remaining}s",
                status_code=429,
                retry_after_seconds=cooldown_remaining,
            )

        contents = []
        for item in history or []:
            role = "model" if item.get("role") == "assistant" else "user"
            content = (item.get("content") or "").strip()
            if not content:
                continue
            contents.append(
                {
                    "role": role,
                    "parts": [{"text": content}],
                }
            )

        contents.append(
            {
                "role": "user",
                "parts": [{"text": prompt}],
            }
        )

        payload: dict[str, Any] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_output_tokens,
            },
        }
        if response_mime_type:
            payload["generationConfig"]["responseMimeType"] = response_mime_type

        url = (
            f"{settings.gemini_api_base_url}/models/"
            f"{parse.quote(effective_model, safe='')}:generateContent"
            f"?key={parse.quote(settings.gemini_api_key or '', safe='')}"
        )

        data = await asyncio.to_thread(self._post_json, url, payload, effective_model)
        return self._extract_text(data)

    @classmethod
    def get_cooldown_remaining(cls, model: str | None = None) -> int:
        effective_model = (model or settings.gemini_model).strip() or settings.gemini_model
        until = cls._cooldowns.get(effective_model)
        if until is None:
            return 0
        remaining = int((until - datetime.now()).total_seconds())
        if remaining <= 0:
            cls._cooldowns.pop(effective_model, None)
            return 0
        return remaining

    @classmethod
    def _set_cooldown(cls, model: str, retry_after_seconds: int) -> None:
        seconds = max(1, retry_after_seconds)
        cls._cooldowns[model] = datetime.now() + timedelta(seconds=seconds)

    def _post_json(self, url: str, payload: dict[str, Any], model: str) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )

        try:
            with request.urlopen(req, timeout=settings.gemini_timeout_seconds) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except error.HTTPError as exc:  # pragma: no cover
            detail = exc.read().decode("utf-8", errors="ignore")
            logger.warning("gemini http error %s: %s", exc.code, detail)
            retry_after_seconds = self._extract_retry_after_seconds(detail)
            if exc.code == 429:
                self._set_cooldown(model, retry_after_seconds or 60)
            raise GeminiServiceError(
                f"Gemini API returned HTTP {exc.code}",
                status_code=exc.code,
                retry_after_seconds=retry_after_seconds,
                detail=detail,
            ) from exc
        except error.URLError as exc:  # pragma: no cover
            logger.warning("gemini url error: %s", exc)
            raise GeminiServiceError("Cannot reach Gemini API") from exc
        except Exception as exc:  # pragma: no cover
            logger.warning("gemini request failed: %s", exc)
            raise GeminiServiceError("Gemini request failed") from exc

    @staticmethod
    def _extract_retry_after_seconds(detail: str | None) -> int | None:
        if not detail:
            return None

        try:
            payload = json.loads(detail)
        except Exception:
            payload = None

        if isinstance(payload, dict):
            error_payload = payload.get("error") or {}
            details = error_payload.get("details") or []
            for item in details:
                retry_delay = item.get("retryDelay") if isinstance(item, dict) else None
                seconds = GeminiService._parse_retry_delay(retry_delay)
                if seconds is not None:
                    return seconds

        match = re.search(r"retry in\s+([0-9]+(?:\.[0-9]+)?)s", detail, flags=re.IGNORECASE)
        if match:
            return max(1, int(float(match.group(1))))
        return None

    @staticmethod
    def _parse_retry_delay(value: str | None) -> int | None:
        if not value:
            return None
        match = re.match(r"([0-9]+)(?:\.[0-9]+)?s$", value.strip())
        if match:
            return max(1, int(match.group(1)))
        return None

    @staticmethod
    def _extract_text(data: dict[str, Any]) -> str:
        candidates = data.get("candidates") or []
        for candidate in candidates:
            content = candidate.get("content") or {}
            parts = content.get("parts") or []
            texts = [part.get("text", "") for part in parts if part.get("text")]
            joined = "\n".join(texts).strip()
            if joined:
                return joined
        raise GeminiServiceError("Gemini returned an empty response")
