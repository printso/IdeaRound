"""圆桌讨论任务编排器。

从 runtime_service.py 的 _process_roundtable_task（约500行）提取为独立编排器，
集成新的模块化组件：
- strategy_registry: 角色调度策略
- memory_manager: 分层记忆管理
- model_router: 辅助模型路由
- context_compressor: 智能上下文压缩
- safety_guard: 安全防护
- prompt_registry: Prompt 模板
- stream_bus: 流式推送
- summary_service: 消息摘要

编排器职责：
1. 管理圆桌讨论的完整生命周期
2. 协调角色发言 → 评委评估 → 阶段转换的流程
3. 集成所有模块化组件
4. 处理取消、失败等异常
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("idearound.task_orchestrator")

# ── 导入模块化组件 ────────────────────────────────────────────────────

from .context_compressor import ContextCompressor, estimate_messages_tokens, build_compressor_llm_caller
from .memory_manager import MemoryManager, LayeredMemory, merge_memory_summary_v2
from .model_router import ModelRouter, TaskType, get_model_router
from .prompt_registry import PromptRegistry, get_prompt_registry
from .safety_guard import SafetyGuard, get_safety_guard
from .strategy_registry import StrategyRegistry, SchedulingContext, get_strategy_registry
from .stream_bus import StreamBus
from .summary_service import SummaryService, get_summary_service

# ── 常量 ──────────────────────────────────────────────────────────────

MODERATOR_SUMMARY_MODES = {"disabled", "manual", "per_round", "auto"}
CONTEXT_EXCEEDED_KEYWORDS = (
    "context size has been exceeded",
    "maximum context length",
    "too many tokens",
    "context_length_exceeded",
    "context overflow",
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_message(message: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": message.get("id") or uuid.uuid4().hex,
        "speaker_id": message.get("speaker_id") or message.get("speakerId") or "",
        "speaker_name": message.get("speaker_name") or message.get("speakerName") or "",
        "speaker_type": message.get("speaker_type") or message.get("speakerType") or "agent",
        "content": message.get("content") or "",
        "summary": message.get("summary") or "",
        "summary_metrics": message.get("summary_metrics") or message.get("summaryMetrics") or None,
        "streaming": bool(message.get("streaming", False)),
        "created_at": message.get("created_at") or message.get("createdAt") or _utcnow().isoformat(),
    }


def _build_canvas_items(board_state: Dict[str, Any], stage: str) -> Dict[str, List[str]]:
    """构建 Canvas 展示项"""
    consensus = board_state.get("consensus")
    disputes = board_state.get("disputes")
    consensus_items = [str(item).strip() for item in consensus if str(item).strip()] if isinstance(consensus, list) else []
    dispute_items: List[str] = []
    if isinstance(disputes, list):
        for item in disputes:
            if isinstance(item, dict):
                topic = _safe_text(item.get("topic"))
                if topic:
                    dispute_items.append(topic)
            else:
                text = _safe_text(item)
                if text:
                    dispute_items.append(text)
    if not consensus_items and stage == "final":
        consensus_items.append("已输出总结性方案")
    if not dispute_items and stage == "brief":
        dispute_items.append("仍需继续验证关键假设")
    return {
        "canvas_consensus": consensus_items[:6],
        "canvas_disputes": dispute_items[:6],
    }


# ── 数据库辅助 ────────────────────────────────────────────────────────

async def _load_llm_settings(model_id: int) -> Dict[str, Any]:
    """从数据库加载 LLM 设置"""
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.llm import LLMConfig
    except ImportError:
        from backend.app.core.database import AsyncSessionLocal
        from backend.app.models.llm import LLMConfig

    from sqlalchemy import select

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(LLMConfig).where(LLMConfig.id == model_id, LLMConfig.is_active.is_(True))
        )
        llm_config = result.scalars().first()
        if not llm_config:
            raise RuntimeError("LLM Config not found or inactive")
        if not llm_config.api_key:
            raise RuntimeError("API key is required for this model")
        return {
            "api_key": llm_config.api_key,
            "api_base": llm_config.api_base,
            "model_name": llm_config.model_name,
            "temperature": llm_config.temperature,
            "max_tokens": llm_config.max_tokens,
            "top_p": llm_config.top_p,
            "context_length": llm_config.context_length,
            "frequency_penalty": llm_config.frequency_penalty,
            "presence_penalty": llm_config.presence_penalty,
        }


async def _get_scheduling_mode_cached() -> str:
    """获取角色调度模式，带缓存"""
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.roundtable_config import RoundtableConfig
    except ImportError:
        from backend.app.core.database import AsyncSessionLocal
        from backend.app.models.roundtable_config import RoundtableConfig

    from sqlalchemy import select

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(RoundtableConfig).where(RoundtableConfig.config_key == "role_scheduling_mode")
            )
            config = result.scalars().first()
            return config.config_value if config and config.config_value else "single_round_robin"
    except Exception:
        return "single_round_robin"


async def _get_moderator_summary_mode_cached() -> str:
    """获取主持人总结模式，带缓存"""
    try:
        from app.core.database import AsyncSessionLocal
        from app.models.roundtable_config import RoundtableConfig
    except ImportError:
        from backend.app.core.database import AsyncSessionLocal
        from backend.app.models.roundtable_config import RoundtableConfig

    from sqlalchemy import select

    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(RoundtableConfig).where(RoundtableConfig.config_key == "moderator_summary_mode")
            )
            config = result.scalars().first()
            return config.config_value if config and config.config_value in MODERATOR_SUMMARY_MODES else "auto"
    except Exception:
        return "auto"


# ── OpenAI 客户端缓存 ────────────────────────────────────────────────

from openai import AsyncOpenAI

_openai_client_cache: Dict[str, AsyncOpenAI] = {}
_OPENAI_CLIENT_CACHE_MAX = 10


def _get_or_create_openai_client(llm_settings: Dict[str, Any]) -> AsyncOpenAI:
    cache_key = f"{llm_settings['api_key'][:8]}:{llm_settings.get('api_base', '')}"
    client = _openai_client_cache.get(cache_key)
    if client is not None:
        return client
    if len(_openai_client_cache) >= _OPENAI_CLIENT_CACHE_MAX:
        oldest_key = next(iter(_openai_client_cache))
        _openai_client_cache.pop(oldest_key, None)
    client = AsyncOpenAI(
        api_key=llm_settings["api_key"],
        base_url=llm_settings.get("api_base") or None,
    )
    _openai_client_cache[cache_key] = client
    return client


# ── LLM 调用封装 ──────────────────────────────────────────────────────

async def _call_llm_text_with_settings(
    llm_settings: Dict[str, Any],
    prompt: str,
    system_prompt: str,
    *,
    temperature: Optional[float] = None,
) -> str:
    """文本调用 LLM，含上下文超限自动截断"""
    client = _get_or_create_openai_client(llm_settings)

    async def _do_call(p: str, sp: str = system_prompt):
        kwargs: Dict[str, Any] = {
            "model": llm_settings["model_name"],
            "messages": [
                {"role": "system", "content": sp},
                {"role": "user", "content": p},
            ],
            "temperature": llm_settings.get("temperature", 0.7) if temperature is None else temperature,
            "stream": False,
        }
        for key in ("max_tokens", "top_p", "frequency_penalty", "presence_penalty"):
            if llm_settings.get(key) is not None:
                kwargs[key] = llm_settings[key]
        return await client.chat.completions.create(**kwargs)

    try:
        result = await _do_call(prompt)
    except Exception as exc:
        err_str = str(exc).lower()
        if any(kw in err_str for kw in CONTEXT_EXCEEDED_KEYWORDS):
            from .context_compressor import estimate_token_count
            context_length = llm_settings.get("context_length") or 8000
            max_input_tokens = int(context_length * 0.7)
            # 简单截断
            truncated_prompt = prompt[-max_input_tokens:] if len(prompt) > max_input_tokens * 2 else prompt
            result = await _do_call(truncated_prompt, system_prompt[:int(max_input_tokens * 0.3)])
        else:
            raise

    return result.choices[0].message.content or ""


async def _call_llm_stream_with_settings(
    llm_settings: Dict[str, Any],
    prompt: str,
    system_prompt: str,
    *,
    temperature: Optional[float] = None,
):
    """流式调用 LLM"""
    client = _get_or_create_openai_client(llm_settings)

    async def _do_call(p: str, sp: str = system_prompt):
        kwargs: Dict[str, Any] = {
            "model": llm_settings["model_name"],
            "messages": [
                {"role": "system", "content": sp},
                {"role": "user", "content": p},
            ],
            "temperature": llm_settings.get("temperature", 0.7) if temperature is None else temperature,
            "stream": True,
        }
        for key in ("max_tokens", "top_p", "frequency_penalty", "presence_penalty"):
            if llm_settings.get(key) is not None:
                kwargs[key] = llm_settings[key]
        return await client.chat.completions.create(**kwargs)

    try:
        response = await _do_call(prompt)
    except Exception as exc:
        err_str = str(exc).lower()
        if any(kw in err_str for kw in CONTEXT_EXCEEDED_KEYWORDS):
            from .context_compressor import estimate_token_count
            context_length = llm_settings.get("context_length") or 8000
            max_input_tokens = int(context_length * 0.7)
            truncated_prompt = prompt[-max_input_tokens:] if len(prompt) > max_input_tokens * 2 else prompt
            response = await _do_call(truncated_prompt, system_prompt[:int(max_input_tokens * 0.3)])
        else:
            raise

    async for chunk in response:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


async def _call_llm_json_with_settings(
    llm_settings: Dict[str, Any],
    prompt: str,
    system_prompt: str,
) -> Dict[str, Any]:
    """JSON 格式调用 LLM"""
    client = _get_or_create_openai_client(llm_settings)

    async def _do_call(p: str):
        kwargs: Dict[str, Any] = {
            "model": llm_settings["model_name"],
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": p},
            ],
            "temperature": 0.1,
            "stream": False,
            "response_format": {"type": "json_object"},
        }
        for key in ("max_tokens", "top_p", "frequency_penalty", "presence_penalty"):
            if llm_settings.get(key) is not None:
                kwargs[key] = llm_settings[key]
        return await client.chat.completions.create(**kwargs)

    try:
        response = await _do_call(prompt)
    except Exception as exc:
        err_str = str(exc).lower()
        if any(kw in err_str for kw in CONTEXT_EXCEEDED_KEYWORDS):
            context_length = llm_settings.get("context_length") or 8000
            max_input_tokens = int(context_length * 0.7)
            truncated_prompt = prompt[-max_input_tokens:] if len(prompt) > max_input_tokens * 2 else prompt
            response = await _do_call(truncated_prompt)
        else:
            raise

    content = response.choices[0].message.content or "{}"
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return {}


# ── Prompt 构建 ────────────────────────────────────────────────────────

def _build_roundtable_system_prompt(
    payload: Dict[str, Any],
    role: Dict[str, Any],
    stage: str,
    *,
    safety_guard: Optional[SafetyGuard] = None,
    prompt_registry: Optional[PromptRegistry] = None,
) -> str:
    """构建角色系统提示词，集成安全扫描和 Prompt 注册表"""
    registry = prompt_registry or get_prompt_registry()
    guard = safety_guard or get_safety_guard()

    prompt_templates = payload.get("prompt_templates") or {}
    intent_card = payload.get("intent_card") or {}
    core_goal = intent_card.get("coreGoal") or intent_card.get("core_goal") or "未提供"
    constraints = intent_card.get("constraints") or ""
    pain_points = intent_card.get("painPoints") or intent_card.get("pain_points") or ""
    expected_result = payload.get("expected_result") or ""
    role_name = role.get("name") or "角色"
    role_stance = role.get("stance") or "中立"

    # 使用注册表渲染基础模板
    base_prompt = registry.render(
        "role_system_base",
        prompt_base=prompt_templates.get("prompt_base") or "你是圆桌创意中的一个角色，请保持高信噪比，避免客套话、重复和盲目附和。",
        role_name=role_name,
        role_stance=role_stance,
        core_goal=core_goal,
        constraints=constraints or "未提供",
        pain_points=pain_points or "未提供",
        expected_result=expected_result or "未提供",
    )

    base = [base_prompt]

    # 灵魂配置 - 安全扫描后注入
    soul_config = role.get("soul_config") or role.get("soulConfig")
    if soul_config:
        sanitized_soul, scan_result = guard.scan_soul_config(soul_config)
        base.extend(["", sanitized_soul])

    # 阶段提示
    is_audit = role.get("id") == "audit" or "审计官" in role_name
    if stage == "brief":
        if is_audit and prompt_templates.get("prompt_audit_brief"):
            base.extend(["", prompt_templates["prompt_audit_brief"]])
        elif prompt_templates.get("prompt_brief_stage"):
            base.extend(["", prompt_templates["prompt_brief_stage"]])
        else:
            stage_prompt = registry.render("role_brief_stage")
            base.extend(["", stage_prompt])
    else:
        if is_audit and prompt_templates.get("prompt_audit_final"):
            base.extend(["", prompt_templates["prompt_audit_final"]])
        elif prompt_templates.get("prompt_final_stage"):
            base.extend(["", prompt_templates["prompt_final_stage"]])
        else:
            template_name = "audit_final_stage" if is_audit else "role_final_stage"
            stage_prompt = registry.render(template_name)
            base.extend(["", stage_prompt])

    # 用户自定义系统提示词 - 安全扫描后注入
    system_prompt = _safe_text(payload.get("system_prompt"))
    if system_prompt:
        sanitized_sp, _ = guard.scan_system_prompt(system_prompt)
        base.extend(["", f"补充系统提示词：{sanitized_sp}"])

    return "\n".join(base)


def _build_roundtable_user_prompt(
    payload: Dict[str, Any],
    role: Dict[str, Any],
    stage: str,
    user_message: str,
    memory_summary: str,
    *,
    prompt_registry: Optional[PromptRegistry] = None,
) -> str:
    """构建角色用户提示词，使用 Prompt 注册表"""
    registry = prompt_registry or get_prompt_registry()

    role_name = role.get("name") or "角色"
    role_stance = role.get("stance") or "中立"
    core_goal = (
        (payload.get("intent_card") or {}).get("coreGoal")
        or (payload.get("intent_card") or {}).get("core_goal")
        or "未指定目标"
    )

    return registry.render(
        "role_user_prompt",
        stage=stage,
        core_goal=core_goal,
        role_name=role_name,
        role_stance=role_stance,
        memory_summary=memory_summary or "暂无摘要",
        user_message=user_message,
    )


def _build_recent_transcript(
    messages: List[Dict[str, Any]],
    *,
    memory_summary: str = "",
    max_messages: int = 8,
    max_chars: int = 2800,
) -> str:
    """构建近期讨论摘要"""
    recent_lines: List[str] = []
    if memory_summary:
        recent_lines.append(f"【历史摘要】{memory_summary}")
    for item in messages[-max_messages:]:
        speaker = item.get("speaker_name") or item.get("speakerName") or "未知角色"
        content = item.get("content") or ""
        # 简单截断
        if len(content) > 260:
            content = content[:260] + "…"
        recent_lines.append(f"{speaker}：{content}")
    transcript = "\n".join(recent_lines).strip()
    return transcript[-max_chars:] if len(transcript) > max_chars else transcript


# ── 评委评估 ──────────────────────────────────────────────────────────

async def _evaluate_roundtable(
    llm_settings: Dict[str, Any],
    payload: Dict[str, Any],
    messages: List[Dict[str, Any]],
    current_round: int,
    memory_summary: str,
    *,
    prompt_registry: Optional[PromptRegistry] = None,
    auxiliary_model_id: Optional[int] = None,
) -> Dict[str, Any]:
    """评估圆桌讨论进度"""
    registry = prompt_registry or get_prompt_registry()
    model_router = get_model_router()

    transcript = _build_recent_transcript(messages, memory_summary=memory_summary, max_messages=10, max_chars=3600)
    intent_card = payload.get("intent_card") or {}

    # 使用辅助模型进行评估（如果配置了）
    eval_settings = await model_router.get_settings_for_task(
        llm_settings, auxiliary_model_id, TaskType.JUDGE_EVALUATE,
    )

    async def get_progress() -> Dict[str, Any]:
        try:
            progress_prompt = registry.render(
                "judge_evaluate",
                core_goal=intent_card.get("coreGoal") or intent_card.get("core_goal") or "未提供",
                constraints=intent_card.get("constraints") or "未提供",
                pain_points=intent_card.get("painPoints") or intent_card.get("pain_points") or "未提供",
                expected_result=payload.get("expected_result") or "",
                current_round=current_round,
                transcript=transcript,
            )
            result = await _call_llm_json_with_settings(eval_settings, progress_prompt, "你是一个公正严谨的裁判大模型，只输出 JSON。")
            result["success"] = True
            return result
        except Exception as exc:
            return {
                "score": 0,
                "reason": f"裁判评估失败：{exc}",
                "reached": False,
                "consensusCount": 0,
                "resolvedPainPoints": 0,
                "nextFocus": "继续围绕核心目标补足证据和执行路径",
                "success": False,
            }

    async def get_board() -> Dict[str, Any]:
        try:
            board_prompt = registry.render(
                "scribe_board",
                core_goal=intent_card.get("coreGoal") or intent_card.get("core_goal") or "未提供",
                expected_result=payload.get("expected_result") or "",
                transcript=transcript,
            )
            # 书记员也使用辅助模型
            scribe_settings = await model_router.get_settings_for_task(
                llm_settings, auxiliary_model_id, TaskType.SCRIBE_SUMMARY,
            )
            result = await _call_llm_json_with_settings(scribe_settings, board_prompt, "你是一个高信噪比的会议书记员，只输出 JSON。")
            result["success"] = True
            return result
        except Exception as exc:
            return {
                "summary": f"共识板生成失败：{exc}",
                "consensus": [],
                "disputes": [],
                "nextQuestions": ["请继续围绕核心目标补充高价值观点"],
                "success": False,
            }

    judge_state, board_state = await asyncio.gather(get_progress(), get_board())
    return {"judge_state": judge_state, "consensus_board": board_state}


# ── 角色流式发言 ──────────────────────────────────────────────────────

async def _generate_role_reply_stream(
    llm_settings: Dict[str, Any],
    payload: Dict[str, Any],
    role: Dict[str, Any],
    stage: str,
    user_message: str,
    memory_summary: str,
    task_id: str,
    current_messages: list,
    base_result_payload: dict,
    msg_id: str,
    cancel_event: asyncio.Event,
    *,
    safety_guard: Optional[SafetyGuard] = None,
    prompt_registry: Optional[PromptRegistry] = None,
    set_task_state_func: Optional[callable] = None,
    auxiliary_model_id: Optional[int] = None,
) -> Dict[str, Any]:
    """流式生成角色回复"""
    guard = safety_guard or get_safety_guard()
    registry = prompt_registry or get_prompt_registry()
    model_router = get_model_router()

    # 角色创意发言使用主模型
    creative_settings = await model_router.get_settings_for_task(
        llm_settings, auxiliary_model_id, TaskType.ROLE_CREATIVE,
    )

    content = ""
    msg_idx = None
    for i, msg in enumerate(current_messages):
        if msg.get("id") == msg_id:
            msg_idx = i
            break
    if msg_idx is None:
        msg_idx = len(current_messages) - 1

    original_created_at = current_messages[msg_idx].get("created_at") or _utcnow().isoformat()

    try:
        prompt = _build_roundtable_user_prompt(
            payload, role, stage, user_message, memory_summary,
            prompt_registry=registry,
        )
        system_prompt = _build_roundtable_system_prompt(
            payload, role, stage,
            safety_guard=guard, prompt_registry=registry,
        )

        last_update_time = time.time()

        async for chunk in _call_llm_stream_with_settings(creative_settings, prompt, system_prompt):
            if cancel_event.is_set():
                content += "\n> (已取消)"
                break

            content += chunk

            now = time.time()
            if now - last_update_time > 0.3 and set_task_state_func:
                current_messages[msg_idx]["content"] = content
                current_messages[msg_idx]["streaming"] = True
                await set_task_state_func(
                    task_id,
                    result_payload={**base_result_payload, "messages": current_messages},
                    persist=False,
                )
                last_update_time = now

    except Exception as exc:
        if not content:
            content = f"> 生成失败：{exc}"
        else:
            content += f"\n> (生成中断：{exc})"

    normalized_content = content.strip()

    final_msg: Dict[str, Any] = {
        "id": msg_id,
        "speaker_id": role.get("id") or "",
        "speaker_name": role.get("name") or "角色",
        "speaker_type": "agent",
        "content": normalized_content,
        "summary": "",
        "summary_metrics": None,
        "streaming": False,
        "created_at": original_created_at,
    }

    current_messages[msg_idx] = final_msg

    if set_task_state_func:
        await set_task_state_func(
            task_id,
            result_payload={**base_result_payload, "messages": current_messages},
            persist=False,
        )
        await asyncio.sleep(0.05)

    return final_msg


# ── 圆桌编排器 ────────────────────────────────────────────────────────

class RoundtableOrchestrator:
    """圆桌讨论编排器。

    集成所有模块化组件，管理完整的圆桌讨论流程：
    角色调度 → 流式发言 → 消息摘要 → 评委评估 → 阶段转换
    """

    def __init__(self):
        self.safety_guard = get_safety_guard()
        self.prompt_registry = get_prompt_registry()
        self.strategy_registry = get_strategy_registry()
        self.model_router = get_model_router()
        self.summary_service = get_summary_service()
        self.memory_manager = MemoryManager()

    async def process(
        self,
        task_id: str,
        payload: Dict[str, Any],
        *,
        set_task_state_func: callable,
        get_task_payload_func: callable,
        is_cancel_requested_func: callable,
        record_event_func: callable,
    ) -> None:
        """执行圆桌讨论编排。

        Args:
            task_id: 任务 ID
            payload: 任务请求参数
            set_task_state_func: 设置任务状态的函数
            get_task_payload_func: 获取任务参数的函数
            is_cancel_requested_func: 检查取消请求的函数
            record_event_func: 记录事件的函数
        """
        start_time = time.perf_counter()
        room_id = payload.get("room_id")

        try:
            # 加载主模型设置
            llm_settings = await _load_llm_settings(payload["model_id"])
            await set_task_state_func(task_id, status="running", started=True)

            roles = [role for role in payload.get("roles", []) if role.get("selected")]
            if not roles:
                raise RuntimeError("No selected roles")

            current_messages = [_normalize_message(msg) for msg in payload.get("prior_messages", [])]
            user_message_id = payload.get("user_message_id") or f"m_user_{uuid.uuid4().hex[:10]}"
            user_message = _safe_text(payload.get("user_message"))
            if not user_message:
                raise RuntimeError("User message is required")

            user_message_payload = {
                "id": user_message_id,
                "speaker_id": "user",
                "speaker_name": "我" if payload.get("trigger") != "host" else "主持人",
                "speaker_type": "user",
                "content": user_message,
                "streaming": False,
                "created_at": _utcnow().isoformat(),
            }
            if not any(msg.get("id") == user_message_id for msg in current_messages):
                current_messages.append(user_message_payload)

            current_stage = payload.get("roundtable_stage") or "brief"
            auto_continue = bool(payload.get("auto_continue", True))
            max_dialogue_rounds = max(int(payload.get("max_dialogue_rounds") or 1), 1)
            current_round = int(payload.get("auto_round_count") or 0)
            memory_summary = _safe_text(payload.get("memory_summary"))
            auxiliary_model_id = payload.get("auxiliary_model_id")

            # 初始化分层记忆
            structured_memory_data = payload.get("structured_memory")
            self.memory_manager.initialize(
                raw_summary=memory_summary,
                structured_data=structured_memory_data,
            )

            # 主持人总结模式
            request_summary_mode = payload.get("moderator_summary_mode")
            if request_summary_mode and request_summary_mode in MODERATOR_SUMMARY_MODES:
                moderator_summary_mode = request_summary_mode
            else:
                moderator_summary_mode = await _get_moderator_summary_mode_cached()

            # 初始化上下文压缩器
            context_length = llm_settings.get("context_length") or 8000
            compressor = ContextCompressor(
                context_length=context_length,
                threshold_percent=0.60,
            )

            base_result_payload: Dict[str, Any] = {
                "messages": current_messages,
                "stage": current_stage,
                "auto_round_count": current_round,
                "judge_state": None,
                "consensus_board": None,
                "canvas_consensus": [],
                "canvas_disputes": [],
                "memory_summary": memory_summary,
                "active_role_ids": [role.get("id") for role in roles],
                "last_user_message": user_message,
                "moderator_summary_mode": moderator_summary_mode,
            }
            await set_task_state_func(task_id, result_payload=base_result_payload)

            last_checked_msg_index = max(0, len(current_messages) - 1)
            turns_in_current_cycle = 0

            while True:
                # 检查取消
                if await is_cancel_requested_func(task_id):
                    canceled_payload = {**base_result_payload, "messages": current_messages}
                    await set_task_state_func(
                        task_id, status="canceled", result_payload=canceled_payload, finished=True,
                    )
                    await record_event_func(
                        room_id=room_id, task_id=task_id,
                        event_type="task.roundtable_orchestration.canceled",
                        event_payload={"stage": current_stage, "auto_round_count": current_round},
                    )
                    return

                # 检查 @提及
                mentioned_role = None
                for i in range(last_checked_msg_index, len(current_messages)):
                    content = current_messages[i].get("content", "")
                    for role in roles:
                        role_name = role.get("name", "")
                        if role_name and re.search(r'@' + re.escape(role_name) + r'(?:\s|[^\w]|$)', content):
                            mentioned_role = role
                            break
                    if mentioned_role:
                        break

                last_checked_msg_index = len(current_messages)

                # 获取调度模式
                scheduling_mode = await _get_scheduling_mode_cached()

                # 构建调度上下文
                ctx = SchedulingContext(
                    current_round=current_round,
                    memory_summary=memory_summary,
                    current_messages=current_messages,
                    scheduling_mode=scheduling_mode,
                    call_llm_json_func=lambda p, sp: _call_llm_json_with_settings(llm_settings, p, sp),
                )

                if mentioned_role:
                    speaking_roles = [mentioned_role]
                    schedule_reason = "mentioned"
                else:
                    # 使用策略注册表
                    speaking_roles, schedule_reason = await self.strategy_registry.resolve(
                        scheduling_mode, roles, ctx,
                    )

                # 主持人指定时插入提示消息
                if schedule_reason == "host_specify":
                    host_announce_msg = {
                        "id": f"m_host_announce_{uuid.uuid4().hex[:10]}",
                        "speaker_id": "host",
                        "speaker_name": "主持人",
                        "speaker_type": "host",
                        "content": f"（主持人根据讨论脉络，指定 **{speaking_roles[0].get('name')}** 接下来发言）",
                        "streaming": False,
                        "created_at": _utcnow().isoformat(),
                    }
                    current_messages.append(host_announce_msg)
                    base_result_payload = {**base_result_payload, "messages": current_messages}
                    await set_task_state_func(task_id, result_payload=base_result_payload)

                # 收集摘要异步任务
                pending_summary_tasks: List[tuple] = []

                # 顺序流式生成各角色回复
                for idx, role in enumerate(speaking_roles):
                    # 查找或创建 typing 消息
                    existing_typing_idx = None
                    for i, msg in enumerate(current_messages):
                        if (msg.get("speaker_id") == role.get("id") and
                            msg.get("speaker_type") == "agent" and
                            msg.get("streaming") is True and
                            msg.get("content") == "正在组织语言..."):
                            existing_typing_idx = i
                            break

                    if existing_typing_idx is not None:
                        temp_msg_id = current_messages[existing_typing_idx]["id"]
                        if idx > 0:
                            current_messages[existing_typing_idx]["created_at"] = _utcnow().isoformat()
                    else:
                        temp_msg_id = f"m_{role.get('id', 'agent')}_{uuid.uuid4().hex[:10]}"
                        role_created_at = _utcnow().isoformat()
                        typing_msg = {
                            "id": temp_msg_id,
                            "speaker_id": role.get("id") or "",
                            "speaker_name": role.get("name") or "角色",
                            "speaker_type": "agent",
                            "content": "正在组织语言...",
                            "streaming": True,
                            "created_at": role_created_at,
                        }
                        current_messages.append(typing_msg)
                        base_result_payload = {**base_result_payload, "messages": current_messages}
                        await set_task_state_func(task_id, result_payload=base_result_payload, persist=False)

                    # 清空 content 开始流式输出
                    typing_idx = existing_typing_idx if existing_typing_idx is not None else len(current_messages) - 1
                    current_messages[typing_idx]["content"] = ""
                    base_result_payload = {**base_result_payload, "messages": current_messages}
                    await set_task_state_func(task_id, result_payload=base_result_payload, persist=False)

                    # 注册取消事件
                    from .stream_bus import register_cancel_event
                    cancel_event = register_cancel_event(task_id)

                    # 流式生成
                    role_message = await _generate_role_reply_stream(
                        llm_settings,
                        payload,
                        role,
                        current_stage,
                        user_message,
                        memory_summary,
                        task_id,
                        current_messages,
                        base_result_payload,
                        temp_msg_id,
                        cancel_event,
                        safety_guard=self.safety_guard,
                        prompt_registry=self.prompt_registry,
                        set_task_state_func=set_task_state_func,
                        auxiliary_model_id=auxiliary_model_id,
                    )

                    # 异步生成摘要
                    summary_task = asyncio.create_task(
                        self.summary_service.generate(
                            role_message["content"],
                            llm_settings=llm_settings,
                        )
                    )
                    pending_summary_tasks.append((role_message["id"], summary_task))

                    # 更新分层记忆
                    self.memory_manager.update_from_message(role_message)
                    memory_summary = self.memory_manager.get_flat_summary()

                    base_result_payload = {
                        **base_result_payload,
                        "messages": current_messages,
                        "memory_summary": memory_summary,
                    }
                    await set_task_state_func(task_id, result_payload=base_result_payload)

                    turns_in_current_cycle += 1

                # 等待摘要完成
                if pending_summary_tasks:
                    msg_id_to_idx = {msg["id"]: idx for idx, msg in enumerate(current_messages)}
                    task_to_msg_id = {t: m_id for m_id, t in pending_summary_tasks}
                    pending_set = set(task_to_msg_id.keys())
                    summary_updated = False

                    while pending_set:
                        done, pending_set = await asyncio.wait(pending_set, return_when=asyncio.FIRST_COMPLETED)
                        for finished in done:
                            m_id = task_to_msg_id.get(finished)
                            if not m_id:
                                continue
                            try:
                                result = finished.result()
                            except Exception:
                                continue
                            idx = msg_id_to_idx.get(m_id)
                            if idx is None:
                                continue
                            current_messages[idx]["summary"] = result.get("summary", "")
                            current_messages[idx]["summary_metrics"] = result.get("summary_metrics")
                            summary_updated = True
                            await set_task_state_func(
                                task_id,
                                result_payload={**base_result_payload, "messages": list(current_messages)},
                                persist=False,
                            )

                    if summary_updated:
                        messages_snapshot = [dict(m) for m in current_messages if not m.get("streaming")]
                        for msg in messages_snapshot:
                            self.memory_manager.update_from_message(msg)
                        memory_summary = self.memory_manager.get_flat_summary()
                        base_result_payload = {
                            **base_result_payload,
                            "messages": current_messages,
                            "memory_summary": memory_summary,
                        }
                        await set_task_state_func(task_id, result_payload=base_result_payload)

                # 尝试上下文压缩
                if compressor.should_compress_preflight(current_messages):
                    compressor_llm_settings = await self.model_router.get_settings_for_task(
                        llm_settings, auxiliary_model_id, TaskType.CONTEXT_COMPRESS,
                    )
                    call_func = build_compressor_llm_caller(compressor_llm_settings)
                    compressed = await compressor.compress(current_messages, call_func)
                    if compressed is not current_messages:
                        current_messages = compressed
                        base_result_payload = {**base_result_payload, "messages": current_messages}
                        await set_task_state_func(task_id, result_payload=base_result_payload, persist=False)

                if current_stage == "brief":
                    current_round += 1

                # 群聊节流评估
                need_evaluation = True
                if scheduling_mode == "single_round_robin" and schedule_reason == "single_round_robin":
                    if turns_in_current_cycle < len(roles):
                        need_evaluation = False
                    else:
                        turns_in_current_cycle = 0

                if not need_evaluation:
                    base_result_payload = {
                        **base_result_payload,
                        "messages": current_messages,
                        "auto_round_count": current_round,
                    }
                    await set_task_state_func(task_id, result_payload=base_result_payload, persist=False)
                    continue

                # 评委评估
                temp_host_id = f"m_host_{uuid.uuid4().hex[:10]}"
                typing_host_msg = {
                    "id": temp_host_id,
                    "speaker_id": "host",
                    "speaker_name": "主持人",
                    "speaker_type": "host",
                    "content": "正在提炼共识并规划下一步...",
                    "streaming": True,
                    "created_at": _utcnow().isoformat(),
                }
                current_messages.append(typing_host_msg)
                base_result_payload = {**base_result_payload, "messages": current_messages}
                await set_task_state_func(task_id, result_payload=base_result_payload)

                evaluation = await _evaluate_roundtable(
                    llm_settings, payload,
                    [m for m in current_messages if not m.get("streaming")],
                    current_round, memory_summary,
                    prompt_registry=self.prompt_registry,
                    auxiliary_model_id=auxiliary_model_id,
                )

                current_messages.pop()

                judge_state = evaluation["judge_state"]
                board_state = evaluation["consensus_board"]

                # 更新分层记忆
                self.memory_manager.update_from_board(board_state)
                memory_summary = self.memory_manager.get_flat_summary()

                canvas_items = _build_canvas_items(board_state, current_stage)

                base_result_payload = {
                    **base_result_payload,
                    "messages": current_messages,
                    "stage": current_stage,
                    "auto_round_count": current_round,
                    "judge_state": judge_state,
                    "consensus_board": board_state,
                    "memory_summary": memory_summary,
                    "canvas_consensus": canvas_items["canvas_consensus"],
                    "canvas_disputes": canvas_items["canvas_disputes"],
                    "completed_stage": current_stage,
                }
                await set_task_state_func(task_id, result_payload=base_result_payload)

                # 阶段转换判断
                if current_stage == "final":
                    duration_ms = int((time.perf_counter() - start_time) * 1000)
                    await set_task_state_func(
                        task_id, status="completed",
                        result_payload={**base_result_payload, "final_generated": True},
                        finished=True,
                    )
                    await record_event_func(
                        room_id=room_id, task_id=task_id,
                        event_type="task.roundtable_orchestration.completed",
                        event_payload={"stage": current_stage, "auto_round_count": current_round, "message_count": len(current_messages)},
                        duration_ms=duration_ms,
                    )
                    return

                if not auto_continue:
                    duration_ms = int((time.perf_counter() - start_time) * 1000)
                    await set_task_state_func(
                        task_id, status="completed",
                        result_payload={**base_result_payload, "final_generated": False},
                        finished=True,
                    )
                    await record_event_func(
                        room_id=room_id, task_id=task_id,
                        event_type="task.roundtable_orchestration.completed",
                        event_payload={"stage": current_stage, "auto_round_count": current_round, "message_count": len(current_messages)},
                        duration_ms=duration_ms,
                    )
                    return

                # 收敛判断
                reached_expected = bool(judge_state.get("reached"))
                reached_max_round = current_round >= max_dialogue_rounds

                should_converge = False
                if moderator_summary_mode == "disabled":
                    should_converge = False
                elif moderator_summary_mode == "manual":
                    should_converge = False
                elif moderator_summary_mode == "per_round":
                    should_converge = True
                else:
                    should_converge = reached_expected or reached_max_round

                if should_converge:
                    current_stage = "final"
                    converge_msg = (
                        (payload.get("prompt_templates") or {}).get("prompt_converge_trigger")
                        or self.prompt_registry.render("converge_trigger")
                    )
                    current_messages.append({
                        "id": f"m_host_{uuid.uuid4().hex[:10]}",
                        "speaker_id": "host",
                        "speaker_name": "主持人",
                        "speaker_type": "host",
                        "content": converge_msg,
                        "streaming": False,
                        "created_at": _utcnow().isoformat(),
                    })
                    memory_summary = self.memory_manager.get_flat_summary()
                    base_result_payload = {
                        **base_result_payload,
                        "messages": current_messages,
                        "stage": current_stage,
                        "last_user_message": converge_msg,
                        "memory_summary": memory_summary,
                        "transition_reason": "expected_result_reached" if reached_expected else "max_round_reached" if reached_max_round else "per_round_summary",
                    }
                    await set_task_state_func(task_id, result_payload=base_result_payload)
                    continue

                # disabled/manual 达到最大轮数时停止
                if moderator_summary_mode in ("disabled", "manual") and reached_max_round:
                    duration_ms = int((time.perf_counter() - start_time) * 1000)
                    await set_task_state_func(
                        task_id, status="completed",
                        result_payload={**base_result_payload, "final_generated": False},
                        finished=True,
                    )
                    await record_event_func(
                        room_id=room_id, task_id=task_id,
                        event_type="task.roundtable_orchestration.completed",
                        event_payload={"stage": current_stage, "auto_round_count": current_round, "message_count": len(current_messages), "summary_mode": moderator_summary_mode},
                        duration_ms=duration_ms,
                    )
                    return

                # 继续讨论
                next_prompt = _safe_text(judge_state.get("nextFocus")) or "请继续围绕期望结果推进，补足关键证据、约束和执行路径。"
                user_message = f"请继续推进：{next_prompt}"
                current_messages.append({
                    "id": f"m_host_{uuid.uuid4().hex[:10]}",
                    "speaker_id": "host",
                    "speaker_name": "主持人",
                    "speaker_type": "host",
                    "content": user_message,
                    "streaming": False,
                    "created_at": _utcnow().isoformat(),
                })
                memory_summary = self.memory_manager.get_flat_summary()
                current_round += 1
                base_result_payload = {
                    **base_result_payload,
                    "messages": current_messages,
                    "last_user_message": user_message,
                    "next_prompt": next_prompt,
                    "memory_summary": memory_summary,
                    "auto_round_count": current_round,
                }
                await set_task_state_func(task_id, result_payload=base_result_payload)

        except Exception as exc:
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            await set_task_state_func(task_id, status="failed", error_message=str(exc), finished=True)
            await record_event_func(
                room_id=room_id, task_id=task_id,
                event_type="task.failed",
                event_payload={"error": str(exc), "task_type": payload.get("task_type")},
                success=False, duration_ms=duration_ms,
            )


# ── 全局单例 ──────────────────────────────────────────────────────────

_orchestrator: Optional[RoundtableOrchestrator] = None


def get_orchestrator() -> RoundtableOrchestrator:
    """获取全局圆桌编排器"""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = RoundtableOrchestrator()
    return _orchestrator
