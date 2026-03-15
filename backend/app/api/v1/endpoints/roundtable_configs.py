from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Dict

try:
    from backend.app.core.database import get_db
    from backend.app.models.roundtable_config import RoundtableConfig as DBRoundtableConfig
    from backend.app.schemas.roundtable_config import RoundtableConfig, RoundtableConfigCreate, RoundtableConfigUpdate
except ImportError:
    from app.core.database import get_db
    from app.models.roundtable_config import RoundtableConfig as DBRoundtableConfig
    from app.schemas.roundtable_config import RoundtableConfig, RoundtableConfigCreate, RoundtableConfigUpdate

router = APIRouter()

# 提示词模板配置键列表
PROMPT_CONFIG_KEYS = [
    "prompt_base",
    "prompt_brief_stage", 
    "prompt_final_stage",
    "prompt_audit_brief",
    "prompt_audit_final",
    "prompt_converge_trigger",
]

@router.get("/prompts", response_model=Dict[str, str])
async def get_prompt_templates(db: AsyncSession = Depends(get_db)):
    """获取所有提示词模板配置"""
    result = await db.execute(
        select(DBRoundtableConfig).where(
            DBRoundtableConfig.config_key.in_(PROMPT_CONFIG_KEYS),
            DBRoundtableConfig.is_active.is_(True)
        )
    )
    configs = result.scalars().all()
    return {config.config_key: config.config_value for config in configs}

@router.get("/", response_model=List[RoundtableConfig])
async def read_roundtable_configs(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBRoundtableConfig).offset(skip).limit(limit))
    configs = result.scalars().all()
    return configs

@router.get("/{config_id}", response_model=RoundtableConfig)
async def read_roundtable_config(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBRoundtableConfig).where(DBRoundtableConfig.id == config_id))
    config = result.scalars().first()
    if not config:
        raise HTTPException(status_code=404, detail="Roundtable config not found")
    return config

@router.post("/", response_model=RoundtableConfig)
async def create_roundtable_config(config: RoundtableConfigCreate, db: AsyncSession = Depends(get_db)):
    db_config = DBRoundtableConfig(**config.model_dump())
    db.add(db_config)
    await db.commit()
    await db.refresh(db_config)
    return db_config

@router.put("/{config_id}", response_model=RoundtableConfig)
async def update_roundtable_config(config_id: int, config: RoundtableConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBRoundtableConfig).where(DBRoundtableConfig.id == config_id))
    db_config = result.scalars().first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Roundtable config not found")
    
    for key, value in config.model_dump(exclude_unset=True).items():
        setattr(db_config, key, value)
    
    await db.commit()
    await db.refresh(db_config)
    return db_config

@router.delete("/{config_id}")
async def delete_roundtable_config(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(DBRoundtableConfig).where(DBRoundtableConfig.id == config_id))
    db_config = result.scalars().first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Roundtable config not found")
    
    await db.delete(db_config)
    await db.commit()
    return {"ok": True}
