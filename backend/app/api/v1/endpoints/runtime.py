from __future__ import annotations

import asyncio
import json
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
    from backend.app.models.llm import LLMConfig
    from backend.app.models.runtime import RuntimeEvent, RuntimeTask
    from backend.app.schemas.runtime import (
        RuntimeEventResponse,
        RuntimeEventTrackRequest,
        RuntimeMetricsSummary,
        RuntimeRoomSnapshot,
        RuntimeRoundtableRunRequest,
        RuntimeTaskCancelResponse,
        RuntimeTaskCreateRequest,
        RuntimeTaskResponse,
    )
except ImportError:
    from app.core.database import AsyncSessionLocal, get_db
    from app.models.llm import LLMConfig
    from app.models.runtime import RuntimeEvent, RuntimeTask
    from app.schemas.runtime import (
        RuntimeEventResponse,
        RuntimeEventTrackRequest,
        RuntimeMetricsSummary,
        RuntimeRoomSnapshot,
        RuntimeRoundtableRunRequest,
        RuntimeTaskCancelResponse,
        RuntimeTaskCreateRequest,
        RuntimeTaskResponse,
    )

router = APIRouter()

TERMINAL_STATUSES = {"completed", "failed", "canceled"}
TASK_STREAM_QUEUES: Dict[str, List[asyncio.Queue[Dict[str, Any]]]] = {}


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
    queues = TASK_STREAM_QUEUES.get(task_id, [])
    if not queues:
        return
    message = {"event": event_type, "task": task_payload}
    stale_queues: List[asyncio.Queue[Dict[str, Any]]] = []
    for queue in queues:
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            stale_queues.append(queue)
    if stale_queues:
        for queue in stale_queues:
            _unsubscribe_task_stream(task_id, queue)


