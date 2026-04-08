"""
角色模板领域服务。
"""

# Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import csv
import io
import json
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException, UploadFile
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

try:
    from backend.app.models.role_template import RoleTemplate as RoleTemplateModel
    from backend.app.models.role_template import RoleTemplateVersion
    from backend.app.schemas.role_template import (
        RoleTemplate,
        RoleTemplateClone,
        RoleTemplateCreate,
        RoleTemplateUpdate,
    )
except ImportError:
    from app.models.role_template import RoleTemplate as RoleTemplateModel
    from app.models.role_template import RoleTemplateVersion
    from app.schemas.role_template import (
        RoleTemplate,
        RoleTemplateClone,
        RoleTemplateCreate,
        RoleTemplateUpdate,
    )


def _parse_dialogue_examples(data: Any) -> List[Dict[str, Any]]:
    if isinstance(data, str):
        try:
            return json.loads(data)
        except Exception:
            return []
    return data or []


def _parse_skill_tags(data: Any) -> List[str]:
    if isinstance(data, str):
        try:
            return json.loads(data)
        except Exception:
            if data:
                return [t.strip() for t in data.split(",") if t.strip()]
            return []
    return data or []


async def get_role_templates(
    db: AsyncSession,
    skip: int,
    limit: int,
    category: Optional[str] = None,
    stance: Optional[str] = None,
    is_active: Optional[bool] = None,
    is_default: Optional[bool] = None,
    search: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
) -> Tuple[int, List[RoleTemplateModel], Dict[str, int]]:
    query = select(RoleTemplateModel)

    filters = []
    if category:
        filters.append(RoleTemplateModel.category == category)
    if stance:
        filters.append(RoleTemplateModel.stance == stance)
    if is_active is not None:
        filters.append(RoleTemplateModel.is_active == is_active)
    if is_default is not None:
        filters.append(RoleTemplateModel.is_default == is_default)

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

    sort_column = getattr(RoleTemplateModel, sort_by, RoleTemplateModel.created_at)
    if sort_order == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(sort_column)

    count_query = select(func.count()).select_from(RoleTemplateModel)
    if filters:
        count_query = count_query.where(and_(*filters))
    total = (await db.execute(count_query)).scalar() or 0

    query = query.offset(skip).limit(limit)
    templates = list((await db.execute(query)).scalars().all())

    stats_query = select(
        RoleTemplateModel.category, func.count(RoleTemplateModel.id).label("count")
    ).group_by(RoleTemplateModel.category)
    stats_result = await db.execute(stats_query)
    category_stats = {row.category: row.count for row in stats_result.all()}

    return total, templates, category_stats


async def get_usage_stats(db: AsyncSession) -> Dict[str, Any]:
    total = (await db.execute(select(func.count()).select_from(RoleTemplateModel))).scalar() or 0
    active = (
        await db.execute(
            select(func.count())
            .select_from(RoleTemplateModel)
            .where(RoleTemplateModel.is_active == True)
        )
    ).scalar() or 0
    inactive = (
        await db.execute(
            select(func.count())
            .select_from(RoleTemplateModel)
            .where(RoleTemplateModel.is_active == False)
        )
    ).scalar() or 0

    category_result = await db.execute(
        select(RoleTemplateModel.category, func.count(RoleTemplateModel.id)).group_by(
            RoleTemplateModel.category
        )
    )
    category_stats = {row[0]: row[1] for row in category_result.all()}

    top_used_query = (
        select(RoleTemplateModel).order_by(desc(RoleTemplateModel.usage_count)).limit(5)
    )
    top_used = [
        RoleTemplate.model_validate(t)
        for t in (await db.execute(top_used_query)).scalars().all()
    ]

    recent_query = (
        select(RoleTemplateModel).order_by(desc(RoleTemplateModel.last_used_at)).limit(5)
    )
    recent_used = [
        RoleTemplate.model_validate(t)
        for t in (await db.execute(recent_query)).scalars().all()
        if t.last_used_at
    ]

    return {
        "total_templates": total,
        "active_templates": active,
        "inactive_templates": inactive,
        "category_stats": category_stats,
        "top_used": top_used,
        "recent_used": recent_used,
    }


async def get_role_template(db: AsyncSession, template_id: int) -> RoleTemplateModel:
    result = await db.execute(
        select(RoleTemplateModel).where(RoleTemplateModel.id == template_id)
    )
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="角色模板不存在")
    return template


