from __future__ import annotations

import asyncio
import hashlib
import json
import math
import re
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

# ── 模块化组件导入 ──────────────────────────────────────────────────
try:
    from backend.app.services.runtime import (
        ContextCompressor,
        MemoryManager,
        ModelRouter,
        PromptRegistry,
        SafetyGuard,
        StrategyRegistry,
        SummaryService,
        TaskType,
        build_compressor_llm_caller,
        estimate_messages_tokens,
        get_model_router,
        get_prompt_registry,
        get_safety_guard,
        get_strategy_registry,
        get_summary_service,
        merge_memory_summary_v2,
    )
except ImportError:
    from app.services.runtime import (
        ContextCompressor,
        MemoryManager,
        ModelRouter,
        PromptRegistry,
        SafetyGuard,
        StrategyRegistry,
        SummaryService,
        TaskType,
        build_compressor_llm_caller,
        estimate_messages_tokens,
        get_model_router,
        get_prompt_registry,
        get_safety_guard,
        get_strategy_registry,
        get_summary_service,
        merge_memory_summary_v2,
    )

try:
    from backend.app.core.database import AsyncSessionLocal, get_db
    from backend.app.core.redis_client import (
        SUMMARY_CACHE_PREFIX,
        SUMMARY_CACHE_TTL_SECONDS,
        TASK_CHANNEL_PREFIX,
        TASK_STATE_PREFIX,
        TASK_STATE_TTL_SECONDS,
        cache_delete,
        cache_get,
        cache_set,
        is_redis_available,
        publish_event,
    )
    from backend.app.models.llm import LLMConfig
    from backend.app.models.runtime import RuntimeEvent, RuntimeTask
    from backend.app.schemas.runtime import (
        RuntimeEventResponse,
        RuntimeEventTrackRequest,
        RuntimeMetricsSummary,
        RuntimeMessageSummaryItem,
        RuntimeMessageSummaryRequest,
        RuntimeMessageSummaryResponse,
        RuntimeRoomSnapshot,
        RuntimeRoundtableRunRequest,
        RuntimeTaskCancelResponse,
        RuntimeTaskCreateRequest,
        RuntimeTaskResponse,
    )
except ImportError:
    from app.core.database import AsyncSessionLocal, get_db
    from app.core.redis_client import (
        SUMMARY_CACHE_PREFIX,
        SUMMARY_CACHE_TTL_SECONDS,
        TASK_CHANNEL_PREFIX,
        TASK_STATE_PREFIX,
        TASK_STATE_TTL_SECONDS,
        cache_delete,
        cache_get,
        cache_set,
        is_redis_available,
        publish_event,
    )
    from app.models.llm import LLMConfig
    from app.models.runtime import RuntimeEvent, RuntimeTask
    from app.schemas.runtime import (
        RuntimeEventResponse,
        RuntimeEventTrackRequest,
        RuntimeMetricsSummary,
        RuntimeMessageSummaryItem,
        RuntimeMessageSummaryRequest,
        RuntimeMessageSummaryResponse,
        RuntimeRoomSnapshot,
        RuntimeRoundtableRunRequest,
        RuntimeTaskCancelResponse,
        RuntimeTaskCreateRequest,
        RuntimeTaskResponse,
    )


TERMINAL_STATUSES = {"completed", "failed", "canceled"}
# 进程内 Queue 仍保留用于本 Worker 内的 SSE 推送；
# Redis Pub/Sub 用于跨 Worker 广播，两者配合使用。
TASK_STREAM_QUEUES: Dict[str, List[asyncio.Queue[Dict[str, Any]]]] = {}
SUMMARY_MAX_CHARS = 120
SUMMARY_RT_TARGET_MS = 300
ACTION_HINTS = ("建议", "需要", "应", "执行", "推进", "验证", "上线", "优化", "修复", "建立", "安排", "行动", "下一步")
CONCLUSION_HINTS = ("结论", "核心", "关键", "优先", "必须", "最终", "判断", "共识")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _as_json_dict(content: str, fallback: Dict[str, Any]) -> Dict[str, Any]:
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return fallback


def _serialize_runtime_task(task: RuntimeTask) -> Dict[str, Any]:
    return {
        "task_id": task.task_id,
        "task_type": task.task_type,
        "room_id": task.room_id,
        "status": task.status,
        "model_id": task.model_id,
        "result_payload": task.result_payload,
        "error_message": task.error_message,
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "finished_at": task.finished_at.isoformat() if task.finished_at else None,
        "created_at": task.created_at.isoformat() if task.created_at else _utcnow().isoformat(),
    }


def _subscribe_task_stream(task_id: str) -> asyncio.Queue[Dict[str, Any]]:
    queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue()
    TASK_STREAM_QUEUES.setdefault(task_id, []).append(queue)
    return queue


def _unsubscribe_task_stream(task_id: str, queue: asyncio.Queue[Dict[str, Any]]) -> None:
    queues = TASK_STREAM_QUEUES.get(task_id)
    if not queues:
        return
    TASK_STREAM_QUEUES[task_id] = [item for item in queues if item is not queue]
    if not TASK_STREAM_QUEUES[task_id]:
        TASK_STREAM_QUEUES.pop(task_id, None)


async def _publish_task_stream_event(
    task_id: str,
    event_type: str,
    task_payload: Dict[str, Any],
) -> None:
    event_message = {"event": event_type, "task": task_payload}

    # 1) 本 Worker 内的 Queue 推送（低延迟）
    queues = TASK_STREAM_QUEUES.get(task_id, [])
    stale_queues: List[asyncio.Queue[Dict[str, Any]]] = []
    for queue in queues:
        try:
            queue.put_nowait(event_message)
        except asyncio.QueueFull:
            stale_queues.append(queue)
    for queue in stale_queues:
        _unsubscribe_task_stream(task_id, queue)

    # 2) 跨 Worker 广播（Redis Pub/Sub）
    if is_redis_available():
        await publish_event(f"{TASK_CHANNEL_PREFIX}{task_id}", event_message)


async def _publish_task_stream_payload(task_id: str, payload: Dict[str, Any]) -> None:
    queues = TASK_STREAM_QUEUES.get(task_id, [])
    stale_queues: List[asyncio.Queue[Dict[str, Any]]] = []
    for queue in queues:
        try:
            queue.put_nowait(payload)
        except asyncio.QueueFull:
            stale_queues.append(queue)
    for queue in stale_queues:
        _unsubscribe_task_stream(task_id, queue)
    if is_redis_available():
        await publish_event(f"{TASK_CHANNEL_PREFIX}{task_id}", payload)


