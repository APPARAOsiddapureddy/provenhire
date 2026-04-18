from __future__ import annotations

import asyncio
import json
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class InterviewTelemetry:
    """
    Append-only per-session interview trace.

    Each event is stored as one JSON object per line so traces remain readable,
    tail-able, and resilient to partial writes.
    """

    def __init__(self) -> None:
        self.root = Path(__file__).resolve().parents[1] / "runtime" / "interview_traces"
        self.root.mkdir(parents=True, exist_ok=True)
        self._locks: dict[str, asyncio.Lock] = {}

    def _lock_for(self, session_id: str) -> asyncio.Lock:
        return self._locks.setdefault(session_id or "unknown", asyncio.Lock())

    def trace_path(self, session_id: str) -> Path:
        safe = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in (session_id or "unknown"))
        return self.root / f"{safe}.jsonl"

    def _append_record(self, path: Path, record: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=True, default=str) + "\n")

    async def log(
        self,
        session_id: str,
        event: str,
        *,
        source: str = "backend",
        level: str = "info",
        **fields: Any,
    ) -> dict[str, Any]:
        record = {
            "ts": round(time.time(), 3),
            "iso_ts": datetime.now(timezone.utc).isoformat(),
            "session_id": session_id,
            "source": source,
            "event": event,
            "level": level,
            **fields,
        }
        async with self._lock_for(session_id):
            await asyncio.to_thread(self._append_record, self.trace_path(session_id), record)
        return record

    def _read_records(self, path: Path) -> list[dict[str, Any]]:
        if not path.exists():
            return []
        records: list[dict[str, Any]] = []
        with path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    parsed = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(parsed, dict):
                    records.append(parsed)
        return records

    async def get_events(self, session_id: str, limit: int = 500) -> list[dict[str, Any]]:
        records = await asyncio.to_thread(self._read_records, self.trace_path(session_id))
        if limit <= 0:
            return records
        return records[-limit:]

    async def summarize(self, session_id: str, limit: int = 500) -> dict[str, Any]:
        events = await self.get_events(session_id, limit=0)
        event_counts = Counter(event.get("event", "unknown") for event in events)
        source_counts = Counter(event.get("source", "unknown") for event in events)
        route_counts = Counter(
            event.get("route_kind")
            for event in events
            if isinstance(event.get("route_kind"), str) and event.get("route_kind")
        )
        provider_counts = Counter(
            event.get("provider") or event.get("provider_used")
            for event in events
            if (event.get("provider") or event.get("provider_used"))
        )

        max_metrics: dict[str, float] = {}
        latest_metrics: dict[str, float] = {}
        for event in events:
            for key, value in event.items():
                if not key.endswith("_ms"):
                    continue
                if not isinstance(value, (int, float)):
                    continue
                numeric = round(float(value), 3)
                previous = max_metrics.get(key)
                if previous is None or numeric > previous:
                    max_metrics[key] = numeric
                latest_metrics[key] = numeric

        issues = [
            event
            for event in events
            if event.get("level") in {"warn", "error"}
            or event.get("fallback_used")
            or event.get("stalled")
            or any(token in str(event.get("event", "")) for token in ("fail", "error", "discard", "skip", "stale"))
        ]

        return {
            "session_id": session_id,
            "trace_path": str(self.trace_path(session_id)),
            "event_count": len(events),
            "sources": dict(source_counts),
            "events": dict(event_counts),
            "route_kinds": dict(route_counts),
            "providers": dict(provider_counts),
            "max_metrics_ms": max_metrics,
            "latest_metrics_ms": latest_metrics,
            "first_event_at": events[0]["iso_ts"] if events else None,
            "last_event_at": events[-1]["iso_ts"] if events else None,
            "recent_events": events[-limit:] if limit > 0 else events[-200:],
            "issues": issues[-50:],
        }


interview_telemetry = InterviewTelemetry()
