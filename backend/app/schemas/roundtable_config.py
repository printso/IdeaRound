from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class RoundtableConfigBase(BaseModel):
    config_key: str
    config_value: str = Field(..., description="JSON 格式的配置值")
    description: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    is_active: bool = True

class RoundtableConfigCreate(RoundtableConfigBase):
    pass

class RoundtableConfigUpdate(RoundtableConfigBase):
    pass

class RoundtableConfig(RoundtableConfigBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