def _format_sse_message(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _compress_text(value: str, max_chars: int = 220) -> str:
    clean = " ".join(_safe_text(value).split())
    if len(clean) <= max_chars:
        return clean
    return clean[: max_chars - 1] + "…"


def _normalize_summary_text(value: str, max_chars: int = SUMMARY_MAX_CHARS) -> str:
    clean = _safe_text(value)
    clean = re.sub(r"^[>\-\*\d\.\s]+", "", clean)
    clean = clean.replace("\r", " ").replace("\n", " ")
    clean = re.sub(r"\s+", " ", clean).strip(" \"'[]【】")
    if len(clean) <= max_chars:
        return clean
    return clean[: max_chars - 1].rstrip() + "…"


def _split_sentences(value: str) -> List[str]:
    normalized = re.sub(r"[\r\n]+", "。", _safe_text(value))
    parts = re.split(r"[。！？；;]+", normalized)
    return [part.strip(" -•*") for part in parts if part.strip(" -•*")]


def _extract_numeric_tokens(value: str) -> List[str]:
    return re.findall(r"\d+(?:\.\d+)?%?", _safe_text(value))


def _contains_hint(value: str, hints: tuple[str, ...]) -> bool:
    text = _safe_text(value)
    return any(hint in text for hint in hints)


def _char_bigrams(value: str) -> set[str]:
    normalized = re.sub(r"[^\w\u4e00-\u9fff]", "", _safe_text(value).lower())
    if len(normalized) < 2:
        return {normalized} if normalized else set()
    return {normalized[index : index + 2] for index in range(len(normalized) - 1)}


def _build_extractive_summary(content: str, max_chars: int = SUMMARY_MAX_CHARS) -> str:
    sentences = _split_sentences(content)
    if not sentences:
        return _normalize_summary_text(content, max_chars=max_chars)

    ranked = sorted(
        sentences,
        key=lambda sentence: (
            1 if _extract_numeric_tokens(sentence) else 0,
            1 if _contains_hint(sentence, ACTION_HINTS) else 0,
            1 if _contains_hint(sentence, CONCLUSION_HINTS) else 0,
            min(len(sentence), 60),
        ),
        reverse=True,
    )

    selected: List[str] = []
    for sentence in ranked:
        if sentence in selected:
            continue
        candidate = "；".join(selected + [sentence]) if selected else sentence
        if len(candidate) > max_chars and selected:
            continue
        selected.append(sentence)
        if len("；".join(selected)) >= max_chars or len(selected) >= 3:
            break

    if not selected:
        selected = [ranked[0]]
    return _normalize_summary_text("；".join(selected), max_chars=max_chars)


def _score_summary_consistency(source: str, summary: str) -> float:
    source_text = _safe_text(source)
    summary_text = _normalize_summary_text(summary)
    if not source_text:
        return 100.0
    if not summary_text:
        return 0.0

    reference = _build_extractive_summary(source_text, max_chars=160)
    reference_bigrams = _char_bigrams(reference)
    summary_bigrams = _char_bigrams(summary_text)
    overlap_score = 100.0
    if reference_bigrams:
        overlap_score = 100.0 * len(reference_bigrams & summary_bigrams) / len(reference_bigrams)

    source_numbers = set(_extract_numeric_tokens(source_text))
    summary_numbers = set(_extract_numeric_tokens(summary_text))
    number_score = 100.0 if not source_numbers else 100.0 * len(source_numbers & summary_numbers) / len(source_numbers)

    action_score = 100.0
    if _contains_hint(source_text, ACTION_HINTS):
        action_score = 100.0 if _contains_hint(summary_text, ACTION_HINTS) else 0.0

    conclusion_score = 100.0
    if _contains_hint(source_text, CONCLUSION_HINTS):
        conclusion_score = 100.0 if _contains_hint(summary_text, CONCLUSION_HINTS) else 0.0

    length_score = 100.0 if len(summary_text) <= SUMMARY_MAX_CHARS else max(0.0, 100.0 - (len(summary_text) - SUMMARY_MAX_CHARS) * 5.0)
    score = overlap_score * 0.45 + number_score * 0.3 + action_score * 0.15 + conclusion_score * 0.05 + length_score * 0.05
    return round(min(score, 100.0), 2)


def _build_message_summary_prompt(content: str) -> str:
    return f"""请将以下角色回复压缩为不超过120字的中文摘要。
要求：
1. 必须保留关键结论、行动项、数值结论。
2. 删除冗余修辞、铺垫、客套和重复表达。
3. 与原文语义保持一致，不得新增事实。
4. 只输出摘要正文，不要加标题或说明。

原文：
{content}
"""


def _build_summary_cache_key(model_id: int, content: str) -> str:
    payload = f"{model_id}:{_safe_text(content)}".encode("utf-8")
    return hashlib.md5(payload).hexdigest()


def _extract_summary_points(content: str, max_items: int = 3) -> List[str]:
    lines = [
        line.strip("-*0123456789. ")
        for line in _safe_text(content).splitlines()
        if line.strip()
    ]
    compact = [_compress_text(line, 80) for line in lines if len(line) >= 4]
    if compact:
        return compact[:max_items]
    if not content:
        return []
    return [_compress_text(content, 80)]


def _build_recent_transcript(
    messages: List[Dict[str, Any]],
    *,
    memory_summary: str = "",
    max_messages: int = 8,
    max_chars: int = 2800,
) -> str:
    recent_lines: List[str] = []
    if memory_summary:
        recent_lines.append(f"【历史摘要】{memory_summary}")
    for item in messages[-max_messages:]:
        speaker = item.get("speaker_name") or item.get("speakerName") or "未知角色"
        content = item.get("content") or ""
        recent_lines.append(f"{speaker}：{_compress_text(content, 260)}")
    transcript = "\n".join(recent_lines).strip()
    return transcript[-max_chars:] if len(transcript) > max_chars else transcript


def _rebuild_memory_summary_from_messages(messages: List[Dict[str, Any]], *, max_chars: int = 1200) -> str:
    """从消息列表重新构建 memory_summary，优先使用 LLM 生成的精炼摘要。"""
    snippets: List[str] = []
    for item in messages:
        if item.get("speaker_type") == "host":
            continue  # 跳过主持人调度消息
        speaker = item.get("speaker_name") or item.get("speakerName") or "未知角色"
        summary_text = (item.get("summary") or "").strip()
        if summary_text:
            snippets.append(f"{speaker}：{summary_text}")
        else:
            points = _extract_summary_points(item.get("content") or "", max_items=2)
            if points:
                snippets.append(f"{speaker}：" + "；".join(points))
    merged = " | ".join(snippets)
    return merged[-max_chars:] if len(merged) > max_chars else merged


def _merge_memory_summary(memory_summary: str, messages: List[Dict[str, Any]], *, max_chars: int = 1200) -> str:
    snippets: List[str] = []
    if memory_summary:
        snippets.append(memory_summary)
    for item in messages[-6:]:
        speaker = item.get("speaker_name") or item.get("speakerName") or "未知角色"
        # 优先使用 LLM 生成的精炼摘要，否则提取原始要点
        summary_text = item.get("summary") or ""
        if summary_text and summary_text.strip():
            snippets.append(f"{speaker}：{summary_text.strip()}")
        else:
            points = _extract_summary_points(item.get("content") or "", max_items=2)
            if points:
                snippets.append(f"{speaker}：" + "；".join(points))
    merged = " | ".join(snippets)
    return merged[-max_chars:] if len(merged) > max_chars else merged


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


def _build_progress_prompt(payload: Dict[str, Any]) -> str:
    expected_result = payload.get("expected_result") or "推动讨论形成高质量结论"
    transcript = (payload.get("transcript") or "无").strip()[-4000:]
    current_round = payload.get("current_round") or 0
    user_demand = _safe_text(payload.get("initial_demand")) or _safe_text(payload.get("user_message")) or "未提供"
    return f"""你是圆桌讨论的后台裁判。
请根据原始需求与当前讨论内容，评估当前讨论的收敛进度与完成质量。

【原始需求】{user_demand}
【期望结果】{expected_result}
【当前轮次】{current_round}
【讨论内容】
{transcript}

请严格输出 JSON：
{{
  "score": 0-100 的整数,
  "reason": "30字内说明当前判断",
  "reached": true 或 false,
  "consensusCount": 已形成的共识条数,
  "resolvedPainPoints": 已解决痛点条数,
  "nextFocus": "下一步最该推进的问题"
}}"""


def _build_board_prompt(payload: Dict[str, Any]) -> str:
    transcript = (payload.get("transcript") or "无").strip()[-4000:]
    expected_result = payload.get("expected_result") or "形成清晰结论"
    user_demand = _safe_text(payload.get("initial_demand")) or _safe_text(payload.get("user_message")) or "未提供"
    return f"""你是圆桌讨论的书记员。
请基于当前讨论内容提炼当前已经形成的共识、尚未解决的争议，以及最值得继续追问的问题。

【原始需求】{user_demand}
【期望结果】{expected_result}
【讨论内容】
{transcript}

请严格输出 JSON：
{{
  "summary": "一句话概括当前局势，不超过40字",
  "consensus": ["共识1", "共识2"],
  "disputes": [
    {{"topic": "争议主题", "pro": "支持方观点", "con": "反对方观点"}}
  ],
  "nextQuestions": ["下一步该问的问题1", "下一步该问的问题2"]
}}"""


async def _load_llm_settings(model_id: int) -> Dict[str, Any]:
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


CONTEXT_EXCEEDED_KEYWORDS = (
    "context size has been exceeded",
    "maximum context length",
    "too many tokens",
    "context_length_exceeded",
    "context overflow",
)

# ---- 任务取消事件注册表：让流式生成循环能及时响应取消请求 ----
_task_cancel_events: Dict[str, asyncio.Event] = {}


def _register_task_cancel_event(task_id: str) -> asyncio.Event:
    """注册一个可等待的取消事件，供流式生成循环检查。"""
    event = asyncio.Event()
    _task_cancel_events[task_id] = event
    return event


def _signal_task_cancel(task_id: str) -> None:
    """发出取消信号，让正在进行的 LLM 调用尽快退出。"""
    event = _task_cancel_events.get(task_id)
    if event:
        event.set()


def _unregister_task_cancel_event(task_id: str) -> None:
    """任务结束时清理取消事件。"""
    _task_cancel_events.pop(task_id, None)


# ---- 智能上下文截断：按语义优先级截断，替代粗暴按字符对半切 ----

def _estimate_token_count(text: str) -> int:
    """粗估 token 数：中文约 1 字符 ≈ 1.5 token，英文约 4 字符 ≈ 1 token"""
    if not text:
        return 0
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    other_chars = len(text) - chinese_chars
    return int(chinese_chars * 1.5 + other_chars / 4)


def _truncate_prompt_by_priority(
    system_prompt: str,
    user_prompt: str,
    max_tokens: int = 6000,
) -> tuple:
    """
    按优先级截断 prompt，而非粗暴按字符对半切。
    优先级：system_prompt 基础层 > user_prompt 最新内容 > user_prompt 历史 > system_prompt 补充层

    策略：
    1. 如果总估算 token 未超限，不截断
    2. 先精简 user_prompt 中的讨论摘要段（限制到 600 字）
    3. 再精简 system_prompt：移除补充系统提示词部分
    4. 最后截断 system_prompt 中的灵魂配置长段落
    """
    total_est = _estimate_token_count(system_prompt) + _estimate_token_count(user_prompt)
    if total_est <= max_tokens:
        return system_prompt, user_prompt

    # 策略 1：精简 user_prompt 中的讨论摘要段
    summary_marker = "【讨论摘要】"
    if summary_marker in user_prompt:
        parts = user_prompt.split(summary_marker, 1)
        summary_and_rest = parts[1]
        # 找下一个段落标记
        next_marker_idx = len(summary_and_rest)
        for marker in ["【本轮输入】", "【讨论阶段】", "【核心目标】", "【用户意图】"]:
            idx = summary_and_rest.find(marker)
            if idx > 0:
                next_marker_idx = min(next_marker_idx, idx)
        if next_marker_idx < len(summary_and_rest):
            # 保留后续段落，截断摘要段
            summary_content = summary_and_rest[:next_marker_idx]
            rest_content = summary_and_rest[next_marker_idx:]
            truncated_summary = summary_content[:600] + "…\n"
            user_prompt = parts[0] + summary_marker + truncated_summary + rest_content
        else:
            truncated_summary = summary_and_rest[:600] + "…"
            user_prompt = parts[0] + summary_marker + truncated_summary

    total_est = _estimate_token_count(system_prompt) + _estimate_token_count(user_prompt)
    if total_est <= max_tokens:
        return system_prompt, user_prompt

    # 策略 2：移除 system_prompt 中的补充系统提示词段
    supplement_marker = "补充系统提示词："
    if supplement_marker in system_prompt:
        idx = system_prompt.rfind(supplement_marker)
        system_prompt = system_prompt[:idx].rstrip()

    total_est = _estimate_token_count(system_prompt) + _estimate_token_count(user_prompt)
    if total_est <= max_tokens:
        return system_prompt, user_prompt

    # 策略 3：截断 system_prompt 中的长段落（可能是灵魂配置）
    lines = system_prompt.split("\n")
    filtered_lines = []
    skip_next = False
    for line in lines:
        if len(line) > 200 and not skip_next:
            filtered_lines.append(line[:100] + "…")
            skip_next = True
        else:
            skip_next = False
            filtered_lines.append(line)
    system_prompt = "\n".join(filtered_lines)

    return system_prompt, user_prompt


# ---- 角色调度模式进程内缓存 ----
_scheduling_mode_cache: Dict[str, str] = {}
_SCHEDULING_MODE_CACHE_TTL = 300  # 5 分钟
_scheduling_mode_cache_time: float = 0


async def _get_scheduling_mode() -> str:
    """获取角色调度模式，带进程内缓存（5 分钟 TTL）。"""
    global _scheduling_mode_cache_time

    now = time.time()
    if now - _scheduling_mode_cache_time < _SCHEDULING_MODE_CACHE_TTL and _scheduling_mode_cache:
        return _scheduling_mode_cache.get("mode", "parallel_all")

    try:
        from app.models.roundtable_config import RoundtableConfig as DBRoundtableConfig
        async with AsyncSessionLocal() as db_session:
            result = await db_session.execute(
                select(DBRoundtableConfig).where(DBRoundtableConfig.config_key == "role_scheduling_mode")
            )
            mode_config = result.scalars().first()
            mode = mode_config.config_value if mode_config and mode_config.config_value else "parallel_all"
            _scheduling_mode_cache["mode"] = mode
            _scheduling_mode_cache_time = now
            return mode
    except Exception:
        return _scheduling_mode_cache.get("mode", "parallel_all")


# ---- 主持人总结模式进程内缓存 ----
_moderator_summary_mode_cache: Dict[str, str] = {}
_MODERATOR_SUMMARY_MODE_CACHE_TTL = 300  # 5 分钟
_moderator_summary_mode_cache_time: float = 0

MODERATOR_SUMMARY_MODES = {"disabled", "manual", "per_round", "auto"}


async def _get_moderator_summary_mode() -> str:
    """获取主持人总结模式，带进程内缓存（5 分钟 TTL）。
    
    模式说明：
    - disabled: 禁用主持人总结，不会自动进入 final 阶段
    - manual: 仅手动点击总结按钮时触发，不自动进入 final 阶段
    - per_round: 每轮对话后自动启用总结（自动进入 final 阶段）
    - auto: 裁判判定收敛或达到最大轮数时自动总结（默认行为）
    """
    global _moderator_summary_mode_cache_time

    now = time.time()
    if now - _moderator_summary_mode_cache_time < _MODERATOR_SUMMARY_MODE_CACHE_TTL and _moderator_summary_mode_cache:
        return _moderator_summary_mode_cache.get("mode", "auto")

    try:
        from app.models.roundtable_config import RoundtableConfig as DBRoundtableConfig
        async with AsyncSessionLocal() as db_session:
            result = await db_session.execute(
                select(DBRoundtableConfig).where(DBRoundtableConfig.config_key == "moderator_summary_mode")
            )
            mode_config = result.scalars().first()
            mode = mode_config.config_value if mode_config and mode_config.config_value in MODERATOR_SUMMARY_MODES else "auto"
            _moderator_summary_mode_cache["mode"] = mode
            _moderator_summary_mode_cache_time = now
            return mode
    except Exception:
        return _moderator_summary_mode_cache.get("mode", "auto")


_openai_client_cache: Dict[str, AsyncOpenAI] = {}
_OPENAI_CLIENT_CACHE_MAX = 10


def _get_or_create_openai_client(llm_settings: Dict[str, Any]) -> AsyncOpenAI:
    """复用 AsyncOpenAI 客户端，避免每次调用创建新的 HTTP 连接池。"""
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


async def _call_llm_text_with_settings(
    llm_settings: Dict[str, Any],
    prompt: str,
    system_prompt: str,
    *,
    temperature: Optional[float] = None,
) -> str:
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
        if llm_settings.get("max_tokens") is not None:
            kwargs["max_tokens"] = llm_settings["max_tokens"]
        if llm_settings.get("top_p") is not None:
            kwargs["top_p"] = llm_settings["top_p"]
        if llm_settings.get("frequency_penalty") is not None:
            kwargs["frequency_penalty"] = llm_settings["frequency_penalty"]
        if llm_settings.get("presence_penalty") is not None:
            kwargs["presence_penalty"] = llm_settings["presence_penalty"]
        return await client.chat.completions.create(**kwargs)

    context_length = llm_settings.get("context_length") or 8000
    max_input_tokens = int(context_length * 0.7)

    try:
        result = await _do_call(prompt)
    except Exception as exc:
        err_str = str(exc).lower()
        if any(kw in err_str for kw in CONTEXT_EXCEEDED_KEYWORDS):
            # 使用智能截断替代粗暴对半切
            truncated_sp, truncated_prompt = _truncate_prompt_by_priority(
                system_prompt, prompt, max_tokens=max_input_tokens,
            )
            result = await _do_call(truncated_prompt, truncated_sp)
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
        if llm_settings.get("max_tokens") is not None:
            kwargs["max_tokens"] = llm_settings["max_tokens"]
        if llm_settings.get("top_p") is not None:
            kwargs["top_p"] = llm_settings["top_p"]
        if llm_settings.get("frequency_penalty") is not None:
            kwargs["frequency_penalty"] = llm_settings["frequency_penalty"]
        if llm_settings.get("presence_penalty") is not None:
            kwargs["presence_penalty"] = llm_settings["presence_penalty"]
        return await client.chat.completions.create(**kwargs)

    context_length = llm_settings.get("context_length") or 8000
    max_input_tokens = int(context_length * 0.7)

    try:
        response = await _do_call(prompt)
    except Exception as exc:
        err_str = str(exc).lower()
        if any(kw in err_str for kw in CONTEXT_EXCEEDED_KEYWORDS):
            # 使用智能截断替代粗暴对半切
            truncated_sp, truncated_prompt = _truncate_prompt_by_priority(
                system_prompt, prompt, max_tokens=max_input_tokens,
            )
            response = await _do_call(truncated_prompt, truncated_sp)
        else:
            raise

    async for chunk in response:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta


async def _generate_message_summary_with_settings(
    llm_settings: Dict[str, Any],
    content: str,
) -> Dict[str, Any]:
    started = time.perf_counter()
    fallback_summary = _build_extractive_summary(content)
    fallback_score = _score_summary_consistency(content, fallback_summary)
    summary = fallback_summary
    semantic_consistency = fallback_score
    source = "extractive_guardrail"

    try:
        llm_summary = await _call_llm_text_with_settings(
            llm_settings,
            _build_message_summary_prompt(content),
            "你是严谨的会议摘要助手，负责输出高保真、短摘要，不得遗漏结论、行动项和数值结论。",
            temperature=0.1,
        )
        llm_summary = _normalize_summary_text(llm_summary)
        llm_score = _score_summary_consistency(content, llm_summary)
        if llm_summary and llm_score >= 95.0:
            summary = llm_summary
            semantic_consistency = llm_score
            source = "llm"
    except Exception:
        pass

    duration_ms = int((time.perf_counter() - started) * 1000)
    return {
        "summary": summary,
        "summary_metrics": {
            "duration_ms": duration_ms,
            "summary_length": len(summary),
            "semantic_consistency": semantic_consistency,
            "source": source,
            "generated_at": _utcnow().isoformat(),
            "meets_rt_target": duration_ms <= SUMMARY_RT_TARGET_MS,
        },
    }


async def _summarize_message_batch(
    request: RuntimeMessageSummaryRequest,
) -> RuntimeMessageSummaryResponse:
    started = time.perf_counter()
    llm_settings = await _load_llm_settings(request.model_id)
    items: List[RuntimeMessageSummaryItem] = []

    for message in request.messages:
        existing_summary = _normalize_summary_text(message.summary or "")
        existing_metrics = message.summary_metrics or {}
        existing_score = float(existing_metrics.get("semantic_consistency") or 0)
        cache_hit = False

        if existing_summary and existing_score >= 95.0 and not request.force_refresh:
            summary_text = existing_summary
            metrics = {
                **existing_metrics,
                "duration_ms": int(existing_metrics.get("duration_ms") or 0),
                "semantic_consistency": existing_score,
                "meets_rt_target": bool(existing_metrics.get("meets_rt_target", True)),
            }
            cache_hit = True
        else:
            cache_key = f"{SUMMARY_CACHE_PREFIX}{_build_summary_cache_key(request.model_id, message.content)}"
            cached = await cache_get(cache_key)
            if cached and not request.force_refresh:
                summary_text = str(cached["summary"])
                metrics = dict(cached["summary_metrics"])
                cache_hit = True
            else:
                generated = await _generate_message_summary_with_settings(llm_settings, message.content)
                summary_text = str(generated["summary"])
                metrics = dict(generated["summary_metrics"])
                await cache_set(cache_key, generated, ttl_seconds=SUMMARY_CACHE_TTL_SECONDS)

        items.append(
            RuntimeMessageSummaryItem(
                message_id=message.id,
                summary=summary_text,
                semantic_consistency=float(metrics.get("semantic_consistency") or 0),
                duration_ms=int(metrics.get("duration_ms") or 0),
                cache_hit=cache_hit,
                meets_rt_target=bool(metrics.get("meets_rt_target", False)),
            )
        )

    durations = sorted(item.duration_ms for item in items)
    total_duration_ms = int((time.perf_counter() - started) * 1000)
    await _record_event(
        room_id=request.room_id,
        task_id=None,
        event_type="summary.batch.completed",
        event_payload={
            "message_count": len(items),
            "cache_hits": len([item for item in items if item.cache_hit]),
            "summary_lengths": [len(item.summary) for item in items],
            "semantic_consistency_min": min((item.semantic_consistency for item in items), default=100.0),
        },
        duration_ms=total_duration_ms,
    )
    return RuntimeMessageSummaryResponse(
        items=items,
        avg_duration_ms=int(sum(durations) / len(durations)) if durations else 0,
        p95_duration_ms=durations[max(0, math.ceil(len(durations) * 0.95) - 1)] if durations else 0,
    )


async def _call_llm_json(model_id: int, prompt: str, system_prompt: str) -> Dict[str, Any]:
    llm_settings = await _load_llm_settings(model_id)
    return await _call_llm_json_with_settings(llm_settings, prompt, system_prompt)


async def _call_llm_json_with_settings(
    llm_settings: Dict[str, Any],
    prompt: str,
    system_prompt: str,
) -> Dict[str, Any]:
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
        if llm_settings.get("max_tokens") is not None:
            kwargs["max_tokens"] = llm_settings["max_tokens"]
        if llm_settings.get("top_p") is not None:
            kwargs["top_p"] = llm_settings["top_p"]
        if llm_settings.get("frequency_penalty") is not None:
            kwargs["frequency_penalty"] = llm_settings["frequency_penalty"]
        if llm_settings.get("presence_penalty") is not None:
            kwargs["presence_penalty"] = llm_settings["presence_penalty"]
        return await client.chat.completions.create(**kwargs)

    context_length = llm_settings.get("context_length") or 8000
    max_input_tokens = int(context_length * 0.7)

    try:
        response = await _do_call(prompt)
    except Exception as exc:
        err_str = str(exc).lower()
        if any(kw in err_str for kw in CONTEXT_EXCEEDED_KEYWORDS):
            truncated_sp, truncated_prompt = _truncate_prompt_by_priority(
                system_prompt, prompt, max_tokens=max_input_tokens,
            )
            response = await _do_call(truncated_prompt)
        else:
            raise

    content = response.choices[0].message.content or "{}"
    return _as_json_dict(content, {})


def _build_roundtable_system_prompt(
    payload: Dict[str, Any],
    role: Dict[str, Any],
    stage: str,
) -> str:
    prompt_templates = payload.get("prompt_templates") or {}
    user_demand = _safe_text(payload.get("initial_demand")) or _safe_text(payload.get("user_message")) or "未提供"
    expected_result = payload.get("expected_result") or ""
    role_name = role.get("name") or "角色"
    role_stance = role.get("stance") or "中立"

    base = [
        prompt_templates.get("prompt_base")
        or "你是圆桌创意中的一个角色，请保持高信噪比，避免客套话、重复和盲目附和。",
        f"你的身份：{role_name}（立场：{role_stance}）。",
        f"用户原始需求：{user_demand}。",
        f"期望结果：{expected_result or '未提供'}。",
        "请优先指出有价值的新信息、风险和分歧，不要复述别人已经说过的话。",
        "如果你同意某个观点，必须补充证据、边界或执行条件，禁止空泛附和。",
        "你的每次输出都必须覆盖：问题/风险、依据/验证、建议方案、预期效果/阈值。",
        "禁止只提问题不提方案；禁止给出无法验证的空泛判断。",
    ]
    soul_config = role.get("soul_config") or role.get("soulConfig")
    if soul_config:
        # 安全扫描灵魂配置
        try:
            _guard = get_safety_guard()
            sanitized_soul, _ = _guard.scan_soul_config(soul_config)
            base.extend(["", sanitized_soul])
        except Exception:
            base.extend(["", soul_config])

    is_audit = role.get("id") == "audit" or "审计官" in role_name
    if stage == "brief":
        if is_audit and prompt_templates.get("prompt_audit_brief"):
            base.extend(["", prompt_templates["prompt_audit_brief"]])
        elif prompt_templates.get("prompt_brief_stage"):
            base.extend(["", prompt_templates["prompt_brief_stage"]])
        else:
            base.extend(
                [
                    "",
                    "当前处于「脑暴发散阶段」。",
                    "只输出 3-5 条核心判断或建议，避免总结成大而全方案。",
                    "优先暴露分歧、漏洞、前提假设和增量机会。",
                    "使用 Markdown 无序列表。",
                ]
            )
    else:
        if is_audit and prompt_templates.get("prompt_audit_final"):
            base.extend(["", prompt_templates["prompt_audit_final"]])
        elif prompt_templates.get("prompt_final_stage"):
            base.extend(["", prompt_templates["prompt_final_stage"]])
        else:
            base.extend(
                [
                    "",
                    "当前处于「收敛定稿阶段」。",
                    "请输出可执行方案，至少覆盖目标拆解、关键路径、风险对策、验证指标和下一步行动。",
                    "保留必要分歧，但必须给出建议结论。",
                    "使用 Markdown 输出。",
                ]
            )

    system_prompt = _safe_text(payload.get("system_prompt"))
    if system_prompt:
        # 安全扫描用户自定义系统提示词
        try:
            _guard = get_safety_guard()
            sanitized_sp, _ = _guard.scan_system_prompt(system_prompt)
            base.extend(["", f"补充系统提示词：{sanitized_sp}"])
        except Exception:
            base.extend(["", f"补充系统提示词：{system_prompt}"])
    return "\n".join(base)


def _build_roundtable_user_prompt(
    payload: Dict[str, Any],
    role: Dict[str, Any],
    stage: str,
    user_message: str,
    memory_summary: str,
) -> str:
    role_name = role.get("name") or "角色"
    role_stance = role.get("stance") or "中立"
    user_demand = _safe_text(payload.get("initial_demand")) or _safe_text(payload.get("user_message")) or "未指定需求"
    return f"""【讨论阶段】{stage}
【原始需求】{user_demand}
【角色身份】{role_name}（{role_stance}）
【讨论摘要】
{memory_summary or '暂无摘要'}

【本轮输入】
{user_message}

请以你的角色身份直接回应：
1. 必须围绕核心目标，不要跑题。
2. 必须提供新的判断、补充或反驳，不能机械重复已有内容。
3. 如果发现前提不足，请明确指出需要验证什么。
4. 输出内容保持精炼，避免客套。
5. 必须按以下四段结构输出：问题/风险、依据/验证、建议方案、预期效果/阈值。"""


def _compose_role_turn_instruction(
    role: Dict[str, Any],
    round_index: int,
    base_user_message: str,
    recent_peer_messages: List[Dict[str, Any]],
) -> str:
    role_name = role.get("name") or "角色"
    interaction_lines: List[str] = []
    for item in recent_peer_messages[:2]:
        peer_name = item.get("speaker_name") or "其他角色"
        snippet = _safe_text(item.get("content"))[:140]
        if snippet:
            interaction_lines.append(f"- 必须回应 {peer_name} 的观点：{snippet}")

    interaction_block = "\n".join(interaction_lines) if interaction_lines else "- 首轮允许直接提出关键判断，但至少补充一条可执行建议。"

    return (
        f"{base_user_message}\n\n"
        f"【本轮要求】\n"
        f"- 当前是第 {round_index} 轮，请只输出最关键的 3-4 条。\n"
        f"- 你必须输出建设性方案，不能只提问题。\n"
        f"- 你的每条观点都尽量包含可验证依据或待验证条件。\n"
        f"- 若存在分歧，请明确点名回应其他角色。\n"
        f"【必须回应】\n{interaction_block}\n\n"
        f"【输出格式】\n"
        f"### {role_name} 观点\n"
        f"1. 问题/风险：...\n"
        f"2. 依据/验证：...\n"
        f"3. 建议方案：...\n"
        f"4. 预期效果/阈值：...\n"
    )


async def _aggregate_round_insights(
    llm_settings: Dict[str, Any],
    payload: Dict[str, Any],
    role_messages: List[Dict[str, Any]],
    current_round: int,
) -> Dict[str, Any]:
    if not role_messages:
        return {
            "host_message": "",
            "discussion_metrics": {
                "round": current_round,
                "new_points": 0,
                "duplicate_rate": 0,
                "problem_solution_ratio": "0:0",
                "conflict_count": 0,
                "avg_role_duration_ms": 0,
                "resolved_topics": 0,
            },
            "next_focus": "",
        }

    transcript = "\n\n".join(
        f"[{msg.get('speaker_name')}] (耗时 {int(msg.get('duration_ms') or 0)}ms)\n{_safe_text(msg.get('content'))}"
        for msg in role_messages
    )
    prompt = (
        f"【原始需求】{_safe_text(payload.get('initial_demand')) or _safe_text(payload.get('user_message')) or '未提供'}\n"
        f"【期望结果】{_safe_text(payload.get('expected_result')) or '未提供'}\n"
        f"【当前轮次】{current_round}\n"
        f"【本轮角色输出】\n{transcript}\n\n"
        "请严格输出 JSON："
        "{"
        "\"summary\":\"40字内主持人聚合结论\","
        "\"ranked_points\":[\"去重后的重点1\",\"去重后的重点2\",\"去重后的重点3\"],"
        "\"conflicts\":[\"关键冲突1\",\"关键冲突2\"],"
        "\"next_focus\":\"下一轮应聚焦的问题\","
        "\"duplicate_rate\":0,"
        "\"problem_count\":0,"
        "\"solution_count\":0,"
        "\"resolved_topics\":0"
        "}"
    )
    system_prompt = "你是圆桌讨论的聚合主持人，只负责去重、提炼冲突、排序重点，并输出严格 JSON。"
    try:
        result = await _call_llm_json_with_settings(llm_settings, prompt, system_prompt)
    except Exception:
        result = {}

    ranked_points = [str(item).strip() for item in (result.get("ranked_points") or []) if str(item).strip()]
    conflicts = [str(item).strip() for item in (result.get("conflicts") or []) if str(item).strip()]
    summary = _safe_text(result.get("summary")) or "主持人已完成本轮聚合。"
    next_focus = _safe_text(result.get("next_focus")) or "请继续围绕关键分歧补充证据与可执行方案。"
    duplicate_rate = int(result.get("duplicate_rate") or 0)
    problem_count = int(result.get("problem_count") or 0)
    solution_count = int(result.get("solution_count") or 0)
    resolved_topics = int(result.get("resolved_topics") or 0)
    avg_role_duration_ms = int(
        sum(int(msg.get("duration_ms") or 0) for msg in role_messages) / max(len(role_messages), 1)
    )

    host_lines = [f"### 主持人聚合", f"- 本轮总结：{summary}"]
    if ranked_points:
        host_lines.append("- 去重后重点：")
        host_lines.extend([f"  - {item}" for item in ranked_points[:3]])
    if conflicts:
        host_lines.append("- 关键冲突：")
        host_lines.extend([f"  - {item}" for item in conflicts[:2]])
    host_lines.append(f"- 下一轮聚焦：{next_focus}")

    return {
        "host_message": "\n".join(host_lines),
        "next_focus": next_focus,
        "discussion_metrics": {
            "round": current_round,
            "new_points": len(ranked_points),
            "duplicate_rate": duplicate_rate,
            "problem_solution_ratio": f"{problem_count}:{solution_count}",
            "conflict_count": len(conflicts),
            "avg_role_duration_ms": avg_role_duration_ms,
            "resolved_topics": resolved_topics,
        },
    }


def _build_canvas_items(board_state: Dict[str, Any], stage: str) -> Dict[str, List[str]]:
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


async def _record_event(
    *,
    room_id: Optional[str],
    event_type: str,
    event_payload: Optional[Dict[str, Any]],
    user_id: Optional[int] = None,
    task_id: Optional[str] = None,
    success: bool = True,
    duration_ms: Optional[int] = None,
) -> None:
    async with AsyncSessionLocal() as db:
        db.add(
            RuntimeEvent(
                room_id=room_id,
                user_id=user_id,
                task_id=task_id,
                event_type=event_type,
                event_payload=event_payload,
                success=success,
                duration_ms=duration_ms,
            )
        )
        await db.commit()


async def _set_task_state(
    task_id: str,
    *,
    status: Optional[str] = None,
    result_payload: Optional[Dict[str, Any]] = None,
    error_message: Optional[str] = None,
    started: bool = False,
    finished: bool = False,
    persist: bool = True,
) -> Optional[RuntimeTask]:
    state_cache_key = f"{TASK_STATE_PREFIX}{task_id}"

    if not persist:
        cached_task = await cache_get(state_cache_key)
        if cached_task is None:
            async with AsyncSessionLocal() as db:
                result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
                task = result.scalars().first()
                if not task:
                    return None
                cached_task = _serialize_runtime_task(task)
                await cache_set(state_cache_key, cached_task, ttl_seconds=TASK_STATE_TTL_SECONDS)

        if status is not None:
            cached_task["status"] = status
        if result_payload is not None:
            cached_task["result_payload"] = result_payload
        if error_message is not None:
            cached_task["error_message"] = error_message
        if started:
            cached_task["started_at"] = _utcnow().isoformat()
        if finished:
            cached_task["finished_at"] = _utcnow().isoformat()

        await cache_set(state_cache_key, cached_task, ttl_seconds=TASK_STATE_TTL_SECONDS)
        await _publish_task_stream_event(task_id, "task.update", dict(cached_task))
        return None

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
        task = result.scalars().first()
        if not task:
            return None
        if status is not None:
            task.status = status
        if result_payload is not None:
            task.result_payload = result_payload
        if error_message is not None:
            task.error_message = error_message
        if started:
            task.started_at = _utcnow()
        if finished:
            task.finished_at = _utcnow()
        await db.commit()
        await db.refresh(task)
        serialized = _serialize_runtime_task(task)
        await cache_set(state_cache_key, serialized, ttl_seconds=TASK_STATE_TTL_SECONDS)
        await _publish_task_stream_event(task.task_id, "task.update", serialized)
        return task


async def _get_task_payload(task_id: str) -> Optional[Dict[str, Any]]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
        task = result.scalars().first()
        if not task:
            return None
        return task.request_payload or {}


async def _is_cancel_requested(task_id: str) -> bool:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(RuntimeTask.status).where(RuntimeTask.task_id == task_id))
        status = result.scalar_one_or_none()
        return status in {"cancel_requested", "canceled"}


