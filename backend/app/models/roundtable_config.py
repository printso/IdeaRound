from sqlalchemy import Column, Integer, String, Boolean, Text, Float, DateTime
from sqlalchemy.sql import func
try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base

class RoundtableConfig(Base):
    __tablename__ = "roundtable_configs"

    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String(100), unique=True, index=True, nullable=False)  # 配置键
    config_value = Column(Text, nullable=False)  # 配置值（JSON 格式）
    description = Column(Text, nullable=True)  # 配置描述
    min_value = Column(Float, nullable=True)  # 最小值（用于数值型配置）
    max_value = Column(Float, nullable=True)  # 最大值
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
