from fastapi import APIRouter
from backend.app.api.v1.endpoints import prompts, llm

api_router = APIRouter()
api_router.include_router(prompts.router, prefix="/prompts", tags=["prompts"])
api_router.include_router(llm.router, prefix="/llm", tags=["llm"])
# api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
