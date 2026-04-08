"""应用配置中心。"""

# Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
from pydantic_settings import BaseSettings
from typing import List
from dotenv import load_dotenv

# 加载 .env 文件
load_dotenv()

class Settings(BaseSettings):
    # 基础配置
    DATABASE_URL: str = "sqlite+aiosqlite:///./idearound.db"
    SERVER_HOST: str = "0.0.0.0"
    SERVER_PORT: int = 15001
    SERVER_RELOAD: bool = True
    PROMPT_BASE_PATH: str = "configs/prompts"
    
    # 日志配置
    LOG_LEVEL: str = "INFO"
    
    # CORS 配置
    CORS_ORIGINS: str = "*"  # 逗号分隔的域名列表
    
    # 数据库连接池配置
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_RECYCLE: int = 1800

    # Redis 配置
    REDIS_HOST: str = ""
    REDIS_PORT: int = 6379
    REDIS_PASSWORD: str = ""
    REDIS_DB: int = 0
    REDIS_SSL: bool = False
    
    # 认证配置
    AUTH_ENABLED: bool = True  # 是否启用登录认证
    JWT_SECRET_KEY: str = "your-secret-key-change-this-in-production"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    
    # 初始管理员配置
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "admin@example.com"
    ADMIN_PASSWORD: str = "admin123"  # 首次启动后应修改

    class Config:
        env_file = ".env"
        case_sensitive = False
        extra = "ignore"
        
    @property
    def cors_origins_list(self) -> List[str]:
        """获取 CORS 域名列表"""
        if self.CORS_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",")]

    @property
    def redis_enabled(self) -> bool:
        """判断是否启用 Redis 配置。"""
        return bool(self.REDIS_HOST.strip())

settings = Settings()
