from __future__ import annotations

import asyncio
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from html import unescape
from typing import Any
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from app.core.config import settings
from app.core.logging import get_logger
from app.repositories.market_read_repo import MarketReadRepository

logger = get_logger(__name__)


@dataclass(slots=True)
class CafeFNewsArticle:
    title: str
    summary: str
    url: str
    published_at: str | None
    source: str = "CafeF"


class CafeFNewsService:
    ITEM_PATTERN = re.compile(
        r'<div class="tlitem box-category-item"[^>]*>.*?'
        r"<h3>\s*<a href=\"(?P<href>[^\"]+)\">(?P<title>.*?)</a>\s*</h3>.*?"
        r'<span class="time time-ago"[^>]*title="(?P<time>[^"]+)".*?</span>.*?'
        r'<p class="sapo box-category-sapo"[^>]*>(?P<summary>.*?)</p>',
        re.IGNORECASE | re.DOTALL,
    )
    TAG_PATTERN = re.compile(r"<[^>]+>")
    SPACE_PATTERN = re.compile(r"\s+")

    def __init__(self) -> None:
        self._cache_expires_at: datetime | None = None
        self._cache_items: list[CafeFNewsArticle] = []

    async def fetch_latest_news(
        self,
        limit: int = 10,
        search: str | None = None,
        repo: MarketReadRepository | None = None,
    ) -> list[CafeFNewsArticle]:
        normalized_limit = max(1, min(limit, 20))
        normalized_search = (search or "").strip().lower()

        cached_items = self._get_cached_items()
        if cached_items is None:
            cached_items = await asyncio.to_thread(self._fetch_and_cache_items)

        filtered_items = self._filter_items(cached_items, normalized_search)
        if repo is not None:
            if filtered_items:
                await self._persist_items(repo, filtered_items)
            db_items = await repo.get_latest_news_articles(
                source="CafeF",
                limit=normalized_limit,
                search=normalized_search or None,
            )
            if db_items:
                return [self._from_db_item(item) for item in db_items]

        return filtered_items[:normalized_limit]

    def _get_cached_items(self) -> list[CafeFNewsArticle] | None:
        if not self._cache_expires_at or datetime.utcnow() >= self._cache_expires_at:
            return None
        return list(self._cache_items)

    def _fetch_and_cache_items(self) -> list[CafeFNewsArticle]:
        items = self._fetch_items_sync()
        ttl_seconds = max(15, settings.cafef_news_cache_ttl_seconds)
        self._cache_items = items
        self._cache_expires_at = datetime.utcnow() + timedelta(seconds=ttl_seconds)
        return list(items)

    def _fetch_items_sync(self) -> list[CafeFNewsArticle]:
        request = Request(
            settings.cafef_news_url,
            headers={
                "User-Agent": settings.cafef_news_user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )

        try:
            with urlopen(request, timeout=settings.cafef_news_timeout_seconds) as response:
                html = response.read().decode("utf-8", errors="ignore")
            items = self._parse_items(html)
            logger.info("fetched %s CafeF news items", len(items))
            return items
        except Exception:
            logger.exception("failed to fetch CafeF news from %s", settings.cafef_news_url)
            return []

    def _parse_items(self, html: str) -> list[CafeFNewsArticle]:
        items: list[CafeFNewsArticle] = []

        for match in self.ITEM_PATTERN.finditer(html):
            title = self._clean_text(match.group("title"))
            summary = self._clean_text(match.group("summary"))
            url = urljoin("https://cafef.vn", match.group("href").strip())
            published_at = match.group("time").strip() or None

            if not title or not url:
                continue

            items.append(
                CafeFNewsArticle(
                    title=title,
                    summary=summary,
                    url=url,
                    published_at=published_at,
                )
            )

        seen: set[str] = set()
        unique_items: list[CafeFNewsArticle] = []
        for item in items:
            key = f"{item.title}|{item.url}"
            if key in seen:
                continue
            seen.add(key)
            unique_items.append(item)

        return unique_items

    def _filter_items(self, items: list[CafeFNewsArticle], search: str) -> list[CafeFNewsArticle]:
        if not search:
            return list(items)

        filtered: list[CafeFNewsArticle] = []
        for item in items:
            haystack = f"{item.title} {item.summary}".lower()
            if search in haystack:
                filtered.append(item)
        return filtered

    async def _persist_items(self, repo: MarketReadRepository, items: list[CafeFNewsArticle]) -> None:
        payload = [
            {
                "source": item.source,
                "title": item.title,
                "summary": item.summary,
                "url": item.url,
                "published_at": self._parse_published_at(item.published_at),
                "published_text": item.published_at,
                "raw_json": {
                    "title": item.title,
                    "summary": item.summary,
                    "url": item.url,
                    "published_at": item.published_at,
                    "source": item.source,
                },
            }
            for item in items
        ]
        await repo.upsert_news_articles(payload)
        await repo.session.commit()

    def _from_db_item(self, item: Any) -> CafeFNewsArticle:
        published_text = getattr(item, "published_text", None)
        published_at = getattr(item, "published_at", None)
        return CafeFNewsArticle(
            title=getattr(item, "title", ""),
            summary=getattr(item, "summary", "") or "",
            url=getattr(item, "url", ""),
            published_at=published_text or self._to_display_time(published_at),
            source=getattr(item, "source", "CafeF"),
        )

    def _parse_published_at(self, value: str | None) -> datetime | None:
        text = (value or "").strip()
        if not text:
            return None

        normalized = text.replace("h", ":").replace("H", ":")
        patterns = [
            "%d/%m/%Y %H:%M",
            "%d-%m-%Y %H:%M",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
        ]

        matched = re.search(r"(\d{1,2}[/-]\d{1,2}[/-]\d{4})(?:\s+(\d{1,2}:\d{2}))?", normalized)
        if matched:
            date_part = matched.group(1).replace("-", "/")
            time_part = matched.group(2) or "00:00"
            candidate = f"{date_part} {time_part}"
            try:
                return datetime.strptime(candidate, "%d/%m/%Y %H:%M")
            except ValueError:
                pass

        for pattern in patterns:
            try:
                return datetime.strptime(normalized, pattern)
            except ValueError:
                continue
        return None

    def _to_display_time(self, value: datetime | None) -> str | None:
        if value is None:
            return None
        return value.strftime("%d/%m/%Y %H:%M")

    def _clean_text(self, value: str) -> str:
        text = self.TAG_PATTERN.sub(" ", value)
        text = unescape(text)
        text = self.SPACE_PATTERN.sub(" ", text)
        return text.strip()

    def to_news_payload(self, item: CafeFNewsArticle, index: int) -> dict[str, Any]:
        return {
            "id": f"cafef-{index}",
            "title": item.title,
            "summary": item.summary or None,
            "date": item.published_at or "",
            "capturedAt": item.published_at,
            "url": item.url,
            "source": item.source,
        }