async def _evaluate_roundtable(
    llm_settings: Dict[str, Any],
    payload: Dict[str, Any],
    messages: List[Dict[str, Any]],
    current_round: int,
    memory_summary: str,
) -> Dict[str, Any]:
    transcript = _build_recent_transcript(messages, memory_summary=memory_summary, max_messages=10, max_chars=3600)
    prompt_payload = {
        "initial_demand": payload.get("initial_demand") or "",
        "user_message": payload.get("user_message") or "",
        "expected_result": payload.get("expected_result") or "",
        "transcript": transcript,
        "current_round": current_round,
    }

    async def get_progress() -> Dict[str, Any]:
        try:
            result = await _call_llm_json_with_settings(
                llm_settings,
                _build_progress_prompt(prompt_payload),
                "你是一个公正严谨的裁判大模型，只输出 JSON。",
            )
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
            result = await _call_llm_json_with_settings(
                llm_settings,
                _build_board_prompt(prompt_payload),
                "你是一个高信噪比的会议书记员，只输出 JSON。",
            )
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
) -> Dict[str, Any]:
    started = time.perf_counter()
    content = ""
    # 通过 msg_id 找到对应的消息索引
    msg_idx = None
    for i, msg in enumerate(current_messages):
        if msg.get("id") == msg_id:
            msg_idx = i
            break
    if msg_idx is None:
        msg_idx = len(current_messages) - 1  # 回退到兼容模式
    
    # 保留角色开始发言的时间戳，确保消息时间顺序正确
    original_created_at = current_messages[msg_idx].get("created_at") or _utcnow().isoformat()
    
    try:
        prompt = _build_roundtable_user_prompt(payload, role, stage, user_message, memory_summary)
        system_prompt = _build_roundtable_system_prompt(payload, role, stage)
        
        last_snapshot_time = time.time()
        last_delta_time = time.time()
        delta_buffer = ""
        
        async for chunk in _call_llm_stream_with_settings(llm_settings, prompt, system_prompt):
            # 检查取消信号
            if cancel_event.is_set():
                content += "\n> (已取消)"
                break

            content += chunk
            delta_buffer += chunk

            now = time.time()
            if delta_buffer and now - last_delta_time >= 0.04:
                await _publish_task_stream_payload(
                    task_id,
                    {
                        "event": "message.delta",
                        "delta": {"msg_id": msg_id, "text": delta_buffer},
                    },
                )
                delta_buffer = ""
                last_delta_time = now
            
            if now - last_snapshot_time > 1.2:
                current_messages[msg_idx]["content"] = content
                current_messages[msg_idx]["streaming"] = True
                await _set_task_state(
                    task_id, 
                    result_payload={
                        **base_result_payload,
                        "messages": current_messages,
                    },
                    persist=False,
                )
                last_snapshot_time = now
                
    except Exception as exc:
        if not content:
            content = f"> 生成失败：{exc}"
        else:
            content += f"\n> (生成中断：{exc})"

    normalized_content = content.strip()
    if delta_buffer:
        await _publish_task_stream_payload(
            task_id,
            {
                "event": "message.delta",
                "delta": {"msg_id": msg_id, "text": delta_buffer},
            },
        )

    # 立即将已完成的流式消息落库并推送给前端，不等待摘要生成
    # 摘要由调用方通过 asyncio.create_task 并发生成，不阻塞下一个角色的流式输出
    # created_at 使用角色开始发言的时间，保证发言顺序与时间戳顺序一致
    final_msg: Dict[str, Any] = {
        "id": msg_id,
        "speaker_id": role.get("id") or "",
        "speaker_name": role.get("name") or "角色",
        "speaker_type": "agent",
        "content": normalized_content,
        "summary": "",          # 由调用方并发填充
        "summary_metrics": None,
        "streaming": False,
        "created_at": original_created_at,
        "duration_ms": int((time.perf_counter() - started) * 1000),
    }

    current_messages[msg_idx] = final_msg
    # 使用 persist=False 快速推送，调用方会在外层做 persist=True 落库
    # 避免双重 persist=True 导致的 DB 写入延迟堆积
    await _set_task_state(
        task_id,
        result_payload={
            **base_result_payload,
            "messages": current_messages,
        },
        persist=False,
    )
    # 让出事件循环，确保 SSE 推送事件能被前端及时消费
    await asyncio.sleep(0.05)
    return final_msg


