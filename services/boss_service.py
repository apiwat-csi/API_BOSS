from __future__ import annotations

import logging
from typing import Any

import requests

from models import Boss


logger = logging.getLogger(__name__)


class BossApiError(RuntimeError):
    pass


class BossService:
    def __init__(self, api_url: str, timeout: float = 8) -> None:
        self.api_url = api_url
        self.timeout = timeout

    def fetch_bosses(self) -> list[Boss]:
        try:
            response = requests.get(self.api_url, timeout=self.timeout)
            response.raise_for_status()
        except requests.Timeout as exc:
            logger.warning("Boss API timeout: %s", exc)
            raise BossApiError("API timeout กรุณาลองใหม่อีกครั้ง") from exc
        except requests.RequestException as exc:
            logger.warning("Boss API unavailable: %s", exc)
            raise BossApiError("ไม่สามารถเชื่อมต่อ API ได้") from exc

        try:
            payload = response.json()
        except ValueError as exc:
            logger.warning("Boss API returned invalid JSON")
            raise BossApiError("API ส่งข้อมูล JSON ไม่ถูกต้อง") from exc

        boss_rows = self._extract_array(payload)
        bosses = [Boss.from_api(row) for row in boss_rows if isinstance(row, dict)]
        return sorted(bosses, key=lambda boss: boss.nextRegenFrom or 9_999_999_999)

    @staticmethod
    def _extract_array(payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, list):
            return payload
        if isinstance(payload, dict):
            data = payload.get("array")
            if isinstance(data, list):
                return data
            grouped_rows: list[dict[str, Any]] = []
            for key in ("field", "gold", "boss"):
                rows = payload.get(key)
                if isinstance(rows, list):
                    grouped_rows.extend(row for row in rows if isinstance(row, dict))
            if grouped_rows:
                return grouped_rows
        raise BossApiError("ไม่พบ field array จาก API")
