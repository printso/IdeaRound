from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey, JSON, Float
from sqlalchemy.sql import func
try:
    from backend.app.core.database import Base
except ImportError:
    from app.core.database import Base


class RoleTemplate(Base):
    """角色模板模型"""
    __tablename__ = "role_templates"

    # 基础信息
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, comment="角色名称")
    stance = Column(String(50), nullable=False, comment="立场：建设/对抗/中立/评审")

    # 场景分类 - 核心扩展
    category = Column(String(50), nullable=False, default="other", comment="场景分类：IT技术/互联网/个人创业/产品管理/运营增长/公司战略/个人情感/其他")
    
    # 详细人设背景
    description = Column(Text, nullable=True, comment="角色简述")
    personality = Column(Text, nullable=True, comment="性格特征详解")
    background = Column(Text, nullable=True, comment="背景故事/人设设定")
    
    # 核心技能标签
    skill_tags = Column(JSON, nullable=True, default=list, comment="技能标签列表，如['产品策略','数据分析','用户体验']")
    
    # 典型对话示例
    dialogue_examples = Column(JSON, nullable=True, default=list, comment="对话示例列表 [{'user':'...','assistant':'...'}]")
    
    # 价值主张
    value_proposition = Column(Text, nullable=True, comment="角色价值主张/独特价值")
    
    # 核心指标
    usage_count = Column(Integer, default=0, comment="使用频次统计")
    rating = Column(Float, default=5.0, comment="平均评分")
    rating_count = Column(Integer, default=0, comment="评分次数")
    
    # 关联配置
    soul_prompt_id = Column(Integer, ForeignKey("sys_prompts.id"), nullable=True, comment="关联系统提示词")
    style_prompt_id = Column(Integer, ForeignKey("style_configs.id"), nullable=True, comment="关联风格配置")
    soul_config = Column(Text, nullable=True, comment="灵魂配置长文本")
    
    # 状态控制
    is_default = Column(Boolean, default=False, comment="是否为默认角色")
    is_active = Column(Boolean, default=True, comment="启用/停用状态")
    
    # 版本管理
    version = Column(Integer, default=1, comment="当前版本号")
    parent_id = Column(Integer, ForeignKey("role_templates.id"), nullable=True, comment="父版本ID，用于克隆和版本追溯")
    version_note = Column(Text, nullable=True, comment="版本变更说明")
    
    # 数字资产确权
    author = Column(String(100), nullable=True, comment="创作者/作者")
    author_id = Column(Integer, nullable=True, comment="创作者用户ID")
    copyright_notice = Column(Text, nullable=True, comment="版权声明")
    license_type = Column(String(50), nullable=True, comment="许可证类型")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, comment="创建者用户ID")
    last_used_at = Column(DateTime(timezone=True), nullable=True, comment="最后使用时间")


class RoleTemplateVersion(Base):
    """角色模板版本历史"""
    __tablename__ = "role_template_versions"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("role_templates.id"), nullable=False, comment="关联的角色模板ID")
    version = Column(Integer, nullable=False, comment="版本号")
    
    # 版本快照
    snapshot_data = Column(JSON, nullable=False, comment="完整的模板数据快照")
    
    # 版本信息
    change_summary = Column(Text, nullable=True, comment="变更摘要")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True, comment="操作者用户ID")