async def _process_roundtable_task(task_id: str) -> None:
    payload = await _get_task_payload(task_id)
    if not payload:
        return

    start_time = time.perf_counter()
    room_id = payload.get("room_id")
    cancel_event = _register_task_cancel_event(task_id)
    try:
        llm_settings = await _load_llm_settings(payload["model_id"])
        await _set_task_state(task_id, status="running", started=True)

        roles = [role for role in payload.get("roles", []) if role.get("selected")]
        if not roles:
            raise RuntimeError("No selected roles")

        current_messages = [_normalize_message(message) for message in payload.get("prior_messages", [])]
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
        if not any(message.get("id") == user_message_id for message in current_messages):
            current_messages.append(user_message_payload)

        current_stage = payload.get("roundtable_stage") or "brief"
        auto_continue = bool(payload.get("auto_continue", True))
        auto_brainstorm = bool(payload.get("auto_brainstorm", True))
        max_dialogue_rounds = max(int(payload.get("max_dialogue_rounds") or 1), 1)
        current_round = int(payload.get("auto_round_count") or 0)
        memory_summary = _safe_text(payload.get("memory_summary"))
        auxiliary_model_id = payload.get("auxiliary_model_id")

        # 初始化分层记忆（如果传入了 structured_memory）
        _memory_mgr = MemoryManager()
        structured_memory_data = payload.get("structured_memory")
        _memory_mgr.initialize(raw_summary=memory_summary, structured_data=structured_memory_data)

        # 初始化上下文压缩器
        context_length = llm_settings.get("context_length") or 8000
        _compressor = ContextCompressor(context_length=context_length)

        # 读取主持人总结模式：请求级覆盖 > 数据库配置 > 默认 auto
        request_summary_mode = payload.get("moderator_summary_mode")
        if request_summary_mode and request_summary_mode in MODERATOR_SUMMARY_MODES:
            moderator_summary_mode = request_summary_mode
        else:
            moderator_summary_mode = await _get_moderator_summary_mode()

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
        await _set_task_state(task_id, result_payload=base_result_payload)

        last_checked_msg_index = max(0, len(current_messages) - 1)

        judge_state: Optional[Dict[str, Any]] = None
        board_state: Optional[Dict[str, Any]] = None

        while True:
            if cancel_event.is_set() or await _is_cancel_requested(task_id):
                canceled_payload = {**base_result_payload, "messages": current_messages}
                await _set_task_state(
                    task_id,
                    status="canceled",
                    result_payload=canceled_payload,
                    finished=True,
                )
                await _record_event(
                    room_id=room_id,
                    task_id=task_id,
                    event_type="task.roundtable_orchestration.canceled",
                    event_payload={"stage": current_stage, "auto_round_count": current_round},
                )
                return

            # 检查上一轮新增消息（或本轮用户输入）中是否有 @角色名
            mentioned_role = None
            for i in range(last_checked_msg_index, len(current_messages)):
                content = current_messages[i].get("content", "")
                for role in roles:
                    role_name = role.get("name", "")
                    # 匹配 @角色名，可能后面跟着空格或标点（使用 re.escape 防止特殊字符误匹配）
                    if role_name and re.search(r'@' + re.escape(role_name) + r'(?:\s|[^\w]|$)', content):
                        mentioned_role = role
                        break
                if mentioned_role:
                    break
            
            # 更新已检查的索引，下一轮只检查新产生的消息
            last_checked_msg_index = len(current_messages)

            # 获取调度模式配置（带进程内缓存）
            scheduling_mode = await _get_scheduling_mode()

            if mentioned_role:
                speaking_roles = [mentioned_role]
                schedule_reason = "mentioned"
            elif scheduling_mode in {"parallel_all", "sequential_all", "single_round_robin"}:
                speaking_roles = roles
                schedule_reason = "parallel_all"
            elif scheduling_mode == "single_random":
                import random
                speaking_roles = [random.choice(roles)]
                schedule_reason = "single_random"
            elif scheduling_mode == "host_specify":
                # 由主持人(LLM)决定下一位发言人，使用 JSON 结构化输出
                role_names = [r.get("name", "未知") for r in roles]
                prompt_for_host = f"""【讨论摘要】
{memory_summary or '暂无摘要'}

【候选角色】
{json.dumps(role_names, ensure_ascii=False)}

请根据讨论进展，决定下一位最适合发言的角色。
严格输出 JSON：{{"chosen_role": "角色名"}}"""
                system_prompt_for_host = "你是一个会议主持人，只负责指定下一位发言人。只输出 JSON。"
                try:
                    host_result = await _call_llm_json_with_settings(
                        llm_settings, prompt_for_host, system_prompt_for_host,
                    )
                    chosen_name = str(host_result.get("chosen_role", "")).strip()
                    # 精确匹配
                    chosen_role = next((r for r in roles if r.get("name", "") == chosen_name), None)
                    # 模糊匹配：角色名包含在返回值中
                    if not chosen_role and chosen_name:
                        chosen_role = next((r for r in roles if r.get("name", "") in chosen_name or chosen_name in r.get("name", "")), None)
                    # 仍然未匹配，按轮询降级（比随机更可预测）
                    if not chosen_role:
                        fallback_idx = current_round % len(roles)
                        chosen_role = roles[fallback_idx]
                    speaking_roles = [chosen_role]
                except Exception:
                    # 降级为轮询
                    fallback_idx = current_round % len(roles)
                    speaking_roles = [roles[fallback_idx]]
                schedule_reason = "host_specify"
            else: # single_round_robin
                role_index = current_round % len(roles)
                speaking_roles = [roles[role_index]]
                schedule_reason = "single_round_robin"

            # 如果是主持人指定且不是因为@提及被覆盖，插入一条主持人的提示消息
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
                base_result_payload = {
                    **base_result_payload,
                    "messages": current_messages,
                }
                await _set_task_state(task_id, result_payload=base_result_payload)

            pending_summary_tasks: List[tuple] = []
            recent_peer_messages = [
                msg for msg in current_messages
                if msg.get("speaker_type") == "agent" and not msg.get("streaming") and _safe_text(msg.get("content"))
            ][-8:]

            temp_message_specs: List[tuple[Dict[str, Any], str, str]] = []
            for idx, role in enumerate(speaking_roles):
                temp_msg_id = f"m_{role.get('id', 'agent')}_{uuid.uuid4().hex[:10]}"
                current_messages.append(
                    {
                        "id": temp_msg_id,
                        "speaker_id": role.get("id") or "",
                        "speaker_name": role.get("name") or "角色",
                        "speaker_type": "agent",
                        "content": "",
                        "streaming": True,
                        "created_at": _utcnow().isoformat(),
                    }
                )
                peer_candidates = [msg for msg in recent_peer_messages if msg.get("speaker_id") != role.get("id")]
                if peer_candidates:
                    pivot = idx % len(peer_candidates)
                    targeted_messages = [peer_candidates[pivot]]
                    if len(peer_candidates) > 1:
                        targeted_messages.append(peer_candidates[(pivot + 1) % len(peer_candidates)])
                else:
                    targeted_messages = []
                role_turn_instruction = _compose_role_turn_instruction(
                    role,
                    current_round + 1,
                    user_message,
                    targeted_messages,
                )
                temp_message_specs.append((role, temp_msg_id, role_turn_instruction))

            base_result_payload = {**base_result_payload, "messages": current_messages}
            await _set_task_state(task_id, result_payload=base_result_payload, persist=False)

            role_tasks = [
                _generate_role_reply_stream(
                    llm_settings,
                    payload,
                    role,
                    current_stage,
                    role_turn_instruction,
                    memory_summary,
                    task_id,
                    current_messages,
                    base_result_payload,
                    temp_msg_id,
                    cancel_event,
                )
                for role, temp_msg_id, role_turn_instruction in temp_message_specs
            ]
            role_results = await asyncio.gather(*role_tasks, return_exceptions=True)
            round_role_messages: List[Dict[str, Any]] = []
            for result in role_results:
                if isinstance(result, Exception):
                    raise result
                round_role_messages.append(result)
                summary_task = asyncio.create_task(
                    _generate_message_summary_with_settings(llm_settings, result["content"])
                )
                pending_summary_tasks.append((result["id"], summary_task))
                _memory_mgr.update_from_message(result)

            memory_summary = _memory_mgr.get_flat_summary()
            base_result_payload = {
                **base_result_payload,
                "messages": current_messages,
                "memory_summary": memory_summary,
            }
            await _set_task_state(task_id, result_payload=base_result_payload, persist=False)

            # 6. 各角色摘要并发生成，完成一个即推送一次，避免长时间无任何 SSE/缓存更新
            if pending_summary_tasks:
                msg_id_to_idx: Dict[str, int] = {
                    msg["id"]: idx for idx, msg in enumerate(current_messages)
                }
                task_to_msg_id: Dict[asyncio.Task, str] = {
                    summary_task: m_id for m_id, summary_task in pending_summary_tasks
                }
                pending_summary_set = set(task_to_msg_id.keys())
                summary_updated = False
                while pending_summary_set:
                    done, pending_summary_set = await asyncio.wait(
                        pending_summary_set, return_when=asyncio.FIRST_COMPLETED
                    )
                    for finished in done:
                        m_id = task_to_msg_id.get(finished)
                        if not m_id:
                            continue
                        try:
                            result = finished.result()
                        except Exception:
                            continue
                        if isinstance(result, Exception):
                            continue
                        idx = msg_id_to_idx.get(m_id)
                        if idx is None:
                            continue
                        current_messages[idx]["summary"] = result.get("summary", "")
                        current_messages[idx]["summary_metrics"] = result.get("summary_metrics")
                        summary_updated = True
                        await _set_task_state(
                            task_id,
                            result_payload={**base_result_payload, "messages": list(current_messages)},
                            persist=False,
                        )
                if summary_updated:
                    # 摘要全部就绪后重建 memory_summary，供裁判与下一轮使用
                    # 使用快照而非引用，避免并发修改（streaming 消息的 content 可能被实时更新）
                    messages_snapshot = [dict(m) for m in current_messages if not m.get("streaming")]
                    # 优先使用分层记忆管理器重建
                    for snap_msg in messages_snapshot:
                        _memory_mgr.update_from_message(snap_msg)
                    memory_summary = _memory_mgr.get_flat_summary()
                    base_result_payload = {
                        **base_result_payload,
                        "messages": current_messages,
                        "memory_summary": memory_summary,
                    }
                    await _set_task_state(task_id, result_payload=base_result_payload)

            aggregation = await _aggregate_round_insights(
                llm_settings,
                payload,
                round_role_messages,
                current_round + 1,
            )
            aggregate_message = {
                "id": f"m_host_aggregate_{uuid.uuid4().hex[:10]}",
                "speaker_id": "host",
                "speaker_name": "主持人",
                "speaker_type": "host",
                "content": aggregation["host_message"],
                "streaming": False,
                "created_at": _utcnow().isoformat(),
            }
            current_messages.append(aggregate_message)
            _memory_mgr.update_from_message(aggregate_message)
            memory_summary = _memory_mgr.get_flat_summary()
            base_result_payload = {
                **base_result_payload,
                "messages": current_messages,
                "memory_summary": memory_summary,
                "discussion_metrics": aggregation["discussion_metrics"],
                "next_prompt": aggregation["next_focus"],
            }
            await _set_task_state(task_id, result_payload=base_result_payload, persist=False)

            if current_stage == "brief":
                current_round += 1

            # ---- 上下文压缩（智能摘要替代粗暴截断）----
            try:
                if _compressor.should_compress_preflight(current_messages):
                    # 使用辅助模型进行压缩
                    _model_router = get_model_router()
                    compress_settings = await _model_router.get_settings_for_task(
                        llm_settings, auxiliary_model_id, TaskType.CONTEXT_COMPRESS,
                    )
                    _compress_caller = build_compressor_llm_caller(compress_settings)
                    compressed = await _compressor.compress(current_messages, _compress_caller)
                    if compressed is not current_messages:
                        current_messages = compressed
                        base_result_payload = {**base_result_payload, "messages": current_messages}
                        await _set_task_state(task_id, result_payload=base_result_payload, persist=False)
            except Exception as _comp_err:
                logger.warning("上下文压缩失败（不影响讨论继续）: %s", _comp_err)

            # ---- 评委评估 ----
            evaluation = await _evaluate_roundtable(
                llm_settings,
                payload,
                [m for m in current_messages if not m.get("streaming")],
                current_round,
                memory_summary,
            )

            judge_state = evaluation["judge_state"]
            board_state = evaluation["consensus_board"]
            # 更新分层记忆的共识/分歧层
            _memory_mgr.update_from_board(board_state)
            memory_summary = _memory_mgr.get_flat_summary()
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
            await _set_task_state(task_id, result_payload=base_result_payload)

            if current_stage == "final":
                duration_ms = int((time.perf_counter() - start_time) * 1000)
                await _set_task_state(
                    task_id,
                    status="completed",
                    result_payload={**base_result_payload, "final_generated": True},
                    finished=True,
                )
                await _record_event(
                    room_id=room_id,
                    task_id=task_id,
                    event_type="task.roundtable_orchestration.completed",
                    event_payload={
                        "stage": current_stage,
                        "auto_round_count": current_round,
                        "message_count": len(current_messages),
                    },
                    duration_ms=duration_ms,
                )
                return

            if not auto_continue:
                duration_ms = int((time.perf_counter() - start_time) * 1000)
                await _set_task_state(
                    task_id,
                    status="completed",
                    result_payload={**base_result_payload, "final_generated": False},
                    finished=True,
                )
                await _record_event(
                    room_id=room_id,
                    task_id=task_id,
                    event_type="task.roundtable_orchestration.completed",
                    event_payload={
                        "stage": current_stage,
                        "auto_round_count": current_round,
                        "message_count": len(current_messages),
                    },
                    duration_ms=duration_ms,
                )
                return

            reached_expected_result = bool(judge_state.get("reached"))
            reached_max_round = current_round >= max_dialogue_rounds

            # 根据主持人总结模式决定是否自动进入 final 阶段
            # disabled/manual 模式下不自动进入 final，只能由用户手动触发
            # per_round 模式下每轮都进入 final
            # auto 模式下裁判判定收敛或达到最大轮数时自动进入 final
            summary_mode = moderator_summary_mode
            should_converge = False
            if summary_mode == "disabled":
                # 禁用总结：永远不自动进入 final
                should_converge = False
            elif summary_mode == "manual":
                # 仅手动总结：不自动进入 final
                should_converge = False
            elif summary_mode == "per_round":
                # 每轮总结：每圈评估后都进入 final
                should_converge = True
            else:
                # auto（默认）：裁判判定收敛或达到最大轮数
                should_converge = reached_expected_result or reached_max_round

            if should_converge:
                current_stage = "final"
                user_message = (
                    (payload.get("prompt_templates") or {}).get("prompt_converge_trigger")
                    or "我觉得讨论已经收敛，请各角色基于当前讨论输出总结性方案。"
                )
                current_messages.append(
                    {
                        "id": f"m_host_{uuid.uuid4().hex[:10]}",
                        "speaker_id": "host",
                        "speaker_name": "主持人",
                        "speaker_type": "host",
                        "content": user_message,
                        "streaming": False,
                        "created_at": _utcnow().isoformat(),
                    }
                )
                memory_summary = _merge_memory_summary(memory_summary, current_messages)
                base_result_payload = {
                    **base_result_payload,
                    "messages": current_messages,
                    "stage": current_stage,
                    "last_user_message": user_message,
                    "memory_summary": memory_summary,
                    "transition_reason": "expected_result_reached" if reached_expected_result else "max_round_reached" if reached_max_round else "per_round_summary",
                }
                await _set_task_state(task_id, result_payload=base_result_payload)
                continue

            # disabled/manual 模式下达到最大轮数时，停止讨论但不进入 final
            if (summary_mode in ("disabled", "manual")) and reached_max_round:
                duration_ms = int((time.perf_counter() - start_time) * 1000)
                await _set_task_state(
                    task_id,
                    status="completed",
                    result_payload={**base_result_payload, "final_generated": False},
                    finished=True,
                )
                await _record_event(
                    room_id=room_id,
                    task_id=task_id,
                    event_type="task.roundtable_orchestration.completed",
                    event_payload={
                        "stage": current_stage,
                        "auto_round_count": current_round,
                        "message_count": len(current_messages),
                        "summary_mode": summary_mode,
                    },
                    duration_ms=duration_ms,
                )
                return

            next_prompt = _safe_text(judge_state.get("nextFocus")) or "请继续围绕期望结果推进，补足关键证据、约束和执行路径。"
            user_message = f"请继续推进：{next_prompt}"
            current_messages.append(
                {
                    "id": f"m_host_{uuid.uuid4().hex[:10]}",
                    "speaker_id": "host",
                    "speaker_name": "主持人",
                    "speaker_type": "host",
                    "content": user_message,
                    "streaming": False,
                    "created_at": _utcnow().isoformat(),
                }
            )
            memory_summary = _merge_memory_summary(memory_summary, current_messages)
            current_round += 1
            base_result_payload = {
                **base_result_payload,
                "messages": current_messages,
                "last_user_message": user_message,
                "next_prompt": next_prompt,
                "memory_summary": memory_summary,
                "auto_round_count": current_round,
            }
            await _set_task_state(task_id, result_payload=base_result_payload)
    except Exception as exc:
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        await _set_task_state(task_id, status="failed", error_message=str(exc), finished=True)
        await _record_event(
            room_id=room_id,
            task_id=task_id,
            event_type="task.failed",
            event_payload={"error": str(exc), "task_type": payload.get("task_type")},
            success=False,
            duration_ms=duration_ms,
        )
    finally:
        await cache_delete(f"{TASK_STATE_PREFIX}{task_id}")
        _unregister_task_cancel_event(task_id)


