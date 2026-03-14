from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class LLMConfigBase(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    name: str
    provider: str
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    model_name: str
    is_active: bool = True
    temperature: float = 0.7

class LLMConfigCreate(LLMConfigBase):
    pass

class LLMConfigUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    name: Optional[str] = None
    provider: Optional[str] = None
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    model_name: Optional[str] = None
    is_active: Optional[bool] = None
    temperature: Optional[float] = None

class LLMConfigResponse(LLMConfigBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class LLMChatStreamRequest(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    message: str
    system_prompt: Optional[str] = None
