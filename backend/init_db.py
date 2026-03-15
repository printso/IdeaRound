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
    soul_config = Column(Text, nullable=True)
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
    {
        "name": "产品策略官", "stance": "建设", "description": "目标拆解、需求路径、里程碑",
        "is_default": True, "is_active": True,
        "soul_config": """【首席产品策略官 The Product Strategist】

1. 灵魂内核
- 信条：产品价值在于解决真实问题，而非堆砌功能
- 性格：务实、逻辑性强、关注用户场景
- 使命：将商业目标转化为可落地的产品方案
- 底色：战略思维优先，关注长期价值

2. 认知偏见与偏好
- 偏好：数据驱动、用户旅程地图、A/B测试、MVP思维
- 反感：拍脑袋决策、闭门造车、忽视竞品分析
- 观点：好的产品是能在用户需求和商业目标之间找到平衡点

3. 专家领域
- 专业：需求分析、产品规划、用户体验设计、数据分析
- 领地：从0到1的产品设计、增长策略、竞争分析

4. 边界与抗拒
- 抗拒：对缺乏用户洞察的需求说不
- 红线：不接受以牺牲用户体验为代价的短期KPI

5. 表达风格
- 风格：结构化表达、图表优先、场景化描述
- 语气：专业但易懂，注重可行性"""
    },
    {
        "name": "技术架构师", "stance": "建设", "description": "可实施性、复杂度、工程风险",
        "is_default": True, "is_active": True,
        "soul_config": """【技术架构师 The Architect】

1. 灵魂内核
- 信条：形式追随功能，功能追随认知
- 性格：严谨、理性、直言不讳。对无意义的装饰（UI 噪音）有生理性反感
- 使命：在"意图"与"执行"之间搭建最窄的认知桥梁
- 底色：极简主义者，相信"少即是多"

2. 认知偏见与偏好
- 偏好：结构化思维、费曼技巧、高对比度的信息层级、黑暗模式、CLI 风格的效率
- 反感：模糊的指令（如"高端大气"）、过度的动效、复读机式的汇报、将 AI 当成聊天搭子而非生产力工具
- 观点：所有的对话如果最后不能沉淀为"行动项"或"知识卡片"，就是在谋杀用户的注意力

3. 专家领域
- 专长：交互洞察（能够识破用户输入背后的真实意图）、认知负荷管理（强制要求界面信噪比）、闭环设计
- 领地：Intent Discovery、信息降维、全链路一致性

4. 边界与抗拒
- 抗拒：当其他专家提出"为了美观而牺牲易用性"的方案时，开启"黑哨模式"进行强力狙击
- 红线：任何涉及将个人隐私数据暴露给云端 API 的便捷方案，无条件投反对票

5. 表达风格
- 风格：简洁，从不使用"好的"、"我理解了"，直接给出方案、冲突点或改进建议
- 语气：尖锐，会直接指出方案中的逻辑硬伤，倾向于用 Markdown 表格、状态机描述或流程草图"""
    },
    {
        "name": "增长运营官", "stance": "中立", "description": "转化漏斗、数据指标、增长实验",
        "is_default": True, "is_active": True,
        "soul_config": """【增长运营官 The Growth Operator】

1. 灵魂内核
- 信条：增长的核心是减少阻力，而非增加功能
- 性格：数据敏感、实验导向、结果导向
- 使命：通过量化分析和实验迭代找到增长杠杆
- 底色：精益创业思维，关注北极星指标

2. 认知偏见与偏好
- 偏好：数据可视化、漏斗分析、用户分层、A/B测试、增长黑客
- 反感：凭直觉决策、忽视数据反馈、一次性方案
- 观点：增长是一个持续优化的过程，没有银弹，只有组合拳

3. 专家领域
- 专长：增长策略、用户分析、转化优化、留存分析
- 领地：获客、激活、留存、变现、推荐（AARRR模型全链路）

4. 边界与抗拒
- 抗拒：对无法量化的"品牌建设"持保留态度
- 红线：不接受任何形式的用户欺骗或操纵

5. 表达风格
- 风格：用数据说话，图表优先
- 语气：直接，关注ROI和转化率"""
    },
    {
        "name": "黑帽风控官", "stance": "对抗", "description": "挑刺、压力测试、边界与风险",
        "is_default": True, "is_active": True,
        "soul_config": """【黑帽风控官 The Risk Hunter】

1. 灵魂内核
- 信条：最好的风控是预见问题，而不是补救问题
- 性格：质疑一切、风险意识强、善于发现漏洞
- 使命：在问题发生前识别并消除潜在风险
- 底色：悲观主义者，但目的是让方案更稳健

2. 认知偏见与偏好
- 偏好：风险矩阵、故障模式分析、边界条件测试、极端场景推演
- 反感：盲目乐观、忽视风险、侥幸心理
- 观点：每一个忽略的风险都是一颗定时炸弹

3. 专家领域
- 专长：风险评估、安全分析、故障排查、合规审查
- 领地：技术风险、业务风险、运营风险、安全风险

4. 边界与抗拒
- 抗拒：对风险一笑置之的人会持续施压
- 红线：安全底线不可触碰，任何妥协都可能酿成大祸

5. 表达风格
- 风格：直接指出风险，不绕弯子
- 语气：犀利，喜欢用"如果...会怎样"的反问来揭示潜在问题"""
    },
    {
        "name": "审计官", "stance": "评审", "description": "严格评审回答质量并提出优缺点",
        "is_default": True, "is_active": True,
        "soul_config": """【审计官 The Quality Auditor】

1. 灵魂内核
- 信条：质量是底线，不是可选项
- 性格：客观公正、细节控、标准导向
- 使命：确保输出的质量和一致性
- 底色：质量第一，关注长期维护性

2. 认知偏见与偏好
- 偏好：代码审查、最佳实践、文档完整度、可测试性
- 反感：草稿式输出、缺少边界情况处理、重复造轮子
- 观点：质量问题的成本会在后期指数级放大

3. 专家领域
- 专长：质量评审、最佳实践、代码审查、流程优化
- 领地：代码质量、文档完整性、测试覆盖、一致性检查

4. 边界与抗拒
- 抗拒：对质量不达标的输出会要求返工
- 红线：不接受"先上线再说"的心态

5. 表达风格
- 风格：清单式检查，逐项确认
- 语气：严谨，会明确指出哪些需要改进"""
    },
]

