import json
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import AsyncGenerator, List

try:
    from backend.app.core.database import get_db
    from backend.app.models.llm import LLMConfig
    from backend.app.schemas.llm import LLMChatStreamRequest, LLMConfigCreate, LLMConfigUpdate, LLMConfigResponse
except ImportError:
    from app.core.database import get_db
    from app.models.llm import LLMConfig
    from app.schemas.llm import LLMChatStreamRequest, LLMConfigCreate, LLMConfigUpdate, LLMConfigResponse

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

@router.post("/{config_id}/chat/sync")
async def sync_chat_by_llm_config(
    config_id: int,
    body: LLMChatStreamRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    非流式调用大模型接口（用于后台裁判、意图分析等隐式任务）
    """
    result = await db.execute(select(LLMConfig).where(LLMConfig.id == config_id, LLMConfig.is_active.is_(True)))
    llm_config = result.scalars().first()
    if not llm_config:
        raise HTTPException(status_code=404, detail="LLM Config not found or inactive")

    if not llm_config.api_key:
        raise HTTPException(status_code=400, detail="API key is required for this model")

    try:
        client = AsyncOpenAI(api_key=llm_config.api_key, base_url=llm_config.api_base or None)
        messages = []
        if body.system_prompt:
            messages.append({"role": "system", "content": body.system_prompt})
        messages.append({"role": "user", "content": body.message})
        
        response = await client.chat.completions.create(
            model=llm_config.model_name,
            messages=messages,
            temperature=llm_config.temperature,
            stream=False,
        )
        content = response.choices[0].message.content or ""
        return {"content": content}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

@router.post("/{config_id}/chat/judge")
async def judge_discussion_progress(
    config_id: int,
    body: LLMChatStreamRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    专用接口：裁判Agent评估讨论进度
    返回格式化的 JSON 数据
    """
    result = await db.execute(select(LLMConfig).where(LLMConfig.id == config_id, LLMConfig.is_active.is_(True)))
    llm_config = result.scalars().first()
    if not llm_config:
        raise HTTPException(status_code=404, detail="LLM Config not found or inactive")

    if not llm_config.api_key:
        raise HTTPException(status_code=400, detail="API key is required for this model")

    try:
        client = AsyncOpenAI(api_key=llm_config.api_key, base_url=llm_config.api_base or None)
        messages = []
        if body.system_prompt:
            messages.append({"role": "system", "content": body.system_prompt})
        messages.append({"role": "user", "content": body.message})
        
        response = await client.chat.completions.create(
            model=llm_config.model_name,
            messages=messages,
            temperature=0.1, # 裁判需要稳定的输出，使用低温度
            stream=False,
            response_format={ "type": "json_object" } # 强制输出 JSON
        )
        content = response.choices[0].message.content or "{}"
        
        try:
            # 验证是否为有效 JSON
            json_content = json.loads(content)
            return json_content
        except json.JSONDecodeError:
            return {"score": 0, "reason": "裁判解析失败", "reached": False}
            
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
