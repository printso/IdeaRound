import os
import uuid
import aiofiles
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path

from app.services.file_validator import (
    FileValidator,
    FileValidationResult,
    MaterialFormat,
    MaterialType,
)


class MaterialStorageResult:
    def __init__(
        self,
        success: bool,
        material_id: Optional[str] = None,
        file_path: Optional[str] = None,
        error_message: Optional[str] = None,
        validation_result: Optional[FileValidationResult] = None,
    ):
        self.success = success
        self.material_id = material_id
        self.file_path = file_path
        self.error_message = error_message
        self.validation_result = validation_result


class MaterialStorage:
    def __init__(self, storage_dir: str = "./uploads"):
        self.storage_dir = Path(storage_dir)
        self._ensure_storage_dir()

    def _ensure_storage_dir(self):
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        (self.storage_dir / "documents").mkdir(exist_ok=True)
        (self.storage_dir / "images").mkdir(exist_ok=True)
        (self.storage_dir / "audio").mkdir(exist_ok=True)
        (self.storage_dir / "video").mkdir(exist_ok=True)

    def _get_material_dir(self, material_type: MaterialType) -> Path:
        type_dir_map = {
            MaterialType.DOCUMENT: "documents",
            MaterialType.IMAGE: "images",
            MaterialType.AUDIO: "audio",
            MaterialType.VIDEO: "video",
        }
        return self.storage_dir / type_dir_map.get(material_type, "documents")

    def _generate_material_id(self, original_filename: str, file_hash: str) -> str:
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        uuid_part = uuid.uuid4().hex[:8]
        safe_name = "".join(c for c in original_filename if c.isalnum() or c in "._-")[:20]
        return f"{safe_name}_{timestamp}_{uuid_part}"

    async def save_file(
        self,
        filename: str,
        content: bytes,
        expected_type: Optional[MaterialType] = None
    ) -> MaterialStorageResult:
        validation_result = FileValidator.validate_file(filename, content, expected_type)

        if not validation_result.is_valid:
            return MaterialStorageResult(
                success=False,
                error_message=validation_result.error_message,
                validation_result=validation_result,
            )

        material_id = self._generate_material_id(filename, validation_result.file_hash)
        material_dir = self._get_material_dir(validation_result.material_type)

        extension = FileValidator.get_file_extension(filename)
        safe_filename = f"{material_id}{extension}"
        file_path = material_dir / safe_filename

        try:
            async with aiofiles.open(file_path, "wb") as f:
                await f.write(content)

            return MaterialStorageResult(
                success=True,
                material_id=material_id,
                file_path=str(file_path),
                validation_result=validation_result,
            )
        except Exception as e:
            return MaterialStorageResult(
                success=False,
                error_message=f"Failed to save file: {str(e)}",
                validation_result=validation_result,
            )

    async def delete_file(self, material_id: str) -> bool:
        for subdir in ["documents", "images", "audio", "video"]:
            search_path = self.storage_dir / subdir
            if not search_path.exists():
                continue
            for file_path in search_path.glob(f"*{material_id}*"):
                try:
                    file_path.unlink()
                    return True
                except Exception:
                    continue
        return False

    async def get_file_path(self, material_id: str) -> Optional[str]:
        for subdir in ["documents", "images", "audio", "video"]:
            search_path = self.storage_dir / subdir
            if not search_path.exists():
                continue
            matches = list(search_path.glob(f"*{material_id}*"))
            if matches:
                return str(matches[0])
        return None

    async def read_file_content(self, material_id: str) -> Optional[bytes]:
        file_path = await self.get_file_path(material_id)
        if not file_path:
            return None
        try:
            async with aiofiles.open(file_path, "rb") as f:
                return await f.read()
        except Exception:
            return None


material_storage = MaterialStorage()
