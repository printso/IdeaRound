"""智能上下文压缩器。

参考 Hermes Agent 的 context_compressor.py，将粗暴字符截断替换为
结构化 LLM 摘要压缩，核心改进：

1. 结构化摘要模板（目标、共识、分歧、行动项、关键数据）
2. 迭代更新而非全量重建
3. 多层压缩策略：先裁剪旧工具输出 → 保护头部 → 保护尾部 → LLM 摘要中间
4. Token 预算精细分配
5. 压缩失败降级（冷却期机制）
"""

from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("idearound.context_compressor")

# ── 常量 ──────────────────────────────────────────────────────────────────

# 最小摘要 token 预算
_MIN_SUMMARY_TOKENS = 800
# 被压缩内容分配给摘要的比例
_SUMMARY_RATIO = 0.20
# 摘要 token 上限
_SUMMARY_TOKENS_CEILING = 4000
# 压缩失败冷却期（秒）
_SUMMARY_FAILURE_COOLDOWN_SECONDS = 300
# 中文约 1 字符 ≈ 1.5 token，英文约 4 字符 ≈ 1 token
_CHARS_PER_TOKEN_ZH = 1.5
_CHARS_PER_TOKEN_EN = 4.0

# 摘要前缀标记
SUMMARY_PREFIX = (
    "[上下文压缩] 此前的讨论内容已被压缩以节省上下文空间。"
    "下方摘要描述了已完成的讨论，请基于摘要和当前状态继续，避免重复：\n\n"
)

# 旧工具输出占位
_PRUNED_OUTPUT_PLACEHOLDER = "[旧输出已清理以节省上下文空间]"


def estimate_token_count(text: str) -> int:
    """粗估 token 数：中文约 1 字符 ≈ 1.5 token，英文约 4 字符 ≈ 1 token"""
    if not text:
        return 0
    chinese_chars = sum(1 for c in text if '\u4e00' <= c <= '\u9fff')
    other_chars = len(text) - chinese_chars
    return int(chinese_chars * _CHARS_PER_TOKEN_ZH + other_chars / _CHARS_PER_TOKEN_EN)


def estimate_messages_tokens(messages: List[Dict[str, Any]]) -> int:
    """粗估消息列表的 token 数"""
    total = 0
    for msg in messages:
        content = msg.get("content") or ""
        total += estimate_token_count(content)
        # 每条消息的元数据约 10 token
        total += 10
    return total


