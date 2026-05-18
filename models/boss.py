from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo


BANGKOK_TZ = ZoneInfo("Asia/Bangkok")


def timestamp_to_bangkok(value: int | float | str | None) -> str:
    if value in (None, ""):
        return "-"
    try:
        return datetime.fromtimestamp(int(value), BANGKOK_TZ).strftime("%Y-%m-%d %H:%M:%S")
    except (TypeError, ValueError, OSError):
        return "-"


def safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


@dataclass(slots=True)
class Channel:
    channelNum: int
    lastDie: str
    lastRegen: str
    nextRegenFrom: int
    nextRegenTo: int
    nextRegenFromThai: str
    nextRegenToThai: str

    @classmethod
    def from_api(cls, payload: dict[str, Any]) -> "Channel":
        next_from = safe_int(payload.get("nextRegenFrom"))
        next_to = safe_int(payload.get("nextRegenTo"))
        return cls(
            channelNum=safe_int(payload.get("channelNum")),
            lastDie=str(payload.get("lastDie") or "-"),
            lastRegen=str(payload.get("lastRegen") or "-"),
            nextRegenFrom=next_from,
            nextRegenTo=next_to,
            nextRegenFromThai=timestamp_to_bangkok(next_from),
            nextRegenToThai=timestamp_to_bangkok(next_to),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "channelNum": self.channelNum,
            "lastDie": self.lastDie,
            "lastRegen": self.lastRegen,
            "nextRegenFrom": self.nextRegenFrom,
            "nextRegenTo": self.nextRegenTo,
            "nextRegenFromThai": self.nextRegenFromThai,
            "nextRegenToThai": self.nextRegenToThai,
        }


@dataclass(slots=True)
class Boss:
    kind: int
    name: str
    level: int
    category: str
    mapName: str
    lastDie: str
    lastRegen: str
    nextRegenFrom: int
    nextRegenTo: int
    nextRegenFromThai: str
    nextRegenToThai: str
    totalDeath: int
    channels: list[Channel] = field(default_factory=list)

    @classmethod
    def from_api(cls, payload: dict[str, Any]) -> "Boss":
        next_from = safe_int(payload.get("nextRegenFrom"))
        next_to = safe_int(payload.get("nextRegenTo"))
        channels = [Channel.from_api(channel) for channel in payload.get("channels", []) if isinstance(channel, dict)]

        return cls(
            kind=safe_int(payload.get("kind")),
            name=str(payload.get("name") or "Unknown Boss"),
            level=safe_int(payload.get("level")),
            category=str(payload.get("category") or "-"),
            mapName=str(payload.get("mapName") or "-"),
            lastDie=str(payload.get("lastDie") or "-"),
            lastRegen=str(payload.get("lastRegen") or "-"),
            nextRegenFrom=next_from,
            nextRegenTo=next_to,
            nextRegenFromThai=timestamp_to_bangkok(next_from),
            nextRegenToThai=timestamp_to_bangkok(next_to),
            totalDeath=safe_int(payload.get("totalDeath")),
            channels=channels,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "name": self.name,
            "level": self.level,
            "category": self.category,
            "mapName": self.mapName,
            "lastDie": self.lastDie,
            "lastRegen": self.lastRegen,
            "nextRegenFrom": self.nextRegenFrom,
            "nextRegenTo": self.nextRegenTo,
            "nextRegenFromThai": self.nextRegenFromThai,
            "nextRegenToThai": self.nextRegenToThai,
            "totalDeath": self.totalDeath,
            "channels": [channel.to_dict() for channel in self.channels],
        }
