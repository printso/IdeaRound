"""认证领域服务。"""

# Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.core.config import settings
    from backend.app.core.security import (
        create_access_token,
        create_refresh_token,
        get_password_hash,
        verify_password,
        verify_token,
    )
    from backend.app.models.user import Role, User
    from backend.app.schemas.user import (
        ChangePassword,
        LoginRequest,
        RefreshTokenRequest,
        RegisterRequest,
        Token,
    )
except ImportError:
    from app.core.config import settings
    from app.core.security import (
        create_access_token,
        create_refresh_token,
        get_password_hash,
        verify_password,
        verify_token,
    )
    from app.models.user import Role, User
    from app.schemas.user import (
        ChangePassword,
        LoginRequest,
        RefreshTokenRequest,
        RegisterRequest,
        Token,
    )


def _build_disabled_auth_tokens() -> Token:
    """在关闭认证模式下返回兼容的虚拟令牌。"""
    return Token(
        access_token=create_access_token("0"),
        refresh_token=create_refresh_token("0"),
        token_type="bearer",
    )


async def _get_user_by_login_identifier(db: AsyncSession, identifier: str) -> User | None:
    """按用户名或邮箱查询用户。

    时间复杂度 O(1)，实际取决于数据库索引。
    """
    result = await db.execute(
        select(User).where(
            or_(User.username == identifier, User.email == identifier)
        )
    )
    return result.scalar_one_or_none()


async def authenticate_user(
    login_data: LoginRequest,
    db: AsyncSession,
) -> Token:
    """校验凭据并生成访问令牌。"""
    if not settings.AUTH_ENABLED:
        return _build_disabled_auth_tokens()

    user = await _get_user_by_login_identifier(db, login_data.username)
    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用",
        )

    user.last_login = datetime.utcnow()
    await db.commit()

    return Token(
        access_token=create_access_token(subject=user.id),
        refresh_token=create_refresh_token(subject=user.id),
        token_type="bearer",
    )


async def register_user(
    register_data: RegisterRequest,
    db: AsyncSession,
) -> User:
    """注册新用户并分配默认角色。"""
    if not settings.AUTH_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="注册功能已禁用",
        )

    existing_user = await _get_user_by_login_identifier(db, register_data.username)
    if existing_user is None:
        existing_user = await _get_user_by_login_identifier(db, register_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名或邮箱已被注册",
        )

    user = User(
        username=register_data.username,
        email=register_data.email,
        nickname=register_data.nickname,
        password_hash=get_password_hash(register_data.password),
        is_active=True,
        is_superuser=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    default_role_result = await db.execute(select(Role).where(Role.name == "user"))
    default_role = default_role_result.scalar_one_or_none()
    if default_role:
        user.roles.append(default_role)
        await db.commit()
        await db.refresh(user)

    return user


async def refresh_user_token_pair(
    refresh_data: RefreshTokenRequest,
    db: AsyncSession,
) -> Token:
    """基于刷新令牌签发新令牌。"""
    if not settings.AUTH_ENABLED:
        return _build_disabled_auth_tokens()

    user_id = verify_token(refresh_data.refresh_token, token_type="refresh")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="刷新令牌无效或已过期",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已被禁用",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return Token(
        access_token=create_access_token(subject=user.id),
        refresh_token=create_refresh_token(subject=user.id),
        token_type="bearer",
    )


async def update_user_password(
    password_data: ChangePassword,
    current_user: User,
    db: AsyncSession,
) -> None:
    """修改当前用户密码。"""
    if not settings.AUTH_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="密码修改功能已禁用",
        )

    if not verify_password(password_data.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="原密码错误",
        )

    current_user.password_hash = get_password_hash(password_data.new_password)
    await db.commit()
