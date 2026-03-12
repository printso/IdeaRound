from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.sql import func
from backend.app.core.database import Base

class SysPrompt(Base):
    __tablename__ = "sys_prompts"

    id = Column(Integer, primary_key=True, index=True)
    p_key = Column(String(100), unique=True, index=True, nullable=False) # e.g., "intent_probe_system"
    content = Column(Text, nullable=False) # The prompt template
    version_hash = Column(String(64), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
