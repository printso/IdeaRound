"""
安全认证工具模块
- JWT Token 生成和验证
- 密码加密和验证
"""
from datetime import datetime, timedelta
from typing import Optional, Any, Union
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import ValidationError

try:
    from backend.app.core.config import settings
except ImportError:
    from app.core.config import settings

# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT 算法
ALGORITHM = "HS256"


def create_access_token(
    subject: Union[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    创建访问令牌
    
    Args:
        subject: 主题（通常是用户 ID）
        expires_delta: 过期时间增量，默认使用配置中的 ACCESS_TOKEN_EXPIRE_MINUTES
    
    Returns:
        JWT access token
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES
        )
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "access"
    }
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=ALGORITHM
    )
    return encoded_jwt


def create_refresh_token(
    subject: Union[str, Any],
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    创建刷新令牌
    
    Args:
        subject: 主题（通常是用户 ID）
        expires_delta: 过期时间增量，默认使用配置中的 REFRESH_TOKEN_EXPIRE_DAYS
    
    Returns:
        JWT refresh token
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(
            days=settings.REFRESH_TOKEN_EXPIRE_DAYS
        )
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "refresh"
    }
    encoded_jwt = jwt.encode(
        to_encode,
        settings.JWT_SECRET_KEY,
        algorithm=ALGORITHM
    )
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """
    解码 JWT Token
    
    Args:
        token: JWT token
    
    Returns:
        解码后的 payload，如果失败则返回 None
    """
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[ALGORITHM]
        )
        return payload
    except (JWTError, ValidationError):
        return None


def verify_token(token: str, token_type: str = "access") -> Optional[str]:
    """
    验证 JWT Token
    
    Args:
        token: JWT token
        token_type: 期望的 token 类型 ("access" 或 "refresh")
    
    Returns:
        用户 ID（字符串），如果验证失败则返回 None
    """
    payload = decode_token(token)
    if payload is None:
        return None
    
    # 检查 token 类型
    if payload.get("type") != token_type:
        return None
    
    # 检查是否过期
    exp = payload.get("exp")
    if exp is None:
        return None
    
    try:
        exp_datetime = datetime.fromtimestamp(exp)
        if exp_datetime < datetime.utcnow():
            return None
    except (ValueError, TypeError):
        return None
    
    return payload.get("sub")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码
    
    Args:
        plain_password: 明文密码
        hashed_password: 哈希后的密码
    
    Returns:
        如果密码匹配返回 True，否则返回 False
    """
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """
    生成密码哈希
    
    Args:
        password: 明文密码
    
    Returns:
        哈希后的密码
    """
    return pwd_context.hash(password)
