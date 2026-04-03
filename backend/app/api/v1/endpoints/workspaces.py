from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List, Optional

try:
    from backend.app.core.database import get_db
    from backend.app.core.auth import get_current_user
    from backend.app.models.workspace import Workspace as DBWorkspace
    from backend.app.models.user import User
    from backend.app.schemas.workspace import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse
except ImportError:
    from app.core.database import get_db
    from app.core.auth import get_current_user
    from app.models.workspace import Workspace as DBWorkspace
    from app.models.user import User
    from app.schemas.workspace import WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse

router = APIRouter()


@router.post("/", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    workspace: WorkspaceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """创建新的工作台（圆桌空间）"""
    try:
        # 检查 room_id 是否已存在
        result = await db.execute(
            select(DBWorkspace).where(
                DBWorkspace.room_id == workspace.room_id,
                DBWorkspace.user_id == current_user.id
            )
        )
        existing = result.scalars().first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该圆桌空间已存在"
            )

        # 创建新的工作台
        from datetime import datetime
        db_workspace = DBWorkspace(
            user_id=current_user.id,
            room_id=workspace.room_id,
            data=workspace.data.model_dump(),
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        db.add(db_workspace)
        await db.commit()
        await db.refresh(db_workspace)

        return db_workspace
    except HTTPException:
        # 重新抛出 HTTPException
        raise
    except Exception as e:
        # 记录错误并返回 500 错误
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"创建工作台失败: {str(e)}"
        )


@router.get("/", response_model=List[WorkspaceResponse])
async def list_workspaces(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取当前用户的所有工作台"""
    result = await db.execute(
        select(DBWorkspace)
        .where(DBWorkspace.user_id == current_user.id)
        .order_by(DBWorkspace.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    workspaces = result.scalars().all()
    return workspaces


@router.get("/{room_id}", response_model=WorkspaceResponse)
async def get_workspace(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """获取指定的工作台"""
    result = await db.execute(
        select(DBWorkspace).where(
            DBWorkspace.room_id == room_id,
            DBWorkspace.user_id == current_user.id
        )
    )
    workspace = result.scalars().first()
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="工作台不存在"
        )
    return workspace


@router.put("/{room_id}", response_model=WorkspaceResponse)
async def update_workspace(
    room_id: str,
    workspace_update: WorkspaceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """更新工作台数据"""
    result = await db.execute(
        select(DBWorkspace).where(
            DBWorkspace.room_id == room_id,
            DBWorkspace.user_id == current_user.id
        )
    )
    workspace = result.scalars().first()
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="工作台不存在"
        )

    # 更新数据
    workspace.data = workspace_update.data.model_dump()
    await db.commit()
    await db.refresh(workspace)

    return workspace


@router.delete("/{room_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    room_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """删除工作台"""
    result = await db.execute(
        select(DBWorkspace).where(
            DBWorkspace.room_id == room_id,
            DBWorkspace.user_id == current_user.id
        )
    )
    workspace = result.scalars().first()
    if not workspace:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="工作台不存在"
        )

    await db.delete(workspace)
    await db.commit()

    return None
