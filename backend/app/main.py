from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from backend.app.core.config import settings
from backend.app.core.database import engine, Base
from backend.app.api.v1.api import api_router

# Import all models to ensure they are registered with SQLAlchemy
from backend.app.models.prompt import SysPrompt
from backend.app.models.bot import Bot
from backend.app.models.chat import ChatRoom, Message
from backend.app.models.canvas import ConsensusCanvas
from backend.app.models.llm import LLMConfig

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (for development convenience)
    async with engine.begin() as conn:
        # await conn.run_sync(Base.metadata.drop_all) # Uncomment to reset DB
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Cleanup if needed

app = FastAPI(
    title="IdeaRound API",
    description="Backend for IdeaRound: Cognitive Enhancement & Multi-Agent Decision Support System",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Should be restrictive in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")

@app.get("/")
async def root():
    return {"message": "Welcome to IdeaRound API"}
