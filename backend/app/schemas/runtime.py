from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class RuntimeTaskCreateRequest(BaseModel):
    room_id: str
    model_id: int
    transcript: str
    expected_result: str = ""
    current_round: int = 0
    intent_card: Optional[Dict[str, str]] = None
    trigger: Optional[str] = None


class RuntimeRoleRequest(BaseModel):
    id: str
    name: str
    stance: str
    desc: str
    selected: bool
    soul_config: Optional[str] = None


class RuntimeRoundtableMessageRequest(BaseModel):
    id: str
    speaker_id: str
    speaker_name: str
    speaker_type: str
    content: str
    summary: Optional[str] = None
    summary_metrics: Optional[Dict[str, Any]] = None
    created_at: str
    streaming: Optional[bool] = False


class RuntimeRoundtableRunRequest(BaseModel):
    room_id: str
    model_id: int
    user_message: str
    user_message_id: Optional[str] = None
    roundtable_stage: str = "brief"
    auto_brainstorm: bool = True
    auto_continue: bool = True
    max_dialogue_rounds: int = 6
    auto_round_count: int = 0
    intent_card: Optional[Dict[str, str]] = None
    expected_result: str = ""
    system_prompt: str = ""
    prompt_templates: Optional[Dict[str, str]] = None
    roles: List[RuntimeRoleRequest]
    prior_messages: List[RuntimeRoundtableMessageRequest] = []
    trigger: Optional[str] = None


class RuntimeTaskResponse(BaseModel):
    task_id: str
    task_type: str
    room_id: Optional[str] = None
    status: str
    model_id: Optional[int] = None
    result_payload: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RuntimeEventTrackRequest(BaseModel):
    room_id: Optional[str] = None
    user_id: Optional[int] = None
    event_type: str
    event_payload: Optional[Dict[str, Any]] = None
    task_id: Optional[str] = None
    success: bool = True
    duration_ms: Optional[int] = None


class RuntimeEventResponse(BaseModel):
    id: int
    room_id: Optional[str] = None
    user_id: Optional[int] = None
    task_id: Optional[str] = None
    event_type: str
    success: bool
    duration_ms: Optional[int] = None
    event_payload: Optional[Dict[str, Any]] = None
    created_at: datetime

    class Config:
        from_attributes = True


class RuntimeRoomSnapshot(BaseModel):
    room_id: str
    latest_progress: Optional[Dict[str, Any]] = None
    latest_board: Optional[Dict[str, Any]] = None
    pending_tasks: int = 0


class RuntimeMetricsSummary(BaseModel):
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    pending_tasks: int
    avg_task_duration_ms: int
    avg_summary_duration_ms: int
    p95_summary_duration_ms: int
    total_events: int
    host_events: int
    material_events: int
    compact_mode_penetration: float
    compact_mode_users: int
    tracked_view_mode_users: int
    latest_events: List[RuntimeEventResponse]


class RuntimeTaskCancelResponse(BaseModel):
    task_id: str
    status: str


class RuntimeMessageSummaryRequest(BaseModel):
    room_id: Optional[str] = None
    model_id: int
    force_refresh: bool = False
    messages: List[RuntimeRoundtableMessageRequest]


class RuntimeMessageSummaryItem(BaseModel):
    message_id: str
    summary: str
    semantic_consistency: float
    duration_ms: int
    cache_hit: bool = False
    meets_rt_target: bool = False


class RuntimeMessageSummaryResponse(BaseModel):
    items: List[RuntimeMessageSummaryItem]
    avg_duration_ms: int
    p95_duration_ms: int