async def _process_runtime_task(task_id: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
        task = result.scalars().first()
        if not task:
            return

        payload = task.request_payload or {}
        task.status = "running"
        task.started_at = _utcnow()
        await db.commit()

    start_time = time.perf_counter()

    try:
        if task.task_type == "progress_evaluation":
            result_payload = await _call_llm_json(
                payload["model_id"],
                _build_progress_prompt(payload),
                "你是一个公正严谨的裁判大模型，只输出 JSON。",
            )
        elif task.task_type == "consensus_board":
            result_payload = await _call_llm_json(
                payload["model_id"],
                _build_board_prompt(payload),
                "你是一个高信噪比的会议书记员，只输出 JSON。",
            )
        elif task.task_type == "roundtable_orchestration":
            await _process_roundtable_task(task_id)
            return
        else:
            raise RuntimeError("Unsupported task type")

        duration_ms = int((time.perf_counter() - start_time) * 1000)
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
            task = result.scalars().first()
            if not task:
                return
            task.status = "completed"
            task.result_payload = result_payload
            task.finished_at = _utcnow()
            await db.commit()

        await _record_event(
            room_id=payload.get("room_id"),
            task_id=task_id,
            event_type=f"task.{task.task_type}.completed",
            event_payload=result_payload,
            duration_ms=duration_ms,
        )
    except Exception as exc:
        duration_ms = int((time.perf_counter() - start_time) * 1000)
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
            task = result.scalars().first()
            if task:
                task.status = "failed"
                task.error_message = str(exc)
                task.finished_at = _utcnow()
                await db.commit()

        await _record_event(
            room_id=payload.get("room_id"),
            task_id=task_id,
            event_type="task.failed",
            event_payload={"error": str(exc), "task_type": payload.get("task_type")},
            success=False,
            duration_ms=duration_ms,
        )
    finally:
        await cache_delete(f"{TASK_STATE_PREFIX}{task_id}")


async def _create_task_from_payload(
    task_type: str,
    room_id: str,
    model_id: int,
    request_payload: Dict[str, Any],
    db: AsyncSession,
) -> RuntimeTask:
    task = RuntimeTask(
        task_id=uuid.uuid4().hex,
        task_type=task_type,
        room_id=room_id,
        model_id=model_id,
        status="pending",
        request_payload=request_payload,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    serialized = _serialize_runtime_task(task)
    await cache_set(f"{TASK_STATE_PREFIX}{task.task_id}", serialized, ttl_seconds=TASK_STATE_TTL_SECONDS)
    await _publish_task_stream_event(task.task_id, "task.created", serialized)
    return task


async def _create_task(
    task_type: str,
    request: RuntimeTaskCreateRequest,
    db: AsyncSession,
) -> RuntimeTask:
    return await _create_task_from_payload(
        task_type,
        request.room_id,
        request.model_id,
        {
            "task_type": task_type,
            "room_id": request.room_id,
            "model_id": request.model_id,
            "transcript": request.transcript,
            "expected_result": request.expected_result,
            "current_round": request.current_round,
            "initial_demand": request.initial_demand or "",
            "trigger": request.trigger,
        },
        db,
    )


async def cleanup_old_tasks(max_age_hours: int = 72) -> int:
    """清理超过指定时间的已完成任务的大字段（保留任务记录，释放 result_payload 空间）。"""
    from datetime import timedelta
    cutoff = _utcnow() - timedelta(hours=max_age_hours)
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(RuntimeTask).where(
                RuntimeTask.status.in_(["completed", "failed", "canceled"]),
                RuntimeTask.finished_at < cutoff,
            )
        )
        old_tasks = result.scalars().all()
        count = len(old_tasks)
        for task in old_tasks:
            # 只清理 result_payload 中的大字段，保留任务记录本身
            if isinstance(task.result_payload, dict):
                task.result_payload = {
                    "cleaned": True,
                    "original_message_count": len(task.result_payload.get("messages", [])),
                }
        await db.commit()
        return count

