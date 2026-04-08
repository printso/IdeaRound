"""物料服务层"""

# Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.models.material import Material as DBMaterial
    from backend.app.models.user import User
    from backend.app.schemas.material import (
        MaterialInfo,
        MaterialAnalysisResult,
        IntentSynthesisResult,
        MaterialType,
        MaterialFormat,
    )
    from backend.app.services.file_validator import FileValidator
    from backend.app.services.material_storage import material_storage
    from backend.app.services.material_analyzer import material_analyzer, intent_synthesis_engine
except ImportError:
    from app.models.material import Material as DBMaterial
    from app.models.user import User
    from app.schemas.material import (
        MaterialInfo,
        MaterialAnalysisResult,
        IntentSynthesisResult,
        MaterialType,
        MaterialFormat,
    )
    from app.services.file_validator import FileValidator
    from app.services.material_storage import material_storage
    from app.services.material_analyzer import material_analyzer, intent_synthesis_engine


async def upload_material(
    db: AsyncSession,
    user: User,
    filename: str,
    content: bytes,
    room_id: str,
) -> MaterialInfo:
    validation_result = FileValidator.validate_file(filename, content)
    if not validation_result.is_valid:
        raise HTTPException(status_code=400, detail=validation_result.error_message)

    storage_result = await material_storage.save_file(filename, content)
    if not storage_result.success:
        raise HTTPException(status_code=500, detail=storage_result.error_message)

    db_material = DBMaterial(
        material_id=storage_result.material_id,
        user_id=user.id,
        room_id=room_id,
        filename=filename,
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


async def analyze_material(
    db: AsyncSession,
    user: User,
    material_id: str,
) -> MaterialAnalysisResult:
    result = await db.execute(
        select(DBMaterial).where(
            DBMaterial.material_id == material_id,
            DBMaterial.user_id == user.id
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
            extracted_content=analysis_result.extracted_content if analysis_result.success else None,
            key_info=analysis_result.key_info if analysis_result.success else None,
            intent_indicators=analysis_result.intent_indicators if analysis_result.success else None,
            summary=analysis_result.summary if analysis_result.success else None
        )
    except Exception as e:
        db_material.processing_status = "failed"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


async def synthesize_intent(
    db: AsyncSession,
    user: User,
    material_ids: List[str],
    room_id: str,
    context_text: str,
) -> IntentSynthesisResult:
    material_results = []

    for material_id in material_ids:
        result = await db.execute(
            select(DBMaterial).where(
                DBMaterial.material_id == material_id,
                DBMaterial.user_id == user.id
            )
        )
        db_material = result.scalars().first()

        if not db_material:
            continue

        try:
            from backend.app.services.material_analyzer import MaterialAnalysisResult as AppMaterialAnalysisResult
        except ImportError:
            from app.services.material_analyzer import MaterialAnalysisResult as AppMaterialAnalysisResult

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
        room_id,
        material_results,
        context_text
    )

    return IntentSynthesisResult(**synthesis_result)


async def list_materials(
    db: AsyncSession,
    user: User,
    skip: int,
    limit: int,
    room_id: Optional[str] = None,
) -> List[MaterialInfo]:
    query = select(DBMaterial).where(
        DBMaterial.user_id == user.id,
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


async def get_material(
    db: AsyncSession,
    user: User,
    material_id: str,
) -> MaterialInfo:
    result = await db.execute(
        select(DBMaterial).where(
            DBMaterial.material_id == material_id,
            DBMaterial.user_id == user.id
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


async def delete_material(
    db: AsyncSession,
    user: User,
    material_id: str,
) -> None:
    result = await db.execute(
        select(DBMaterial).where(
            DBMaterial.material_id == material_id,
            DBMaterial.user_id == user.id
        )
    )
    db_material = result.scalars().first()

    if not db_material:
        raise HTTPException(status_code=404, detail="Material not found")

    await material_storage.delete_file(material_id)
    db_material.is_active = False
    await db.commit()
