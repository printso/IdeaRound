"""
初始化系统提示词和配置数据
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from app.core.config import settings
from app.models.prompt import SysPrompt
from app.models.style import StyleConfig
from app.models.role_template import RoleTemplate
from app.models.roundtable_config import RoundtableConfig
from app.models.scenario_template import ScenarioTemplate

# 默认系统提示词
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

# 默认风格配置
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

# 默认角色模板
DEFAULT_ROLE_TEMPLATES = [
    {
        "name": "产品策略官",
        "stance": "建设",
        "description": "目标拆解、需求路径、里程碑",
        "is_default": True,
        "is_active": True,
    },
    {
        "name": "技术架构师",
        "stance": "建设",
        "description": "可实施性、复杂度、工程风险",
        "is_default": True,
        "is_active": True,
    },
    {
        "name": "增长运营官",
        "stance": "中立",
        "description": "转化漏斗、数据指标、增长实验",
        "is_default": True,
        "is_active": True,
    },
    {
        "name": "黑帽风控官",
        "stance": "对抗",
        "description": "挑刺、压力测试、边界与风险",
        "is_default": True,
        "is_active": True,
    },
    {
        "name": "审计官",
        "stance": "评审",
        "description": "严格评审回答质量并提出优缺点",
        "is_default": True,
        "is_active": True,
    },
]

# 默认圆桌配置
DEFAULT_ROUNDTABLE_CONFIGS = [
    {
        "config_key": "max_brief_rounds",
        "config_value": "5",
        "description": "脑暴阶段最大发言轮数",
        "min_value": 3.0,
        "max_value": 10.0,
        "is_active": True,
    },
    {
        "config_key": "temperature_brief",
        "config_value": "0.8",
        "description": "脑暴阶段的模型温度（高发散性）",
        "min_value": 0.5,
        "max_value": 1.2,
        "is_active": True,
    },
    {
        "config_key": "temperature_final",
        "config_value": "0.3",
        "description": "收敛阶段的模型温度（聚焦结论）",
        "min_value": 0.1,
        "max_value": 0.5,
        "is_active": True,
    },
    {
        "config_key": "bidding_threshold",
        "config_value": "0.6",
        "description": "角色竞价发言的最低分数阈值",
        "min_value": 0.3,
        "max_value": 0.9,
        "is_active": True,
    },
    {
        "config_key": "auto_canvas_update_interval",
        "config_value": "3",
        "description": "共识画布自动更新间隔（轮数）",
        "min_value": 1.0,
        "max_value": 5.0,
        "is_active": True,
    },
    # 提示词模板配置
    {
        "config_key": "prompt_base",
        "config_value": "你是圆桌创意中的一个角色，请保持高信噪比，避免客套话与重复。",
        "description": "基础系统提示词",
        "is_active": True,
    },
    {
        "config_key": "prompt_brief_stage",
        "config_value": "当前处于「脑暴发散阶段」。\n只输出核心要点：3-5 条，短句，单条不超过 20 个字。\n不要输出总结性方案，不要写步骤/里程碑/落地计划，不要写\"综上/总结/最终方案\"。\n直接给出你认为最关键的点即可。\n用 Markdown 输出，建议使用无序列表。",
        "description": "脑暴阶段提示词",
        "is_active": True,
    },
    {
        "config_key": "prompt_final_stage",
        "config_value": "当前处于「收敛定稿阶段」。\n请基于当前对话给出总结性方案：目标拆解 → 关键路径 → 风险与对策 → 指标与验证 → 下一步行动清单。\n请给出可执行的落地方案，避免空话。\n用 Markdown 输出，结构清晰。",
        "description": "收敛阶段提示词",
        "is_active": True,
    },
    {
        "config_key": "prompt_audit_brief",
        "config_value": "当前处于「脑暴发散阶段」。\n只输出核心要点：3-5 条，短句，单条不超过 20 个字。\n不要输出总结性方案，不要写步骤/里程碑/落地计划。\n你是审计官：请用\"优点/缺点\"各 2-3 条进行严格评审（同样要短）。",
        "description": "审计官脑暴阶段提示词",
        "is_active": True,
    },
    {
        "config_key": "prompt_audit_final",
        "config_value": "当前处于「收敛定稿阶段」。\n请基于当前对话给出总结性方案：目标拆解 → 关键路径 → 风险与对策 → 指标与验证 → 下一步行动清单。\n你是审计官：在方案后补充\"优缺点/风险/需要补证的数据与实验\"。",
        "description": "审计官收敛阶段提示词",
        "is_active": True,
    },
    {
        "config_key": "prompt_converge_trigger",
        "config_value": "我觉得讨论已经收敛，请各角色基于当前讨论输出总结性方案。",
        "description": "触发收敛阶段的用户消息",
        "is_active": True,
    },
]

# 默认场景模板
DEFAULT_SCENARIO_TEMPLATES = [
    {
        "name": "产品功能杀手局",
        "description": "激进产品经理、保守老用户、技术架构师。适合做产品功能减法、激进创新方案的压力测试。",
        "preset_roles": [1, 2, 4], # 产品策略官、技术架构师、黑帽风控官
        "system_prompt_override": "这是一场关于产品功能的生死辩论。各位需要毫不留情地指出方案的致命缺陷。",
        "is_active": True,
        "sort_order": 1,
    },
    {
        "name": "职业发展拷问局",
        "description": "现实主义长辈、理想主义导师、冷酷HR。适合面临职业抉择、跳槽、创业等重大人生选择。",
        "preset_roles": [3, 4, 5], # 增长运营官(充当现实考量)、黑帽风控官(充当HR)、审计官(充当长辈)
        "system_prompt_override": "这是一场针对个人职业规划的灵魂拷问。请从极度现实和长远发展的双重角度给出建议。",
        "is_active": True,
        "sort_order": 2,
    },
    {
        "name": "商业方案路演局",
        "description": "挑剔投资人、合规法务、市场营销专家。适合商业计划书打磨、融资路演前的模拟答辩。",
        "preset_roles": [1, 3, 5], # 产品策略官(充当市场)、增长运营官(充当投资人)、审计官(充当法务)
        "system_prompt_override": "这是一场模拟融资路演。请用最挑剔的投资人眼光来审视这个商业方案。",
        "is_active": True,
        "sort_order": 3,
    },
]

async def init_database():
    """初始化数据库，插入默认数据"""
    engine = create_async_engine(settings.DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # 插入系统提示词
        for prompt_data in DEFAULT_PROMPTS:
            existing = await session.execute(
                SysPrompt.__table__.select().where(SysPrompt.__table__.c.p_key == prompt_data["p_key"])
            )
            if not existing.scalar():
                await session.execute(SysPrompt.__table__.insert().values(**prompt_data))
                print(f"Inserted prompt: {prompt_data['p_key']}")
        
        # 插入风格配置
        for style_data in DEFAULT_STYLE_CONFIGS:
            existing = await session.execute(
                StyleConfig.__table__.select().where(StyleConfig.__table__.c.s_key == style_data["s_key"])
            )
            if not existing.scalar():
                await session.execute(StyleConfig.__table__.insert().values(**style_data))
                print(f"Inserted style config: {style_data['s_key']}")
        
        # 插入角色模板
        for role_data in DEFAULT_ROLE_TEMPLATES:
            existing = await session.execute(
                RoleTemplate.__table__.select().where(RoleTemplate.__table__.c.name == role_data["name"])
            )
            if not existing.scalar():
                await session.execute(RoleTemplate.__table__.insert().values(**role_data))
                print(f"Inserted role template: {role_data['name']}")
        
        # 插入圆桌配置
        for config_data in DEFAULT_ROUNDTABLE_CONFIGS:
            existing = await session.execute(
                RoundtableConfig.__table__.select().where(RoundtableConfig.__table__.c.config_key == config_data["config_key"])
            )
            if not existing.scalar():
                await session.execute(RoundtableConfig.__table__.insert().values(**config_data))
                print(f"Inserted roundtable config: {config_data['config_key']}")

        # 插入场景模板
        for scenario_data in DEFAULT_SCENARIO_TEMPLATES:
            existing = await session.execute(
                ScenarioTemplate.__table__.select().where(ScenarioTemplate.__table__.c.name == scenario_data["name"])
            )
            if not existing.scalar():
                await session.execute(ScenarioTemplate.__table__.insert().values(**scenario_data))
                print(f"Inserted scenario template: {scenario_data['name']}")
        
        await session.commit()
        print("\n数据库初始化完成！")

if __name__ == "__main__":
    asyncio.run(init_database())
