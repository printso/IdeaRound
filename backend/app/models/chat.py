from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, Float, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base
import enum

class ChatRoomStatus(str, enum.Enum):
    PROBING = "probing"
    ASSEMBLING = "assembling"
    DIVERGENT = "divergent"
    SUSPENDED = "suspended"
    CONVERGENT = "convergent"
    CLOSED = "closed"

class ChatRoom(Base):
    __tablename__ = "chat_rooms"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=True)
    status = Column(String(50), default=ChatRoomStatus.PROBING)
    
    # Intent Probe Data (stored as JSON for flexibility)
    intent_data = Column(JSON, nullable=True) # { "goal": "...", "constraints": "..." }
    
    # Control Compass Settings
    temperature = Column(Float, default=0.7)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    messages = relationship("Message", back_populates="room", cascade="all, delete-orphan")
    canvas = relationship("ConsensusCanvas", back_populates="room", uselist=False, cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("chat_rooms.id"), nullable=False)
    
    sender_type = Column(String(20), nullable=False) # "user", "bot", "system"
    sender_name = Column(String(100), nullable=True) # Bot Name or User
    sender_id = Column(String(50), nullable=True) # Bot ID or User ID
    
    content = Column(Text, nullable=False)
    
    # Metadata for thought chains, scores, etc.
    meta_data = Column(JSON, nullable=True) # { "thought_chain": "...", "score": 85 }
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    room = relationship("ChatRoom", back_populates="messages")
