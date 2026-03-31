"""
角色模板管理 API
提供完整的 CRUD、克隆、版本管理、搜索、统计、批量导入导出功能
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc
from sqlalchemy.orm import selectinload
from typing import List, Optional
import json
import csv
import io
from datetime import datetime

try:
    from backend.app.core.database import get_db
    from backend.app.models.role_template import RoleTemplate as RoleTemplateModel, RoleTemplateVersion
    from backend.app.schemas.role_template import (
        RoleTemplate, RoleTemplateCreate, RoleTemplateUpdate,
        RoleTemplateClone, RoleTemplateListResponse,
        RoleTemplateVersionResponse, RoleTemplateImportData,
        RoleTemplateExportData, UsageStats, CATEGORY_ENUM
    )
except ImportError:
    from app.core.database import get_db
    from app.models.role_template import RoleTemplate as RoleTemplateModel, RoleTemplateVersion
    from app.schemas.role_template import (
        RoleTemplate, RoleTemplateCreate, RoleTemplateUpdate,
        RoleTemplateClone, RoleTemplateListResponse,
        RoleTemplateVersionResponse, RoleTemplateImportData,
        RoleTemplateExportData, UsageStats, CATEGORY_ENUM
    )

router = APIRouter()


def parse_dialogue_examples(data) -> List[dict]:
    """解析对话示例"""
    if isinstance(data, str):
        try:
            return json.loads(data)
        except:
            return []
    return data or []


def parse_skill_tags(data) -> List[str]:
    """解析技能标签"""
    if isinstance(data, str):
        try:
            return json.loads(data)
        except:
            if data:
                return [t.strip() for t in data.split(',') if t.strip()]
            return []
    return data or []


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
    query = select(RoleTemplateModel)
    
    # 应用筛选条件
    filters = []
    if category:
        filters.append(RoleTemplateModel.category == category)
    if stance:
        filters.append(RoleTemplateModel.stance == stance)
    if is_active is not None:
        filters.append(RoleTemplateModel.is_active == is_active)
    if is_default is not None:
        filters.append(RoleTemplateModel.is_default == is_default)
    
    # 全文搜索
    if search:
        search_pattern = f"%{search}%"
        filters.append(
            or_(
                RoleTemplateModel.name.ilike(search_pattern),
                RoleTemplateModel.description.ilike(search_pattern),
                RoleTemplateModel.background.ilike(search_pattern),
                RoleTemplateModel.personality.ilike(search_pattern),
                RoleTemplateModel.value_proposition.ilike(search_pattern),
            )
        )
    
    if filters:
        query = query.where(and_(*filters))
    
    # 排序
    sort_column = getattr(RoleTemplateModel, sort_by, RoleTemplateModel.created_at)
    if sort_order == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(sort_column)
    
    # 获取总数
    count_query = select(func.count()).select_from(RoleTemplateModel)
    if filters:
        count_query = count_query.where(and_(*filters))
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 分页
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    templates = result.scalars().all()
    
    # 统计各分类数量
    stats_query = select(
        RoleTemplateModel.category,
        func.count(RoleTemplateModel.id).label('count')
    ).group_by(RoleTemplateModel.category)
    stats_result = await db.execute(stats_query)
    category_stats = {row.category: row.count for row in stats_result.all()}
    
    return RoleTemplateListResponse(
        total=total,
        templates=[RoleTemplate.model_validate(t) for t in templates],
        stats={"category_stats": category_stats}
    )


@router.get("/stats", response_model=UsageStats)
async def get_usage_stats(db: AsyncSession = Depends(get_db)):
    """获取使用统计数据"""
    # 基础统计
    total_result = await db.execute(select(func.count()).select_from(RoleTemplateModel))
    total = total_result.scalar()
    
    active_result = await db.execute(
        select(func.count()).select_from(RoleTemplateModel).where(RoleTemplateModel.is_active == True)
    )
    active = active_result.scalar()
    
    inactive_result = await db.execute(
        select(func.count()).select_from(RoleTemplateModel).where(RoleTemplateModel.is_active == False)
    )
    inactive = inactive_result.scalar()
    
    # 分类统计
    category_result = await db.execute(
        select(RoleTemplateModel.category, func.count(RoleTemplateModel.id))
        .group_by(RoleTemplateModel.category)
    )
    category_stats = {row[0]: row[1] for row in category_result.all()}
    
    # 使用最多的模板
    top_used_query = select(RoleTemplateModel).order_by(desc(RoleTemplateModel.usage_count)).limit(5)
    top_used_result = await db.execute(top_used_query)
    top_used = [RoleTemplate.model_validate(t) for t in top_used_result.scalars().all()]
    
    # 最近使用的模板
    recent_query = select(RoleTemplateModel).order_by(desc(RoleTemplateModel.last_used_at)).limit(5)
    recent_result = await db.execute(recent_query)
    recent = [RoleTemplate.model_validate(t) for t in recent_result.scalars().all() if t.last_used_at]
    
    return UsageStats(
        total_templates=total,
        active_templates=active,
        inactive_templates=inactive,
        category_stats=category_stats,
        top_used=top_used,
        recent_used=recent
    )


@router.get("/categories", response_model=List[str])
async def get_categories():
    """获取所有场景分类"""
    return CATEGORY_ENUM


@router.get("/{template_id}", response_model=RoleTemplate)
async def read_role_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """获取单个角色模板详情"""
    result = await db.execute(
        select(RoleTemplateModel).where(RoleTemplateModel.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="角色模板不存在")
    return template


@router.post("/", response_model=RoleTemplate)
async def create_role_template(
    template: RoleTemplateCreate,
    db: AsyncSession = Depends(get_db)
):
    """创建新的角色模板"""
    db_template = RoleTemplateModel(
        **template.model_dump(exclude={'dialogue_examples', 'skill_tags'}),
        dialogue_examples=parse_dialogue_examples(template.dialogue_examples),
        skill_tags=parse_skill_tags(template.skill_tags),
        version=1
    )
    db.add(db_template)
    await db.commit()
    await db.refresh(db_template)
    
    # 创建初始版本记录
    version_record = RoleTemplateVersion(
        template_id=db_template.id,
        version=1,
        snapshot_data=db_template.__dict__.copy(),
        change_summary="初始版本"
    )
    db.add(version_record)
    await db.commit()
    
    return db_template


@router.put("/{template_id}", response_model=RoleTemplate)
async def update_role_template(
    template_id: int,
    template: RoleTemplateUpdate,
    db: AsyncSession = Depends(get_db)
):
    """更新角色模板"""
    result = await db.execute(
        select(RoleTemplateModel).where(RoleTemplateModel.id == template_id)
    )
    db_template = result.scalar_one_or_none()
    if not db_template:
        raise HTTPException(status_code=404, detail="角色模板不存在")
    
    update_data = template.model_dump(exclude_unset=True)
    
    # 处理嵌套字段
    if 'dialogue_examples' in update_data:
        update_data['dialogue_examples'] = parse_dialogue_examples(update_data['dialogue_examples'])
    if 'skill_tags' in update_data:
        update_data['skill_tags'] = parse_skill_tags(update_data['skill_tags'])
    
    # 版本更新
    version_note = update_data.pop('version_note', None)
    db_template.version += 1
    
    # 保存旧版本快照
    version_record = RoleTemplateVersion(
        template_id=db_template.id,
        version=db_template.version,
        snapshot_data={k: v for k, v in db_template.__dict__.items() 
                       if not k.startswith('_') and k not in ['version', 'updated_at']},
        change_summary=version_note or "版本更新"
    )
    db.add(version_record)
    
    # 更新字段
    for key, value in update_data.items():
        setattr(db_template, key, value)
    
    await db.commit()
    await db.refresh(db_template)
    return db_template


@router.post("/{template_id}/clone", response_model=RoleTemplate)
async def clone_role_template(
    template_id: int,
    clone_data: RoleTemplateClone,
    db: AsyncSession = Depends(get_db)
):
    """克隆角色模板"""
    result = await db.execute(
        select(RoleTemplateModel).where(RoleTemplateModel.id == template_id)
    )
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="原始角色模板不存在")
    
    # 创建克隆版本
    db_template = RoleTemplateModel(
        name=clone_data.name,
        stance=original.stance,
        category=clone_data.category or original.category,
        description=original.description,
        personality=original.personality,
        background=original.background,
        skill_tags=original.skill_tags,
        dialogue_examples=original.dialogue_examples,
        value_proposition=original.value_proposition,
        soul_prompt_id=original.soul_prompt_id,
        style_prompt_id=original.style_prompt_id,
        soul_config=original.soul_config,
        is_default=False,
        is_active=original.is_active,
        parent_id=template_id,
        version=1,
        author=original.author,
        copyright_notice=original.copyright_notice,
        license_type=original.license_type,
    )
    db.add(db_template)
    await db.commit()
    await db.refresh(db_template)
    
    # 记录版本
    version_record = RoleTemplateVersion(
        template_id=db_template.id,
        version=1,
        snapshot_data={k: v for k, v in db_template.__dict__.items() 
                       if not k.startswith('_')},
        change_summary=f"从模板 #{template_id} 克隆"
    )
    db.add(version_record)
    await db.commit()
    
    return db_template


@router.get("/{template_id}/versions", response_model=List[RoleTemplateVersionResponse])
async def get_template_versions(
    template_id: int,
    db: AsyncSession = Depends(get_db)
):
    """获取角色模板的版本历史"""
    # 检查模板是否存在
    template_result = await db.execute(
        select(RoleTemplateModel).where(RoleTemplateModel.id == template_id)
    )
    if not template_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="角色模板不存在")
    
    result = await db.execute(
        select(RoleTemplateVersion)
        .where(RoleTemplateVersion.template_id == template_id)
        .order_by(desc(RoleTemplateVersion.version))
    )
    versions = result.scalars().all()
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
    # 获取版本快照
    version_result = await db.execute(
        select(RoleTemplateVersion).where(
            and_(
                RoleTemplateVersion.template_id == template_id,
                RoleTemplateVersion.version == version_num
            )
        )
    )
    version_record = version_result.scalar_one_or_none()
    if not version_record:
        raise HTTPException(status_code=404, detail="指定的版本不存在")
    
    # 获取当前模板
    template_result = await db.execute(
        select(RoleTemplateModel).where(RoleTemplateModel.id == template_id)
    )
    db_template = template_result.scalar_one_or_none()
    if not db_template:
        raise HTTPException(status_code=404, detail="角色模板不存在")
    
    # 保存当前版本
    current_version = RoleTemplateVersion(
        template_id=db_template.id,
        version=db_template.version + 1,
        snapshot_data={k: v for k, v in db_template.__dict__.items() 
                       if not k.startswith('_')},
        change_summary=f"恢复到版本 {version_num} 前"
    )
    db.add(current_version)
    
    # 恢复数据
    snapshot = version_record.snapshot_data
    for key in ['name', 'stance', 'category', 'description', 'personality', 
                'background', 'skill_tags', 'dialogue_examples', 'value_proposition',
                'soul_prompt_id', 'style_prompt_id', 'soul_config', 'is_active']:
        if key in snapshot:
            setattr(db_template, key, snapshot[key])
    
    db_template.version += 1
    await db.commit()
    await db.refresh(db_template)
    return db_template


@router.patch("/{template_id}/toggle-active", response_model=RoleTemplate)
async def toggle_template_active(
    template_id: int,
    db: AsyncSession = Depends(get_db)
):
    """切换角色模板的启用/停用状态"""
    result = await db.execute(
        select(RoleTemplateModel).where(RoleTemplateModel.id == template_id)
    )
    db_template = result.scalar_one_or_none()
    if not db_template:
        raise HTTPException(status_code=404, detail="角色模板不存在")
    
    db_template.is_active = not db_template.is_active
    await db.commit()
    await db.refresh(db_template)
    return db_template


@router.patch("/{template_id}/usage")
async def increment_usage_count(
    template_id: int,
    db: AsyncSession = Depends(get_db)
):
    """更新角色模板使用次数"""
    result = await db.execute(
        select(RoleTemplateModel).where(RoleTemplateModel.id == template_id)
    )
    db_template = result.scalar_one_or_none()
    if not db_template:
        raise HTTPException(status_code=404, detail="角色模板不存在")
    
    db_template.usage_count += 1
    db_template.last_used_at = datetime.utcnow()
    await db.commit()
    return {"ok": True, "usage_count": db_template.usage_count}


@router.patch("/{template_id}/rating")
async def update_template_rating(
    template_id: int,
    rating: float = Query(..., ge=1, le=5),
    db: AsyncSession = Depends(get_db)
):
    """更新角色模板评分"""
    result = await db.execute(
        select(RoleTemplateModel).where(RoleTemplateModel.id == template_id)
    )
    db_template = result.scalar_one_or_none()
    if not db_template:
        raise HTTPException(status_code=404, detail="角色模板不存在")
    
    # 计算新的平均评分
    total_score = db_template.rating * db_template.rating_count + rating
    db_template.rating_count += 1
    db_template.rating = round(total_score / db_template.rating_count, 1)
    
    await db.commit()
    await db.refresh(db_template)
    return {"ok": True, "rating": db_template.rating, "rating_count": db_template.rating_count}


@router.delete("/{template_id}")
async def delete_role_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """删除角色模板"""
    result = await db.execute(
        select(RoleTemplateModel).where(RoleTemplateModel.id == template_id)
    )
    db_template = result.scalar_one_or_none()
    if not db_template:
        raise HTTPException(status_code=404, detail="角色模板不存在")
    
    if db_template.is_default:
        raise HTTPException(status_code=400, detail="不能删除默认角色模板")
    
    # 删除关联的版本记录
    await db.execute(
        RoleTemplateVersion.__table__.delete()
        .where(RoleTemplateVersion.template_id == template_id)
    )
    
    await db.delete(db_template)
    await db.commit()
    return {"ok": True}


@router.post("/import")
async def import_role_templates(
    file: UploadFile = File(...),
    import_mode: str = Query("create", description="导入模式: create/merge/update"),
    overwrite: bool = Query(False, description="是否覆盖已存在"),
    db: AsyncSession = Depends(get_db)
):
    """批量导入角色模板（支持 JSON/CSV/Excel）"""
    content = await file.read()
    filename = file.filename or ""
    
    templates_to_import = []
    
    try:
        if filename.endswith('.json'):
            data = json.loads(content.decode('utf-8'))
            if isinstance(data, dict) and 'templates' in data:
                templates_to_import = [RoleTemplateCreate(**t) for t in data['templates']]
            elif isinstance(data, list):
                templates_to_import = [RoleTemplateCreate(**t) for t in data]
        elif filename.endswith('.csv'):
            # CSV 导入
            lines = content.decode('utf-8').split('\n')
            if len(lines) < 2:
                raise HTTPException(status_code=400, detail="CSV 文件格式错误")
            
            # 解析 CSV 头部
            reader = csv.DictReader(io.StringIO(content.decode('utf-8')))
            for row in reader:
                # 处理特殊字段
                if 'skill_tags' in row and row['skill_tags']:
                    row['skill_tags'] = json.loads(row['skill_tags']) if row['skill_tags'].startswith('[') else [t.strip() for t in row['skill_tags'].split(',')]
                if 'dialogue_examples' in row and row['dialogue_examples']:
                    row['dialogue_examples'] = json.loads(row['dialogue_examples'])
                templates_to_import.append(RoleTemplateCreate(**row))
        else:
            raise HTTPException(status_code=400, detail="不支持的文件格式，请上传 JSON 或 CSV 文件")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文件解析错误: {str(e)}")
    
    if not templates_to_import:
        raise HTTPException(status_code=400, detail="没有找到可导入的数据")
    
    imported = []
    skipped = []
    
    for template_data in templates_to_import:
        # 检查是否已存在同名模板
        existing = await db.execute(
            select(RoleTemplateModel).where(RoleTemplateModel.name == template_data.name)
        )
        existing_template = existing.scalar_one_or_none()
        
        if existing_template:
            if import_mode == "update" or overwrite:
                # 更新现有模板
                for key, value in template_data.model_dump().items():
                    if value is not None:
                        setattr(existing_template, key, value)
                imported.append(existing_template.id)
            else:
                skipped.append(template_data.name)
                continue
        else:
            # 创建新模板
            db_template = RoleTemplateModel(
                **template_data.model_dump(exclude={'dialogue_examples', 'skill_tags'}),
                dialogue_examples=parse_dialogue_examples(template_data.dialogue_examples),
                skill_tags=parse_skill_tags(template_data.skill_tags),
                version=1
            )
            db.add(db_template)
            await db.flush()
            
            # 创建版本记录
            version_record = RoleTemplateVersion(
                template_id=db_template.id,
                version=1,
                snapshot_data={k: v for k, v in db_template.__dict__.items() 
                               if not k.startswith('_')},
                change_summary="批量导入"
            )
            db.add(version_record)
            imported.append(db_template.id)
    
    await db.commit()
    
    return {
        "ok": True,
        "imported_count": len(imported),
        "skipped_count": len(skipped),
        "skipped_names": skipped,
        "imported_ids": imported
    }


@router.post("/export")
async def export_role_templates(
    category: Optional[str] = Query(None, description="按分类筛选导出"),
    include_inactive: bool = Query(False, description="包含已停用"),
    export_format: str = Query("json", description="导出格式: json/csv")
):
    """导出角色模板（支持 JSON/CSV）"""
    # 这里返回导出配置，实际数据通过后续查询获取
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
    query = select(RoleTemplateModel)
    
    filters = []
    if category:
        filters.append(RoleTemplateModel.category == category)
    if not include_inactive:
        filters.append(RoleTemplateModel.is_active == True)
    
    if filters:
        query = query.where(and_(*filters))
    
    result = await db.execute(query.order_by(RoleTemplateModel.category, RoleTemplateModel.name))
    templates = result.scalars().all()
    
    return [RoleTemplate.model_validate(t) for t in templates]