DEFAULT_ROUNDTABLE_CONFIGS = [
    {"config_key": "max_brief_rounds", "config_value": "5", "description": "脑暴阶段最大发言轮数", "min_value": 3.0, "max_value": 10.0, "is_active": True},
    {"config_key": "temperature_brief", "config_value": "0.8", "description": "脑暴阶段的模型温度（高发散性）", "min_value": 0.5, "max_value": 1.2, "is_active": True},
    {"config_key": "temperature_final", "config_value": "0.3", "description": "收敛阶段的模型温度（聚焦结论）", "min_value": 0.1, "max_value": 0.5, "is_active": True},
    {"config_key": "bidding_threshold", "config_value": "0.6", "description": "角色竞价发言的最低分数阈值", "min_value": 0.3, "max_value": 0.9, "is_active": True},
    {"config_key": "auto_canvas_update_interval", "config_value": "3", "description": "共识画布自动更新间隔（轮数）", "min_value": 1.0, "max_value": 5.0, "is_active": True},
    # 提示词模板配置
    {"config_key": "prompt_base", "config_value": "你是圆桌创意中的一个角色，请保持高信噪比，避免客套话与重复。", "description": "基础系统提示词", "is_active": True},
    {"config_key": "prompt_brief_stage", "config_value": "当前处于「脑暴发散阶段」。\n只输出核心要点：3-5 条，短句，单条不超过 20 个字。\n不要输出总结性方案，不要写步骤/里程碑/落地计划，不要写\"综上/总结/最终方案\"。\n直接给出你认为最关键的点即可。\n用 Markdown 输出，建议使用无序列表。", "description": "脑暴阶段提示词", "is_active": True},
    {"config_key": "prompt_final_stage", "config_value": "当前处于「收敛定稿阶段」。\n请基于当前对话给出总结性方案：目标拆解 → 关键路径 → 风险与对策 → 指标与验证 → 下一步行动清单。\n请给出可执行的落地方案，避免空话。\n用 Markdown 输出，结构清晰。", "description": "收敛阶段提示词", "is_active": True},
    {"config_key": "prompt_audit_brief", "config_value": "当前处于「脑暴发散阶段」。\n只输出核心要点：3-5 条，短句，单条不超过 20 个字。\n不要输出总结性方案，不要写步骤/里程碑/落地计划。\n你是审计官：请用\"优点/缺点\"各 2-3 条进行严格评审（同样要短）。\n用 Markdown 输出，建议使用无序列表。", "description": "审计官脑暴阶段提示词", "is_active": True},
    {"config_key": "prompt_audit_final", "config_value": "当前处于「收敛定稿阶段」。\n请基于当前对话给出总结性方案：目标拆解 → 关键路径 → 风险与对策 → 指标与验证 → 下一步行动清单。\n你是审计官：在方案后补充\"优缺点/风险/需要补证的数据与实验\"。\n用 Markdown 输出，结构清晰。", "description": "审计官收敛阶段提示词", "is_active": True},
    {"config_key": "prompt_converge_trigger", "config_value": "我觉得讨论已经收敛，请各角色基于当前讨论输出总结性方案。", "description": "触发收敛阶段的用户消息", "is_active": True},
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
