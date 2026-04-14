"""Prompt 注册表。

参考 Hermes Agent 的注册表模式，将散落在多处的 prompt 构建逻辑
集中为可插拔的 Prompt 模板注册表。

核心能力：
1. 每个 prompt 场景（brief/final/audit/裁判/书记员）独立注册
2. 支持动态替换 prompt 模板
3. 支持从数据库加载自定义模板
4. 模板变量替换
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger("idearound.prompt_registry")


# ── Prompt 模板 ───────────────────────────────────────────────────────

class PromptTemplate:
    """Prompt 模板对象"""

    def __init__(
        self,
        name: str,
        template: str,
        description: str = "",
        is_default: bool = False,
    ):
        self.name = name
        self.template = template
        self.description = description
        self.is_default = is_default

    def render(self, **kwargs) -> str:
        """渲染模板，替换变量"""
        result = self.template
        for key, value in kwargs.items():
            placeholder = f"{{{{{key}}}}}"
            result = result.replace(placeholder, str(value or ""))
        return result


# ── Prompt 注册表 ─────────────────────────────────────────────────────

class PromptRegistry:
    """Prompt 模板注册表，支持动态注册和替换"""

    def __init__(self):
        self._templates: Dict[str, PromptTemplate] = {}
        self._register_defaults()

    def _register_defaults(self) -> None:
        """注册默认 prompt 模板"""

        # 角色发言 - 系统提示词基础
        self.register(PromptTemplate(
            name="role_system_base",
            template=(
                "{{prompt_base}}\n"
                "你的身份：{{role_name}}（立场：{{role_stance}}）。\n"
                "用户意图锚点：{{core_goal}}。\n"
                "限制条件：{{constraints}}。\n"
                "待解决痛点：{{pain_points}}。\n"
                "期望结果：{{expected_result}}。\n"
                "请优先指出有价值的新信息、风险和分歧，不要复述别人已经说过的话。\n"
                "如果你同意某个观点，必须补充证据、边界或执行条件，禁止空泛附和。"
            ),
            description="角色系统提示词基础模板",
            is_default=True,
        ))

        # Brief 阶段
        self.register(PromptTemplate(
            name="role_brief_stage",
            template=(
                "当前处于「脑暴发散阶段」。\n"
                "只输出 3-5 条核心判断或建议，避免总结成大而全方案。\n"
                "优先暴露分歧、漏洞、前提假设和增量机会。\n"
                "使用 Markdown 无序列表。"
            ),
            description="Brief 发散阶段提示",
            is_default=True,
        ))

        # 审计官 Brief 阶段
        self.register(PromptTemplate(
            name="audit_brief_stage",
            template=(
                "当前处于「脑暴发散阶段」，你作为审计官需关注合规性和风险。\n"
                "只输出 3-5 条核心风险判断或合规建议。\n"
                "优先暴露法律风险、合规漏洞、数据安全问题和监管盲区。\n"
                "使用 Markdown 无序列表。"
            ),
            description="审计官 Brief 发散阶段提示",
            is_default=True,
        ))

        # Final 阶段
        self.register(PromptTemplate(
            name="role_final_stage",
            template=(
                "当前处于「收敛定稿阶段」。\n"
                "请输出可执行方案，至少覆盖目标拆解、关键路径、风险对策、验证指标和下一步行动。\n"
                "保留必要分歧，但必须给出建议结论。\n"
                "使用 Markdown 输出。"
            ),
            description="Final 收敛阶段提示",
            is_default=True,
        ))

        # 审计官 Final 阶段
        self.register(PromptTemplate(
            name="audit_final_stage",
            template=(
                "当前处于「收敛定稿阶段」，你作为审计官需确保方案合规。\n"
                "请输出合规审查结论，至少覆盖法律风险评估、数据合规路径、监管对接方案和合规验证指标。\n"
                "使用 Markdown 输出。"
            ),
            description="审计官 Final 收敛阶段提示",
            is_default=True,
        ))

        # 角色发言 - 用户提示词
        self.register(PromptTemplate(
            name="role_user_prompt",
            template=(
                "【讨论阶段】{{stage}}\n"
                "【核心目标】{{core_goal}}\n"
                "【角色身份】{{role_name}}（{{role_stance}}）\n"
                "【讨论摘要】\n{{memory_summary}}\n\n"
                "【本轮输入】\n{{user_message}}\n\n"
                "请以你的角色身份直接回应：\n"
                "1. 必须围绕核心目标，不要跑题。\n"
                "2. 必须提供新的判断、补充或反驳，不能机械重复已有内容。\n"
                "3. 如果发现前提不足，请明确指出需要验证什么。\n"
                "4. 输出内容保持精炼，避免客套。"
            ),
            description="角色发言用户提示词模板",
            is_default=True,
        ))

        # 裁判评估
        self.register(PromptTemplate(
            name="judge_evaluate",
            template=(
                "你是圆桌讨论的后台裁判。\n"
                "请根据目标、约束、痛点与当前讨论内容，评估当前讨论的收敛进度与完成质量。\n\n"
                "【核心目标】{{core_goal}}\n"
                "【限制条件】{{constraints}}\n"
                "【核心痛点】{{pain_points}}\n"
                "【期望结果】{{expected_result}}\n"
                "【当前轮次】{{current_round}}\n"
                "【讨论内容】\n{{transcript}}\n\n"
                "请严格输出 JSON：\n"
                "{{{\n"
                '  "score": 0-100 的整数,\n'
                '  "reason": "30字内说明当前判断",\n'
                '  "reached": true 或 false,\n'
                '  "consensusCount": 已形成的共识条数,\n'
                '  "resolvedPainPoints": 已解决痛点条数,\n'
                '  "nextFocus": "下一步最该推进的问题"\n'
                "}}}"
            ),
            description="裁判评估 prompt",
            is_default=True,
        ))

        # 书记员共识板
        self.register(PromptTemplate(
            name="scribe_board",
            template=(
                "你是圆桌讨论的书记员。\n"
                "请基于当前讨论内容提炼当前已经形成的共识、尚未解决的争议，以及最值得继续追问的问题。\n\n"
                "【核心目标】{{core_goal}}\n"
                "【期望结果】{{expected_result}}\n"
                "【讨论内容】\n{{transcript}}\n\n"
                "请严格输出 JSON：\n"
                "{{{\n"
                '  "summary": "一句话概括当前局势，不超过40字",\n'
                '  "consensus": ["共识1", "共识2"],\n'
                '  "disputes": [\n'
                '    {{"topic": "争议主题", "pro": "支持方观点", "con": "反对方观点"}}\n'
                "  ],\n"
                '  "nextQuestions": ["下一步该问的问题1", "下一步该问的问题2"]\n'
                "}}}"
            ),
            description="书记员共识板 prompt",
            is_default=True,
        ))

        # 消息摘要
        self.register(PromptTemplate(
            name="message_summary",
            template=(
                "请将以下角色回复压缩为不超过120字的中文摘要。\n"
                "要求：\n"
                "1. 必须保留关键结论、行动项、数值结论。\n"
                "2. 删除冗余修辞、铺垫、客套和重复表达。\n"
                "3. 与原文语义保持一致，不得新增事实。\n"
                "4. 只输出摘要正文，不要加标题或说明。\n\n"
                "原文：\n{{content}}"
            ),
            description="消息摘要 prompt",
            is_default=True,
        ))

        # 收敛触发
        self.register(PromptTemplate(
            name="converge_trigger",
            template="我觉得讨论已经收敛，请各角色基于当前讨论输出总结性方案。",
            description="收敛触发消息模板",
            is_default=True,
        ))

        # 主持人决策
        self.register(PromptTemplate(
            name="host_decide",
            template=(
                "【讨论摘要】\n{{memory_summary}}\n\n"
                "【候选角色】\n{{role_names}}\n\n"
                "请根据讨论进展，决定下一位最适合发言的角色。\n"
                '严格输出 JSON：{{"chosen_role": "角色名"}}'
            ),
            description="主持人决策 prompt",
            is_default=True,
        ))

    def register(self, template: PromptTemplate) -> None:
        """注册一个 prompt 模板"""
        self._templates[template.name] = template
        logger.debug("注册 prompt 模板: %s", template.name)

    def get(self, name: str) -> Optional[PromptTemplate]:
        """获取指定名称的模板"""
        return self._templates.get(name)

    def render(self, name: str, **kwargs) -> str:
        """渲染指定模板"""
        template = self._templates.get(name)
        if template is None:
            logger.warning("未找到 prompt 模板: %s，使用空字符串", name)
            return ""
        return template.render(**kwargs)

    def list_templates(self) -> List[str]:
        """列出所有已注册的模板名称"""
        return list(self._templates.keys())

    def override_from_config(self, config: Dict[str, str]) -> int:
        """从配置覆盖 prompt 模板。

        Args:
            config: 配置字典，key 为模板名称，value 为模板内容

        Returns:
            覆盖的模板数量
        """
        overridden = 0
        for name, template_str in config.items():
            if not template_str or not template_str.strip():
                continue
            existing = self._templates.get(name)
            if existing:
                existing.template = template_str
                existing.is_default = False
            else:
                self.register(PromptTemplate(
                    name=name,
                    template=template_str,
                    description="用户自定义",
                ))
            overridden += 1
        return overridden


# ── 全局单例 ──────────────────────────────────────────────────────────

_prompt_registry: Optional[PromptRegistry] = None


def get_prompt_registry() -> PromptRegistry:
    """获取全局 Prompt 注册表"""
    global _prompt_registry
    if _prompt_registry is None:
        _prompt_registry = PromptRegistry()
    return _prompt_registry
