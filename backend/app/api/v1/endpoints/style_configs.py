from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

try:
    from backend.app.core.database import get_db
    from backend.app.models.style import StyleConfig as DBStyleConfig
    from backend.app.schemas.style import StyleConfig, StyleConfigCreate, StyleConfigUpdate
except ImportError:
    from app.core.database import get_db
    from app.models.style import StyleConfig as DBStyleConfig
    from app.schemas.style import StyleConfig, StyleConfigCreate, StyleConfigUpdate

router = APIRouter()

@router.get("/", response_model=List[StyleConfig])
async def read_style_configs(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBStyleConfig).offset(skip).limit(limit))
    configs = result.scalars().all()
    return configs

@router.get("/{config_id}", response_model=StyleConfig)
async def read_style_config(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBStyleConfig).where(DBStyleConfig.id == config_id))
    config = result.scalars().first()
    if not config:
        raise HTTPException(status_code=404, detail="Style config not found")
    return config

@router.post("/", response_model=StyleConfig)
async def create_style_config(config: StyleConfigCreate, db: AsyncSession = Depends(get_db)):
    db_config = DBStyleConfig(**config.model_dump())
    db.add(db_config)
    await db.commit()
    await db.refresh(db_config)
    return db_config

@router.put("/{config_id}", response_model=StyleConfig)
async def update_style_config(config_id: int, config: StyleConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBStyleConfig).where(DBStyleConfig.id == config_id))
    db_config = result.scalars().first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Style config not found")
    
    for key, value in config.model_dump(exclude_unset=True).items():
        setattr(db_config, key, value)
    
    await db.commit()
    await db.refresh(db_config)
    return db_config

@router.delete("/{config_id}")
async def delete_style_config(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBStyleConfig).where(DBStyleConfig.id == config_id))
    db_config = result.scalars().first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Style config not found")
    
    await db.delete(db_config)
    await db.commit()
    return {"ok": True}
