from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional
from datetime import datetime

try:
    from backend.app.core.database import get_db
    from backend.app.core.auth import get_current_user
    from backend.app.models.user import User
    from backend.app.models.material import Material as DBMaterial
    from backend.app.schemas.material import (
        MaterialUploadRequest,
        MaterialInfo,
        MaterialAnalysisResult,
        IntentSynthesisRequest,
        IntentSynthesisResult,
        MaterialType,
        MaterialFormat,
        SUPPORTED_FORMATS,
        MAX_FILE_SIZES,
    )
    from backend.app.services.file_validator import FileValidator
    from backend.app.services.material_storage import material_storage
    from backend.app.services.material_analyzer import material_analyzer, intent_synthesis_engine
except ImportError:
    from app.core.database import get_db
    from app.core.auth import get_current_user
    from app.models.user import User
    from app.models.material import Material as DBMaterial
    from app.schemas.material import (
        MaterialUploadRequest,
        MaterialInfo,
        MaterialAnalysisResult,
        IntentSynthesisRequest,
        IntentSynthesisResult,
        MaterialType,
        MaterialFormat,
        SUPPORTED_FORMATS,
        MAX_FILE_SIZES,
    )
    from app.services.file_validator import FileValidator
    from app.services.material_storage import material_storage
    from app.services.material_analyzer import material_analyzer, intent_synthesis_engine

router = APIRouter()


def get_material_type_from_format(fmt: MaterialFormat) -> MaterialType:
    for mtype, formats in SUPPORTED_FORMATS.items():
        if fmt in formats:
            return mtype
    return MaterialType.DOCUMENT


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

    validation_result = FileValidator.validate_file(file.filename, content)
    if not validation_result.is_valid:
        raise HTTPException(status_code=400, detail=validation_result.error_message)

    storage_result = await material_storage.save_file(file.filename, content)
    if not storage_result.success:
        raise HTTPException(status_code=500, detail=storage_result.error_message)

    db_material = DBMaterial(
        material_id=storage_result.material_id,
        user_id=current_user.id,
        room_id=room_id,
        filename=file.filename,
        material_type=validation_result.material_type.value,
        file_format=validation_result.detected_format.value,
        file_size=len(content),
        file_hash=validation_result.file_hash,
        file_path=storage_result.file_path,
        processing_status="uploaded"
    )
    db.add(db_material)
    await db.commit()
    await db.refresh(db_material)

    return MaterialInfo(
        id=db_material.material_id,
        filename=db_material.filename,
        material_type=MaterialType(db_material.material_type),
        format=db_material.file_format,
        size=db_material.file_size,
        processing_status=db_material.processing_status,
        uploaded_at=db_material.created_at.isoformat() if db_material.created_at else datetime.now().isoformat()
    )


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

            validation_result = FileValidator.validate_file(file.filename, content)
            if not validation_result.is_valid:
                continue

            storage_result = await material_storage.save_file(file.filename, content)
            if not storage_result.success:
                continue

            db_material = DBMaterial(
                material_id=storage_result.material_id,
                user_id=current_user.id,
                room_id=room_id,
                filename=file.filename,
                material_type=validation_result.material_type.value,
                file_format=validation_result.detected_format.value,
                file_size=len(content),
                file_hash=validation_result.file_hash,
                file_path=storage_result.file_path,
                processing_status="uploaded"
            )
            db.add(db_material)
            await db.commit()
            await db.refresh(db_material)

            results.append(MaterialInfo(
                id=db_material.material_id,
                filename=db_material.filename,
                material_type=MaterialType(db_material.material_type),
                format=db_material.file_format,
                size=db_material.file_size,
                processing_status=db_material.processing_status,
                uploaded_at=db_material.created_at.isoformat() if db_material.created_at else datetime.now().isoformat()
            ))
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
    result = await db.execute(
        select(DBMaterial).where(
            DBMaterial.material_id == material_id,
            DBMaterial.user_id == current_user.id
        )
    )
    db_material = result.scalars().first()

    if not db_material:
        raise HTTPException(status_code=404, detail="Material not found")

    if db_material.processing_status == "completed":
        return MaterialAnalysisResult(
            material_id=material_id,
            status="completed",
            extracted_content=db_material.extracted_content,
            key_info=db_material.key_info,
            intent_indicators=db_material.intent_indicators,
            summary=db_material.summary
        )

    file_content = await material_storage.read_file_content(material_id)
    if not file_content:
        raise HTTPException(status_code=404, detail="Material file not found")

    db_material.processing_status = "processing"
    await db.commit()

    try:
        if db_material.material_type == MaterialType.IMAGE.value:
            analysis_result = material_analyzer.analyze_image(
                material_id,
                file_content,
                db_material.filename
            )
        else:
            fmt = MaterialFormat(db_material.file_format)
            analysis_result = material_analyzer.analyze_document(
                material_id,
                file_content,
                fmt
            )

        if analysis_result.success:
            db_material.processing_status = "completed"
            db_material.extracted_content = analysis_result.extracted_content
            db_material.key_info = analysis_result.key_info
            db_material.intent_indicators = analysis_result.intent_indicators
            db_material.summary = analysis_result.summary
        else:
            db_material.processing_status = "failed"

        await db.commit()

        return MaterialAnalysisResult(
            material_id=material_id,
            status=db_material.processing_status,
            extracted_content=analysis_result.extracted_content,
            key_info=analysis_result.key_info,
            intent_indicators=analysis_result.intent_indicators,
            summary=analysis_result.summary
        )
    except Exception as e:
        db_material.processing_status = "failed"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


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
            result = await analyze_material(material_id, background_tasks, db, current_user)
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
    material_results = []

    for material_id in request.materials:
        result = await db.execute(
            select(DBMaterial).where(
                DBMaterial.material_id == material_id,
                DBMaterial.user_id == current_user.id
            )
        )
        db_material = result.scalars().first()

        if not db_material:
            continue

        from backend.app.services.material_analyzer import MaterialAnalysisResult as AppMaterialAnalysisResult
        from backend.app.services.file_validator import MaterialFormat as AppMaterialFormat

        analysis_result = AppMaterialAnalysisResult(
            material_id=material_id,
            success=db_material.processing_status == "completed",
            extracted_content=db_material.extracted_content,
            key_info=db_material.key_info,
            intent_indicators=db_material.intent_indicators,
            summary=db_material.summary
        )
        material_results.append(analysis_result)

    if not material_results:
        raise HTTPException(status_code=404, detail="No valid materials found")

    synthesis_result = intent_synthesis_engine.synthesize_intent(
        request.room_id,
        material_results,
        request.context_text
    )

    return IntentSynthesisResult(**synthesis_result)


