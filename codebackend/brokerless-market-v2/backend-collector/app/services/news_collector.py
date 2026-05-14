from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from html import unescape
import re
from urllib.parse import urljoin
from urllib.request import Request, urlopen

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.logging import get_logger
from app.repositories.market_repo import MarketRepository
from app.services.sync_log_service import write_sync_log_safely

logger = get_logger(__name__)


@dataclass(slots=True)
class CafeFNewsArticle:
    title: str
    summary: str
    url: str
    published_at: str | None
    source: str = "CafeF"


class NewsCollector:
    ITEM_PATTERN = re.compile(
        r'<div class="tlitem box-category-item"[^>]*>.*?'
        r"<h3>\s*<a href=\"(?P<href>[^\"]+)\">(?P<title>.*?)</a>\s*</h3>.*?"
        r'<span class="time time-ago"[^>]*title="(?P<time>[^"]+)".*?</span>.*?'
        r'<p class="sapo box-category-sapo"[^>]*>(?P<summary>.*?)</p>',
        re.IGNORECASE | re.DOTALL,
    )
    TAG_PATTERN = re.compile(r"<[^>]+>")
    SPACE_PATTERN = re.compile(r"\s+")

    async def run(self) -> None:
        started_at = datetime.now()
        async with SessionLocal() as session:
            repo = MarketRepository(session)
            try:
                items = self._fetch_items_sync()
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
                        "captured_at": datetime.now(),
                        "updated_at": datetime.now(),
                    }
                    for item in items
                ]
                await repo.upsert_news_articles(payload)
                await repo.create_sync_log(
                    job_name="collect_news",
                    status="success",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=f"collected CafeF news items: {len(items)}",
                    extra_json={
                        "source": "CafeF",
                        "items_in_batch": len(items),
                        "items_resolved": len(items),
                        "url": settings.cafef_news_url,
                    },
                )
                await session.commit()
                logger.info("collected CafeF news items: %s", len(items))
            except Exception as exc:
                await session.rollback()
                await write_sync_log_safely(
                    job_name="collect_news",
                    status="error",
                    started_at=started_at,
                    finished_at=datetime.now(),
                    message=str(exc),
                    extra_json={"source": "CafeF", "url": settings.cafef_news_url},
                )
                logger.exception("collect_news failed")

    def _fetch_items_sync(self) -> list[CafeFNewsArticle]:
        request = Request(
            settings.cafef_news_url,
            headers={
                "User-Agent": settings.cafef_news_user_agent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )

        with urlopen(request, timeout=settings.cafef_news_timeout_seconds) as response:
            html = response.read().decode("utf-8", errors="ignore")
        return self._parse_items(html)

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

        unique_items: list[CafeFNewsArticle] = []
        seen: set[str] = set()
        for item in items:
            key = f"{item.title}|{item.url}"
            if key in seen:
                continue
            seen.add(key)
            unique_items.append(item)
        return unique_items

    def _parse_published_at(self, value: str | None) -> datetime | None:
        text = (value or "").strip()
        if not text:
            return None

        normalized = text.replace("h", ":").replace("H", ":")
        matched = re.search(r"(\d{1,2}[/-]\d{1,2}[/-]\d{4})(?:\s+(\d{1,2}:\d{2}))?", normalized)
        if matched:
            date_part = matched.group(1).replace("-", "/")
            time_part = matched.group(2) or "00:00"
            try:
                return datetime.strptime(f"{date_part} {time_part}", "%d/%m/%Y %H:%M")
            except ValueError:
                return None
        return None

    def _clean_text(self, value: str) -> str:
        text = self.TAG_PATTERN.sub(" ", value)
        text = unescape(text)
        text = self.SPACE_PATTERN.sub(" ", text)
        return text.strip()
