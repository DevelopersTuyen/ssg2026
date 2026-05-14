from __future__ import annotations

import re
import json
from datetime import datetime
from dataclasses import dataclass
from html import unescape
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@dataclass
class CafeFFinancialResult:
    rows: list[dict[str, Any]]
    raw: Any
    source: str = "CAFEF"
    errors: list[str] | None = None


class CafeFFinancialClient:
    def __init__(self) -> None:
        self.base_url = "https://cafef.vn/du-lieu/Ajax/PageNew"
        self.timeout_seconds = max(5, int(settings.cafef_financial_timeout_seconds))
        self.user_agent = settings.cafef_financial_user_agent

    def get_financial_statement(
        self,
        *,
        symbol: str,
        statement_type: str,
        period: str = "quarter",
    ) -> CafeFFinancialResult:
        normalized_symbol = symbol.strip().lower()
        errors: list[str] = []

        try:
            if statement_type == "income_statement":
                raw = self._fetch_finance_report(
                    symbol=normalized_symbol,
                    report_type=1,
                    period=period,
                )
                return CafeFFinancialResult(
                    rows=self._normalize_finance_report_rows(raw, period=period),
                    raw=raw,
                )

            if statement_type == "balance_sheet":
                raw = self._fetch_finance_report(
                    symbol=normalized_symbol,
                    report_type=2,
                    period=period,
                )
                return CafeFFinancialResult(
                    rows=self._normalize_finance_report_rows(raw, period=period),
                    raw=raw,
                )

            if statement_type == "cash_flow":
                last_raw: dict[str, Any] | None = None
                for report_type in (3, 4, 5):
                    try:
                        raw = self._fetch_finance_report(
                            symbol=normalized_symbol,
                            report_type=report_type,
                            period=period,
                        )
                        last_raw = raw
                        rows = self._normalize_finance_report_rows(raw, period=period)
                        if rows:
                            return CafeFFinancialResult(
                                rows=rows,
                                raw=raw,
                            )
                        errors.append(f"Type {report_type}: empty response")
                    except Exception as exc:
                        errors.append(f"Type {report_type}: {exc}")
                try:
                    scraped = self._fetch_cash_flow_html(
                        symbol=normalized_symbol,
                        period=period,
                    )
                    if scraped.rows:
                        scraped.errors = [*(errors or []), *(scraped.errors or [])]
                        return scraped
                except Exception as exc:
                    errors.append(f"HTML cash flow fallback: {exc}")
                return CafeFFinancialResult(rows=[], raw=last_raw, errors=errors)

            if statement_type == "ratio":
                raw = self._fetch_ratio_report(
                    symbol=normalized_symbol,
                    period=period,
                )
                return CafeFFinancialResult(
                    rows=self._normalize_finance_report_rows(raw, period=period),
                    raw=raw,
                )

            if statement_type == "note":
                raw = self._fetch_report_files(symbol=normalized_symbol)
                return CafeFFinancialResult(
                    rows=self._normalize_report_file_rows(raw),
                    raw=raw,
                )
        except Exception as exc:
            errors.append(str(exc))
            logger.warning(
                "cafef financial fallback failed | symbol=%s | statement=%s | period=%s | err=%s",
                symbol,
                statement_type,
                period,
                exc,
            )

        return CafeFFinancialResult(rows=[], raw=None, errors=errors)

    def _fetch_finance_report(self, *, symbol: str, report_type: int, period: str) -> dict[str, Any]:
        params = {
            "Type": report_type,
            "Symbol": symbol,
            "TotalRow": 24,
            "EndDate": "4-2026" if period == "quarter" else "2026",
            "ReportType": self._cafef_period(period),
            "Sort": "DESC",
        }
        return self._get_json("FinanceReport.ashx", params)

    def _fetch_ratio_report(self, *, symbol: str, period: str) -> dict[str, Any]:
        params = {
            "Symbol": symbol,
            "TotalRow": 24,
            "EndDate": "2026",
            "ReportType": self._cafef_period(period),
            "Sort": "DESC",
        }
        return self._get_json("GetDataChiSoTaiChinh.ashx", params)

    def _fetch_report_files(self, *, symbol: str) -> dict[str, Any]:
        params = {
            "Symbol": symbol,
            "Type": 0,
            "Year": 0,
        }
        return self._get_json("FileBCTC.ashx", params)

    def _fetch_cash_flow_html(self, *, symbol: str, period: str) -> CafeFFinancialResult:
        current_year = datetime.now().year
        quarter = 4 if period.strip().lower() != "year" else 0
        errors: list[str] = []
        for year in range(current_year, current_year - 8, -1):
            url = (
                "https://cafef.vn/du-lieu/bao-cao-tai-chinh/"
                f"{symbol}/cashflow/{year}/{quarter}/0/0/1/luu-chuyen-tien-te-gian-tiep-.chn"
            )
            try:
                request = Request(url, headers={"User-Agent": self.user_agent})
                with urlopen(request, timeout=self.timeout_seconds) as response:
                    html = response.read().decode("utf-8", errors="ignore")
                rows = self._normalize_cash_flow_html_rows(html, period=period)
                if rows:
                    return CafeFFinancialResult(
                        rows=rows,
                        raw={"url": url, "html_length": len(html), "year": year},
                        source="CAFEF_HTML",
                        errors=errors,
                    )
                errors.append(f"HTML year {year}: empty")
            except Exception as exc:
                errors.append(f"HTML year {year}: {exc}")

        return CafeFFinancialResult(rows=[], raw=None, source="CAFEF_HTML", errors=errors)

    def _get_json(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        url = f"{self.base_url}/{path}?{urlencode(params)}"
        request = Request(url, headers={"User-Agent": self.user_agent})
        with urlopen(request, timeout=self.timeout_seconds) as response:
            payload = response.read().decode("utf-8", errors="ignore")
        data = json.loads(payload)
        if not isinstance(data, dict):
            raise RuntimeError(f"CafeF returned invalid response for {path}")
        return data

    def _normalize_finance_report_rows(self, payload: dict[str, Any], *, period: str) -> list[dict[str, Any]]:
        values = ((payload.get("Data") or {}).get("Value") or [])
        rows: list[dict[str, Any]] = []
        for report in values:
            fiscal_year = self._to_int(report.get("Year"))
            fiscal_quarter = self._to_int(report.get("Quater"))
            report_period = self._resolve_report_period(
                report.get("Time"),
                fiscal_year=fiscal_year,
                fiscal_quarter=fiscal_quarter,
                period=period,
            )
            for metric in report.get("Value") or []:
                rows.append(
                    {
                        "metricCode": metric.get("Code"),
                        "metricName": metric.get("Name"),
                        "value": metric.get("Value"),
                        "reportPeriod": report_period,
                        "periodType": period,
                        "fiscal_year": fiscal_year,
                        "fiscal_quarter": fiscal_quarter if fiscal_quarter not in (0, None) else None,
                        "raw": {
                            "report": report,
                            "metric": metric,
                        },
                    }
                )
        return rows

    def _normalize_report_file_rows(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        items = payload.get("Data") or []
        rows: list[dict[str, Any]] = []
        for item in items:
            name = str(item.get("Name") or "").strip()
            if not name:
                continue
            lowered = name.lower()
            if "báo cáo tài chính" not in lowered and "bctc" not in lowered:
                continue
            quarter = self._to_int(item.get("Quarter"))
            year = self._to_int(item.get("Year"))
            rows.append(
                {
                    "metricCode": item.get("id") or item.get("Link") or name,
                    "metricName": name,
                    "description": item.get("Link"),
                    "reportPeriod": item.get("Time") or self._resolve_report_period(
                        None,
                        fiscal_year=year,
                        fiscal_quarter=quarter if quarter not in (0, 5) else None,
                        period="quarter" if quarter not in (None, 5) else "year",
                    ),
                    "periodType": "quarter" if quarter not in (None, 0, 5) else "year",
                    "fiscal_year": year,
                    "fiscal_quarter": quarter if quarter not in (None, 0, 5) else None,
                    "raw": item,
                }
            )
        return rows

    def _normalize_cash_flow_html_rows(self, html: str, *, period: str) -> list[dict[str, Any]]:
        header_match = re.search(
            r'<table[^>]*id=["\']tblGridData["\'][^>]*>.*?</table>',
            html,
            re.IGNORECASE | re.DOTALL,
        )
        body_start = re.search(
            r'<table[^>]*id=["\']tableContent["\'][^>]*>',
            html,
            re.IGNORECASE | re.DOTALL,
        )
        if not header_match or not body_start:
            return []

        headers = [
            self._normalize_html_text(text)
            for text in re.findall(
                r'<td class="h_t"[^>]*>\s*(.*?)\s*</td>',
                header_match.group(0),
                re.IGNORECASE | re.DOTALL,
            )
        ]
        headers = [item for item in headers if item]
        if not headers:
            return []

        body_html = html[body_start.start() : body_start.start() + 200_000]

        rows: list[dict[str, Any]] = []
        row_starts = list(
            re.finditer(r"<tr\s+class=['\"]r_item[^>]*>", body_html, re.IGNORECASE | re.DOTALL)
        )
        for index, row_match in enumerate(row_starts):
            next_start = row_starts[index + 1].start() if index + 1 < len(row_starts) else len(body_html)
            row_html = body_html[row_match.start() : next_start]
            row_html = re.sub(
                r"<table class=['\"]BaoCaoTaiChinh_Chart['\"].*?</table>",
                "",
                row_html,
                flags=re.IGNORECASE | re.DOTALL,
            )
            cells = re.findall(r"<td\b[^>]*>(.*?)</td>", row_html, re.IGNORECASE | re.DOTALL)
            if len(cells) < len(headers) + 1:
                continue

            metric_label = self._normalize_html_text(cells[0])
            if not metric_label:
                continue

            for idx, header in enumerate(headers):
                raw_value = self._normalize_html_text(cells[idx + 1])
                if raw_value in ("", "-", "--"):
                    continue
                fiscal_year, fiscal_quarter, report_period = self._resolve_cafef_header_period(header, period=period)
                rows.append(
                    {
                        "metricCode": self._slugify(metric_label),
                        "metricName": metric_label,
                        "value": raw_value,
                        "reportPeriod": report_period,
                        "periodType": "quarter" if fiscal_quarter is not None else "year",
                        "fiscal_year": fiscal_year,
                        "fiscal_quarter": fiscal_quarter,
                        "raw": {
                            "header": header,
                            "value": raw_value,
                        },
                    }
                )
        return rows

    @staticmethod
    def _resolve_report_period(
        explicit: Any,
        *,
        fiscal_year: int | None,
        fiscal_quarter: int | None,
        period: str,
    ) -> str:
        text = str(explicit or "").strip()
        if text:
            return text
        if fiscal_year is not None and fiscal_quarter is not None:
            return f"Q{fiscal_quarter}-{fiscal_year}"
        if fiscal_year is not None:
            return str(fiscal_year)
        return f"{period}_latest"

    @staticmethod
    def _cafef_period(period: str) -> str:
        normalized = period.strip().lower()
        if normalized == "year":
            return "NAM"
        if normalized == "sauthang":
            return "SAUTHANG"
        return "QUY"

    @staticmethod
    def _normalize_html_text(value: Any) -> str:
        text = unescape(str(value or ""))
        text = re.sub(r"<br\s*/?>", " ", text, flags=re.IGNORECASE)
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
        return text

    @staticmethod
    def _resolve_cafef_header_period(header: str, *, period: str) -> tuple[int | None, int | None, str]:
        normalized = header.strip()
        quarter_match = re.search(r"qu[\w]*\s*(\d+)\s*-\s*(\d{4})", normalized, re.IGNORECASE)
        if quarter_match:
            quarter = int(quarter_match.group(1))
            year = int(quarter_match.group(2))
            return year, quarter, f"Q{quarter}-{year}"

        year_match = re.search(r"\b(\d{4})\b", normalized)
        if year_match:
            year = int(year_match.group(1))
            return year, None, str(year)

        fallback_period = period.strip().lower()
        return None, None, f"{fallback_period}_latest"

    @staticmethod
    def _slugify(value: str) -> str:
        lowered = value.lower().strip()
        lowered = re.sub(r"[^a-z0-9]+", "_", lowered)
        return lowered.strip("_") or "cash_flow_item"

    @staticmethod
    def _to_int(value: Any) -> int | None:
        if value in (None, "", "-", "--"):
            return None
        try:
            return int(float(str(value).replace(",", "").strip()))
        except Exception:
            return None
