from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey, JSON
from sqlalchemy.sql import func
try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base


class Material(Base):
    __tablename__ = "materials"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(String(100), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    room_id = Column(String(100), index=True, nullable=True)
    filename = Column(String(255), nullable=False)
    material_type = Column(String(50), nullable=False)
    file_format = Column(String(20), nullable=False)
    file_size = Column(Integer, nullable=False)
    file_hash = Column(String(64), nullable=True)
    file_path = Column(String(500), nullable=True)
    processing_status = Column(String(50), default="pending")
    extracted_content = Column(Text, nullable=True)
    key_info = Column(JSON, nullable=True)
    intent_indicators = Column(JSON, nullable=True)
    summary = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
