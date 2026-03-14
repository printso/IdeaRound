from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

try:
    from backend.app.core.database import get_db
    from backend.app.models.role_template import RoleTemplate as DBRoleTemplate
    from backend.app.schemas.role_template import RoleTemplate, RoleTemplateCreate, RoleTemplateUpdate
except ImportError:
    from app.core.database import get_db
    from app.models.role_template import RoleTemplate as DBRoleTemplate
    from app.schemas.role_template import RoleTemplate, RoleTemplateCreate, RoleTemplateUpdate

router = APIRouter()

@router.get("/", response_model=List[RoleTemplate])
async def read_role_templates(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBRoleTemplate).offset(skip).limit(limit))
    templates = result.scalars().all()
    return templates

@router.get("/{template_id}", response_model=RoleTemplate)
async def read_role_template(template_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBRoleTemplate).where(DBRoleTemplate.id == template_id))
    template = result.scalars().first()
    if not template:
        raise HTTPException(status_code=404, detail="Role template not found")
    return template

@router.post("/", response_model=RoleTemplate)
async def create_role_template(template: RoleTemplateCreate, db: AsyncSession = Depends(get_db)):
    db_template = DBRoleTemplate(**template.model_dump())
    db.add(db_template)
    await db.commit()
    await db.refresh(db_template)
    return db_template

@router.put("/{template_id}", response_model=RoleTemplate)
async def update_role_template(template_id: int, template: RoleTemplateUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBRoleTemplate).where(DBRoleTemplate.id == template_id))
    db_template = result.scalars().first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Role template not found")
    
    for key, value in template.model_dump(exclude_unset=True).items():
        setattr(db_template, key, value)
    
    await db.commit()
    await db.refresh(db_template)
    return db_template

@router.delete("/{template_id}")
async def delete_role_template(template_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBRoleTemplate).where(DBRoleTemplate.id == template_id))
    db_template = result.scalars().first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Role template not found")
    
    await db.delete(db_template)
    await db.commit()
    return {"ok": True}
