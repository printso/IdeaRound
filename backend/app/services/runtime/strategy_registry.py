"""调度策略注册表。

将硬编码的角色调度逻辑（single_round_robin, single_random,
sequential_all, host_specify）提取为可插拔的策略注册表。

特性：
1. 每种调度模式独立注册，支持动态扩展
2. 策略函数签名统一：async (roles, context) -> List[role]
3. 支持从数据库加载自定义调度模式
4. 策略降级：自定义策略失败时回退到轮询
"""

from __future__ import annotations

import logging
import random
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("idearound.strategy_registry")

# ── 策略上下文 ────────────────────────────────────────────────────────

class SchedulingContext:
    """调度上下文，传递给策略函数。"""

    def __init__(
        self,
        *,
        current_round: int = 0,
        memory_summary: str = "",
        current_messages: Optional[List[Dict[str, Any]]] = None,
        scheduling_mode: str = "single_round_robin",
        call_llm_json_func: Optional[Callable] = None,
    ):
        self.current_round = current_round
        self.memory_summary = memory_summary
        self.current_messages = current_messages or []
        self.scheduling_mode = scheduling_mode
        self.call_llm_json_func = call_llm_json_func


# ── 策略函数类型 ──────────────────────────────────────────────────────

SchedulingStrategy = Callable[[List[Dict[str, Any]], SchedulingContext], Any]


# ── 内置策略 ──────────────────────────────────────────────────────────

async def _round_robin_strategy(
    roles: List[Dict[str, Any]],
    context: SchedulingContext,
) -> List[Dict[str, Any]]:
    """轮询策略：按索引轮流发言"""
    role_index = context.current_round % len(roles)
    return [roles[role_index]]


async def _random_strategy(
    roles: List[Dict[str, Any]],
    context: SchedulingContext,
) -> List[Dict[str, Any]]:
    """随机策略：随机选择一个角色发言"""
    return [random.choice(roles)]


async def _sequential_all_strategy(
    roles: List[Dict[str, Any]],
    context: SchedulingContext,
) -> List[Dict[str, Any]]:
    """顺序全发言策略：所有角色依次发言"""
    return list(roles)


async def _host_specify_strategy(
    roles: List[Dict[str, Any]],
    context: SchedulingContext,
) -> List[Dict[str, Any]]:
    """主持人指定策略：由 LLM 决定下一位发言人"""
    if not context.call_llm_json_func:
        # 降级到轮询
        logger.warning("host_specify 策略缺少 call_llm_json_func，降级到轮询")
        return await _round_robin_strategy(roles, context)

    role_names = [r.get("name", "未知") for r in roles]
    import json
    prompt = (
        f"【讨论摘要】\n{context.memory_summary or '暂无摘要'}\n\n"
        f"【候选角色】\n{json.dumps(role_names, ensure_ascii=False)}\n\n"
        "请根据讨论进展，决定下一位最适合发言的角色。\n"
        '严格输出 JSON：{{"chosen_role": "角色名"}}'
    )
    system_prompt = "你是一个会议主持人，只负责指定下一位发言人。只输出 JSON。"

    try:
        host_result = await context.call_llm_json_func(prompt, system_prompt)
        chosen_name = str(host_result.get("chosen_role", "")).strip()

        # 精确匹配
        chosen_role = next((r for r in roles if r.get("name", "") == chosen_name), None)

        # 模糊匹配
        if not chosen_role and chosen_name:
            chosen_role = next(
                (r for r in roles if r.get("name", "") in chosen_name or chosen_name in r.get("name", "")),
                None,
            )

        # 未匹配，降级到轮询
        if not chosen_role:
            fallback_idx = context.current_round % len(roles)
            chosen_role = roles[fallback_idx]

        return [chosen_role]
    except Exception as e:
        logger.warning("host_specify 策略失败，降级到轮询: %s", e)
        return await _round_robin_strategy(roles, context)


# ── 调度策略注册表 ────────────────────────────────────────────────────

class StrategyRegistry:
    """调度策略注册表，支持动态注册和替换"""

    def __init__(self):
        self._strategies: Dict[str, SchedulingStrategy] = {}
        self._register_defaults()

    def _register_defaults(self) -> None:
        """注册默认调度策略"""
        self.register("single_round_robin", _round_robin_strategy)
        self.register("single_random", _random_strategy)
        self.register("sequential_all", _sequential_all_strategy)
        self.register("host_specify", _host_specify_strategy)

    def register(self, name: str, strategy: SchedulingStrategy) -> None:
        """注册调度策略"""
        self._strategies[name] = strategy
        logger.debug("注册调度策略: %s", name)

    def get(self, name: str) -> Optional[SchedulingStrategy]:
        """获取指定名称的策略"""
        return self._strategies.get(name)

    async def resolve(
        self,
        mode: str,
        roles: List[Dict[str, Any]],
        context: SchedulingContext,
    ) -> tuple:
        """根据调度模式解析发言角色。

        Returns:
            (speaking_roles, schedule_reason)
        """
        strategy = self._strategies.get(mode)
        if strategy is None:
            logger.warning("未知调度模式 %s，使用轮询降级", mode)
            strategy = self._strategies["single_round_robin"]
            mode = "single_round_robin"

        try:
            result = await strategy(roles, context)
            return result, mode
        except Exception as e:
            logger.warning("策略 %s 执行失败，降级到轮询: %s", mode, e)
            fallback = await _round_robin_strategy(roles, context)
            return fallback, "single_round_robin"

    def list_strategies(self) -> List[str]:
        """列出所有已注册的策略名称"""
        return list(self._strategies.keys())


# ── 全局单例 ──────────────────────────────────────────────────────────

_strategy_registry: Optional[StrategyRegistry] = None


def get_strategy_registry() -> StrategyRegistry:
    """获取全局调度策略注册表"""
    global _strategy_registry
    if _strategy_registry is None:
        _strategy_registry = StrategyRegistry()
    return _strategy_registry
