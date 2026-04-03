from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, JSON
from sqlalchemy.sql import func
try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base

class ScenarioTemplate(Base):
    __tablename__ = "scenario_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)  # 模板名称，如"产品功能杀手局"
    description = Column(Text, nullable=True)  # 模板描述
    preset_roles = Column(JSON, nullable=False)  # 预设角色ID列表或角色配置定义
    system_prompt_override = Column(Text, nullable=True) # 场景专属系统提示词覆盖
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0) # 排序
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
