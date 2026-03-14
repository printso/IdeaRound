from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class StyleConfigBase(BaseModel):
    s_key: str
    name: str
    content: str
    description: Optional[str] = None
    is_active: bool = True

class StyleConfigCreate(StyleConfigBase):
    pass

class StyleConfigUpdate(StyleConfigBase):
    pass

class StyleConfig(StyleConfigBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
