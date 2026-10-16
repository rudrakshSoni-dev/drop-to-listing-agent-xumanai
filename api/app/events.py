"""In-process pub/sub for pipeline events, with per-drop history for SSE replay."""

import asyncio
import time
from collections import defaultdict
from typing import Any

TERMINAL = {"done", "error"}


class EventBus:
    def __init__(self) -> None:
        self._history: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self._subscribers: dict[str, set[asyncio.Queue[dict[str, Any]]]] = defaultdict(set)
        self._started: dict[str, float] = {}

    def reset(self, drop_id: str) -> None:
        self._history.pop(drop_id, None)
        self._started[drop_id] = time.monotonic()

    def has(self, drop_id: str) -> bool:
        return drop_id in self._history

    async def publish(self, drop_id: str, event: dict[str, Any]) -> None:
        started = self._started.setdefault(drop_id, time.monotonic())
        history = self._history[drop_id]
        event = {**event, "seq": len(history), "t": round((time.monotonic() - started) * 1000)}
        history.append(event)
        for queue in self._subscribers[drop_id]:
            queue.put_nowait(event)

    def subscribe(self, drop_id: str) -> tuple[list[dict[str, Any]], asyncio.Queue[dict[str, Any]]]:
        """Return the replay history plus a queue for everything after it."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self._subscribers[drop_id].add(queue)
        return list(self._history[drop_id]), queue

    def unsubscribe(self, drop_id: str, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._subscribers[drop_id].discard(queue)


bus = EventBus()
