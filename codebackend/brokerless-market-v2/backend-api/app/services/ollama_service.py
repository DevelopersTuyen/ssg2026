from __future__ import annotations

import asyncio
import json
from typing import Any
from urllib import error, parse, request

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class OllamaServiceError(RuntimeError):
    pass


class OllamaService:
    @property
    def base_url(self) -> str:
        return settings.ollama_base_url.rstrip("/")

    @property
    def model(self) -> str:
        return settings.ollama_model

    async def list_models(self) -> list[str]:
        url = f"{self.base_url}/api/tags"
        data = await asyncio.to_thread(self._get_json, url)
        models = data.get("models") or []
        names: list[str] = []
        for item in models:
            if not isinstance(item, dict):
                continue
            name = (item.get("model") or item.get("name") or "").strip()
            if name:
                names.append(name)
        return names

    async def generate_text(
        self,
        *,
        prompt: str,
        system_prompt: str | None = None,
        history: list[dict[str, str]] | None = None,
        temperature: float = 0.2,
        max_output_tokens: int = 1200,
    ) -> str:
        messages: list[dict[str, str]] = []
        if system_prompt and system_prompt.strip():
            messages.append({"role": "system", "content": system_prompt.strip()})

        for item in history or []:
            role = item.get("role") or "user"
            if role not in {"user", "assistant", "system"}:
                role = "user"
            content = (item.get("content") or "").strip()
            if not content:
                continue
            messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": prompt.strip()})

        payload: dict[str, Any] = {
            "model": self.model,
            "stream": False,
            "messages": messages,
            "options": {
                "temperature": temperature,
                "num_predict": max_output_tokens,
            },
        }

        url = f"{self.base_url}/api/chat"
        data = await asyncio.to_thread(self._post_json, url, payload)
        return self._extract_text(data)

    def _get_json(self, url: str) -> dict[str, Any]:
        req = request.Request(
            url,
            headers={"Accept": "application/json"},
            method="GET",
        )
        try:
            with request.urlopen(req, timeout=settings.ollama_timeout_seconds) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except error.HTTPError as exc:  # pragma: no cover
            detail = exc.read().decode("utf-8", errors="ignore")
            logger.warning("ollama http error %s: %s", exc.code, detail)
            raise OllamaServiceError(f"Ollama returned HTTP {exc.code}") from exc
        except error.URLError as exc:  # pragma: no cover
            logger.warning("ollama url error: %s", exc)
            raise OllamaServiceError("Cannot reach Ollama local server") from exc
        except Exception as exc:  # pragma: no cover
            logger.warning("ollama list models failed: %s", exc)
            raise OllamaServiceError("Cannot list Ollama models") from exc

    def _post_json(self, url: str, payload: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        req = request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=settings.ollama_timeout_seconds) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except error.HTTPError as exc:  # pragma: no cover
            detail = exc.read().decode("utf-8", errors="ignore")
            logger.warning("ollama http error %s: %s", exc.code, detail)
            raise OllamaServiceError(f"Ollama returned HTTP {exc.code}") from exc
        except error.URLError as exc:  # pragma: no cover
            logger.warning("ollama url error: %s", exc)
            raise OllamaServiceError("Cannot reach Ollama local server") from exc
        except Exception as exc:  # pragma: no cover
            logger.warning("ollama request failed: %s", exc)
            raise OllamaServiceError("Ollama request failed") from exc

    @staticmethod
    def _extract_text(data: dict[str, Any]) -> str:
        message = data.get("message") or {}
        content = (message.get("content") or "").strip()
        if content:
            return content
        raise OllamaServiceError("Ollama returned an empty response")
