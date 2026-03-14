"""
认证依赖项和权限中间件
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

try:
    from backend.app.core.database import get_db
    from backend.app.core.security import verify_token
    from backend.app.models.user import User
    from backend.app.core.config import settings
except ImportError:
    from app.core.database import get_db
    from app.core.security import verify_token
    from app.models.user import User
    from app.core.config import settings

# HTTP Bearer Token 认证
security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    """
    获取当前登录用户
    
    Args:
        credentials: HTTP Bearer Token
        db: 数据库会话
    
    Returns:
        当前用户对象
    
    Raises:
        HTTPException: 认证失败时抛出
    """
    # 如果未启用认证，返回 None 或创建一个默认用户
    if not settings.AUTH_ENABLED:
        # 在未启用认证模式下，可以返回 None 或创建一个匿名用户
        # 这里我们创建一个虚拟用户用于测试
        return User(
            id=0,
            username="anonymous",
            email="anonymous@example.com",
            password_hash="",
            is_active=True,
            is_superuser=False,
        )
    
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="未提供认证令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    token = credentials.credentials
    user_id = verify_token(token, token_type="access")
    
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证令牌或令牌已过期",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 查询用户
    from sqlalchemy import select
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已被禁用",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user


async def get_current_active_superuser(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    获取当前超级管理员用户
    
    Args:
        current_user: 当前用户
    
    Returns:
        超级管理员用户对象
    
    Raises:
        HTTPException: 如果不是超级管理员
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足，需要管理员权限",
        )
    return current_user


def require_permission(permission: str):
    """
    权限检查装饰器
    
    Args:
        permission: 需要的权限字符串
    
    Returns:
        依赖项函数
    """
    async def permission_checker(
        current_user: User = Depends(get_current_user),
    ) -> bool:
        if not settings.AUTH_ENABLED:
            return True
        
        # 超级管理员拥有所有权限
        if current_user.is_superuser:
            return True
        
        # TODO: 实现基于角色的权限检查
        # 目前简化处理，只要登录即可
        return True
    
    return permission_checker
