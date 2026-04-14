"""辅助模型路由器。

参考 Hermes Agent 的 auxiliary_client.py，实现多模型路由与任务分离：
- 角色创意发言 → 主模型（高 temperature）
- 裁判/评估/书记员 → 严谨便宜模型（低 temperature）
- 消息摘要 → 快速小模型

支持：
1. 按任务类型自动路由到最优模型
2. 辅助模型不可用时降级到主模型
3. 每个 LLMConfig 可配置辅助模型 ID
4. 统一的客户端缓存与连接池管理
"""

from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from openai import AsyncOpenAI

logger = logging.getLogger("idearound.model_router")

# ── 任务类型定义 ──────────────────────────────────────────────────────

class TaskType:
    """LLM 任务类型枚举"""
    ROLE_CREATIVE = "role_creative"        # 角色创意发言
    JUDGE_EVALUATE = "judge_evaluate"      # 裁判评估
    SCRIBE_SUMMARY = "scribe_summary"      # 书记员摘要
    MESSAGE_SUMMARY = "message_summary"    # 消息摘要（单条）
    CONTEXT_COMPRESS = "context_compress"  # 上下文压缩
    HOST_DECIDE = "host_decide"            # 主持人决策


# ── 任务类型到默认参数的映射 ────────────────────────────────────────────

_TASK_DEFAULTS: Dict[str, Dict[str, Any]] = {
    TaskType.ROLE_CREATIVE: {
        "temperature": 0.7,
        "description": "角色创意发言",
        "prefer_fast_model": False,
    },
    TaskType.JUDGE_EVALUATE: {
        "temperature": 0.1,
        "description": "裁判评估",
        "prefer_fast_model": True,
    },
    TaskType.SCRIBE_SUMMARY: {
        "temperature": 0.1,
        "description": "书记员共识板",
        "prefer_fast_model": True,
    },
    TaskType.MESSAGE_SUMMARY: {
        "temperature": 0.1,
        "description": "消息摘要",
        "prefer_fast_model": True,
        "max_tokens_override": 300,
    },
    TaskType.CONTEXT_COMPRESS: {
        "temperature": 0.1,
        "description": "上下文压缩",
        "prefer_fast_model": True,
    },
    TaskType.HOST_DECIDE: {
        "temperature": 0.1,
        "description": "主持人决策",
        "prefer_fast_model": True,
    },
}


# ── OpenAI 客户端缓存 ────────────────────────────────────────────────

_client_cache: Dict[str, AsyncOpenAI] = {}
_CLIENT_CACHE_MAX = 15


def _get_or_create_client(api_key: str, api_base: Optional[str] = None) -> AsyncOpenAI:
    """获取或创建 AsyncOpenAI 客户端，复用 HTTP 连接池"""
    cache_key = f"{api_key[:8]}:{api_base or ''}"
    client = _client_cache.get(cache_key)
    if client is not None:
        return client
    if len(_client_cache) >= _CLIENT_CACHE_MAX:
        oldest_key = next(iter(_client_cache))
        _client_cache.pop(oldest_key, None)
    client = AsyncOpenAI(api_key=api_key, base_url=api_base or None)
    _client_cache[cache_key] = client
    return client


# ── 模型路由器 ────────────────────────────────────────────────────────

