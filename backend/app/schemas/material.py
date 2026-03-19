from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from enum import Enum

try:
    from backend.app.core.database import get_db
    from backend.app.core.auth import get_current_user
    from backend.app.models.user import User
except ImportError:
    from app.core.database import get_db
    from app.core.auth import get_current_user
    from app.models.user import User

router = APIRouter()


class MaterialType(str, Enum):
    DOCUMENT = "document"
    IMAGE = "image"
    AUDIO = "audio"
    VIDEO = "video"


class MaterialFormat(str, Enum):
    PDF = "pdf"
    DOC = "doc"
    DOCX = "docx"
    TXT = "txt"
    JPG = "jpg"
    JPEG = "jpeg"
    PNG = "png"
    GIF = "gif"
    MP3 = "mp3"
    MP4 = "mp4"
    WAV = "wav"


ALLOWED_EXTENSIONS = {
    MaterialFormat.PDF: ["application/pdf"],
    MaterialFormat.DOC: ["application/msword"],
    MaterialFormat.DOCX: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    MaterialFormat.TXT: ["text/plain"],
    MaterialFormat.JPG: ["image/jpeg"],
    MaterialFormat.JPEG: ["image/jpeg"],
    MaterialFormat.PNG: ["image/png"],
    MaterialFormat.GIF: ["image/gif"],
}

MAX_FILE_SIZES = {
    MaterialType.DOCUMENT: 50 * 1024 * 1024,
    MaterialType.IMAGE: 20 * 1024 * 1024,
    MaterialType.AUDIO: 100 * 1024 * 1024,
    MaterialType.VIDEO: 500 * 1024 * 1024,
}

SUPPORTED_FORMATS = {
    MaterialType.DOCUMENT: [MaterialFormat.PDF, MaterialFormat.DOC, MaterialFormat.DOCX, MaterialFormat.TXT],
    MaterialType.IMAGE: [MaterialFormat.JPG, MaterialFormat.JPEG, MaterialFormat.PNG, MaterialFormat.GIF],
    MaterialType.AUDIO: [MaterialFormat.MP3, MaterialFormat.WAV],
    MaterialType.VIDEO: [MaterialFormat.MP4],
}


class MaterialUploadRequest(BaseModel):
    room_id: str
    material_type: MaterialType


class MaterialInfo(BaseModel):
    id: str
    filename: str
    material_type: MaterialType
    format: str
    size: int
    processing_status: str
    extracted_content: Optional[str] = None
    key_info: Optional[Dict[str, Any]] = None
    intent_indicators: Optional[List[str]] = None
    summary: Optional[str] = None
    uploaded_at: str


class MaterialAnalysisResult(BaseModel):
    material_id: str
    status: str
    extracted_content: Optional[str] = None
    key_info: Optional[Dict[str, Any]] = None
    intent_indicators: Optional[List[str]] = None
    summary: Optional[str] = None


class IntentSynthesisRequest(BaseModel):
    room_id: str
    materials: List[str]
    context_text: Optional[str] = None


class IntentSynthesisResult(BaseModel):
    room_id: str
    synthesized_intent: Dict[str, Any]
    material_summaries: List[Dict[str, Any]]
    core_intent_indicators: List[str]
    recommendations: List[str]