def _format_sse_message(event: str, data: Dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _compress_text(value: str, max_chars: int = 220) -> str:
    clean = " ".join(_safe_text(value).split())
    if len(clean) <= max_chars:
        return clean
    return clean[: max_chars - 1] + "…"


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


async def _call_llm_text_with_settings(
    llm_settings: Dict[str, Any],
    prompt: str,
    system_prompt: str,
    *,
    temperature: Optional[float] = None,
) -> str:
    client = AsyncOpenAI(
        api_key=llm_settings["api_key"],
        base_url=llm_settings.get("api_base") or None,
    )
    response = await client.chat.completions.create(
        model=llm_settings["model_name"],
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        temperature=llm_settings.get("temperature", 0.7) if temperature is None else temperature,
        stream=False,
    )
    return response.choices[0].message.content or ""


async def _call_llm_json(model_id: int, prompt: str, system_prompt: str) -> Dict[str, Any]:
    llm_settings = await _load_llm_settings(model_id)
    return await _call_llm_json_with_settings(llm_settings, prompt, system_prompt)


async def _call_llm_json_with_settings(
    llm_settings: Dict[str, Any],
    prompt: str,
    system_prompt: str,
) -> Dict[str, Any]:
    client = AsyncOpenAI(
        api_key=llm_settings["api_key"],
        base_url=llm_settings.get("api_base") or None,
    )
    response = await client.chat.completions.create(
        model=llm_settings["model_name"],
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": prompt},
        ],
        temperature=0.1,
        stream=False,
        response_format={"type": "json_object"},
    )
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
    task_id: Optional[str],
    event_type: str,
    event_payload: Optional[Dict[str, Any]],
    success: bool = True,
    duration_ms: Optional[int] = None,
) -> None:
    async with AsyncSessionLocal() as db:
        db.add(
            RuntimeEvent(
                room_id=room_id,
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
) -> Optional[RuntimeTask]:
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
        await _publish_task_stream_event(task.task_id, "task.update", _serialize_runtime_task(task))
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


async def _generate_role_reply(
    llm_settings: Dict[str, Any],
    payload: Dict[str, Any],
    role: Dict[str, Any],
    stage: str,
    user_message: str,
    transcript: str,
    memory_summary: str,
) -> Dict[str, Any]:
    try:
        content = await _call_llm_text_with_settings(
            llm_settings,
            _build_roundtable_user_prompt(payload, role, stage, user_message, transcript, memory_summary),
            _build_roundtable_system_prompt(payload, role, stage),
        )
    except Exception as exc:
        content = f"> 生成失败：{exc}"

    return {
        "id": f"m_{role.get('id', 'agent')}_{uuid.uuid4().hex[:10]}",
        "speaker_id": role.get("id") or "",
        "speaker_name": role.get("name") or "角色",
        "speaker_type": "agent",
        "content": content.strip(),
        "streaming": False,
        "created_at": _utcnow().isoformat(),
    }


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

            speaking_roles = roles if auto_brainstorm else roles[:1]
            transcript = _build_recent_transcript(
                current_messages,
                memory_summary=memory_summary,
                max_messages=8,
                max_chars=2600,
            )

            role_messages = await asyncio.gather(
                *[
                    _generate_role_reply(
                        llm_settings,
                        payload,
                        role,
                        current_stage,
                        user_message,
                        transcript,
                        memory_summary,
                    )
                    for role in speaking_roles
                ]
            )
            current_messages.extend(role_messages)
            memory_summary = _merge_memory_summary(memory_summary, current_messages)
            if current_stage == "brief":
                current_round += 1

            evaluation = await _evaluate_roundtable(
                llm_settings,
                payload,
                current_messages,
                current_round,
                memory_summary,
            )
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
                        "speaker_type": "user",
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
                    "speaker_type": "user",
                    "content": user_message,
                    "streaming": False,
                    "created_at": _utcnow().isoformat(),
                }
            )
            memory_summary = _merge_memory_summary(memory_summary, current_messages)
            base_result_payload = {
                **base_result_payload,
                "messages": current_messages,
                "last_user_message": user_message,
                "next_prompt": next_prompt,
                "memory_summary": memory_summary,
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
    await _publish_task_stream_event(task.task_id, "task.created", _serialize_runtime_task(task))
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


@router.post("/progress-evaluations", response_model=RuntimeTaskResponse)
async def start_progress_evaluation(
    request: RuntimeTaskCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    task = await _create_task("progress_evaluation", request, db)
    background_tasks.add_task(_process_runtime_task, task.task_id)
    await _record_event(
        room_id=request.room_id,
        task_id=task.task_id,
        event_type="task.progress_evaluation.created",
        event_payload={"trigger": request.trigger, "current_round": request.current_round},
    )
    return task


@router.post("/consensus-boards", response_model=RuntimeTaskResponse)
async def start_consensus_board(
    request: RuntimeTaskCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    task = await _create_task("consensus_board", request, db)
    background_tasks.add_task(_process_runtime_task, task.task_id)
    await _record_event(
        room_id=request.room_id,
        task_id=task.task_id,
        event_type="task.consensus_board.created",
        event_payload={"trigger": request.trigger, "current_round": request.current_round},
    )
    return task


@router.post("/roundtable-runs", response_model=RuntimeTaskResponse)
async def start_roundtable_run(
    request: RuntimeRoundtableRunRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    task = await _create_task_from_payload(
        "roundtable_orchestration",
        request.room_id,
        request.model_id,
        {
            "task_type": "roundtable_orchestration",
            "room_id": request.room_id,
            "model_id": request.model_id,
            "user_message": request.user_message,
            "user_message_id": request.user_message_id,
            "roundtable_stage": request.roundtable_stage,
            "auto_brainstorm": request.auto_brainstorm,
            "auto_continue": request.auto_continue,
            "max_dialogue_rounds": request.max_dialogue_rounds,
            "auto_round_count": request.auto_round_count,
            "intent_card": request.intent_card or {},
            "expected_result": request.expected_result,
            "system_prompt": request.system_prompt,
            "prompt_templates": request.prompt_templates or {},
            "roles": [role.model_dump() for role in request.roles],
            "prior_messages": [message.model_dump() for message in request.prior_messages],
            "trigger": request.trigger,
        },
        db,
    )
    background_tasks.add_task(_process_runtime_task, task.task_id)
    await _record_event(
        room_id=request.room_id,
        task_id=task.task_id,
        event_type="task.roundtable_orchestration.created",
        event_payload={
            "stage": request.roundtable_stage,
            "trigger": request.trigger,
            "role_count": len([role for role in request.roles if role.selected]),
        },
    )
    return task


@router.post("/tasks/{task_id}/cancel", response_model=RuntimeTaskCancelResponse)
async def cancel_runtime_task(task_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.status in TERMINAL_STATUSES:
        return RuntimeTaskCancelResponse(task_id=task.task_id, status=task.status)
    task.status = "cancel_requested"
    await db.commit()
    await db.refresh(task)
    await _publish_task_stream_event(task.task_id, "task.cancel_requested", _serialize_runtime_task(task))
    return RuntimeTaskCancelResponse(task_id=task.task_id, status=task.status)


@router.get("/tasks/{task_id}", response_model=RuntimeTaskResponse)
async def get_runtime_task(task_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/tasks/{task_id}/stream")
async def stream_runtime_task(task_id: str, request: Request):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
        task = result.scalars().first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        initial_payload = _serialize_runtime_task(task)

    queue = _subscribe_task_stream(task_id)

    async def event_generator():
        try:
            yield _format_sse_message("task.snapshot", {"event": "task.snapshot", "task": initial_payload})
            if initial_payload["status"] in TERMINAL_STATUSES:
                yield _format_sse_message("task.done", {"event": "task.done", "task": initial_payload})
                return

            while True:
                if await request.is_disconnected():
                    return
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=15)
                    yield _format_sse_message(str(payload.get("event") or "task.update"), payload)
                    task_payload = payload.get("task") or {}
                    if task_payload.get("status") in TERMINAL_STATUSES:
                        yield _format_sse_message("task.done", payload)
                        return
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            _unsubscribe_task_stream(task_id, queue)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.get("/rooms/{room_id}/snapshot", response_model=RuntimeRoomSnapshot)
async def get_room_runtime_snapshot(room_id: str, db: AsyncSession = Depends(get_db)):
    progress_result = await db.execute(
        select(RuntimeTask)
        .where(
            RuntimeTask.room_id == room_id,
            RuntimeTask.task_type == "progress_evaluation",
            RuntimeTask.status == "completed",
        )
        .order_by(desc(RuntimeTask.finished_at), desc(RuntimeTask.id))
        .limit(1)
    )
    board_result = await db.execute(
        select(RuntimeTask)
        .where(
            RuntimeTask.room_id == room_id,
            RuntimeTask.task_type == "consensus_board",
            RuntimeTask.status == "completed",
        )
        .order_by(desc(RuntimeTask.finished_at), desc(RuntimeTask.id))
        .limit(1)
    )
    roundtable_result = await db.execute(
        select(RuntimeTask)
        .where(
            RuntimeTask.room_id == room_id,
            RuntimeTask.task_type == "roundtable_orchestration",
            RuntimeTask.status == "completed",
        )
        .order_by(desc(RuntimeTask.finished_at), desc(RuntimeTask.id))
        .limit(1)
    )
    pending_result = await db.execute(
        select(func.count(RuntimeTask.id)).where(
            RuntimeTask.room_id == room_id,
            RuntimeTask.status.in_(["pending", "running", "cancel_requested"]),
        )
    )

    latest_progress = progress_result.scalars().first()
    latest_board = board_result.scalars().first()
    latest_roundtable = roundtable_result.scalars().first()
    pending_tasks = pending_result.scalar() or 0

    if latest_roundtable and latest_roundtable.result_payload:
        latest_progress_payload = latest_roundtable.result_payload.get("judge_state") or (
            latest_progress.result_payload if latest_progress else None
        )
        latest_board_payload = latest_roundtable.result_payload.get("consensus_board") or (
            latest_board.result_payload if latest_board else None
        )
    else:
        latest_progress_payload = latest_progress.result_payload if latest_progress else None
        latest_board_payload = latest_board.result_payload if latest_board else None

    return RuntimeRoomSnapshot(
        room_id=room_id,
        latest_progress=latest_progress_payload,
        latest_board=latest_board_payload,
        pending_tasks=pending_tasks,
    )


@router.post("/events", response_model=RuntimeEventResponse)
async def track_runtime_event(
    request: RuntimeEventTrackRequest,
    db: AsyncSession = Depends(get_db),
):
    event = RuntimeEvent(
        room_id=request.room_id,
        task_id=request.task_id,
        event_type=request.event_type,
        event_payload=request.event_payload,
        success=request.success,
        duration_ms=request.duration_ms,
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.get("/events/recent", response_model=List[RuntimeEventResponse])
async def list_recent_runtime_events(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(RuntimeEvent).order_by(desc(RuntimeEvent.created_at), desc(RuntimeEvent.id)).limit(limit)
    )
    return list(result.scalars().all())


@router.get("/metrics/summary", response_model=RuntimeMetricsSummary)
async def get_runtime_metrics_summary(db: AsyncSession = Depends(get_db)):
    tasks = list((await db.execute(select(RuntimeTask))).scalars().all())
    events = list(
        (
            await db.execute(
                select(RuntimeEvent).order_by(desc(RuntimeEvent.created_at), desc(RuntimeEvent.id)).limit(20)
            )
        ).scalars().all()
    )

    completed_tasks = [task for task in tasks if task.status == "completed"]
    failed_tasks = [task for task in tasks if task.status == "failed"]
    pending_tasks = [task for task in tasks if task.status in {"pending", "running", "cancel_requested"}]
    durations: List[int] = []
    for task in completed_tasks:
        if task.started_at and task.finished_at:
            durations.append(int((task.finished_at - task.started_at).total_seconds() * 1000))

    total_events_result = await db.execute(select(func.count(RuntimeEvent.id)))
    host_events_result = await db.execute(
        select(func.count(RuntimeEvent.id)).where(RuntimeEvent.event_type.like("host.%"))
    )
    material_events_result = await db.execute(
        select(func.count(RuntimeEvent.id)).where(RuntimeEvent.event_type.like("material.%"))
    )

    return RuntimeMetricsSummary(
        total_tasks=len(tasks),
        completed_tasks=len(completed_tasks),
        failed_tasks=len(failed_tasks),
        pending_tasks=len(pending_tasks),
        avg_task_duration_ms=int(sum(durations) / len(durations)) if durations else 0,
        total_events=total_events_result.scalar() or 0,
        host_events=host_events_result.scalar() or 0,
        material_events=material_events_result.scalar() or 0,
        latest_events=events,
    )
