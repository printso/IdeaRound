"""
用户管理 API 接口
- 用户列表（分页）
- 创建用户
- 更新用户
- 删除用户
- 重置密码
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import List, Optional

try:
    from backend.app.core.database import get_db
    from backend.app.core.security import get_password_hash
    from backend.app.core.auth import get_current_user
    from backend.app.models.user import User, Role
    from backend.app.schemas.user import (
        UserResponse,
        UserCreate,
        UserUpdateAdmin,
        UserListResponse,
        AdminChangePassword,
    )
except ImportError:
    from app.core.database import get_db
    from app.core.security import get_password_hash
    from app.core.auth import get_current_user
    from app.models.user import User, Role
    from app.schemas.user import (
        UserResponse,
        UserCreate,
        UserUpdateAdmin,
        UserListResponse,
        AdminChangePassword,
    )

router = APIRouter()


@router.get("/", response_model=UserListResponse, summary="获取用户列表")
async def read_users(
    skip: int = Query(0, ge=0, description="跳过记录数"),
    limit: int = Query(20, ge=1, le=100, description="每页记录数"),
    keyword: Optional[str] = Query(None, description="搜索关键词(用户名/邮箱/昵称)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取用户列表（分页），支持关键词搜索
    - 管理员：可以看到所有用户
    - 普通用户：只能看到自己
    """
    # 非管理员只能看到自己
    if not current_user.is_superuser:
        return UserListResponse(total=1, users=[current_user])

    # 管理员可以看到所有用户
    query = select(User).order_by(User.created_at.desc())
    count_query = select(func.count(User.id))

    # 添加搜索条件
    if keyword:
        search_pattern = f"%{keyword}%"
        search_condition = or_(
            User.username.ilike(search_pattern),
            User.email.ilike(search_pattern),
            User.nickname.ilike(search_pattern),
        )
        query = query.where(search_condition)
        count_query = count_query.where(search_condition)

    # 获取总数
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # 分页查询
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    users = result.scalars().all()

    return UserListResponse(total=total, users=users)


@router.get("/me", response_model=UserResponse, summary="获取当前用户信息")
async def read_current_user(
    current_user: User = Depends(get_current_user),
):
    """
    获取当前登录用户的信息
    """
    return current_user


@router.get("/{user_id}", response_model=UserResponse, summary="获取用户详情")
async def read_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    获取指定用户详情
    - 管理员：可以查看任何用户
    - 普通用户：只能查看自己
    """
    # 非管理员只能查看自己
    if not current_user.is_superuser and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="没有权限查看其他用户",
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    return user


@router.post("/", response_model=UserResponse, summary="创建用户")
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    管理员创建新用户
    """
    # 检查是否为管理员
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有管理员才能创建用户",
        )

    # 检查用户名是否已存在
    result = await db.execute(
        select(User).where(
            (User.username == user_data.username) | (User.email == user_data.email)
        )
    )
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名或邮箱已被使用",
        )

    # 创建用户
    user = User(
        username=user_data.username,
        email=user_data.email,
        nickname=user_data.nickname,
        password_hash=get_password_hash(user_data.password),
        is_active=True,
        is_superuser=False,
    )

    db.add(user)
    await db.commit()
    await db.refresh(user)

    return user


@router.put("/{user_id}", response_model=UserResponse, summary="更新用户")
async def update_user(
    user_id: int,
    user_data: UserUpdateAdmin,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    管理员更新用户信息
    """
    # 检查是否为管理员
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有管理员才能更新用户",
        )

    # 获取要更新的用户
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 如果要修改用户名或邮箱，检查是否冲突
    update_data = user_data.model_dump(exclude_unset=True)
    if 'username' in update_data or 'email' in update_data:
        check_query = select(User).where(User.id != user_id)
        if 'username' in update_data:
            check_query = check_query.where(User.username == update_data['username'])
        if 'email' in update_data:
            check_query = check_query.where(User.email == update_data['email'])
        check_result = await db.execute(check_query)
        if check_result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="用户名或邮箱已被使用",
            )

    # 更新字段
    for key, value in update_data.items():
        if key == 'role_ids':
            # 处理角色分配
            if value is not None:
                role_query = select(Role).where(Role.id.in_(value))
                role_result = await db.execute(role_query)
                roles = role_result.scalars().all()
                user.roles = list(roles)
        else:
            setattr(user, key, value)

    await db.commit()
    await db.refresh(user)

    return user


@router.delete("/{user_id}", summary="删除用户")
async def delete_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    删除用户
    """
    # 检查是否为管理员
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有管理员才能删除用户",
        )

    # 不能删除自己
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能删除自己的账户",
        )

    # 获取要删除的用户
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    await db.delete(user)
    await db.commit()

    return {"message": "用户删除成功"}


@router.put("/{user_id}/password", summary="重置用户密码")
async def reset_user_password(
    user_id: int,
    password_data: AdminChangePassword,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    管理员重置用户密码
    """
    # 检查是否为管理员
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只有管理员才能重置密码",
        )

    # 获取要重置密码的用户
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 更新密码
    user.password_hash = get_password_hash(password_data.new_password)
    await db.commit()

    return {"message": "密码重置成功"}
