from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class RoleTemplateBase(BaseModel):
    name: str
    stance: str
    description: Optional[str] = None
    soul_prompt_id: Optional[int] = None
    style_prompt_id: Optional[int] = None
    is_default: bool = False
    is_active: bool = True

class RoleTemplateCreate(RoleTemplateBase):
    pass

class RoleTemplateUpdate(RoleTemplateBase):
    pass

class RoleTemplate(RoleTemplateBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
