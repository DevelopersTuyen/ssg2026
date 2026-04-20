from __future__ import annotations

import json
from typing import Any

from redis import asyncio as redis

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class CacheService:
    def __init__(self) -> None:
        self._client = None

    async def get_client(self):
        if self._client is None:
            try:
                self._client = redis.from_url(settings.redis_url, decode_responses=True)
            except Exception as exc:  # pragma: no cover
                logger.warning("cannot init redis client: %s", exc)
                self._client = None
        return self._client

    async def get_json(self, key: str) -> Any | None:
        client = await self.get_client()
        if client is None:
            return None
        try:
            value = await client.get(key)
            return json.loads(value) if value else None
        except Exception as exc:  # pragma: no cover
            logger.warning("cache get failed: %s", exc)
            return None

    async def set_json(self, key: str, value: Any, ttl: int | None = None) -> None:
        client = await self.get_client()
        if client is None:
            return
        try:
            await client.set(key, json.dumps(value, default=str), ex=ttl or settings.cache_ttl_seconds)
        except Exception as exc:  # pragma: no cover
            logger.warning("cache set failed: %s", exc)


cache_service = CacheService()
