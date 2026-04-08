"""
物料管理 API
提供文件上传、解析与查询功能
"""
# Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

try:
    from backend.app.core.database import get_db
    from backend.app.core.auth import get_current_user
    from backend.app.models.user import User
    from backend.app.schemas.material import (
        MaterialInfo,
        MaterialAnalysisResult,
        IntentSynthesisRequest,
        IntentSynthesisResult,
        MaterialType,
        MaterialFormat,
        SUPPORTED_FORMATS,
        MAX_FILE_SIZES,
    )
    from backend.app.services import material_service
except ImportError:
    from app.core.database import get_db
    from app.core.auth import get_current_user
    from app.models.user import User
    from app.schemas.material import (
        MaterialInfo,
        MaterialAnalysisResult,
        IntentSynthesisRequest,
        IntentSynthesisResult,
        MaterialType,
        MaterialFormat,
        SUPPORTED_FORMATS,
        MAX_FILE_SIZES,
    )
    from app.services import material_service

router = APIRouter()


@router.post("/upload", response_model=MaterialInfo)
async def upload_material(
    file: UploadFile = File(...),
    room_id: str = Query(..., description="Room ID to associate with this material"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="File is empty")

    return await material_service.upload_material(db, current_user, file.filename, content, room_id)


@router.post("/upload/multiple", response_model=List[MaterialInfo])
async def upload_multiple_materials(
    files: List[UploadFile] = File(...),
    room_id: str = Query(..., description="Room ID to associate with these materials"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 files can be uploaded at once")

    results = []
    for file in files:
        try:
            if not file.filename:
                continue

            content = await file.read()
            if len(content) == 0:
                continue

            res = await material_service.upload_material(db, current_user, file.filename, content, room_id)
            results.append(res)
        except HTTPException:
            continue

    return results


@router.post("/analyze/{material_id}", response_model=MaterialAnalysisResult)
async def analyze_material(
    material_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await material_service.analyze_material(db, current_user, material_id)


@router.post("/analyze/batch")
async def batch_analyze_materials(
    material_ids: List[str],
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    results = []
    for material_id in material_ids:
        try:
            result = await material_service.analyze_material(db, current_user, material_id)
            results.append(result)
        except HTTPException:
            continue

    return {"results": results, "total": len(material_ids), "processed": len(results)}


@router.post("/intent/synthesize", response_model=IntentSynthesisResult)
async def synthesize_intent(
    request: IntentSynthesisRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await material_service.synthesize_intent(
        db, current_user, request.materials, request.room_id, request.context_text
    )


@router.get("/materials", response_model=List[MaterialInfo])
async def list_materials(
    room_id: Optional[str] = Query(None, description="Filter by room ID"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await material_service.list_materials(db, current_user, skip, limit, room_id)


@router.get("/{material_id}", response_model=MaterialInfo)
async def get_material(
    material_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return await material_service.get_material(db, current_user, material_id)


@router.delete("/{material_id}")
async def delete_material(
    material_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await material_service.delete_material(db, current_user, material_id)
    return {"ok": True}


@router.get("/formats/supported")
async def get_supported_formats():
    return {
        "supported_formats": {
            mtype.value: [fmt.value for fmt in formats]
            for mtype, formats in SUPPORTED_FORMATS.items()
        },
        "max_file_sizes": {
            mtype.value: size
            for mtype, size in MAX_FILE_SIZES.items()
        }
    }
