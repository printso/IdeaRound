"""
运行时与编排 API
负责大模型调度、圆桌流式通信、长任务管理与评估。
"""

# Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
from typing import List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.core.database import get_db, AsyncSessionLocal
    from backend.app.models.runtime import RuntimeTask, RuntimeEvent
    from backend.app.schemas.runtime import (
        RuntimeTaskResponse, RuntimeTaskCreateRequest,
        RuntimeRoundtableRunRequest, RuntimeTaskCancelResponse,
        RuntimeRoomSnapshot, RuntimeMessageSummaryRequest,
        RuntimeMessageSummaryResponse, RuntimeEventTrackRequest,
        RuntimeEventResponse
    )
    from backend.app.services import runtime_service
except ImportError:
    from app.core.database import get_db, AsyncSessionLocal
    from app.models.runtime import RuntimeTask, RuntimeEvent
    from app.schemas.runtime import (
        RuntimeTaskResponse, RuntimeTaskCreateRequest,
        RuntimeRoundtableRunRequest, RuntimeTaskCancelResponse,
        RuntimeRoomSnapshot, RuntimeMessageSummaryRequest,
        RuntimeMessageSummaryResponse, RuntimeEventTrackRequest,
        RuntimeEventResponse
    )
    from app.services import runtime_service

router = APIRouter()


@router.post("/progress-evaluations", response_model=RuntimeTaskResponse)
async def start_progress_evaluation(
    request: RuntimeTaskCreateRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    task = await runtime_service._create_task("progress_evaluation", request, db)
    background_tasks.add_task(runtime_service._process_runtime_task, task.task_id)
    await runtime_service._record_event(
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
    task = await runtime_service._create_task("consensus_board", request, db)
    background_tasks.add_task(runtime_service._process_runtime_task, task.task_id)
    await runtime_service._record_event(
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
    task = await runtime_service._create_task_from_payload(
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
    background_tasks.add_task(runtime_service._process_runtime_task, task.task_id)
    await runtime_service._record_event(
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
    if task.status in runtime_service.TERMINAL_STATUSES:
        return RuntimeTaskCancelResponse(task_id=task.task_id, status=task.status)
    task.status = "cancel_requested"
    await db.commit()
    await db.refresh(task)
    await runtime_service._publish_task_stream_event(task.task_id, "task.cancel_requested", runtime_service._serialize_runtime_task(task))
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
    import asyncio
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
        task = result.scalars().first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        initial_payload = runtime_service._serialize_runtime_task(task)

    queue = runtime_service._subscribe_task_stream(task_id)

    async def event_generator():
        try:
            yield runtime_service._format_sse_message("task.snapshot", {"event": "task.snapshot", "task": initial_payload})
            if initial_payload["status"] in runtime_service.TERMINAL_STATUSES:
                yield runtime_service._format_sse_message("task.done", {"event": "task.done", "task": initial_payload})
                return

            while True:
                if await request.is_disconnected():
                    return
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=15)
                    yield runtime_service._format_sse_message(str(payload.get("event") or "task.update"), payload)
                    task_payload = payload.get("task") or {}
                    if task_payload.get("status") in runtime_service.TERMINAL_STATUSES:
                        yield runtime_service._format_sse_message("task.done", payload)
                        return
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            runtime_service._unsubscribe_task_stream(task_id, queue)

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


@router.post("/message-summaries", response_model=RuntimeMessageSummaryResponse)
async def summarize_roundtable_messages(request: RuntimeMessageSummaryRequest):
    return await runtime_service._summarize_message_batch(request)


@router.post("/events", response_model=RuntimeEventResponse)
async def track_runtime_event(
    request: RuntimeEventTrackRequest,
    db: AsyncSession = Depends(get_db),
):
    event = RuntimeEvent(
        room_id=request.room_id,
        user_id=request.user_id,
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