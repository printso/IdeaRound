# Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
"""
Redis 客户端管理模块。

提供异步 Redis 连接池与生命周期管理，用于：
- 任务流 Pub/Sub（多 Worker 共享 SSE 事件）
- 消息摘要缓存（带 TTL + LRU 淘汰）
- 任务状态缓存

时间复杂度：所有操作均为 O(1)，依赖 Redis 自身保证。
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, Optional

try:
    from backend.app.core.config import settings
except ImportError:
    from app.core.config import settings

logger = logging.getLogger("idearound.redis")

_redis_pool: Optional[Any] = None
_pubsub_redis: Optional[Any] = None

CACHE_PREFIX = "idearound:"
TASK_STATE_PREFIX = f"{CACHE_PREFIX}task_state:"
SUMMARY_CACHE_PREFIX = f"{CACHE_PREFIX}msg_summary:"
TASK_CHANNEL_PREFIX = f"{CACHE_PREFIX}task_stream:"

TASK_STATE_TTL_SECONDS = 3600
SUMMARY_CACHE_TTL_SECONDS = 86400


async def init_redis() -> bool:
    """
    初始化 Redis 连接池。在应用启动时调用。

    Returns:
        是否成功连接 Redis。
    """
    global _redis_pool
    if not settings.redis_enabled:
        logger.info("Redis 未配置，使用进程内存缓存（仅适用于单 Worker）")
        return False

    try:
        import redis.asyncio as aioredis

        _redis_pool = aioredis.Redis(
            host=settings.REDIS_HOST,
            port=settings.REDIS_PORT,
            password=settings.REDIS_PASSWORD or None,
            db=settings.REDIS_DB,
            ssl=settings.REDIS_SSL,
            decode_responses=True,
            max_connections=20,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
        )
        await _redis_pool.ping()
        logger.info(f"Redis 连接成功: {settings.REDIS_HOST}:{settings.REDIS_PORT}")
        return True
    except Exception as exc:
        logger.warning(f"Redis 连接失败，降级到进程内存缓存: {exc}")
        _redis_pool = None
        return False


async def close_redis() -> None:
    """关闭 Redis 连接池。在应用关闭时调用。"""
    global _redis_pool, _pubsub_redis
    if _pubsub_redis:
        await _pubsub_redis.close()
        _pubsub_redis = None
    if _redis_pool:
        await _redis_pool.close()
        _redis_pool = None
        logger.info("Redis 连接已关闭")


def get_redis() -> Optional[Any]:
    """获取 Redis 客户端实例（可能为 None 表示未启用）。"""
    return _redis_pool


def is_redis_available() -> bool:
    """判断 Redis 是否可用。"""
    return _redis_pool is not None


async def cache_get(key: str) -> Optional[Dict[str, Any]]:
    """
    从 Redis 或进程缓存获取 JSON 值。

    Args:
        key: 缓存键。

    Returns:
        解析后的字典，或 None。
    """
    if _redis_pool is None:
        return _FALLBACK_CACHE.get(key)
    try:
        raw = await _redis_pool.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.debug(f"Redis GET 失败 (key={key}): {exc}")
        return None


async def cache_set(key: str, value: Dict[str, Any], ttl_seconds: int = 3600) -> None:
    """
    将 JSON 值写入 Redis 或进程缓存。

    Args:
        key: 缓存键。
        value: 要缓存的字典。
        ttl_seconds: 过期时间（秒）。
    """
    if _redis_pool is None:
        _fallback_cache_set(key, value)
        return
    try:
        await _redis_pool.setex(key, ttl_seconds, json.dumps(value, ensure_ascii=False))
    except Exception as exc:
        logger.debug(f"Redis SET 失败 (key={key}): {exc}")
        _fallback_cache_set(key, value)


async def cache_delete(key: str) -> None:
    """删除缓存键。"""
    if _redis_pool is None:
        _FALLBACK_CACHE.pop(key, None)
        return
    try:
        await _redis_pool.delete(key)
    except Exception as exc:
        logger.debug(f"Redis DEL 失败 (key={key}): {exc}")


async def publish_event(channel: str, data: Dict[str, Any]) -> int:
    """
    向 Redis 频道发布事件（用于跨 Worker SSE 推送）。

    Args:
        channel: 频道名。
        data: 事件数据。

    Returns:
        接收到消息的订阅者数量。
    """
    if _redis_pool is None:
        return 0
    try:
        return await _redis_pool.publish(channel, json.dumps(data, ensure_ascii=False))
    except Exception as exc:
        logger.debug(f"Redis PUBLISH 失败 (channel={channel}): {exc}")
        return 0


async def subscribe_channel(channel: str):
    """
    订阅 Redis 频道，返回异步迭代器。

    Args:
        channel: 频道名。

    Yields:
        解析后的事件字典。
    """
    if _redis_pool is None:
        return

    import redis.asyncio as aioredis

    subscriber = _redis_pool.pubsub()
    await subscriber.subscribe(channel)
    try:
        async for raw_message in subscriber.listen():
            if raw_message["type"] == "message":
                try:
                    yield json.loads(raw_message["data"])
                except (json.JSONDecodeError, TypeError):
                    continue
    finally:
        await subscriber.unsubscribe(channel)
        await subscriber.close()


# ---------------------------------------------------------------------------
# 进程内降级缓存（单 Worker 场景或 Redis 不可用时）
# 使用 LRU 策略限制大小，防止内存泄漏
# ---------------------------------------------------------------------------
_FALLBACK_CACHE: Dict[str, Any] = {}
_FALLBACK_CACHE_MAX_SIZE = 2000
_FALLBACK_CACHE_ORDER: list[str] = []


def _fallback_cache_set(key: str, value: Any) -> None:
    """带 LRU 淘汰的进程内缓存写入。"""
    if key in _FALLBACK_CACHE:
        _FALLBACK_CACHE_ORDER.remove(key)
    elif len(_FALLBACK_CACHE) >= _FALLBACK_CACHE_MAX_SIZE:
        evicted = _FALLBACK_CACHE_ORDER.pop(0)
        _FALLBACK_CACHE.pop(evicted, None)
    _FALLBACK_CACHE[key] = value
    _FALLBACK_CACHE_ORDER.append(key)


def fallback_cache_get(key: str) -> Optional[Any]:
    """进程内缓存读取。"""
    return _FALLBACK_CACHE.get(key)
