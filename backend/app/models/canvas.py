from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base

class ConsensusCanvas(Base):
    __tablename__ = "consensus_canvas"

    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(Integer, ForeignKey("chat_rooms.id"), unique=True, nullable=False)
    
    current_goal = Column(Text, nullable=True) # "Current Goal"
    agreements = Column(JSON, default=list) # List of strings or objects { "text": "...", "time": "..." }
    disagreements = Column(JSON, default=list) # List of strings or objects { "text": "...", "involved_roles": [...] }
    
    last_updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    room = relationship("ChatRoom", back_populates="canvas")
