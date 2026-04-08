from sqlalchemy import Column, Integer, String, Boolean, Float, Text, DateTime
from sqlalchemy.sql import func
try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base

class LLMConfig(Base):
    __tablename__ = "llm_configs"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False) # Display name
    provider = Column(String(50), nullable=False) # openai, azure, ollama, etc.
    api_key = Column(String(255), nullable=True) # Sensitive
    api_base = Column(String(255), nullable=True) # For local models or Azure
    model_name = Column(String(100), nullable=False) # e.g. gpt-4, llama2
    
    is_active = Column(Boolean, default=True)
    enable_thinking = Column(Boolean, default=False)
    temperature = Column(Float, default=0.7)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
