"""分层持久化记忆管理器。

参考 Hermes Agent 的 memory_manager.py，将简单的字符串拼接 + 尾部截断
升级为分层结构化记忆：

1. 共识层（consensus）：已达成共识的观点
2. 分歧层（disputes）：尚未解决的争议
3. 行动项层（action_items）：需要执行的下一步
4. 关键数据层（key_data）：具体数值、指标、配置
5. 进展层（progress）：讨论进展概要

特性：
- 增量更新而非全量重建
- <memory-context> 隔离标签，防止 LLM 把记忆当指令执行
- 结构化序列化与反序列化
- 跨会话持久化（通过 result_payload 存储）
"""

from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger("idearound.memory_manager")

# ── 记忆隔离标签 ──────────────────────────────────────────────────────

MEMORY_CONTEXT_OPEN = "<memory-context>"
MEMORY_CONTEXT_CLOSE = "</memory-context>"

# ── 分层记忆结构 ──────────────────────────────────────────────────────

class LayeredMemory:
    """分层记忆对象。

    将 memory_summary 从简单字符串升级为结构化对象，
    支持增量更新和精细化的上下文注入。
    """

    def __init__(self):
        self.consensus: List[str] = []       # 已达成共识
        self.disputes: List[Dict[str, str]] = []  # 分歧：{topic, pro, con}
        self.action_items: List[str] = []    # 行动项
        self.key_data: List[str] = []        # 关键数据
        self.progress: str = ""              # 进展概要
        self.raw_summary: str = ""           # 原始摘要文本（向后兼容）

    def to_dict(self) -> Dict[str, Any]:
        """序列化为字典"""
        return {
            "consensus": self.consensus,
            "disputes": self.disputes,
            "action_items": self.action_items,
            "key_data": self.key_data,
            "progress": self.progress,
            "raw_summary": self.raw_summary,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LayeredMemory":
        """从字典反序列化"""
        memory = cls()
        memory.consensus = data.get("consensus", [])
        memory.disputes = data.get("disputes", [])
        memory.action_items = data.get("action_items", [])
        memory.key_data = data.get("key_data", [])
        memory.progress = data.get("progress", "")
        memory.raw_summary = data.get("raw_summary", "")
        return memory

    def to_prompt_text(self, max_chars: int = 1500) -> str:
        """将分层记忆格式化为可注入 prompt 的文本。

        使用 <memory-context> 标签隔离，防止 LLM 将记忆内容当作指令执行。
        """
        parts = []

        if self.consensus:
            parts.append("【已达成共识】")
            for item in self.consensus[:6]:
                parts.append(f"• {item}")

        if self.disputes:
            parts.append("【仍存分歧】")
            for d in self.disputes[:4]:
                topic = d.get("topic", "")
                pro = d.get("pro", "")
                con = d.get("con", "")
                if topic:
                    parts.append(f"• {topic}：支持={pro}；反对={con}")

        if self.action_items:
            parts.append("【行动项】")
            for item in self.action_items[:5]:
                parts.append(f"• {item}")

        if self.key_data:
            parts.append("【关键数据】")
            for item in self.key_data[:5]:
                parts.append(f"• {item}")

        if self.progress:
            parts.append(f"【进展】{self.progress}")

        if not parts and self.raw_summary:
            # 向后兼容：如果没有结构化数据但有原始摘要
            text = self.raw_summary
            if len(text) > max_chars:
                text = text[:max_chars] + "…"
            return f"{MEMORY_CONTEXT_OPEN}\n{MEMORY_CONTEXT_CLOSE}\n【历史摘要】{text}"

        result = "\n".join(parts)
        if len(result) > max_chars:
            # 优先保留共识和行动项
            essential_parts = []
            if self.consensus:
                essential_parts.append("【已达成共识】" + "；".join(self.consensus[:3]))
            if self.action_items:
                essential_parts.append("【行动项】" + "；".join(self.action_items[:3]))
            result = "\n".join(essential_parts) if essential_parts else result[:max_chars] + "…"

        return f"{MEMORY_CONTEXT_OPEN}\n{result}\n{MEMORY_CONTEXT_CLOSE}"

    def to_flat_summary(self, max_chars: int = 1200) -> str:
        """扁平化为简单字符串（向后兼容旧的 memory_summary 字段）"""
        parts = []
        if self.consensus:
            parts.append("共识：" + "；".join(self.consensus[:4]))
        if self.disputes:
            dispute_topics = [d.get("topic", "") for d in self.disputes[:3] if d.get("topic")]
            if dispute_topics:
                parts.append("分歧：" + "；".join(dispute_topics))
        if self.action_items:
            parts.append("行动：" + "；".join(self.action_items[:3]))
        if self.progress:
            parts.append(self.progress)

        if not parts and self.raw_summary:
            text = self.raw_summary
            return text[-max_chars:] if len(text) > max_chars else text

        result = " | ".join(parts)
        return result[-max_chars:] if len(result) > max_chars else result


# ── 记忆管理器 ────────────────────────────────────────────────────────

class MemoryManager:
    """分层持久化记忆管理器。

    职责：
    1. 从消息列表中提取并更新分层记忆
    2. 将共识板结果整合进记忆
    3. 增量更新而非全量重建
    4. 支持跨房间/跨会话的知识沉淀
    """

    # 行动项关键词
    ACTION_HINTS = ("建议", "需要", "应", "执行", "推进", "验证", "上线", "优化", "修复", "建立", "安排", "行动", "下一步")
    # 结论关键词
    CONCLUSION_HINTS = ("结论", "核心", "关键", "优先", "必须", "最终", "判断", "共识")

    def __init__(self):
        self._memory: Optional[LayeredMemory] = None

    def initialize(self, raw_summary: str = "", structured_data: Optional[Dict[str, Any]] = None) -> LayeredMemory:
        """初始化记忆。

        Args:
            raw_summary: 旧的字符串格式 memory_summary（向后兼容）
            structured_data: 结构化记忆数据（如果有）
        """
        if structured_data:
            self._memory = LayeredMemory.from_dict(structured_data)
        else:
            self._memory = LayeredMemory()
            self._memory.raw_summary = raw_summary

        return self._memory

    def get_memory(self) -> LayeredMemory:
        """获取当前记忆对象"""
        if self._memory is None:
            self._memory = LayeredMemory()
        return self._memory

    def update_from_message(self, message: Dict[str, Any]) -> None:
        """从单条消息中提取信息并增量更新记忆"""
        memory = self.get_memory()
        content = (message.get("content") or "").strip()
        summary = (message.get("summary") or "").strip()
        speaker_type = message.get("speaker_type") or message.get("speakerType") or "agent"

        # 跳过主持人的调度消息
        if speaker_type == "host":
            return

        text = summary or content
        if not text:
            return

        # 提取行动项
        if any(hint in text for hint in self.ACTION_HINTS):
            # 简单提取：包含行动关键词的句子
            sentences = re.split(r"[。！？；;]+", text)
            for s in sentences:
                s = s.strip()
                if s and any(hint in s for hint in self.ACTION_HINTS):
                    if s not in memory.action_items:
                        memory.action_items.append(s)
                        if len(memory.action_items) > 10:
                            memory.action_items.pop(0)

        # 提取关键数据（数字、百分比等）
        numbers = re.findall(r"\d+(?:\.\d+)?%?", text)
        if numbers and any(hint in text for hint in self.CONCLUSION_HINTS):
            for num in numbers:
                data_point = f"数值结论：{num}"
                if data_point not in memory.key_data:
                    memory.key_data.append(data_point)
                    if len(memory.key_data) > 10:
                        memory.key_data.pop(0)

        # 更新原始摘要
        speaker = message.get("speaker_name") or message.get("speakerName") or "角色"
        snippet = summary if summary else self._extract_snippet(content, max_items=2)
        if snippet:
            new_entry = f"{speaker}：{snippet}"
            if memory.raw_summary:
                memory.raw_summary = f"{memory.raw_summary} | {new_entry}"
            else:
                memory.raw_summary = new_entry
            # 限制长度
            if len(memory.raw_summary) > 1500:
                memory.raw_summary = memory.raw_summary[-1200:]

    def update_from_board(self, board_state: Dict[str, Any]) -> None:
        """从共识板更新记忆"""
        memory = self.get_memory()

        # 更新共识
        consensus = board_state.get("consensus", [])
        if isinstance(consensus, list):
            for item in consensus:
                item_str = str(item).strip()
                if item_str and item_str not in memory.consensus:
                    memory.consensus.append(item_str)
                    if len(memory.consensus) > 10:
                        memory.consensus.pop(0)

        # 更新分歧
        disputes = board_state.get("disputes", [])
        if isinstance(disputes, list):
            for item in disputes:
                if isinstance(item, dict):
                    topic = str(item.get("topic", "")).strip()
                    if topic:
                        # 检查是否已存在相同主题
                        existing = next(
                            (d for d in memory.disputes if d.get("topic") == topic),
                            None,
                        )
                        if existing:
                            # 更新已有分歧
                            if item.get("pro"):
                                existing["pro"] = str(item["pro"])
                            if item.get("con"):
                                existing["con"] = str(item["con"])
                        else:
                            memory.disputes.append({
                                "topic": topic,
                                "pro": str(item.get("pro", "")),
                                "con": str(item.get("con", "")),
                            })
                            if len(memory.disputes) > 8:
                                memory.disputes.pop(0)

        # 更新进展
        summary_text = board_state.get("summary", "")
        if summary_text:
            memory.progress = str(summary_text).strip()

    def get_prompt_text(self, max_chars: int = 1500) -> str:
        """获取用于注入 prompt 的记忆文本"""
        return self.get_memory().to_prompt_text(max_chars=max_chars)

    def get_flat_summary(self, max_chars: int = 1200) -> str:
        """获取扁平化的 memory_summary（向后兼容）"""
        return self.get_memory().to_flat_summary(max_chars=max_chars)

    def get_structured_data(self) -> Dict[str, Any]:
        """获取结构化记忆数据（用于持久化存储）"""
        return self.get_memory().to_dict()

    def reset(self) -> None:
        """重置记忆（新讨论开始时）"""
        self._memory = None

    @staticmethod
    def _extract_snippet(content: str, max_items: int = 2) -> str:
        """从内容中提取简短要点"""
        lines = [
            line.strip("-*0123456789. ")
            for line in (content or "").splitlines()
            if line.strip()
        ]
        compact = [l[:80] for l in lines if len(l) >= 4]
        if compact:
            return "；".join(compact[:max_items])
        if not content:
            return ""
        return content[:80]


# ── 向后兼容的函数 ────────────────────────────────────────────────────

def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _compress_text(value: str, max_chars: int = 220) -> str:
    clean = " ".join(_safe_text(value).split())
    if len(clean) <= max_chars:
        return clean
    return clean[:max_chars - 1] + "…"


def _extract_summary_points(content: str, max_items: int = 3) -> List[str]:
    lines = [
        line.strip("-*0123456789. ")
        for line in _safe_text(content).splitlines()
        if line.strip()
    ]
    compact = [_compress_text(line, 80) for line in lines if len(line) >= 4]
    if compact:
        return compact[:max_items]
    if not content:
        return []
    return [_compress_text(content, 80)]


def merge_memory_summary_v2(
    memory_summary: str,
    messages: List[Dict[str, Any]],
    *,
    max_chars: int = 1200,
    structured_data: Optional[Dict[str, Any]] = None,
) -> tuple:
    """升级版记忆合并函数。

    返回 (flat_summary, structured_data) 元组，
    flat_summary 向后兼容旧接口，structured_data 用于持久化。

    Args:
        memory_summary: 当前的 memory_summary 字符串
        messages: 新增消息列表
        max_chars: 最大字符数
        structured_data: 已有的结构化记忆数据

    Returns:
        (flat_summary_str, structured_data_dict)
    """
    manager = MemoryManager()
    manager.initialize(raw_summary=memory_summary, structured_data=structured_data)

    for msg in messages[-6:]:
        manager.update_from_message(msg)

    return manager.get_flat_summary(max_chars), manager.get_structured_data()


def rebuild_memory_from_messages_v2(
    messages: List[Dict[str, Any]],
    *,
    max_chars: int = 1200,
) -> tuple:
    """从消息列表重建记忆。

    Returns:
        (flat_summary_str, structured_data_dict)
    """
    manager = MemoryManager()
    manager.initialize()

    for item in messages:
        if item.get("speaker_type") == "host":
            continue
        manager.update_from_message(item)

    return manager.get_flat_summary(max_chars), manager.get_structured_data()
