from fastapi import APIRouter

try:
    from backend.app.api.v1.endpoints import prompts, llm, style_configs, role_templates, roundtable_configs, auth, users
except ImportError:
    from app.api.v1.endpoints import prompts, llm, style_configs, role_templates, roundtable_configs, auth, users

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["用户认证"])
api_router.include_router(users.router, prefix="/users", tags=["用户管理"])
api_router.include_router(prompts.router, prefix="/prompts", tags=["系统提示词管理"])
api_router.include_router(llm.router, prefix="/llm", tags=["LLM 配置"])
api_router.include_router(style_configs.router, prefix="/style-configs", tags=["风格配置管理"])
api_router.include_router(role_templates.router, prefix="/role-templates", tags=["角色模板管理"])
api_router.include_router(roundtable_configs.router, prefix="/roundtable-configs", tags=["圆桌配置管理"])
# api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
