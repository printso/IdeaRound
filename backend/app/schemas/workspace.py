from pydantic import BaseModel, field_serializer, field_validator, model_serializer
from typing import List, Optional, Dict, Any, Union
from datetime import datetime


class RoleMember(BaseModel):
    id: str
    name: str
    stance: str  # '建设' | '对抗' | '中立' | '评审'
    desc: str
    selected: bool
    soul_config: Optional[str] = None


class Message(BaseModel):
    id: str
    speaker_id: str
    speaker_name: str
    speaker_type: str  # 'user' | 'agent'
    content: str
    streaming: Optional[bool] = False
    created_at: str


class WorkspaceData(BaseModel):
    room_id: str
    room_name: str
    step: str
    initial_demand: str
    intent_card: Dict[str, str]
    intent_ready: bool
    roles: List[RoleMember]
    roles_ready: bool
    room_ready: bool
    system_prompt: str
    messages: List[Message]
    canvas_consensus: List[str]
    canvas_disputes: List[str]
    canvas_updated_at: str
    roundtable_stage: str
    selected_model_id: Optional[int] = None
    expected_result: Optional[str] = ""
    max_dialogue_rounds: Optional[int] = 6
    auto_round_count: Optional[int] = 0
    judge_state: Optional[Dict[str, Any]] = None
    consensus_board: Optional[Dict[str, Any]] = None
    canvas_snapshot: Optional[Dict[str, Any]] = None


class WorkspaceCreate(BaseModel):
    room_id: str
    room_name: str
    data: WorkspaceData


class WorkspaceUpdate(BaseModel):
    data: WorkspaceData


class WorkspaceResponse(BaseModel):
    id: int
    user_id: int
    room_id: str
    data: WorkspaceData
    created_at: datetime
    updated_at: Optional[datetime] = None

    @model_serializer(mode='wrap')
    def serialize_model(self, handler):
        data = handler(self)
        # 将 datetime 字段序列化为 ISO 8601 字符串
        if isinstance(data.get('created_at'), datetime):
            dt = data['created_at']
            if dt.tzinfo is not None:
                dt = dt.astimezone()
            data['created_at'] = dt.isoformat() + ('Z' if dt.tzinfo is None else '')
        if isinstance(data.get('updated_at'), datetime):
            dt = data['updated_at']
            if dt.tzinfo is not None:
                dt = dt.astimezone()
            data['updated_at'] = dt.isoformat() + ('Z' if dt.tzinfo is None else '')
        return data

    class Config:
        from_attributes = True
