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
from sqlalchemy import select
from datetime import datetime, timedelta

try:
    from backend.app.core.database import get_db
    from backend.app.core.security import (
        verify_password,
        get_password_hash,
        create_access_token,
        create_refresh_token,
        verify_token,
    )
    from backend.app.core.config import settings
    from backend.app.core.auth import get_current_user
    from backend.app.models.user import User, Role
    from backend.app.schemas.user import (
        LoginRequest,
        RegisterRequest,
        Token,
        UserResponse,
        ChangePassword,
        RefreshTokenRequest,
    )
except ImportError:
    from app.core.database import get_db
    from app.core.security import (
        verify_password,
        get_password_hash,
        create_access_token,
        create_refresh_token,
        verify_token,
    )
    from app.core.config import settings
    from app.core.auth import get_current_user
    from app.models.user import User, Role
    from app.schemas.user import (
        LoginRequest,
        RegisterRequest,
        Token,
        UserResponse,
        ChangePassword,
        RefreshTokenRequest,
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
    # 如果未启用认证，返回一个虚拟 token
    if not settings.AUTH_ENABLED:
        return Token(
            access_token=create_access_token("0"),
            refresh_token=create_refresh_token("0"),
            token_type="bearer",
        )
    
    # 查询用户（支持用户名或邮箱登录）
    query = select(User).where(
        (User.username == login_data.username) | 
        (User.email == login_data.username)
    )
    result = await db.execute(query)
    user = result.scalar_one_or_none()
    
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
    
    # 更新最后登录时间
    user.last_login = datetime.utcnow()
    await db.commit()
    
    # 生成 Token
    access_token = create_access_token(subject=user.id)
    refresh_token = create_refresh_token(subject=user.id)
    
    return Token(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
    )


@router.post("/register", response_model=UserResponse, summary="用户注册")
async def register(
    register_data: RegisterRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    新用户注册
    """
    if not settings.AUTH_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="注册功能已禁用",
        )
    
    # 检查用户名是否已存在
    query = select(User).where(
        (User.username == register_data.username) | 
        (User.email == register_data.email)
    )
    result = await db.execute(query)
    existing_user = result.scalar_one_or_none()
    
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名或邮箱已被注册",
        )
    
    # 创建用户
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
    
    # 分配默认角色（user）
    default_role_query = select(Role).where(Role.name == "user")
    default_role_result = await db.execute(default_role_query)
    default_role = default_role_result.scalar_one_or_none()
    
    if default_role:
        user.roles.append(default_role)
        await db.commit()
    
    return user


@router.post("/refresh", response_model=Token, summary="刷新令牌")
async def refresh_token(
    refresh_data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    使用刷新令牌获取新的访问令牌
    """
    if not settings.AUTH_ENABLED:
        return Token(
            access_token=create_access_token("0"),
            refresh_token=create_refresh_token("0"),
            token_type="bearer",
        )
    
    user_id = verify_token(refresh_data.refresh_token, token_type="refresh")
    
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="刷新令牌无效或已过期",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 验证用户是否存在且活跃
    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在或已被禁用",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 生成新的 Token
    new_access_token = create_access_token(subject=user.id)
    new_refresh_token = create_refresh_token(subject=user.id)
    
    return Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
    )


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
    if not settings.AUTH_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="密码修改功能已禁用",
        )
    
    # 验证旧密码
    if not verify_password(password_data.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="原密码错误",
        )
    
    # 更新密码
    current_user.password_hash = get_password_hash(password_data.new_password)
    await db.commit()
    
    return {"message": "密码修改成功"}
