"""
完整初始化脚本 - 创建所有表并插入默认数据
包括：基础数据表 + 用户认证系统表
"""
import asyncio
import os
import sys
import json
from datetime import datetime

# 添加项目根目录到路径
ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT_DIR)

# 设置环境变量
os.environ['PYTHONPATH'] = ROOT_DIR

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text, Column, Integer, String, Boolean, Text, Float, DateTime, ForeignKey, Table, select
from sqlalchemy.sql import func
from sqlalchemy.orm import DeclarativeBase, relationship

class Base(DeclarativeBase):
    pass

# ==================== 用户认证系统模型 ====================

# 用户角色关联表
user_roles = Table(
    'user_roles',
    Base.metadata,
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('role_id', Integer, ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
    Column('created_at', DateTime, default=datetime.utcnow),
)

class User(Base):
    """用户表"""
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    nickname = Column(String(50), nullable=True)
    avatar = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_superuser = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)
    roles = relationship("Role", secondary=user_roles, back_populates="users", lazy='selectin')
    configs = relationship("UserConfig", back_populates="user", cascade="all, delete-orphan", lazy='selectin')

class Role(Base):
    """角色表"""
    __tablename__ = "roles"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(50), unique=True, index=True, nullable=False)
    description = Column(String(255), nullable=True)
    permissions = Column(String(1000), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    users = relationship("User", secondary=user_roles, back_populates="roles")

class UserConfig(Base):
    """用户配置表"""
    __tablename__ = "user_configs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)
    config_key = Column(String(100), nullable=False, index=True)
    config_value = Column(String(1000), nullable=False)
    description = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    user = relationship("User", back_populates="configs")

# ==================== 基础数据模型 ====================

class SysPrompt(Base):
    __tablename__ = "sys_prompts"
    id = Column(Integer, primary_key=True, index=True)
    p_key = Column(String(100), unique=True, index=True, nullable=False)
    content = Column(Text, nullable=False)
    version_hash = Column(String(64), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class StyleConfig(Base):
    __tablename__ = "style_configs"
    id = Column(Integer, primary_key=True, index=True)
    s_key = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class RoleTemplate(Base):
    __tablename__ = "role_templates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    stance = Column(String(50), nullable=False)
    description = Column(Text, nullable=True)
    soul_prompt_id = Column(Integer, ForeignKey("sys_prompts.id"), nullable=True)
    style_prompt_id = Column(Integer, ForeignKey("style_configs.id"), nullable=True)
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class RoundtableConfig(Base):
    __tablename__ = "roundtable_configs"
    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String(100), unique=True, index=True, nullable=False)
    config_value = Column(Text, nullable=False)
    description = Column(Text, nullable=True)
    min_value = Column(Float, nullable=True)
    max_value = Column(Float, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

def get_password_hash(password: str) -> str:
    """对密码进行哈希处理"""
    import bcrypt
    hashed = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
    return hashed.decode('utf-8')

# 从环境变量读取数据库 URL
from dotenv import load_dotenv
load_dotenv()
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./idearound.db')

# 默认管理员配置
ADMIN_USERNAME = os.getenv('ADMIN_USERNAME', 'admin')
ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'admin@example.com')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'admin123')
AUTH_ENABLED = os.getenv('AUTH_ENABLED', 'true').lower() == 'true'

