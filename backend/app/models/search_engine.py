from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base

class SearchEngineConfig(Base):
    __tablename__ = "search_engine_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False) # Display name
    provider = Column(String(50), nullable=False) # searxng
    base_url = Column(String(255), nullable=False) # Search engine API URL
    api_key = Column(String(255), nullable=True) # API Key if needed
    
    is_enabled = Column(Boolean, default=True) # Enabled/disabled
    is_default = Column(Boolean, default=False) # Whether it's the default engine
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
