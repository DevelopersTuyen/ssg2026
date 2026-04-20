from __future__ import annotations

import asyncio
import json
from typing import Any
from urllib import error, parse, request

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class GeminiServiceError(RuntimeError):
    pass


class GeminiService:
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
    ) -> str:
        if not self.enabled:
            raise GeminiServiceError("GEMINI_API_KEY is not configured")

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
            f"{parse.quote(settings.gemini_model, safe='')}:generateContent"
            f"?key={parse.quote(settings.gemini_api_key or '', safe='')}"
        )

        data = await asyncio.to_thread(self._post_json, url, payload)
        return self._extract_text(data)

    def _post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
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
            raise GeminiServiceError(f"Gemini API returned HTTP {exc.code}") from exc
        except error.URLError as exc:  # pragma: no cover
            logger.warning("gemini url error: %s", exc)
            raise GeminiServiceError("Cannot reach Gemini API") from exc
        except Exception as exc:  # pragma: no cover
            logger.warning("gemini request failed: %s", exc)
            raise GeminiServiceError("Gemini request failed") from exc

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