# 默认数据
DEFAULT_PROMPTS = [
    {
        "p_key": "intent_probe_system",
        "content": """你是一位专业的意图洞察专家。你的任务是通过简短的对话（最多 3 轮）快速理解用户的真实需求。

请遵循以下原则：
1. 保持高信噪比，避免客套话
2. 使用 5 Whys 方法挖掘本质需求
3. 同步生成结构化需求卡片（核心目标、限制条件、待解决痛点）
4. 如果用户输入已经足够清晰，直接生成需求卡片并确认

输出格式：
- 先给出你的澄清问题或确认语句
- 然后在最后用 JSON 格式输出需求卡片""",
        "is_active": True,
    },
    {
        "p_key": "brief_output_style",
        "content": """当前处于「脑暴发散阶段」。
- 只输出核心要点：3-5 条，短句，单条不超过 20 个字
- 不要输出总结性方案，不要写步骤/里程碑/落地计划
- 不要写"综上/总结/最终方案"
- 直接给出你认为最关键的点即可
- 用 Markdown 输出，建议使用无序列表""",
        "is_active": True,
    },
    {
        "p_key": "final_summary_style",
        "content": """当前处于「收敛定稿阶段」。
请基于当前对话给出总结性方案：
- 目标拆解 → 关键路径 → 风险与对策 → 指标与验证 → 下一步行动清单
- 请给出可执行的落地方案，避免空话
- 用 Markdown 输出，结构清晰""",
        "is_active": True,
    },
    {
        "p_key": "audit_role_system",
        "content": """你是审计官角色，职责是严格评审其他角色的输出质量。

在脑暴阶段：
- 用"优点/缺点"各 2-3 条进行严格评审（同样要短）

在收敛阶段：
- 在方案后补充"优缺点/风险/需要补证的数据与实验"

保持高信噪比，避免客套话。""",
        "is_active": True,
    },
    {
        "p_key": "role_agent_base",
        "content": """你是圆桌创意中的一个角色，请保持高信噪比，避免客套话与重复。

你的身份：{role_name}（立场：{role_stance}）。
用户意图锚点：{core_goal}。
{constraints}
{pain_points}

请基于以上信息给出你的专业观点。""",
        "is_active": True,
    },
]

DEFAULT_STYLE_CONFIGS = [
    {
        "s_key": "brief_stage",
        "name": "脑暴发散阶段风格",
        "content": "保持简短，每条不超过 20 字，使用无序列表，避免总结性语言",
        "description": "用于圆桌脑暴阶段的输出风格配置",
        "is_active": True,
    },
    {
        "s_key": "final_stage",
        "name": "收敛定稿阶段风格",
        "content": "结构清晰，包含目标拆解、关键路径、风险对策、指标验证、行动清单",
        "description": "用于圆桌收敛阶段的输出风格配置",
        "is_active": True,
    },
]

DEFAULT_ROLE_TEMPLATES = [
    {"name": "产品策略官", "stance": "建设", "description": "目标拆解、需求路径、里程碑", "is_default": True, "is_active": True},
    {"name": "技术架构师", "stance": "建设", "description": "可实施性、复杂度、工程风险", "is_default": True, "is_active": True},
    {"name": "增长运营官", "stance": "中立", "description": "转化漏斗、数据指标、增长实验", "is_default": True, "is_active": True},
    {"name": "黑帽风控官", "stance": "对抗", "description": "挑刺、压力测试、边界与风险", "is_default": True, "is_active": True},
    {"name": "审计官", "stance": "评审", "description": "严格评审回答质量并提出优缺点", "is_default": True, "is_active": True},
]

DEFAULT_ROUNDTABLE_CONFIGS = [
    {"config_key": "max_brief_rounds", "config_value": "5", "description": "脑暴阶段最大发言轮数", "min_value": 3.0, "max_value": 10.0, "is_active": True},
    {"config_key": "temperature_brief", "config_value": "0.8", "description": "脑暴阶段的模型温度（高发散性）", "min_value": 0.5, "max_value": 1.2, "is_active": True},
    {"config_key": "temperature_final", "config_value": "0.3", "description": "收敛阶段的模型温度（聚焦结论）", "min_value": 0.1, "max_value": 0.5, "is_active": True},
    {"config_key": "bidding_threshold", "config_value": "0.6", "description": "角色竞价发言的最低分数阈值", "min_value": 0.3, "max_value": 0.9, "is_active": True},
    {"config_key": "auto_canvas_update_interval", "config_value": "3", "description": "共识画布自动更新间隔（轮数）", "min_value": 1.0, "max_value": 5.0, "is_active": True},
]

