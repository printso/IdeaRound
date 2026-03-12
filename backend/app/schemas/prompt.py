from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class PromptBase(BaseModel):
    p_key: str
    content: str
    is_active: bool = True

class PromptCreate(PromptBase):
    pass

class PromptUpdate(PromptBase):
    pass

class Prompt(PromptBase):
    id: int
    version_hash: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