async def create_role_template(
    db: AsyncSession, template_data: RoleTemplateCreate
) -> RoleTemplateModel:
    db_template = RoleTemplateModel(
        **template_data.model_dump(exclude={"dialogue_examples", "skill_tags"}),
        dialogue_examples=_parse_dialogue_examples(template_data.dialogue_examples),
        skill_tags=_parse_skill_tags(template_data.skill_tags),
        version=1,
    )
    db.add(db_template)
    await db.commit()
    await db.refresh(db_template)

    version_record = RoleTemplateVersion(
        template_id=db_template.id,
        version=1,
        snapshot_data=db_template.__dict__.copy(),
        change_summary="初始版本",
    )
    db.add(version_record)
    await db.commit()

    return db_template


async def update_role_template(
    db: AsyncSession, template_id: int, update_data: RoleTemplateUpdate
) -> RoleTemplateModel:
    db_template = await get_role_template(db, template_id)

    data = update_data.model_dump(exclude_unset=True)
    if "dialogue_examples" in data:
        data["dialogue_examples"] = _parse_dialogue_examples(data["dialogue_examples"])
    if "skill_tags" in data:
        data["skill_tags"] = _parse_skill_tags(data["skill_tags"])

    version_note = data.pop("version_note", None)
    db_template.version += 1

    version_record = RoleTemplateVersion(
        template_id=db_template.id,
        version=db_template.version,
        snapshot_data={
            k: v
            for k, v in db_template.__dict__.items()
            if not k.startswith("_") and k not in ["version", "updated_at"]
        },
        change_summary=version_note or "版本更新",
    )
    db.add(version_record)

    for key, value in data.items():
        setattr(db_template, key, value)

    await db.commit()
    await db.refresh(db_template)
    return db_template


async def clone_role_template(
    db: AsyncSession, template_id: int, clone_data: RoleTemplateClone
) -> RoleTemplateModel:
    original = await get_role_template(db, template_id)

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

    version_record = RoleTemplateVersion(
        template_id=db_template.id,
        version=1,
        snapshot_data={
            k: v for k, v in db_template.__dict__.items() if not k.startswith("_")
        },
        change_summary=f"从模板 #{template_id} 克隆",
    )
    db.add(version_record)
    await db.commit()

    return db_template


async def get_template_versions(
    db: AsyncSession, template_id: int
) -> List[RoleTemplateVersion]:
    await get_role_template(db, template_id)  # 验证存在
    result = await db.execute(
        select(RoleTemplateVersion)
        .where(RoleTemplateVersion.template_id == template_id)
        .order_by(desc(RoleTemplateVersion.version))
    )
    return list(result.scalars().all())


async def restore_template_version(
    db: AsyncSession, template_id: int, version_num: int
) -> RoleTemplateModel:
    version_result = await db.execute(
        select(RoleTemplateVersion).where(
            and_(
                RoleTemplateVersion.template_id == template_id,
                RoleTemplateVersion.version == version_num,
            )
        )
    )
    version_record = version_result.scalar_one_or_none()
    if not version_record:
        raise HTTPException(status_code=404, detail="指定的版本不存在")

    db_template = await get_role_template(db, template_id)

    current_version = RoleTemplateVersion(
        template_id=db_template.id,
        version=db_template.version + 1,
        snapshot_data={
            k: v for k, v in db_template.__dict__.items() if not k.startswith("_")
        },
        change_summary=f"恢复到版本 {version_num} 前",
    )
    db.add(current_version)

    snapshot = version_record.snapshot_data
    keys_to_restore = [
        "name",
        "stance",
        "category",
        "description",
        "personality",
        "background",
        "skill_tags",
        "dialogue_examples",
        "value_proposition",
        "soul_prompt_id",
        "style_prompt_id",
        "soul_config",
        "is_active",
    ]
    for key in keys_to_restore:
        if key in snapshot:
            setattr(db_template, key, snapshot[key])

    db_template.version += 1
    await db.commit()
    await db.refresh(db_template)
    return db_template


async def toggle_template_active(db: AsyncSession, template_id: int) -> RoleTemplateModel:
    db_template = await get_role_template(db, template_id)
    db_template.is_active = not db_template.is_active
    await db.commit()
    await db.refresh(db_template)
    return db_template


async def increment_usage_count(db: AsyncSession, template_id: int) -> int:
    db_template = await get_role_template(db, template_id)
    db_template.usage_count += 1
    db_template.last_used_at = datetime.utcnow()
    await db.commit()
    return db_template.usage_count


