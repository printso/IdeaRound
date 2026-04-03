from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class SearchEngineConfigBase(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    name: str
    provider: str
    base_url: str
    api_key: Optional[str] = None
    is_enabled: bool = True
    is_default: bool = False

class SearchEngineConfigCreate(SearchEngineConfigBase):
    pass

class SearchEngineConfigUpdate(BaseModel):
    model_config = ConfigDict(protected_namespaces=())
    name: Optional[str] = None
    provider: Optional[str] = None
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    is_enabled: Optional[bool] = None
    is_default: Optional[bool] = None

class SearchEngineConfigResponse(SearchEngineConfigBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}

class SearchEngineTestRequest(BaseModel):
    query: str
    limit: int = 5
