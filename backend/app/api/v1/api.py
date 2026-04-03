from fastapi import APIRouter

try:
    from backend.app.api.v1.endpoints import prompts, llm, style_configs, role_templates, roundtable_configs, auth, users, workspaces, materials, scenario_templates, runtime, search_engines
except ImportError:
    from app.api.v1.endpoints import prompts, llm, style_configs, role_templates, roundtable_configs, auth, users, workspaces, materials, scenario_templates, runtime, search_engines

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["用户认证"])
api_router.include_router(users.router, prefix="/users", tags=["用户管理"])
api_router.include_router(prompts.router, prefix="/prompts", tags=["系统提示词管理"])
api_router.include_router(llm.router, prefix="/llm", tags=["LLM 配置"])
api_router.include_router(search_engines.router, prefix="/search-engines", tags=["搜索引擎配置"])
api_router.include_router(style_configs.router, prefix="/style-configs", tags=["风格配置管理"])
api_router.include_router(role_templates.router, prefix="/role-templates", tags=["角色模板管理"])
api_router.include_router(roundtable_configs.router, prefix="/roundtable-configs", tags=["圆桌配置管理"])
api_router.include_router(workspaces.router, prefix="/workspaces", tags=["工作台管理"])
api_router.include_router(materials.router, prefix="/materials", tags=["材料管理"])
api_router.include_router(scenario_templates.router, prefix="/scenario-templates", tags=["Scenario Templates"])
api_router.include_router(runtime.router, prefix="/runtime", tags=["运行时编排"])
# api_router.include_router(chat.router, prefix="/chat", tags=["chat"])
