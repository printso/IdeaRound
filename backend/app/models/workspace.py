from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)  # 用户ID，实现数据隔离
    room_id = Column(String(100), unique=True, nullable=False, index=True)  # 圆桌空间ID
    data = Column(JSON, nullable=False)  # 工作台数据，包含所有状态

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
