from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.sql import func
try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base

class StyleConfig(Base):
    __tablename__ = "style_configs"

    id = Column(Integer, primary_key=True, index=True)
    s_key = Column(String(100), unique=True, index=True, nullable=False)  # e.g., "brief_output", "final_summary"
    name = Column(String(200), nullable=False)  # 配置名称
    content = Column(Text, nullable=False)  # 风格配置内容
    description = Column(Text, nullable=True)  # 配置描述
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
