from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime

try:
    from backend.app.core.database import get_db
    from backend.app.models.search_engine import SearchEngineConfig
    from backend.app.schemas.search_engine import SearchEngineConfigCreate, SearchEngineConfigUpdate, SearchEngineConfigResponse, SearchEngineTestRequest
    from backend.app.services.search_service import SearchService
except ImportError:
    from app.core.database import get_db
    from app.models.search_engine import SearchEngineConfig
    from app.schemas.search_engine import SearchEngineConfigCreate, SearchEngineConfigUpdate, SearchEngineConfigResponse, SearchEngineTestRequest
    from app.services.search_service import SearchService

router = APIRouter()

@router.get("/", response_model=List[SearchEngineConfigResponse])
async def read_search_engine_configs(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SearchEngineConfig).offset(skip).limit(limit))
    configs = result.scalars().all()
    return configs

@router.get("/{config_id}", response_model=SearchEngineConfigResponse)
async def read_search_engine_config(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SearchEngineConfig).where(SearchEngineConfig.id == config_id))
    config = result.scalars().first()
    if not config:
        raise HTTPException(status_code=404, detail="Search Engine Config not found")
    return config

@router.post("/", response_model=SearchEngineConfigResponse)
async def create_search_engine_config(config: SearchEngineConfigCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SearchEngineConfig).where(SearchEngineConfig.name == config.name))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="Search Engine Config with this name already exists")
    
    # If this is set as default, unset others
    if config.is_default:
        from sqlalchemy import update
        await db.execute(update(SearchEngineConfig).values(is_default=False))

    db_config = SearchEngineConfig(**config.model_dump(), created_at=datetime.now(), updated_at=datetime.now())
    db.add(db_config)
    await db.commit()
    await db.refresh(db_config)
    return db_config

@router.put("/{config_id}", response_model=SearchEngineConfigResponse)
async def update_search_engine_config(config_id: int, config: SearchEngineConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SearchEngineConfig).where(SearchEngineConfig.id == config_id))
    db_config = result.scalars().first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Search Engine Config not found")
    
    update_data = config.model_dump(exclude_unset=True)
    
    if update_data.get("is_default"):
        from sqlalchemy import update
        await db.execute(update(SearchEngineConfig).values(is_default=False))
        
    for key, value in update_data.items():
        setattr(db_config, key, value)
    
    await db.commit()
    await db.refresh(db_config)
    return db_config

@router.delete("/{config_id}")
async def delete_search_engine_config(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SearchEngineConfig).where(SearchEngineConfig.id == config_id))
    db_config = result.scalars().first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Search Engine Config not found")
    
    await db.delete(db_config)
    await db.commit()
    return {"ok": True}

@router.post("/{config_id}/test")
async def test_search_engine_config(config_id: int, request: SearchEngineTestRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SearchEngineConfig).where(SearchEngineConfig.id == config_id))
    db_config = result.scalars().first()
    if not db_config:
        raise HTTPException(status_code=404, detail="Search Engine Config not found")
    
    try:
        # Assuming SearchService has a way to search with a specific config
        if db_config.provider == "searxng":
            results = await SearchService._search_searxng(request.query, db_config, request.limit)
            return {"ok": True, "results": results}
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported provider: {db_config.provider}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
