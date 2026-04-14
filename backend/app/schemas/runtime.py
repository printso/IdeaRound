from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class RuntimeTaskCreateRequest(BaseModel):
    room_id: str = Field(..., max_length=200)
    model_id: int
    transcript: str = Field(default="", max_length=50000)
    expected_result: str = Field(default="", max_length=2000)
    current_round: int = Field(default=0, ge=0, le=100)
    intent_card: Optional[Dict[str, str]] = None
    trigger: Optional[str] = Field(default=None, max_length=50)


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
    room_id: str = Field(..., max_length=200)
    model_id: int
    user_message: str = Field(..., min_length=1, max_length=5000)
    user_message_id: Optional[str] = Field(default=None, max_length=100)
    roundtable_stage: str = Field(default="brief", pattern=r"^(brief|final)$")
    auto_brainstorm: bool = True
    auto_continue: bool = True
    max_dialogue_rounds: int = Field(default=6, ge=1, le=30)
    auto_round_count: int = Field(default=0, ge=0, le=100)
    intent_card: Optional[Dict[str, str]] = None
    expected_result: str = Field(default="", max_length=2000)
    system_prompt: str = Field(default="", max_length=5000)
    prompt_templates: Optional[Dict[str, str]] = None
    roles: List[RuntimeRoleRequest] = Field(..., max_length=20)
    prior_messages: List[RuntimeRoundtableMessageRequest] = Field(default=[], max_length=200)
    trigger: Optional[str] = Field(default=None, max_length=50)
    moderator_summary_mode: Optional[str] = Field(default=None, pattern=r"^(disabled|manual|per_round|auto)$")
    auxiliary_model_id: Optional[int] = Field(default=None, description="辅助模型ID，用于裁判/书记员/摘要等非创意任务")
    structured_memory: Optional[Dict[str, Any]] = Field(default=None, description="结构化记忆数据（共识/分歧/行动项等）")


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
