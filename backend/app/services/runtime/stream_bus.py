"""流式推送与事件总线。

将 SSE 推送、Redis Pub/Sub 广播、任务状态缓存等逻辑
从 runtime_service.py 中提取为独立模块。

职责：
1. 进程内 Queue 管理（本 Worker SSE 推送）
2. Redis Pub/Sub 跨 Worker 广播
3. SSE 消息格式化
4. 任务取消事件管理
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger("idearound.stream_bus")

# ── 进程内 SSE 队列 ──────────────────────────────────────────────────

# task_id -> [Queue, ...]
TASK_STREAM_QUEUES: Dict[str, List[asyncio.Queue[Dict[str, Any]]]] = {}


def subscribe(task_id: str) -> asyncio.Queue[Dict[str, Any]]:
    """订阅任务流事件，返回一个 Queue"""
    queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
    TASK_STREAM_QUEUES.setdefault(task_id, []).append(queue)
    return queue


def unsubscribe(task_id: str, queue: asyncio.Queue[Dict[str, Any]]) -> None:
    """取消订阅"""
    queues = TASK_STREAM_QUEUES.get(task_id)
    if not queues:
        return
    TASK_STREAM_QUEUES[task_id] = [q for q in queues if q is not queue]
    if not TASK_STREAM_QUEUES[task_id]:
        TASK_STREAM_QUEUES.pop(task_id, None)


# ── 事件发布 ──────────────────────────────────────────────────────────

async def publish(
    task_id: str,
    event_type: str,
    task_payload: Dict[str, Any],
) -> None:
    """发布任务流事件。

    1) 本 Worker 内的 Queue 推送（低延迟）
    2) 跨 Worker 广播（Redis Pub/Sub）
    """
    event_message = {"event": event_type, "task": task_payload}

    # 1) 进程内 Queue
    queues = TASK_STREAM_QUEUES.get(task_id, [])
    stale: List[asyncio.Queue[Dict[str, Any]]] = []
    for q in queues:
        try:
            q.put_nowait(event_message)
        except asyncio.QueueFull:
            stale.append(q)
    for q in stale:
        unsubscribe(task_id, q)

    # 2) Redis Pub/Sub
    try:
        from app.core.redis_client import is_redis_available, publish_event, TASK_CHANNEL_PREFIX
    except ImportError:
        from backend.app.core.redis_client import is_redis_available, publish_event, TASK_CHANNEL_PREFIX

    if is_redis_available():
        await publish_event(f"{TASK_CHANNEL_PREFIX}{task_id}", event_message)


# ── SSE 格式化 ────────────────────────────────────────────────────────

def format_sse(event: str, data: Dict[str, Any]) -> str:
    """格式化 SSE 消息"""
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


# ── 任务取消事件 ──────────────────────────────────────────────────────

_cancel_events: Dict[str, asyncio.Event] = {}


def register_cancel_event(task_id: str) -> asyncio.Event:
    """注册一个可等待的取消事件"""
    event = asyncio.Event()
    _cancel_events[task_id] = event
    return event


def signal_cancel(task_id: str) -> None:
    """发出取消信号"""
    event = _cancel_events.get(task_id)
    if event:
        event.set()


def unregister_cancel_event(task_id: str) -> None:
    """清理取消事件"""
    _cancel_events.pop(task_id, None)


def is_cancel_signaled(task_id: str) -> bool:
    """检查取消事件是否已触发"""
    event = _cancel_events.get(task_id)
    return event.is_set() if event else False


class StreamBus:
    """兼容旧调用方的轻量包装类。

    该模块已函数化实现；此类仅提供稳定导出符号，避免
    `from .stream_bus import StreamBus` 在重构过渡期失败。
    """

    @staticmethod
    def subscribe(task_id: str) -> asyncio.Queue[Dict[str, Any]]:
        return subscribe(task_id)

    @staticmethod
    def unsubscribe(task_id: str, queue: asyncio.Queue[Dict[str, Any]]) -> None:
        unsubscribe(task_id, queue)

    @staticmethod
    async def publish(task_id: str, event_type: str, task_payload: Dict[str, Any]) -> None:
        await publish(task_id, event_type, task_payload)

    @staticmethod
    def format_sse(event: str, data: Dict[str, Any]) -> str:
        return format_sse(event, data)

    @staticmethod
    def register_cancel_event(task_id: str) -> asyncio.Event:
        return register_cancel_event(task_id)

    @staticmethod
    def signal_cancel(task_id: str) -> None:
        signal_cancel(task_id)

    @staticmethod
    def unregister_cancel_event(task_id: str) -> None:
        unregister_cancel_event(task_id)

    @staticmethod
    def is_cancel_signaled(task_id: str) -> bool:
        return is_cancel_signaled(task_id)
