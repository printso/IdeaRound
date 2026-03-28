from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
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
        RuntimeTaskCreateRequest,
        RuntimeTaskResponse,
    )

router = APIRouter()


def _as_json_dict(content: str, fallback: Dict[str, Any]) -> Dict[str, Any]:
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    return fallback


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


async def _call_llm_json(model_id: int, prompt: str, system_prompt: str) -> Dict[str, Any]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(LLMConfig).where(LLMConfig.id == model_id, LLMConfig.is_active.is_(True))
        )
        llm_config = result.scalars().first()
        if not llm_config:
            raise RuntimeError("LLM Config not found or inactive")
        if not llm_config.api_key:
            raise RuntimeError("API key is required for this model")

        client = AsyncOpenAI(api_key=llm_config.api_key, base_url=llm_config.api_base or None)
        response = await client.chat.completions.create(
            model=llm_config.model_name,
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


async def _process_runtime_task(task_id: str) -> None:
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
        task = result.scalars().first()
        if not task:
            return

        payload = task.request_payload or {}
        task.status = "running"
        task.started_at = datetime.now(timezone.utc)
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
            task.finished_at = datetime.now(timezone.utc)
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
                task.finished_at = datetime.now(timezone.utc)
                await db.commit()

        await _record_event(
            room_id=payload.get("room_id"),
            task_id=task_id,
            event_type="task.failed",
            event_payload={"error": str(exc), "task_type": payload.get("task_type")},
            success=False,
            duration_ms=duration_ms,
        )


async def _create_task(
    task_type: str,
    request: RuntimeTaskCreateRequest,
    db: AsyncSession,
) -> RuntimeTask:
    task = RuntimeTask(
        task_id=uuid.uuid4().hex,
        task_type=task_type,
        room_id=request.room_id,
        model_id=request.model_id,
        status="pending",
        request_payload={
            "task_type": task_type,
            "room_id": request.room_id,
            "model_id": request.model_id,
            "transcript": request.transcript,
            "expected_result": request.expected_result,
            "current_round": request.current_round,
            "intent_card": request.intent_card or {},
            "trigger": request.trigger,
        },
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


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


@router.get("/tasks/{task_id}", response_model=RuntimeTaskResponse)
async def get_runtime_task(task_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


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
    pending_result = await db.execute(
        select(func.count(RuntimeTask.id)).where(
            RuntimeTask.room_id == room_id,
            RuntimeTask.status.in_(["pending", "running"]),
        )
    )

    latest_progress = progress_result.scalars().first()
    latest_board = board_result.scalars().first()
    pending_tasks = pending_result.scalar() or 0

    return RuntimeRoomSnapshot(
        room_id=room_id,
        latest_progress=latest_progress.result_payload if latest_progress else None,
        latest_board=latest_board.result_payload if latest_board else None,
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
    events = list((await db.execute(select(RuntimeEvent).order_by(desc(RuntimeEvent.created_at), desc(RuntimeEvent.id)).limit(20))).scalars().all())

    completed_tasks = [task for task in tasks if task.status == "completed"]
    failed_tasks = [task for task in tasks if task.status == "failed"]
    pending_tasks = [task for task in tasks if task.status in {"pending", "running"}]
    durations = []
    for task in completed_tasks:
        if task.started_at and task.finished_at:
            durations.append(int((task.finished_at - task.started_at).total_seconds() * 1000))

    total_events_result = await db.execute(select(func.count(RuntimeEvent.id)))
    director_events_result = await db.execute(
        select(func.count(RuntimeEvent.id)).where(RuntimeEvent.event_type.like("director.%"))
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
        director_events=director_events_result.scalar() or 0,
        material_events=material_events_result.scalar() or 0,
        latest_events=events,
    )
