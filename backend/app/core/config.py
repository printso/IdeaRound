import os
import yaml
from pydantic_settings import BaseSettings
from typing import Dict, Any

class Settings(BaseSettings):
    DATABASE_URL: str
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 8000
    SERVER_RELOAD: bool = True
    PROMPT_BASE_PATH: str = "configs/prompts"

    class Config:
        env_file = ".env"

def load_config() -> Settings:
    config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))), "configs", "config.yaml")
    
    if not os.path.exists(config_path):
        # Fallback or error if config file is missing
        print(f"Config file not found at {config_path}")
        return Settings(DATABASE_URL="sqlite+aiosqlite:///./test.db") # Default fallback

    with open(config_path, "r", encoding="utf-8") as f:
        config_data = yaml.safe_load(f)

    db_url = config_data.get("database", {}).get("url", "sqlite+aiosqlite:///./test.db")
    
    return Settings(
        DATABASE_URL=db_url,
        SERVER_HOST=config_data.get("server", {}).get("host", "0.0.0.0"),
        SERVER_PORT=config_data.get("server", {}).get("port", 8000),
        SERVER_RELOAD=config_data.get("server", {}).get("reload", True),
        PROMPT_BASE_PATH=config_data.get("prompts", {}).get("base_path", "configs/prompts")
    )

settings = load_config()
