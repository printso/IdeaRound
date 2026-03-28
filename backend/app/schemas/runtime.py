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
    event_type: str
    event_payload: Optional[Dict[str, Any]] = None
    task_id: Optional[str] = None
    success: bool = True
    duration_ms: Optional[int] = None


class RuntimeEventResponse(BaseModel):
    id: int
    room_id: Optional[str] = None
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
    total_events: int
    director_events: int
    material_events: int
    latest_events: List[RuntimeEventResponse]