async def update_template_rating(
    db: AsyncSession, template_id: int, rating: float
) -> Tuple[float, int]:
    db_template = await get_role_template(db, template_id)
    total_score = db_template.rating * db_template.rating_count + rating
    db_template.rating_count += 1
    db_template.rating = round(total_score / db_template.rating_count, 1)
    await db.commit()
    await db.refresh(db_template)
    return db_template.rating, db_template.rating_count


async def delete_role_template(db: AsyncSession, template_id: int) -> None:
    db_template = await get_role_template(db, template_id)
    if db_template.is_default:
        raise HTTPException(status_code=400, detail="不能删除默认角色模板")

    await db.execute(
        RoleTemplateVersion.__table__.delete().where(
            RoleTemplateVersion.template_id == template_id
        )
    )
    await db.delete(db_template)
    await db.commit()


async def import_role_templates(
    db: AsyncSession, file: UploadFile, import_mode: str, overwrite: bool
) -> Dict[str, Any]:
    content = await file.read()
    filename = file.filename or ""

    templates_to_import = []

    try:
        if filename.endswith(".json"):
            data = json.loads(content.decode("utf-8"))
            if isinstance(data, dict) and "templates" in data:
                templates_to_import = [
                    RoleTemplateCreate(**t) for t in data["templates"]
                ]
            elif isinstance(data, list):
                templates_to_import = [RoleTemplateCreate(**t) for t in data]
        elif filename.endswith(".csv"):
            lines = content.decode("utf-8").split("\n")
            if len(lines) < 2:
                raise HTTPException(status_code=400, detail="CSV 文件格式错误")

            reader = csv.DictReader(io.StringIO(content.decode("utf-8")))
            for row in reader:
                if "skill_tags" in row and row["skill_tags"]:
                    row["skill_tags"] = (
                        json.loads(row["skill_tags"])
                        if row["skill_tags"].startswith("[")
                        else [t.strip() for t in row["skill_tags"].split(",")]
                    )
                if "dialogue_examples" in row and row["dialogue_examples"]:
                    row["dialogue_examples"] = json.loads(row["dialogue_examples"])
                templates_to_import.append(RoleTemplateCreate(**row))
        else:
            raise HTTPException(
                status_code=400, detail="不支持的文件格式，请上传 JSON 或 CSV 文件"
            )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文件解析错误: {str(e)}")

    if not templates_to_import:
        raise HTTPException(status_code=400, detail="没有找到可导入的数据")

    imported = []
    skipped = []

    for template_data in templates_to_import:
        existing = await db.execute(
            select(RoleTemplateModel).where(
                RoleTemplateModel.name == template_data.name
            )
        )
        existing_template = existing.scalar_one_or_none()

        if existing_template:
            if import_mode == "update" or overwrite:
                for key, value in template_data.model_dump().items():
                    if value is not None:
                        setattr(existing_template, key, value)
                imported.append(existing_template.id)
            else:
                skipped.append(template_data.name)
                continue
        else:
            db_template = RoleTemplateModel(
                **template_data.model_dump(
                    exclude={"dialogue_examples", "skill_tags"}
                ),
                dialogue_examples=_parse_dialogue_examples(
                    template_data.dialogue_examples
                ),
                skill_tags=_parse_skill_tags(template_data.skill_tags),
                version=1,
            )
            db.add(db_template)
            await db.flush()

            version_record = RoleTemplateVersion(
                template_id=db_template.id,
                version=1,
                snapshot_data={
                    k: v
                    for k, v in db_template.__dict__.items()
                    if not k.startswith("_")
                },
                change_summary="批量导入",
            )
            db.add(version_record)
            imported.append(db_template.id)

    await db.commit()

    return {
        "ok": True,
        "imported_count": len(imported),
        "skipped_count": len(skipped),
        "skipped_names": skipped,
        "imported_ids": imported,
    }


async def export_all_templates(
    db: AsyncSession, category: Optional[str], include_inactive: bool
) -> List[RoleTemplateModel]:
    query = select(RoleTemplateModel)

    filters = []
    if category:
        filters.append(RoleTemplateModel.category == category)
    if not include_inactive:
        filters.append(RoleTemplateModel.is_active == True)

    if filters:
        query = query.where(and_(*filters))

    result = await db.execute(
        query.order_by(RoleTemplateModel.category, RoleTemplateModel.name)
    )
    return list(result.scalars().all())
