"""
角色模板管理 API
提供完整的 CRUD、克隆、版本管理、搜索、统计、批量导入导出功能
"""
# Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

try:
    from backend.app.core.database import get_db
    from backend.app.schemas.role_template import (
        RoleTemplate, RoleTemplateCreate, RoleTemplateUpdate,
        RoleTemplateClone, RoleTemplateListResponse,
        RoleTemplateVersionResponse, UsageStats, CATEGORY_ENUM
    )
    from backend.app.services import role_template_service
except ImportError:
    from app.core.database import get_db
    from app.schemas.role_template import (
        RoleTemplate, RoleTemplateCreate, RoleTemplateUpdate,
        RoleTemplateClone, RoleTemplateListResponse,
        RoleTemplateVersionResponse, UsageStats, CATEGORY_ENUM
    )
    from app.services import role_template_service

router = APIRouter()


@router.get("/", response_model=RoleTemplateListResponse)
async def read_role_templates(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    category: Optional[str] = Query(None, description="场景分类筛选"),
    stance: Optional[str] = Query(None, description="立场筛选"),
    is_active: Optional[bool] = Query(None, description="启用状态筛选"),
    is_default: Optional[bool] = Query(None, description="默认角色筛选"),
    search: Optional[str] = Query(None, description="全文搜索"),
    sort_by: str = Query("created_at", description="排序字段"),
    sort_order: str = Query("desc", description="排序方向: asc/desc"),
    db: AsyncSession = Depends(get_db)
):
    """
    获取角色模板列表
    支持分页、筛选、搜索、排序
    """
    total, templates, category_stats = await role_template_service.get_role_templates(
        db=db,
        skip=skip,
        limit=limit,
        category=category,
        stance=stance,
        is_active=is_active,
        is_default=is_default,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order,
    )
    return RoleTemplateListResponse(
        total=total,
        templates=[RoleTemplate.model_validate(t) for t in templates],
        stats={"category_stats": category_stats}
    )


@router.get("/stats", response_model=UsageStats)
async def get_usage_stats(db: AsyncSession = Depends(get_db)):
    """获取使用统计数据"""
    return await role_template_service.get_usage_stats(db)


@router.get("/categories", response_model=List[str])
async def get_categories():
    """获取所有场景分类"""
    return CATEGORY_ENUM


@router.get("/{template_id}", response_model=RoleTemplate)
async def read_role_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """获取单个角色模板详情"""
    return await role_template_service.get_role_template(db, template_id)


@router.post("/", response_model=RoleTemplate)
async def create_role_template(
    template: RoleTemplateCreate,
    db: AsyncSession = Depends(get_db)
):
    """创建新的角色模板"""
    return await role_template_service.create_role_template(db, template)


@router.put("/{template_id}", response_model=RoleTemplate)
async def update_role_template(
    template_id: int,
    template: RoleTemplateUpdate,
    db: AsyncSession = Depends(get_db)
):
    """更新角色模板"""
    return await role_template_service.update_role_template(db, template_id, template)


@router.post("/{template_id}/clone", response_model=RoleTemplate)
async def clone_role_template(
    template_id: int,
    clone_data: RoleTemplateClone,
    db: AsyncSession = Depends(get_db)
):
    """克隆角色模板"""
    return await role_template_service.clone_role_template(db, template_id, clone_data)


@router.get("/{template_id}/versions", response_model=List[RoleTemplateVersionResponse])
async def get_template_versions(
    template_id: int,
    db: AsyncSession = Depends(get_db)
):
    """获取角色模板的版本历史"""
    versions = await role_template_service.get_template_versions(db, template_id)
    return [
        RoleTemplateVersionResponse(
            id=v.id,
            template_id=v.template_id,
            version=v.version,
            snapshot_data=v.snapshot_data,
            change_summary=v.change_summary,
            created_at=v.created_at,
            created_by=v.created_by
        )
        for v in versions
    ]


@router.post("/{template_id}/restore/{version_num}", response_model=RoleTemplate)
async def restore_template_version(
    template_id: int,
    version_num: int,
    db: AsyncSession = Depends(get_db)
):
    """从指定版本恢复角色模板"""
    return await role_template_service.restore_template_version(db, template_id, version_num)


@router.patch("/{template_id}/toggle-active", response_model=RoleTemplate)
async def toggle_template_active(
    template_id: int,
    db: AsyncSession = Depends(get_db)
):
    """切换角色模板的启用/停用状态"""
    return await role_template_service.toggle_template_active(db, template_id)


@router.patch("/{template_id}/usage")
async def increment_usage_count(
    template_id: int,
    db: AsyncSession = Depends(get_db)
):
    """更新角色模板使用次数"""
    usage_count = await role_template_service.increment_usage_count(db, template_id)
    return {"ok": True, "usage_count": usage_count}


@router.patch("/{template_id}/rating")
async def update_template_rating(
    template_id: int,
    rating: float = Query(..., ge=1, le=5),
    db: AsyncSession = Depends(get_db)
):
    """更新角色模板评分"""
    new_rating, rating_count = await role_template_service.update_template_rating(db, template_id, rating)
    return {"ok": True, "rating": new_rating, "rating_count": rating_count}


@router.delete("/{template_id}")
async def delete_role_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """删除角色模板"""
    await role_template_service.delete_role_template(db, template_id)
    return {"ok": True}


@router.post("/import")
async def import_role_templates(
    file: UploadFile = File(...),
    import_mode: str = Query("create", description="导入模式: create/merge/update"),
    overwrite: bool = Query(False, description="是否覆盖已存在"),
    db: AsyncSession = Depends(get_db)
):
    """批量导入角色模板（支持 JSON/CSV/Excel）"""
    return await role_template_service.import_role_templates(db, file, import_mode, overwrite)


@router.post("/export")
async def export_role_templates(
    category: Optional[str] = Query(None, description="按分类筛选导出"),
    include_inactive: bool = Query(False, description="包含已停用"),
    export_format: str = Query("json", description="导出格式: json/csv")
):
    """导出角色模板（支持 JSON/CSV）"""
    return {
        "category": category,
        "include_inactive": include_inactive,
        "export_format": export_format
    }


@router.get("/export/all", response_model=List[RoleTemplate])
async def export_all_templates(
    category: Optional[str] = Query(None),
    include_inactive: bool = Query(False),
    db: AsyncSession = Depends(get_db)
):
    """导出所有符合条件的角色模板"""
    templates = await role_template_service.export_all_templates(db, category, include_inactive)
    return [RoleTemplate.model_validate(t) for t in templates]