class ModelRouter:
    """辅助模型路由器，按任务类型路由到最优模型。

    路由逻辑：
    1. 角色创意发言 → 主模型（用户配置的 model_id）
    2. 裁判/书记员/摘要等 → 辅助模型（如果配置了 auxiliary_model_id）
    3. 辅助模型不可用 → 降级到主模型

    辅助模型 ID 存储在 LLMConfig 表的扩展字段中，
    或通过 roundtable_config 表的 auxiliary_model_id 配置。
    """

    def __init__(self):
        # 辅助模型配置缓存: model_id -> auxiliary_settings
        self._auxiliary_cache: Dict[int, Dict[str, Any]] = {}
        self._cache_time: float = 0
        self._cache_ttl: float = 300  # 5 分钟

    async def load_auxiliary_model(self, auxiliary_model_id: Optional[int]) -> Optional[Dict[str, Any]]:
        """加载辅助模型配置"""
        if not auxiliary_model_id:
            return None

        try:
            from app.core.database import AsyncSessionLocal
            from app.models.llm import LLMConfig
            from sqlalchemy import select
        except ImportError:
            from backend.app.core.database import AsyncSessionLocal
            from backend.app.models.llm import LLMConfig
            from sqlalchemy import select

        try:
            async with AsyncSessionLocal() as db:
                result = await db.execute(
                    select(LLMConfig).where(
                        LLMConfig.id == auxiliary_model_id,
                        LLMConfig.is_active.is_(True),
                    )
                )
                config = result.scalars().first()
                if not config or not config.api_key:
                    return None
                return {
                    "api_key": config.api_key,
                    "api_base": config.api_base,
                    "model_name": config.model_name,
                    "temperature": config.temperature,
                    "max_tokens": config.max_tokens,
                    "top_p": config.top_p,
                    "context_length": config.context_length,
                    "frequency_penalty": config.frequency_penalty,
                    "presence_penalty": config.presence_penalty,
                }
        except Exception as e:
            logger.warning("加载辅助模型 %d 失败: %s", auxiliary_model_id, e)
            return None

    def resolve_settings(
        self,
        main_settings: Dict[str, Any],
        auxiliary_settings: Optional[Dict[str, Any]],
        task_type: str,
        temperature_override: Optional[float] = None,
    ) -> Dict[str, Any]:
        """根据任务类型解析最优模型设置。

        Args:
            main_settings: 主模型设置
            auxiliary_settings: 辅助模型设置（可能为 None）
            task_type: 任务类型
            temperature_override: 温度覆盖

        Returns:
            解析后的模型设置字典
        """
        task_defaults = _TASK_DEFAULTS.get(task_type, {})
        prefer_fast = task_defaults.get("prefer_fast_model", False)

        # 选择模型：需要快速模型的任务优先使用辅助模型
        if prefer_fast and auxiliary_settings:
            resolved = dict(auxiliary_settings)
            source = "auxiliary"
        else:
            resolved = dict(main_settings)
            source = "main"

        # 温度：覆盖 > 任务默认 > 模型默认
        if temperature_override is not None:
            resolved["temperature"] = temperature_override
        elif task_defaults.get("temperature") is not None:
            resolved["temperature"] = task_defaults["temperature"]
        # 否则使用模型自身的 temperature

        # max_tokens 覆盖
        max_tokens_override = task_defaults.get("max_tokens_override")
        if max_tokens_override and not resolved.get("max_tokens"):
            resolved["max_tokens"] = max_tokens_override

        resolved["_source"] = source
        resolved["_task_type"] = task_type

        return resolved

    async def get_settings_for_task(
        self,
        main_settings: Dict[str, Any],
        auxiliary_model_id: Optional[int],
        task_type: str,
        temperature_override: Optional[float] = None,
    ) -> Dict[str, Any]:
        """获取指定任务类型的模型设置（含辅助模型加载与降级）。

        Args:
            main_settings: 主模型设置
            auxiliary_model_id: 辅助模型 ID（可能为 None）
            task_type: 任务类型
            temperature_override: 温度覆盖

        Returns:
            解析后的模型设置字典
        """
        auxiliary_settings = await self.load_auxiliary_model(auxiliary_model_id)
        resolved = self.resolve_settings(
            main_settings, auxiliary_settings, task_type, temperature_override,
        )

        logger.debug(
            "模型路由: task=%s → %s (model=%s, temp=%.2f)",
            task_type, resolved["_source"], resolved.get("model_name"), resolved.get("temperature", 0),
        )

        return resolved


# ── 全局单例 ──────────────────────────────────────────────────────────

_model_router: Optional[ModelRouter] = None


def get_model_router() -> ModelRouter:
    """获取全局模型路由器单例"""
    global _model_router
    if _model_router is None:
        _model_router = ModelRouter()
    return _model_router
