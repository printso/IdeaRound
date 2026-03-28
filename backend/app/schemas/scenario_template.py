from typing import Optional, List, Any
from pydantic import BaseModel
from datetime import datetime

class ScenarioTemplateBase(BaseModel):
    name: str
    description: Optional[str] = None
    preset_roles: List[Any]  # 存储预设角色定义或ID
    system_prompt_override: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0

class ScenarioTemplateCreate(ScenarioTemplateBase):
    pass

class ScenarioTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    preset_roles: Optional[List[Any]] = None
    system_prompt_override: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None

class ScenarioTemplateInDB(ScenarioTemplateBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
