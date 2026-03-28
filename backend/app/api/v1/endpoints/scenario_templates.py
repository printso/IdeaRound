from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

try:
    from backend.app.core.database import get_db
    from backend.app.models.scenario_template import ScenarioTemplate
    from backend.app.schemas.scenario_template import (
        ScenarioTemplateCreate,
        ScenarioTemplateUpdate,
        ScenarioTemplateInDB
    )
except ImportError:
    from app.core.database import get_db
    from app.models.scenario_template import ScenarioTemplate
    from app.schemas.scenario_template import (
        ScenarioTemplateCreate,
        ScenarioTemplateUpdate,
        ScenarioTemplateInDB
    )

router = APIRouter()

@router.get("/", response_model=List[ScenarioTemplateInDB])
async def list_scenario_templates(db: AsyncSession = Depends(get_db)):
    """获取所有场景模板列表"""
    result = await db.execute(
        select(ScenarioTemplate).order_by(ScenarioTemplate.sort_order.asc(), ScenarioTemplate.id.desc())
    )
    return result.scalars().all()

@router.post("/", response_model=ScenarioTemplateInDB)
async def create_scenario_template(
    template: ScenarioTemplateCreate, 
    db: AsyncSession = Depends(get_db)
):
    """创建新的场景模板"""
    db_obj = ScenarioTemplate(**template.dict())
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj

@router.put("/{template_id}", response_model=ScenarioTemplateInDB)
async def update_scenario_template(
    template_id: int, 
    template_update: ScenarioTemplateUpdate, 
    db: AsyncSession = Depends(get_db)
):
    """更新场景模板"""
    result = await db.execute(select(ScenarioTemplate).where(ScenarioTemplate.id == template_id))
    db_obj = result.scalar_one_or_none()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Template not found")
        
    update_data = template_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_obj, field, value)
        
    await db.commit()
    await db.refresh(db_obj)
    return db_obj

@router.delete("/{template_id}")
async def delete_scenario_template(
    template_id: int, 
    db: AsyncSession = Depends(get_db)
):
    """删除场景模板"""
    result = await db.execute(select(ScenarioTemplate).where(ScenarioTemplate.id == template_id))
    db_obj = result.scalar_one_or_none()
    
    if not db_obj:
        raise HTTPException(status_code=404, detail="Template not found")
        
    await db.delete(db_obj)
    await db.commit()
    return {"message": "Deleted successfully"}
