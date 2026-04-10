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


def _merge_memory_summary(memory_summary: str, messages: List[Dict[str, Any]], *, max_chars: int = 1200) -> str:
    snippets: List[str] = []
    if memory_summary:
        snippets.append(memory_summary)
    for item in messages[-6:]:
        speaker = item.get("speaker_name") or item.get("speakerName") or "未知角色"
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
    intent_card = payload.get("intent_card") or {}
    core_goal = intent_card.get("coreGoal") or intent_card.get("core_goal") or "未提供"
    pain_points = intent_card.get("painPoints") or intent_card.get("pain_points") or "未提供"
    constraints = intent_card.get("constraints") or "未提供"
    return f"""你是圆桌讨论的后台裁判。
请根据目标、约束、痛点与当前讨论内容，评估当前讨论的收敛进度与完成质量。

【核心目标】{core_goal}
【限制条件】{constraints}
【核心痛点】{pain_points}
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
    intent_card = payload.get("intent_card") or {}
    core_goal = intent_card.get("coreGoal") or intent_card.get("core_goal") or "未提供"
    return f"""你是圆桌讨论的书记员。
请基于当前讨论内容提炼当前已经形成的共识、尚未解决的争议，以及最值得继续追问的问题。

【核心目标】{core_goal}
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
        }


CONTEXT_EXCEEDED_KEYWORDS = (
    "context size has been exceeded",
    "maximum context length",
    "too many tokens",
    "context_length_exceeded",
    "context overflow",
)


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

    async def _do_call(p: str):
        return await client.chat.completions.create(
            model=llm_settings["model_name"],
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": p},
            ],
            temperature=llm_settings.get("temperature", 0.7) if temperature is None else temperature,
            stream=False,
        )

    try:
        result = await _do_call(prompt)
    except Exception as exc:
        err_str = str(exc).lower()
        if any(kw in err_str for kw in CONTEXT_EXCEEDED_KEYWORDS):
            # Retry with second half of the prompt (discard oldest half)
            mid = len(prompt) // 2
            truncated = prompt[mid:]
            result = await _do_call(truncated)
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

    async def _do_call(p: str):
        return await client.chat.completions.create(
            model=llm_settings["model_name"],
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": p},
            ],
            temperature=llm_settings.get("temperature", 0.7) if temperature is None else temperature,
            stream=True,
        )

    try:
        response = await _do_call(prompt)
    except Exception as exc:
        err_str = str(exc).lower()
        if any(kw in err_str for kw in CONTEXT_EXCEEDED_KEYWORDS):
            mid = len(prompt) // 2
            truncated = prompt[mid:]
            response = await _do_call(truncated)
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
        return await client.chat.completions.create(
            model=llm_settings["model_name"],
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": p},
            ],
            temperature=0.1,
            stream=False,
            response_format={"type": "json_object"},
        )

    try:
        response = await _do_call(prompt)
    except Exception as exc:
        err_str = str(exc).lower()
        if any(kw in err_str for kw in CONTEXT_EXCEEDED_KEYWORDS):
            mid = len(prompt) // 2
            response = await _do_call(prompt[mid:])
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
    intent_card = payload.get("intent_card") or {}
    core_goal = intent_card.get("coreGoal") or intent_card.get("core_goal") or "未提供"
    constraints = intent_card.get("constraints") or ""
    pain_points = intent_card.get("painPoints") or intent_card.get("pain_points") or ""
    expected_result = payload.get("expected_result") or ""
    role_name = role.get("name") or "角色"
    role_stance = role.get("stance") or "中立"

    base = [
        prompt_templates.get("prompt_base")
        or "你是圆桌创意中的一个角色，请保持高信噪比，避免客套话、重复和盲目附和。",
        f"你的身份：{role_name}（立场：{role_stance}）。",
        f"用户意图锚点：{core_goal}。",
        f"限制条件：{constraints or '未提供'}。",
        f"待解决痛点：{pain_points or '未提供'}。",
        f"期望结果：{expected_result or '未提供'}。",
        "请优先指出有价值的新信息、风险和分歧，不要复述别人已经说过的话。",
        "如果你同意某个观点，必须补充证据、边界或执行条件，禁止空泛附和。",
    ]
    soul_config = role.get("soul_config") or role.get("soulConfig")
    if soul_config:
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
        base.extend(["", f"补充系统提示词：{system_prompt}"])
    return "\n".join(base)


