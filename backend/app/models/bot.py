from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from backend.app.core.database import Base

class Bot(Base):
    __tablename__ = "bots"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    role_type = Column(String(50), nullable=False) # e.g., "probe", "expert", "blackhat"
    avatar_url = Column(String(255), nullable=True)
    
    # Prompt IDs (or we could link to SysPrompt if we want strict FKs, but loose coupling is okay too)
    soul_prompt_id = Column(String(255), nullable=True) # ID or key in sys_prompts
    style_prompt_id = Column(String(255), nullable=True)
    
    description = Column(Text, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
