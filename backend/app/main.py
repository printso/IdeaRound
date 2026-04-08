from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import os

try:
    from backend.app.core.config import settings
    from backend.app.core.database import engine, Base
    from backend.app.core.middleware import (
        RequestIDMiddleware,
        LoggingMiddleware,
        ExceptionHandlerMiddleware,
    )
    from backend.app.core.logger import app_logger
    from backend.app.api.v1.api import api_router
    # Import all models to ensure they are registered with SQLAlchemy
    from backend.app.models.prompt import SysPrompt
    from backend.app.models.bot import Bot
    from backend.app.models.chat import ChatRoom, Message
    from backend.app.models.canvas import ConsensusCanvas
    from backend.app.models.llm import LLMConfig
    from backend.app.models.workspace import Workspace
    from backend.app.models.runtime import RuntimeTask, RuntimeEvent
    from backend.app.models.search_engine import SearchEngineConfig
except ImportError:
    from app.core.config import settings
    from app.core.database import engine, Base
    from app.core.middleware import (
        RequestIDMiddleware,
        LoggingMiddleware,
        ExceptionHandlerMiddleware,
    )
    from app.core.logger import app_logger
    from app.api.v1.api import api_router
    # Import all models to ensure they are registered with SQLAlchemy
    from app.models.prompt import SysPrompt
    from app.models.bot import Bot
    from app.models.chat import ChatRoom, Message
    from app.models.canvas import ConsensusCanvas
    from app.models.llm import LLMConfig
    from app.models.workspace import Workspace
    from app.models.runtime import RuntimeTask, RuntimeEvent
    from app.models.search_engine import SearchEngineConfig

@asynccontextmanager
async def lifespan(app: FastAPI):
    app_logger.info("Starting IdeaRound API...")
    # Create tables on startup (for development convenience)
    async with engine.begin() as conn:
        # await conn.run_sync(Base.metadata.drop_all) # Uncomment to reset DB
        await conn.run_sync(Base.metadata.create_all)
        # 自动迁移：为已有表添加缺失的列
        import sqlalchemy as sa
        from sqlalchemy import inspect as sa_inspect, text as sa_text
        def _auto_migrate(connection):
            insp = sa_inspect(connection)
            if 'llm_configs' in insp.get_table_names():
                cols = [c['name'] for c in insp.get_columns('llm_configs')]
                if 'enable_thinking' not in cols:
                    connection.execute(sa_text(
                        "ALTER TABLE llm_configs ADD COLUMN enable_thinking TINYINT(1) DEFAULT 0"
                    ))
        await conn.run_sync(_auto_migrate)
    app_logger.info("Database tables initialized")
    yield
    app_logger.info("Shutting down IdeaRound API...")
    # Cleanup if needed

app = FastAPI(
    title="IdeaRound API",
    description="Backend for IdeaRound: Cognitive Enhancement & Multi-Agent Decision Support System",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS - 支持环境变量配置
cors_origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True if cors_origins != ["*"] else False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 添加自定义中间件 (顺序重要: 最后添加的先执行)
app.add_middleware(ExceptionHandlerMiddleware)
app.add_middleware(LoggingMiddleware)
app.add_middleware(RequestIDMiddleware)

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"message": "Welcome to IdeaRound API"}
