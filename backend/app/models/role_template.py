from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base

class RoleTemplate(Base):
    __tablename__ = "role_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)  # 角色名称
    stance = Column(String(50), nullable=False)  # 立场：建设/对抗/中立/评审
    description = Column(Text, nullable=True)  # 角色描述
    soul_prompt_id = Column(Integer, ForeignKey("sys_prompts.id"), nullable=True)  # 关联系统提示词
    style_prompt_id = Column(Integer, ForeignKey("style_configs.id"), nullable=True)  # 关联风格配置
    soul_config = Column(Text, nullable=True)  # 灵魂配置长文本
    is_default = Column(Boolean, default=False)  # 是否为默认角色
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