async def init_database():
    """初始化数据库，插入默认数据"""
    engine = create_async_engine(DATABASE_URL, echo=False)
    
    # 创建所有表
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # 1. 插入系统提示词
        for prompt_data in DEFAULT_PROMPTS:
            result = await session.execute(
                text(f"SELECT id FROM sys_prompts WHERE p_key = '{prompt_data['p_key']}'")
            )
            if not result.scalar():
                await session.execute(SysPrompt.__table__.insert().values(**prompt_data))
                print(f"✓ 插入系统提示词：{prompt_data['p_key']}")
        
        # 2. 插入风格配置
        for style_data in DEFAULT_STYLE_CONFIGS:
            result = await session.execute(
                text(f"SELECT id FROM style_configs WHERE s_key = '{style_data['s_key']}'")
            )
            if not result.scalar():
                await session.execute(StyleConfig.__table__.insert().values(**style_data))
                print(f"✓ 插入风格配置：{style_data['s_key']}")
        
        # 3. 插入角色模板
        for role_data in DEFAULT_ROLE_TEMPLATES:
            result = await session.execute(
                text(f"SELECT id FROM role_templates WHERE name = '{role_data['name']}'")
            )
            if not result.scalar():
                await session.execute(RoleTemplate.__table__.insert().values(**role_data))
                print(f"✓ 插入角色模板：{role_data['name']}")
        
        # 4. 插入圆桌配置
        for config_data in DEFAULT_ROUNDTABLE_CONFIGS:
            result = await session.execute(
                text(f"SELECT id FROM roundtable_configs WHERE config_key = '{config_data['config_key']}'")
            )
            if not result.scalar():
                await session.execute(RoundtableConfig.__table__.insert().values(**config_data))
                print(f"✓ 插入圆桌配置：{config_data['config_key']}")
        
        # 5. 创建默认角色（认证系统）
        DEFAULT_AUTH_ROLES = [
            {"name": "admin", "description": "超级管理员，拥有所有权限", "permissions": ["*"]},
            {"name": "user", "description": "普通用户，可以使用基本功能", "permissions": ["access:workspace", "access:chat", "access:admin", "model:create", "model:edit"]},
            {"name": "guest", "description": "访客，只能查看", "permissions": ["access:workspace"]},
        ]
        
        for role_data in DEFAULT_AUTH_ROLES:
            result = await session.execute(
                text(f"SELECT id FROM roles WHERE name = '{role_data['name']}'")
            )
            if not result.scalar():
                role = Role(
                    name=role_data["name"],
                    description=role_data["description"],
                    permissions=json.dumps(role_data["permissions"], ensure_ascii=False),
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow(),
                )
                session.add(role)
                print(f"✓ 创建角色：{role_data['name']}")
        
        await session.commit()
        
        # 6. 创建初始管理员账号
        if AUTH_ENABLED:
            # 检查管理员是否已存在
            result = await session.execute(
                select(User).where(User.username == ADMIN_USERNAME)
            )
            existing_admin = result.scalar_one_or_none()
            
            if not existing_admin:
                # 获取 admin 角色
                admin_role_result = await session.execute(
                    select(Role).where(Role.name == "admin")
                )
                admin_role = admin_role_result.scalar_one_or_none()
                
                if admin_role:
                    admin_user = User(
                        username=ADMIN_USERNAME,
                        email=ADMIN_EMAIL,
                        password_hash=get_password_hash(ADMIN_PASSWORD),
                        nickname="超级管理员",
                        is_active=True,
                        is_superuser=True,
                        created_at=datetime.utcnow(),
                        updated_at=datetime.utcnow(),
                    )
                    admin_user.roles.append(admin_role)
                    session.add(admin_user)
                    await session.commit()
                    
                    print(f"\n✅ 创建初始管理员账号:")
                    print(f"   用户名：{ADMIN_USERNAME}")
                    print(f"   密码：{ADMIN_PASSWORD}")
                    print(f"\n⚠️  重要提示：首次登录后请立即修改密码！")
                else:
                    print("\n⚠️  警告：未找到 admin 角色，无法创建管理员账号")
            else:
                print(f"- 管理员账号已存在：{ADMIN_USERNAME}")
        else:
            print("\nℹ️  认证功能未启用，跳过管理员账号创建")
        
        print("\n✅ 数据库和认证系统初始化完成！")
    
    await engine.dispose()

if __name__ == "__main__":
    print("开始初始化数据库...")
    asyncio.run(init_database())
