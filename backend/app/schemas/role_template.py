from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# 场景分类枚举
CATEGORY_ENUM = [
    "技术架构",     # 系统设计、技术选型、架构演进
    "产品方案",     # 产品规划、功能设计、用户体验
    "市场增长",     # 增长策略、营销获客、转化优化
    "战略规划",     # 业务战略、长期方向、竞争分析
    "个人创业",     # 创业决策、融资、团队搭建、个人发展
    "组织效能",     # 团队管理、流程优化、组织文化
    "个人情感",     # 情绪管理、关系处理、心理支持
    "行业分析",     # 特定行业趋势、竞品研究、政策环境
    "投融资",       # 融资、估值、投资决策
    "运营管理",     # 日常运营、供应链、用户运营
    "其他"          # 兜底
]

# 立场枚举
STANCE_ENUM = [
    "建设",     # 主动帮忙完善方案、提供具体建议
    "支持",     # 肯定方向、给予鼓励和资源化建议
    "中立",     # 客观呈现多方信息和可能性
    "评审",     # 专业评估、指出优缺点与风险
    "质疑",     # 挑战假设、提出尖锐问题
    "保守",     # 谨慎风控、强调稳健与底线
    "创新",     # 新增：大胆突破、提供颠覆性想法
]


class DialogueExample(BaseModel):
    """对话示例"""
    user: str = Field(..., description="用户输入")
    assistant: str = Field(..., description="角色回复")
    scenario: Optional[str] = Field(None, description="场景描述")


class RoleTemplateBase(BaseModel):
    """角色模板基础Schema"""
    name: str = Field(..., min_length=1, max_length=100, description="角色名称")
    stance: str = Field(..., description="立场")
    category: str = Field(default="其他", description="场景分类")
    description: Optional[str] = Field(None, description="角色简述")
    personality: Optional[str] = Field(None, description="性格特征详解")
    background: Optional[str] = Field(None, description="背景故事/人设设定")
    skill_tags: Optional[List[str]] = Field(default_factory=list, description="技能标签列表")
    dialogue_examples: Optional[List[DialogueExample]] = Field(default_factory=list, description="对话示例")
    value_proposition: Optional[str] = Field(None, description="价值主张")
    soul_prompt_id: Optional[int] = Field(None, description="系统提示词ID")
    style_prompt_id: Optional[int] = Field(None, description="风格配置ID")
    soul_config: Optional[str] = Field(None, description="灵魂配置")
    is_default: bool = Field(default=False, description="是否默认")
    is_active: bool = Field(default=True, description="是否启用")
    author: Optional[str] = Field(None, description="创作者")
    author_id: Optional[int] = Field(None, description="创作者ID")
    copyright_notice: Optional[str] = Field(None, description="版权声明")
    license_type: Optional[str] = Field(None, description="许可证类型")


class RoleTemplateCreate(RoleTemplateBase):
    """创建角色模板"""
    pass


class RoleTemplateUpdate(BaseModel):
    """更新角色模板"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    stance: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    personality: Optional[str] = None
    background: Optional[str] = None
    skill_tags: Optional[List[str]] = None
    dialogue_examples: Optional[List[DialogueExample]] = None
    value_proposition: Optional[str] = None
    soul_prompt_id: Optional[int] = None
    style_prompt_id: Optional[int] = None
    soul_config: Optional[str] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None
    author: Optional[str] = None
    copyright_notice: Optional[str] = None
    license_type: Optional[str] = None
    version_note: Optional[str] = Field(None, description="版本变更说明")


class RoleTemplateClone(BaseModel):
    """克隆角色模板"""
    name: str = Field(..., min_length=1, max_length=100, description="新角色名称")
    category: Optional[str] = Field(None, description="新场景分类")


class RoleTemplate(RoleTemplateBase):
    """角色模板响应"""
    id: int
    version: int = 1
    parent_id: Optional[int] = None
    version_note: Optional[str] = None
    usage_count: int = 0
    rating: float = 5.0
    rating_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[int] = None
    last_used_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class RoleTemplateListResponse(BaseModel):
    """角色模板列表响应"""
    total: int
    templates: List[RoleTemplate]
    stats: Optional[Dict[str, Any]] = Field(None, description="统计数据")


class RoleTemplateVersionResponse(BaseModel):
    """版本历史响应"""
    id: int
    template_id: int
    version: int
    snapshot_data: Dict[str, Any]
    change_summary: Optional[str] = None
    created_at: datetime
    created_by: Optional[int] = None


class RoleTemplateImportData(BaseModel):
    """批量导入数据"""
    templates: List[RoleTemplateCreate]
    import_mode: str = Field(default="create", description="导入模式: create/merge/update")
    overwrite_existing: bool = Field(default=False, description="是否覆盖已存在")


class RoleTemplateExportData(BaseModel):
    """导出数据"""
    templates: List[RoleTemplate]
    export_format: str = Field(default="json", description="导出格式: json/csv/excel")
    include_inactive: bool = Field(default=False, description="是否包含已停用")


class UsageStats(BaseModel):
    """使用统计"""
    total_templates: int
    active_templates: int
    inactive_templates: int
    category_stats: Dict[str, int]
    top_used: List[RoleTemplate]
    recent_used: List[RoleTemplate]
