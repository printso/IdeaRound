from sqlalchemy import Boolean, Column, DateTime, Integer, JSON, String, Text
from sqlalchemy.sql import func

try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base


class RuntimeTask(Base):
    __tablename__ = "runtime_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(String(64), unique=True, index=True, nullable=False)
    task_type = Column(String(50), index=True, nullable=False)
    room_id = Column(String(100), index=True, nullable=True)
    user_id = Column(Integer, index=True, nullable=True)
    model_id = Column(Integer, index=True, nullable=True)
    status = Column(String(30), index=True, nullable=False, default="pending")
    request_payload = Column(JSON, nullable=True)
    result_payload = Column(JSON, nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    finished_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class RuntimeEvent(Base):
    __tablename__ = "runtime_events"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String(100), index=True, nullable=True)
    user_id = Column(Integer, index=True, nullable=True)
    task_id = Column(String(64), index=True, nullable=True)
    event_type = Column(String(100), index=True, nullable=False)
    success = Column(Boolean, default=True, nullable=False)
    duration_ms = Column(Integer, nullable=True)
    event_payload = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