@router.get("/materials", response_model=List[MaterialInfo])
async def list_materials(
    room_id: Optional[str] = Query(None, description="Filter by room ID"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = select(DBMaterial).where(
        DBMaterial.user_id == current_user.id,
        DBMaterial.is_active.is_(True)
    )

    if room_id:
        query = query.where(DBMaterial.room_id == room_id)

    query = query.order_by(DBMaterial.created_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    materials = result.scalars().all()

    return [
        MaterialInfo(
            id=m.material_id,
            filename=m.filename,
            material_type=MaterialType(m.material_type),
            format=m.file_format,
            size=m.file_size,
            processing_status=m.processing_status,
            extracted_content=m.extracted_content,
            key_info=m.key_info,
            intent_indicators=m.intent_indicators,
            summary=m.summary,
            uploaded_at=m.created_at.isoformat() if m.created_at else datetime.now().isoformat()
        )
        for m in materials
    ]


@router.get("/{material_id}", response_model=MaterialInfo)
async def get_material(
    material_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(DBMaterial).where(
            DBMaterial.material_id == material_id,
            DBMaterial.user_id == current_user.id
        )
    )
    db_material = result.scalars().first()

    if not db_material:
        raise HTTPException(status_code=404, detail="Material not found")

    return MaterialInfo(
        id=db_material.material_id,
        filename=db_material.filename,
        material_type=MaterialType(db_material.material_type),
        format=db_material.file_format,
        size=db_material.file_size,
        processing_status=db_material.processing_status,
        extracted_content=db_material.extracted_content,
        key_info=db_material.key_info,
        intent_indicators=db_material.intent_indicators,
        summary=db_material.summary,
        uploaded_at=db_material.created_at.isoformat() if db_material.created_at else datetime.now().isoformat()
    )


@router.delete("/{material_id}")
async def delete_material(
    material_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(DBMaterial).where(
            DBMaterial.material_id == material_id,
            DBMaterial.user_id == current_user.id
        )
    )
    db_material = result.scalars().first()

    if not db_material:
        raise HTTPException(status_code=404, detail="Material not found")

    await material_storage.delete_file(material_id)
    db_material.is_active = False
    await db.commit()

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