def _build_roundtable_user_prompt(
    payload: Dict[str, Any],
    role: Dict[str, Any],
    stage: str,
    user_message: str,
    transcript: str,
    memory_summary: str,
) -> str:
    role_name = role.get("name") or "角色"
    role_stance = role.get("stance") or "中立"
    core_goal = (
        (payload.get("intent_card") or {}).get("coreGoal")
        or (payload.get("intent_card") or {}).get("core_goal")
        or "未指定目标"
    )
    return f"""【讨论阶段】{stage}
【核心目标】{core_goal}
【角色身份】{role_name}（{role_stance}）
【滚动摘要】
{memory_summary or '暂无摘要'}

【最近对话】
{transcript or '暂无历史对话'}

【本轮输入】
{user_message}

请以你的角色身份直接回应：
1. 必须围绕核心目标，不要跑题。
2. 必须提供新的判断、补充或反驳，不能机械重复已有内容。
3. 如果发现前提不足，请明确指出需要验证什么。
4. 输出内容保持精炼，避免客套。"""


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
        "expected_result": payload.get("expected_result") or "",
        "transcript": transcript,
        "current_round": current_round,
        "intent_card": payload.get("intent_card") or {},
    }

    async def get_progress() -> Dict[str, Any]:
        try:
            return await _call_llm_json_with_settings(
                llm_settings,
                _build_progress_prompt(prompt_payload),
                "你是一个公正严谨的裁判大模型，只输出 JSON。",
            )
        except Exception as exc:
            return {
                "score": 0,
                "reason": f"裁判评估失败：{exc}",
                "reached": False,
                "consensusCount": 0,
                "resolvedPainPoints": 0,
                "nextFocus": "继续围绕核心目标补足证据和执行路径",
            }

    async def get_board() -> Dict[str, Any]:
        try:
            return await _call_llm_json_with_settings(
                llm_settings,
                _build_board_prompt(prompt_payload),
                "你是一个高信噪比的会议书记员，只输出 JSON。",
            )
        except Exception as exc:
            return {
                "summary": f"共识板生成失败：{exc}",
                "consensus": [],
                "disputes": [],
                "nextQuestions": ["请继续围绕核心目标补充高价值观点"],
            }

    judge_state, board_state = await asyncio.gather(get_progress(), get_board())
    return {"judge_state": judge_state, "consensus_board": board_state}


async def _generate_role_reply_stream(
    llm_settings: Dict[str, Any],
    payload: Dict[str, Any],
    role: Dict[str, Any],
    stage: str,
    user_message: str,
    transcript: str,
    memory_summary: str,
    task_id: str,
    current_messages: list,
    base_result_payload: dict,
    msg_id: str,
) -> Dict[str, Any]:
    content = ""
    try:
        prompt = _build_roundtable_user_prompt(payload, role, stage, user_message, transcript, memory_summary)
        system_prompt = _build_roundtable_system_prompt(payload, role, stage)
        
        last_update_time = time.time()
        
        async for chunk in _call_llm_stream_with_settings(llm_settings, prompt, system_prompt):
            content += chunk
            
            # Throttle updates to avoid overwhelming the frontend
            now = time.time()
            if now - last_update_time > 0.1:  # Update every 100ms
                current_messages[-1]["content"] = content
                await _set_task_state(
                    task_id, 
                    result_payload={
                        **base_result_payload,
                        "messages": current_messages,
                    },
                    persist=False,
                )
                last_update_time = now
                
    except Exception as exc:
        if not content:
            content = f"> 生成失败：{exc}"
        else:
            content += f"\n> (生成中断：{exc})"

    normalized_content = content.strip()

    # 立即将已完成的流式消息落库并推送给前端，不等待摘要生成
    # 摘要由调用方通过 asyncio.create_task 并发生成，不阻塞下一个角色的流式输出
    final_msg: Dict[str, Any] = {
        "id": msg_id,
        "speaker_id": role.get("id") or "",
        "speaker_name": role.get("name") or "角色",
        "speaker_type": "agent",
        "content": normalized_content,
        "summary": "",          # 由调用方并发填充
        "summary_metrics": None,
        "streaming": False,
        "created_at": _utcnow().isoformat(),
    }

    current_messages[-1] = final_msg
    await _set_task_state(
        task_id,
        result_payload={
            **base_result_payload,
            "messages": current_messages,
        },
    )
    return final_msg


