import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import AsyncGenerator, List

from backend.app.core.database import get_db
from backend.app.models.llm import LLMConfig
from backend.app.schemas.llm import LLMChatStreamRequest, LLMConfigCreate, LLMConfigUpdate, LLMConfigResponse

router = APIRouter()

@router.get("/", response_model=List[LLMConfigResponse])
async def read_llm_configs(skip: int = 0, limit: int = 100, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LLMConfig).offset(skip).limit(limit))
    llm_configs = result.scalars().all()
    return llm_configs

@router.get("/{config_id}", response_model=LLMConfigResponse)
async def read_llm_config(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LLMConfig).where(LLMConfig.id == config_id))
    llm_config = result.scalars().first()
    if not llm_config:
        raise HTTPException(status_code=404, detail="LLM Config not found")
    return llm_config

@router.post("/", response_model=LLMConfigResponse)
async def create_llm_config(config: LLMConfigCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LLMConfig).where(LLMConfig.name == config.name))
    if result.scalars().first():
        raise HTTPException(status_code=400, detail="LLM Config with this name already exists")
    
    db_config = LLMConfig(**config.model_dump())
    db.add(db_config)
    await db.commit()
    await db.refresh(db_config)
    return db_config

@router.put("/{config_id}", response_model=LLMConfigResponse)
async def update_llm_config(config_id: int, config: LLMConfigUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LLMConfig).where(LLMConfig.id == config_id))
    db_config = result.scalars().first()
    if not db_config:
        raise HTTPException(status_code=404, detail="LLM Config not found")
    
    update_data = config.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_config, key, value)
    
    await db.commit()
    await db.refresh(db_config)
    return db_config

@router.delete("/{config_id}")
async def delete_llm_config(config_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(LLMConfig).where(LLMConfig.id == config_id))
    db_config = result.scalars().first()
    if not db_config:
        raise HTTPException(status_code=404, detail="LLM Config not found")
    
    await db.delete(db_config)
    await db.commit()
    return {"ok": True}


@router.post("/{config_id}/chat/stream")
async def stream_chat_by_llm_config(
    config_id: int,
    body: LLMChatStreamRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(LLMConfig).where(LLMConfig.id == config_id, LLMConfig.is_active.is_(True)))
    llm_config = result.scalars().first()
    if not llm_config:
        raise HTTPException(status_code=404, detail="LLM Config not found or inactive")

    if not llm_config.api_key:
        raise HTTPException(status_code=400, detail="API key is required for this model")

    async def event_generator() -> AsyncGenerator[str, None]:
        try:
            client = AsyncOpenAI(api_key=llm_config.api_key, base_url=llm_config.api_base or None)
            messages = []
            if body.system_prompt:
                messages.append({"role": "system", "content": body.system_prompt})
            messages.append({"role": "user", "content": body.message})
            stream = await client.chat.completions.create(
                model=llm_config.model_name,
                messages=messages,
                temperature=llm_config.temperature,
                stream=True,
            )
            async for chunk in stream:
                content = ""
                if chunk.choices and chunk.choices[0].delta:
                    content = chunk.choices[0].delta.content or ""
                if content:
                    yield f"data: {json.dumps({'type': 'delta', 'content': content}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as exc:
            err = str(exc)
            yield f"data: {json.dumps({'type': 'error', 'message': err}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
