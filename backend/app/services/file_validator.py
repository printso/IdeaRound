import hashlib
import magic
import re
from typing import Optional, Tuple, List, Dict, Any
from enum import Enum

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
    MD = "md"
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
    MaterialFormat.MD: ["text/markdown", "text/x-markdown", "application/x-markdown"],
    MaterialFormat.JPG: ["image/jpeg"],
    MaterialFormat.JPEG: ["image/jpeg"],
    MaterialFormat.PNG: ["image/png"],
    MaterialFormat.GIF: ["image/gif"],
}

FILE_EXTENSION_MAP = {
    ".pdf": MaterialFormat.PDF,
    ".doc": MaterialFormat.DOC,
    ".docx": MaterialFormat.DOCX,
    ".txt": MaterialFormat.TXT,
    ".md": MaterialFormat.MD,
    ".markdown": MaterialFormat.MD,
    ".jpg": MaterialFormat.JPG,
    ".jpeg": MaterialFormat.JPEG,
    ".png": MaterialFormat.PNG,
    ".gif": MaterialFormat.GIF,
    ".mp3": MaterialFormat.MP3,
    ".mp4": MaterialFormat.MP4,
    ".wav": MaterialFormat.WAV,
}

MIME_TO_FORMAT = {mime: fmt for fmt, mimes in ALLOWED_EXTENSIONS.items() for mime in mimes}
MIME_TO_FORMAT.update({
    "image/jpeg": MaterialFormat.JPG,
    "image/png": MaterialFormat.PNG,
    "image/gif": MaterialFormat.GIF,
})

MAX_FILE_SIZES = {
    MaterialType.DOCUMENT: 50 * 1024 * 1024,
    MaterialType.IMAGE: 20 * 1024 * 1024,
    MaterialType.AUDIO: 100 * 1024 * 1024,
    MaterialType.VIDEO: 500 * 1024 * 1024,
}

SUPPORTED_FORMATS = {
    MaterialType.DOCUMENT: {MaterialFormat.PDF, MaterialFormat.DOC, MaterialFormat.DOCX, MaterialFormat.TXT, MaterialFormat.MD},
    MaterialType.IMAGE: {MaterialFormat.JPG, MaterialFormat.JPEG, MaterialFormat.PNG, MaterialFormat.GIF},
    MaterialType.AUDIO: {MaterialFormat.MP3, MaterialFormat.WAV},
    MaterialType.VIDEO: {MaterialFormat.MP4},
}

DANGEROUS_PATTERNS = [
    rb"<script",
    rb"javascript:",
    rb"onerror=",
    rb"onload=",
    rb"onclick=",
    rb"<iframe",
    rb"<object",
    rb"<embed",
    rb"<!DOCTYPE",
    rb"<!--",
    rb"-->",
    rb"expression\(",
    rb"url\(",
    rb"data:text/html",
]

class FileValidationResult:
    def __init__(
        self,
        is_valid: bool,
        error_message: Optional[str] = None,
        file_hash: Optional[str] = None,
        detected_format: Optional[MaterialFormat] = None,
        material_type: Optional[MaterialType] = None,
    ):
        self.is_valid = is_valid
        self.error_message = error_message
        self.file_hash = file_hash
        self.detected_format = detected_format
        self.material_type = material_type


class FileValidator:
    @staticmethod
    def get_file_extension(filename: str) -> str:
        if "." not in filename:
            return ""
        return "." + filename.rsplit(".", 1)[1].lower()

    @staticmethod
    def calculate_file_hash(content: bytes) -> str:
        return hashlib.sha256(content).hexdigest()

    @staticmethod
    def detect_mime_type(content: bytes) -> str:
        try:
            mime = magic.Magic(mime=True)
            return mime.from_buffer(content)
        except Exception:
            return "application/octet-stream"

    @staticmethod
    def check_dangerous_content(content: bytes) -> Tuple[bool, Optional[str]]:
        content_lower = content.lower()
        for pattern in DANGEROUS_PATTERNS:
            if pattern in content_lower:
                return True, f"Detected potentially dangerous content pattern: {pattern.decode('utf-8', errors='ignore')}"
        return False, None

    @staticmethod
    def validate_file(
        filename: str,
        content: bytes,
        expected_type: Optional[MaterialType] = None
    ) -> FileValidationResult:
        if not filename or len(filename.strip()) == 0:
            return FileValidationResult(False, "Filename cannot be empty")

        file_hash = FileValidator.calculate_file_hash(content)

        extension = FileValidator.get_file_extension(filename)
        if not extension:
            return FileValidationResult(False, "File must have an extension")

        if extension not in FILE_EXTENSION_MAP:
            return FileValidationResult(False, f"Unsupported file extension: {extension}")

        detected_format = FILE_EXTENSION_MAP[extension]

        detected_mime = FileValidator.detect_mime_type(content)
        allowed_mimes = ALLOWED_EXTENSIONS.get(detected_format, [])
        if detected_mime not in allowed_mimes and detected_mime != "application/octet-stream":
            return FileValidationResult(False, f"MIME type mismatch: expected {allowed_mimes}, got {detected_mime}")

        is_dangerous, danger_msg = FileValidator.check_dangerous_content(content)
        if is_dangerous:
            return FileValidationResult(False, f"Security check failed: {danger_msg}")

        material_type = None
        for mtype, formats in SUPPORTED_FORMATS.items():
            if detected_format in formats:
                material_type = mtype
                break

        if not material_type:
            return FileValidationResult(False, f"Could not determine material type for format: {detected_format}")

        if expected_type and material_type != expected_type:
            return FileValidationResult(
                False,
                f"File type mismatch: expected {expected_type}, got {material_type}"
            )

        max_size = MAX_FILE_SIZES.get(material_type, 10 * 1024 * 1024)
        if len(content) > max_size:
            return FileValidationResult(
                False,
                f"File size exceeds limit: {len(content)} bytes > {max_size} bytes"
            )

        return FileValidationResult(
            is_valid=True,
            file_hash=file_hash,
            detected_format=detected_format,
            material_type=material_type
        )

    @staticmethod
    def get_supported_formats() -> Dict[str, List[str]]:
        return {
            mtype.value: [fmt.value for fmt in formats]
            for mtype, formats in SUPPORTED_FORMATS.items()
        }
