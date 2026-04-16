"""
运行时与编排 API
负责大模型调度、圆桌流式通信、长任务管理与评估。
"""

# Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import json
import time
from typing import List
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.core.database import get_db, AsyncSessionLocal
    from backend.app.core.auth import get_current_user
    from backend.app.core.redis_client import TASK_CHANNEL_PREFIX, TASK_STATE_PREFIX, cache_get, cache_set, is_redis_available, subscribe_channel
    from backend.app.models.runtime import RuntimeTask, RuntimeEvent
    from backend.app.models.user import User
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
    from app.core.auth import get_current_user
    from app.core.redis_client import TASK_CHANNEL_PREFIX, TASK_STATE_PREFIX, cache_get, cache_set, is_redis_available, subscribe_channel
    from app.models.runtime import RuntimeTask, RuntimeEvent
    from app.models.user import User
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
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
    current_user: User = Depends(get_current_user),
):
    import uuid
    from datetime import datetime, timezone
    
    def _utcnow() -> datetime:
        return datetime.now(timezone.utc)
    
    # 预构建初始消息列表（包含用户消息和第一个角色的 typing 状态）
    # 这样前端订阅 SSE 时能立即看到角色响应，无需等待后台任务启动
    current_messages = []
    for msg in request.prior_messages:
        current_messages.append({
            "id": str(msg.id) if msg.id else uuid.uuid4().hex,
            "speaker_id": str(msg.speaker_id) if msg.speaker_id else "",
            "speaker_name": str(msg.speaker_name) if msg.speaker_name else "",
            "speaker_type": str(msg.speaker_type) if msg.speaker_type else "agent",
            "content": str(msg.content) if msg.content else "",
            "summary": str(msg.summary) if msg.summary else "",
            "summary_metrics": msg.summary_metrics if msg.summary_metrics else None,
            "streaming": bool(msg.streaming) if msg.streaming is not None else False,
            "created_at": str(msg.created_at) if msg.created_at else _utcnow().isoformat(),
        })
    
    # 添加用户消息
    user_message_id = str(request.user_message_id) if request.user_message_id else f"m_user_{uuid.uuid4().hex[:10]}"
    user_message_payload = {
        "id": user_message_id,
        "speaker_id": "user",
        "speaker_name": "我" if request.trigger != "host" else "主持人",
        "speaker_type": "user",
        "content": str(request.user_message) if request.user_message else "",
        "streaming": False,
        "created_at": _utcnow().isoformat(),
    }
    if not any(message.get("id") == user_message_id for message in current_messages):
        current_messages.append(user_message_payload)
    
    # 获取第一个选中的角色，预添加 typing 状态
    selected_roles = [role for role in request.roles if role.selected]
    if selected_roles:
        first_role = selected_roles[0]
        typing_msg = {
            "id": f"m_{first_role.id}_{uuid.uuid4().hex[:10]}",
            "speaker_id": str(first_role.id) if first_role.id else "",
            "speaker_name": str(first_role.name) if first_role.name else "角色",
            "speaker_type": "agent",
            "content": "正在组织语言...",
            "streaming": True,
            "created_at": _utcnow().isoformat(),
        }
        current_messages.append(typing_msg)
    
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
            "initial_demand": request.initial_demand or "",
            "expected_result": request.expected_result,
            "system_prompt": request.system_prompt,
            "prompt_templates": request.prompt_templates or {},
            "roles": [role.model_dump() for role in request.roles],
            "prior_messages": [message.model_dump() for message in request.prior_messages],
            "trigger": request.trigger,
            "moderator_summary_mode": request.moderator_summary_mode,
            "auxiliary_model_id": request.auxiliary_model_id,
            "structured_memory": request.structured_memory,
        },
        db,
    )
    
    # 立即推送包含 typing 状态的初始状态到 Redis，确保前端订阅时能立即看到
    initial_result_payload = {
        "messages": current_messages,
        "stage": request.roundtable_stage or "brief",
        "auto_round_count": request.auto_round_count or 0,
        "judge_state": None,
        "consensus_board": None,
        "canvas_consensus": [],
        "canvas_disputes": [],
        "memory_summary": "",
        "active_role_ids": [role.id for role in selected_roles],
        "last_user_message": str(request.user_message) if request.user_message else "",
    }
    serialized_task = runtime_service._serialize_runtime_task(task)
    serialized_task["result_payload"] = initial_result_payload
    
    # 推送到 Redis 并发布 SSE 事件，确保前端能立即收到
    await cache_set(
        f"{TASK_STATE_PREFIX}{task.task_id}",
        serialized_task,
        ttl_seconds=3600,
    )
    await runtime_service._publish_task_stream_event(
        task.task_id,
        "task.update",
        serialized_task,
    )
    
    background_tasks.add_task(runtime_service._process_runtime_task, task.task_id)
    await runtime_service._record_event(
        room_id=request.room_id,
        task_id=task.task_id,
        event_type="task.roundtable_orchestration.created",
        event_payload={
            "stage": request.roundtable_stage,
            "trigger": request.trigger,
            "role_count": len(selected_roles),
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
    # 触发取消信号，让流式生成循环尽快退出
    runtime_service._signal_task_cancel(task.task_id)
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
    cached_payload = await cache_get(f"{TASK_STATE_PREFIX}{task_id}")
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(RuntimeTask).where(RuntimeTask.task_id == task_id))
        task = result.scalars().first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        initial_payload = cached_payload or runtime_service._serialize_runtime_task(task)

    queue = runtime_service._subscribe_task_stream(task_id)
    redis_queue: asyncio.Queue[dict] = asyncio.Queue()
    redis_forward_task = None
    state_cache_key = f"{TASK_STATE_PREFIX}{task_id}"

    if is_redis_available():
        async def forward_redis_events():
            async for payload in subscribe_channel(f"{TASK_CHANNEL_PREFIX}{task_id}"):
                await redis_queue.put(payload)
                task_payload = payload.get("task") or {}
                if task_payload.get("status") in runtime_service.TERMINAL_STATUSES:
                    return

        redis_forward_task = asyncio.create_task(forward_redis_events())

    async def event_generator():
        """推送任务状态；短周期拉取缓存以弥补 Pub/Sub 与跨进程订阅晚于首包导致的丢事件问题。"""
        last_fingerprint = ""
        last_wire_activity = time.monotonic()
        sse_poll_interval_sec = 0.35
        keep_alive_sec = 12.0

        def _emit_from_cached_task(cached: dict, event_name: str):
            payload = {"event": event_name, "task": cached}
            return json.dumps(payload, ensure_ascii=False, sort_keys=True), payload

        try:
            yield runtime_service._format_sse_message("task.snapshot", {"event": "task.snapshot", "task": initial_payload})
            last_wire_activity = time.monotonic()
            fp0, _ = _emit_from_cached_task(initial_payload, "task.snapshot")
            last_fingerprint = fp0
            if initial_payload["status"] in runtime_service.TERMINAL_STATUSES:
                yield runtime_service._format_sse_message("task.done", {"event": "task.done", "task": initial_payload})
                return

            while True:
                if await request.is_disconnected():
                    return
                wait_tasks = [asyncio.create_task(queue.get())]
                if redis_forward_task is not None:
                    wait_tasks.append(asyncio.create_task(redis_queue.get()))
                done, pending = await asyncio.wait(
                    wait_tasks, timeout=sse_poll_interval_sec, return_when=asyncio.FIRST_COMPLETED
                )
                for task_item in pending:
                    task_item.cancel()

                if not done:
                    fresh = await cache_get(state_cache_key)
                    if fresh:
                        fingerprint, synthetic = _emit_from_cached_task(fresh, "task.update")
                        if fingerprint != last_fingerprint:
                            last_fingerprint = fingerprint
                            yield runtime_service._format_sse_message("task.update", synthetic)
                            last_wire_activity = time.monotonic()
                            task_payload = fresh
                            if task_payload.get("status") in runtime_service.TERMINAL_STATUSES:
                                yield runtime_service._format_sse_message(
                                    "task.done", {"event": "task.done", "task": fresh}
                                )
                                return
                    if time.monotonic() - last_wire_activity >= keep_alive_sec:
                        yield ": keep-alive\n\n"
                        last_wire_activity = time.monotonic()
                    continue

                payload = next(iter(done)).result()
                fingerprint = json.dumps(payload, ensure_ascii=False, sort_keys=True)
                if fingerprint == last_fingerprint:
                    continue
                last_fingerprint = fingerprint
                yield runtime_service._format_sse_message(str(payload.get("event") or "task.update"), payload)
                last_wire_activity = time.monotonic()
                task_payload = payload.get("task") or {}
                if task_payload.get("status") in runtime_service.TERMINAL_STATUSES:
                    yield runtime_service._format_sse_message("task.done", payload)
                    return
        finally:
            runtime_service._unsubscribe_task_stream(task_id, queue)
            if redis_forward_task is not None:
                redis_forward_task.cancel()
                try:
                    await redis_forward_task
                except asyncio.CancelledError:
                    pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            # 禁止 Nginx / CDN 等反向代理缓冲 SSE 响应，确保每条事件实时推送到客户端
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


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
async def summarize_roundtable_messages(
    request: RuntimeMessageSummaryRequest,
    current_user: User = Depends(get_current_user),
):
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
