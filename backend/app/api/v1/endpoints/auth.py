"""
认证相关 API 接口
- 用户登录
- 用户注册
- 刷新 Token
- 用户登出
- 获取当前用户信息
- 修改密码
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
try:
    from backend.app.core.database import get_db
    from backend.app.core.auth import get_current_user
    from backend.app.models.user import User
    from backend.app.schemas.user import (
        LoginRequest,
        RegisterRequest,
        Token,
        UserResponse,
        ChangePassword,
        RefreshTokenRequest,
    )
    from backend.app.services.auth_service import (
        authenticate_user,
        refresh_user_token_pair,
        register_user,
        update_user_password,
    )
except ImportError:
    from app.core.database import get_db
    from app.core.auth import get_current_user
    from app.models.user import User
    from app.schemas.user import (
        LoginRequest,
        RegisterRequest,
        Token,
        UserResponse,
        ChangePassword,
        RefreshTokenRequest,
    )
    from app.services.auth_service import (
        authenticate_user,
        refresh_user_token_pair,
        register_user,
        update_user_password,
    )

router = APIRouter()


@router.post("/login", response_model=Token, summary="用户登录")
async def login(
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    用户登录，返回访问令牌和刷新令牌
    """
    return await authenticate_user(login_data, db)


@router.post("/register", response_model=UserResponse, summary="用户注册")
async def register(
    register_data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    新用户注册
    """
    return await register_user(register_data, db)


@router.post("/refresh", response_model=Token, summary="刷新令牌")
async def refresh_token(
    refresh_data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    使用刷新令牌获取新的访问令牌
    """
    return await refresh_user_token_pair(refresh_data, db)


@router.post("/logout", summary="用户登出")
async def logout(
    current_user: User = Depends(get_current_user),
):
    """
    用户登出（客户端删除 token 即可，服务端可以记录黑名单）
    """
    # TODO: 可以将当前 token 加入黑名单
    return {"message": "登出成功"}


@router.get("/me", response_model=UserResponse, summary="获取当前用户信息")
async def get_current_user_info(
    current_user: User = Depends(get_current_user),
):
    """
    获取当前登录用户的信息
    """
    return current_user


@router.put("/password", summary="修改密码")
async def change_password(
    password_data: ChangePassword,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    修改当前用户的密码
    """
    await update_user_password(password_data, current_user, db)
    return {"message": "密码修改成功"}