async def _process_roundtable_task(task_id: str) -> None:
    payload = await _get_task_payload(task_id)
    if not payload:
        return

    start_time = time.perf_counter()
    room_id = payload.get("room_id")
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
        }
        await _set_task_state(task_id, result_payload=base_result_payload)

        last_checked_msg_index = max(0, len(current_messages) - 1)

        while True:
            if await _is_cancel_requested(task_id):
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
                    # 匹配 @角色名，可能后面跟着空格或标点
                    import re
                    if role_name and re.search(r'@' + re.escape(role_name) + r'(?:\s|[^\w]|$)', content):
                        mentioned_role = role
                        break
                if mentioned_role:
                    break
            
            # 更新已检查的索引，下一轮只检查新产生的消息
            last_checked_msg_index = len(current_messages)

            # 获取调度模式配置
            scheduling_mode = "single_round_robin" # 默认单角色轮询
            try:
                from app.models.roundtable_config import RoundtableConfig as DBRoundtableConfig
                async with AsyncSessionLocal() as db_session:
                    result = await db_session.execute(select(DBRoundtableConfig).where(DBRoundtableConfig.config_key == "role_scheduling_mode"))
                    mode_config = result.scalars().first()
                    if mode_config and mode_config.config_value:
                        scheduling_mode = mode_config.config_value
            except Exception:
                pass

            if mentioned_role:
                speaking_roles = [mentioned_role]
                schedule_reason = "mentioned"
            elif scheduling_mode == "sequential_all":
                speaking_roles = roles
                schedule_reason = "sequential_all"
            elif scheduling_mode == "single_random":
                import random
                speaking_roles = [random.choice(roles)]
                schedule_reason = "single_random"
            elif scheduling_mode == "host_specify":
                # 由主持人(LLM)决定下一位发言人
                transcript_for_host = _build_recent_transcript(current_messages, memory_summary=memory_summary, max_messages=6, max_chars=2000)
                role_names = [r.get("name", "未知") for r in roles]
                prompt_for_host = f"【最近对话】\n{transcript_for_host}\n\n【候选角色】\n{', '.join(role_names)}\n\n请根据上下文，决定下一位最适合发言的角色是谁。只需输出角色名，不要输出任何其他内容。如果无法决定，请输出随机角色名。"
                system_prompt_for_host = "你是一个会议主持人，只负责指定下一位发言人。"
                try:
                    result_text = await _call_llm_text_with_settings(llm_settings, prompt_for_host, system_prompt_for_host, temperature=0.1)
                    # 尝试精确匹配
                    chosen_role = next((r for r in roles if r.get("name", "") == result_text.strip()), None)
                    # 如果没有精确匹配，尝试模糊匹配
                    if not chosen_role:
                        chosen_role = next((r for r in roles if r.get("name", "") in result_text), None)
                    if not chosen_role:
                        import random
                        chosen_role = random.choice(roles)
                    speaking_roles = [chosen_role]
                except Exception:
                    import random
                    speaking_roles = [random.choice(roles)]
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

            # 收集摘要异步任务：(msg_id, Task)，随各角色流式输出并发执行
            pending_summary_tasks: List[tuple] = []

            # 顺序流式生成各角色回复——前端可实时看到每个角色逐字输出
            for role in speaking_roles:
                # 1. 广播该角色"正在输入"的状态
                temp_msg_id = f"m_{role.get('id', 'agent')}_{uuid.uuid4().hex[:10]}"
                typing_msg = {
                    "id": temp_msg_id,
                    "speaker_id": role.get("id") or "",
                    "speaker_name": role.get("name") or "角色",
                    "speaker_type": "agent",
                    "content": "正在组织语言...",
                    "streaming": True,
                    "created_at": _utcnow().isoformat(),
                }
                current_messages.append(typing_msg)
                base_result_payload = {
                    **base_result_payload,
                    "messages": current_messages,
                }
                await _set_task_state(task_id, result_payload=base_result_payload)

                # 2. 实时构建上下文（不含正在输入的占位消息）
                transcript = _build_recent_transcript(
                    [m for m in current_messages if not m.get("streaming")],
                    memory_summary=memory_summary,
                    max_messages=8,
                    max_chars=2600,
                )

                # 3. 流式生成回复并立即落库推送（函数内不再阻塞等待摘要）
                current_messages[-1]["content"] = ""
                role_message = await _generate_role_reply_stream(
                    llm_settings,
                    payload,
                    role,
                    current_stage,
                    user_message,
                    transcript,
                    memory_summary,
                    task_id,
                    current_messages,
                    base_result_payload,
                    temp_msg_id,
                )

                # 4. 立即以 create_task 启动摘要生成，与下一个角色的流式输出并发执行
                summary_task = asyncio.create_task(
                    _generate_message_summary_with_settings(llm_settings, role_message["content"])
                )
                pending_summary_tasks.append((role_message["id"], summary_task))

                # 5. 使用 content 更新内存摘要（摘要字段此时为空，不影响上下文构建）
                memory_summary = _merge_memory_summary(memory_summary, [role_message])
                base_result_payload = {
                    **base_result_payload,
                    "messages": current_messages,
                    "memory_summary": memory_summary,
                }
                await _set_task_state(task_id, result_payload=base_result_payload)

            # 6. 所有角色流式输出完成后，统一 gather 并发的摘要任务并回填消息
            if pending_summary_tasks:
                msg_id_to_idx: Dict[str, int] = {
                    msg["id"]: idx for idx, msg in enumerate(current_messages)
                }
                summary_results = await asyncio.gather(
                    *[task for _, task in pending_summary_tasks],
                    return_exceptions=True,
                )
                summary_updated = False
                for (m_id, _), result in zip(pending_summary_tasks, summary_results):
                    if isinstance(result, Exception):
                        continue
                    idx = msg_id_to_idx.get(m_id)
                    if idx is not None:
                        current_messages[idx]["summary"] = result.get("summary", "")
                        current_messages[idx]["summary_metrics"] = result.get("summary_metrics")
                        summary_updated = True
                if summary_updated:
                    base_result_payload = {**base_result_payload, "messages": current_messages}
                    await _set_task_state(task_id, result_payload=base_result_payload)

            if current_stage == "brief":
                current_round += 1

            # 广播裁判/主持人“正在总结思考”的状态
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
            base_result_payload = {
                **base_result_payload,
                "messages": current_messages,
            }
            await _set_task_state(task_id, result_payload=base_result_payload)

            evaluation = await _evaluate_roundtable(
                llm_settings,
                payload,
                [m for m in current_messages if not m.get("streaming")], # 排除临时消息
                current_round,
                memory_summary,
            )
            
            # 移除主持人的临时消息
            current_messages.pop()
            
            judge_state = evaluation["judge_state"]
            board_state = evaluation["consensus_board"]
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
            if reached_expected_result or reached_max_round:
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
                    "transition_reason": "expected_result_reached" if reached_expected_result else "max_round_reached",
                }
                await _set_task_state(task_id, result_payload=base_result_payload)
                continue

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
            "intent_card": request.intent_card or {},
            "trigger": request.trigger,
        },
        db,
    )