class ContextCompressor:
    """圆桌讨论上下文压缩器。

    算法：
      1. 裁剪旧的冗长输出（免费，无 LLM 调用）
      2. 保护头部消息（系统提示 + 最初几轮）
      3. 按 token 预算保护尾部消息（最近的讨论）
      4. 用结构化 LLM prompt 摘要中间轮次
      5. 后续压缩时迭代更新已有的摘要
    """

    def __init__(
        self,
        context_length: int = 8000,
        threshold_percent: float = 0.60,
        protect_first_n: int = 3,
        protect_last_n: int = 10,
        summary_target_ratio: float = 0.20,
    ):
        self.context_length = context_length
        self.threshold_percent = threshold_percent
        self.protect_first_n = protect_first_n
        self.protect_last_n = protect_last_n
        self.summary_target_ratio = max(0.10, min(summary_target_ratio, 0.80))

        self.threshold_tokens = int(context_length * threshold_percent)
        self.compression_count = 0
        self.last_prompt_tokens = 0

        # Token 预算
        target_tokens = int(self.threshold_tokens * self.summary_target_ratio)
        self.tail_token_budget = target_tokens
        self.max_summary_tokens = min(
            int(context_length * 0.08), _SUMMARY_TOKENS_CEILING,
        )

        # 迭代摘要存储
        self._previous_summary: Optional[str] = None
        self._summary_failure_cooldown_until: float = 0.0

    def should_compress(self, prompt_tokens: int = None) -> bool:
        """检查上下文是否超过压缩阈值"""
        tokens = prompt_tokens if prompt_tokens is not None else self.last_prompt_tokens
        return tokens >= self.threshold_tokens

    def should_compress_preflight(self, messages: List[Dict[str, Any]]) -> bool:
        """使用粗估做预检（API 调用前）"""
        return estimate_messages_tokens(messages) >= self.threshold_tokens

    def get_status(self) -> Dict[str, Any]:
        """获取压缩状态"""
        return {
            "last_prompt_tokens": self.last_prompt_tokens,
            "threshold_tokens": self.threshold_tokens,
            "context_length": self.context_length,
            "compression_count": self.compression_count,
            "has_previous_summary": self._previous_summary is not None,
        }

    # ── Phase 1: 裁剪旧的冗长输出 ──────────────────────────────────────

    def _prune_old_outputs(
        self,
        messages: List[Dict[str, Any]],
        protect_tail_count: int,
    ) -> Tuple[List[Dict[str, Any]], int]:
        """替换旧的冗长输出内容为占位符"""
        if not messages:
            return messages, 0

        result = [m.copy() for m in messages]
        pruned = 0
        prune_boundary = len(result) - protect_tail_count

        for i in range(prune_boundary):
            msg = result[i]
            content = msg.get("content") or ""
            if not content or content == _PRUNED_OUTPUT_PLACEHOLDER:
                continue
            # 只裁剪超过 300 字的内容
            if len(content) > 300:
                result[i] = {**msg, "content": _PRUNED_OUTPUT_PLACEHOLDER}
                pruned += 1

        return result, pruned

    # ── Phase 2: 计算 token 预算 ───────────────────────────────────────

    def _compute_summary_budget(self, turns_to_summarize: List[Dict[str, Any]]) -> int:
        """根据被压缩内容量缩放摘要 token 预算"""
        content_tokens = estimate_messages_tokens(turns_to_summarize)
        budget = int(content_tokens * _SUMMARY_RATIO)
        return max(_MIN_SUMMARY_TOKENS, min(budget, self.max_summary_tokens))

    # ── Phase 3: 序列化讨论内容用于摘要 ───────────────────────────────

    def _serialize_for_summary(self, turns: List[Dict[str, Any]]) -> str:
        """将讨论轮次序列化为文本供摘要模型使用"""
        parts = []
        for msg in turns:
            speaker = msg.get("speaker_name") or msg.get("speakerName") or "角色"
            speaker_type = msg.get("speaker_type") or msg.get("speakerType") or "agent"
            content = msg.get("content") or ""

            if speaker_type == "host":
                continue  # 跳过主持人调度消息

            # 截断过长内容
            if len(content) > 2000:
                content = content[:1200] + "\n...[截断]...\n" + content[-600:]

            parts.append(f"[{speaker}]: {content}")

        return "\n\n".join(parts)

    # ── Phase 4: 生成结构化摘要 ───────────────────────────────────────

    def _build_summary_prompt(
        self,
        turns_to_summarize: List[Dict[str, Any]],
        summary_budget: int,
    ) -> str:
        """构建结构化摘要 prompt"""
        content_to_summarize = self._serialize_for_summary(turns_to_summarize)

        if self._previous_summary:
            # 迭代更新：保留已有信息，添加新进展
            return f"""你正在更新一份圆桌讨论的上下文压缩摘要。之前已有一份摘要，新的讨论轮次需要被整合进来。

之前的摘要：
{self._previous_summary}

需要整合的新讨论：
{content_to_summarize}

请使用以下精确结构更新摘要。保留所有仍然相关的已有信息，添加新进展，将已完成的项目从"进行中"移到"已完成"。仅在信息明显过时时才删除。

## 讨论目标
[用户试图达成什么 — 从之前摘要保留，如有演变则更新]

## 约束与偏好
[用户偏好、限制条件、重要决策 — 跨压缩累积]

## 进展
### 已达成共识
[已形成的共识 — 包含具体观点和依据]
### 仍存分歧
[尚未解决的争议 — 包含各方立场]
### 进行中
[正在进行的工作或讨论]

## 关键决策
[做出的重要决策及原因]

## 行动项
[需要执行的下一步行动]

## 关键数据
[具体的数值、指标、配置细节等会丢失的重要数据]

目标约 {summary_budget} token。请具体 — 包含具体观点、数据、结论，而非模糊描述。
只输出摘要正文，不加任何前缀或说明。"""
        else:
            # 首次压缩：从零生成
            return f"""请为圆桌讨论创建一份结构化的交接摘要，以便在早期轮次被压缩后，后续的讨论角色能继续推进。

需要摘要的讨论内容：
{content_to_summarize}

请使用以下精确结构：

## 讨论目标
[用户试图达成什么]

## 约束与偏好
[用户偏好、限制条件、重要决策]

## 进展
### 已达成共识
[已形成的共识 — 包含具体观点和依据]
### 仍存分歧
[尚未解决的争议 — 包含各方立场]
### 进行中
[正在进行的工作或讨论]

## 关键决策
[做出的重要决策及原因]

## 行动项
[需要执行的下一步行动]

## 关键数据
[具体的数值、指标、配置细节等会丢失的重要数据]

目标约 {summary_budget} token。请具体 — 包含具体观点、数据、结论，而非模糊描述。目标是防止后续角色重复讨论或遗漏重要细节。
只输出摘要正文，不加任何前缀或说明。"""

    async def _generate_summary(
        self,
        turns_to_summarize: List[Dict[str, Any]],
        call_llm_func,
    ) -> Optional[str]:
        """生成结构化摘要。

        Args:
            turns_to_summarize: 需要摘要的讨论轮次
            call_llm_func: 异步 LLM 调用函数，签名为 async (prompt, system_prompt) -> str

        Returns:
            生成的摘要文本，或 None（如果所有尝试都失败）
        """
        now = time.monotonic()
        if now < self._summary_failure_cooldown_until:
            logger.debug(
                "压缩摘要冷却中（剩余 %.0f 秒）",
                self._summary_failure_cooldown_until - now,
            )
            return None

        summary_budget = self._compute_summary_budget(turns_to_summarize)
        prompt = self._build_summary_prompt(turns_to_summarize, summary_budget)

        try:
            summary = await call_llm_func(
                prompt,
                "你是严谨的圆桌讨论摘要助手，负责输出结构化的高保真摘要，不得遗漏共识、分歧、行动项和关键数据。",
            )
            summary = summary.strip() if summary else ""

            if summary:
                self._previous_summary = summary
                self._summary_failure_cooldown_until = 0.0
                return f"{SUMMARY_PREFIX}{summary}"
            return None

        except Exception as e:
            self._summary_failure_cooldown_until = time.monotonic() + _SUMMARY_FAILURE_COOLDOWN_SECONDS
            logger.warning(
                "上下文压缩摘要生成失败: %s。冷却 %d 秒。",
                e, _SUMMARY_FAILURE_COOLDOWN_SECONDS,
            )
            return None

    # ── Phase 5: 尾部保护（按 token 预算） ────────────────────────────

    def _find_tail_cut_by_tokens(
        self,
        messages: List[Dict[str, Any]],
        head_end: int,
    ) -> int:
        """从尾部向前累积 token，直到预算耗尽。返回尾部起始索引"""
        n = len(messages)
        min_tail = self.protect_last_n
        accumulated = 0
        cut_idx = n

        for i in range(n - 1, head_end - 1, -1):
            msg = messages[i]
            content = msg.get("content") or ""
            msg_tokens = estimate_token_count(content) + 10  # +10 元数据

            if accumulated + msg_tokens > self.tail_token_budget and (n - i) >= min_tail:
                break
            accumulated += msg_tokens
            cut_idx = i

        # 确保至少保护 protect_last_n 条消息
        fallback_cut = n - min_tail
        if cut_idx > fallback_cut:
            cut_idx = fallback_cut

        if cut_idx <= head_end:
            cut_idx = fallback_cut

        return max(cut_idx, head_end + 1)

    # ── 主入口：压缩 ─────────────────────────────────────────────────

    async def compress(
        self,
        messages: List[Dict[str, Any]],
        call_llm_func,
        current_tokens: int = None,
    ) -> List[Dict[str, Any]]:
        """压缩讨论消息列表，通过摘要中间轮次来节省上下文空间。

        Args:
            messages: 当前消息列表
            call_llm_func: 异步 LLM 调用函数
            current_tokens: 当前 token 数（可选）

        Returns:
            压缩后的消息列表
        """
        n_messages = len(messages)
        if n_messages <= self.protect_first_n + self.protect_last_n + 1:
            logger.warning(
                "无法压缩：仅 %d 条消息（需要 > %d）",
                n_messages,
                self.protect_first_n + self.protect_last_n + 1,
            )
            return messages

        display_tokens = current_tokens or self.last_prompt_tokens or estimate_messages_tokens(messages)

        # Phase 1: 裁剪旧的冗长输出
        messages, pruned_count = self._prune_old_outputs(
            messages, protect_tail_count=self.protect_last_n * 3,
        )
        if pruned_count:
            logger.info("预压缩：裁剪了 %d 条旧的冗长输出", pruned_count)

        # Phase 2: 确定边界
        compress_start = self.protect_first_n
        compress_end = self._find_tail_cut_by_tokens(messages, compress_start)

        if compress_start >= compress_end:
            return messages

        turns_to_summarize = messages[compress_start:compress_end]

        logger.info(
            "上下文压缩触发（%d token >= %d 阈值），摘要轮次 %d-%d（%d 条）",
            display_tokens, self.threshold_tokens,
            compress_start + 1, compress_end, len(turns_to_summarize),
        )

        # Phase 3: 生成结构化摘要
        summary = await self._generate_summary(turns_to_summarize, call_llm_func)

        # Phase 4: 组装压缩后的消息列表
        compressed = []
        for i in range(compress_start):
            compressed.append(messages[i].copy())

        if summary:
            # 将摘要作为一条特殊消息插入
            compressed.append({
                "id": f"m_compressed_{self.compression_count}",
                "speaker_id": "system",
                "speaker_name": "系统",
                "speaker_type": "system",
                "content": summary,
                "streaming": False,
                "created_at": messages[compress_start].get("created_at") if compress_start < len(messages) else "",
            })
        else:
            logger.debug("无可用摘要模型 — 中间轮次被丢弃，无摘要")

        for i in range(compress_end, n_messages):
            compressed.append(messages[i].copy())

        self.compression_count += 1
        self.last_prompt_tokens = estimate_messages_tokens(compressed)

        logger.info(
            "压缩完成：%d → %d 条消息（约节省 %d token），第 %d 次压缩",
            n_messages, len(compressed),
            display_tokens - self.last_prompt_tokens,
            self.compression_count,
        )

        return compressed

    def update_previous_summary(self, summary: str) -> None:
        """手动更新之前的摘要（用于外部记忆管理同步）"""
        if summary:
            self._previous_summary = summary

    def reset(self) -> None:
        """重置压缩器状态（新讨论开始时）"""
        self._previous_summary = None
        self.compression_count = 0
        self.last_prompt_tokens = 0
        self._summary_failure_cooldown_until = 0.0


# ── 便捷函数：构建压缩用的 LLM 调用函数 ──────────────────────────────

def build_compressor_llm_caller(llm_settings: Dict[str, Any]):
    """构建供 ContextCompressor 使用的 LLM 调用函数。

    使用辅助模型（如果有配置）而非主模型来执行摘要，降低成本。
    """
    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        api_key=llm_settings["api_key"],
        base_url=llm_settings.get("api_base") or None,
    )

    # 摘要任务使用低 temperature
    model_name = llm_settings.get("summary_model") or llm_settings.get("model_name")
    temperature = 0.1

    async def _call(prompt: str, system_prompt: str) -> str:
        kwargs: Dict[str, Any] = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature,
            "stream": False,
        }
        max_tokens = llm_settings.get("max_tokens")
        if max_tokens:
            kwargs["max_tokens"] = min(max_tokens, _SUMMARY_TOKENS_CEILING * 2)

        response = await client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""

    return _call
