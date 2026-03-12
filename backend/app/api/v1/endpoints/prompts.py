from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from backend.app.core.database import get_db
from backend.app.models.prompt import SysPrompt
from backend.app.schemas.prompt import Prompt, PromptCreate, PromptUpdate

router = APIRouter()

@router.get("/", response_model=List[Prompt])
async def read_prompts(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SysPrompt).offset(skip).limit(limit))
    prompts = result.scalars().all()
    return prompts

@router.post("/", response_model=Prompt)
async def create_prompt(prompt: PromptCreate, db: AsyncSession = Depends(get_db)):
    db_prompt = SysPrompt(**prompt.dict())
    db.add(db_prompt)
    await db.commit()
    await db.refresh(db_prompt)
    return db_prompt

@router.put("/{prompt_id}", response_model=Prompt)
async def update_prompt(prompt_id: int, prompt: PromptUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SysPrompt).where(SysPrompt.id == prompt_id))
    db_prompt = result.scalars().first()
    if not db_prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    for key, value in prompt.dict().items():
        setattr(db_prompt, key, value)
    
    await db.commit()
    await db.refresh(db_prompt)
    return db_prompt

@router.delete("/{prompt_id}")
async def delete_prompt(prompt_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SysPrompt).where(SysPrompt.id == prompt_id))
    db_prompt = result.scalars().first()
    if not db_prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    
    await db.delete(db_prompt)
    await db.commit()
    return {"ok": True}
