"""消息摘要服务。

将消息摘要生成、质量评分、缓存管理从 runtime_service.py 提取为独立模块。

职责：
1. 抽取式摘要（extractive）作为快速兜底
2. LLM 摘要 + 语义一致性评分
3. 摘要缓存管理
4. 批量摘要生成
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("idearound.summary_service")

# ── 常量 ──────────────────────────────────────────────────────────────

SUMMARY_MAX_CHARS = 120
SUMMARY_RT_TARGET_MS = 300
ACTION_HINTS = ("建议", "需要", "应", "执行", "推进", "验证", "上线", "优化", "修复", "建立", "安排", "行动", "下一步")
CONCLUSION_HINTS = ("结论", "核心", "关键", "优先", "必须", "最终", "判断", "共识")


# ── 工具函数 ──────────────────────────────────────────────────────────

def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _safe_text(value: Any) -> str:
    return str(value or "").strip()


def _compress_text(value: str, max_chars: int = 220) -> str:
    clean = " ".join(_safe_text(value).split())
    if len(clean) <= max_chars:
        return clean
    return clean[:max_chars - 1] + "…"


def _normalize_summary_text(value: str, max_chars: int = SUMMARY_MAX_CHARS) -> str:
    """规范化摘要文本"""
    clean = _safe_text(value)
    clean = re.sub(r"^[>\-\*\d\.\s]+", "", clean)
    clean = clean.replace("\r", " ").replace("\n", " ")
    clean = re.sub(r"\s+", " ", clean).strip(" \"'[]【】")
    if len(clean) <= max_chars:
        return clean
    return clean[:max_chars - 1].rstrip() + "…"


def _split_sentences(value: str) -> List[str]:
    normalized = re.sub(r"[\r\n]+", "。", _safe_text(value))
    parts = re.split(r"[。！？；;]+", normalized)
    return [part.strip(" -•*") for part in parts if part.strip(" -•*")]


def _extract_numeric_tokens(value: str) -> List[str]:
    return re.findall(r"\d+(?:\.\d+)?%?", _safe_text(value))


def _contains_hint(value: str, hints: tuple) -> bool:
    text = _safe_text(value)
    return any(hint in text for hint in hints)


def _char_bigrams(value: str) -> set:
    normalized = re.sub(r"[^\w\u4e00-\u9fff]", "", _safe_text(value).lower())
    if len(normalized) < 2:
        return {normalized} if normalized else set()
    return {normalized[i:i + 2] for i in range(len(normalized) - 1)}


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


# ── 抽取式摘要 ────────────────────────────────────────────────────────

def build_extractive_summary(content: str, max_chars: int = SUMMARY_MAX_CHARS) -> str:
    """构建抽取式摘要（无需 LLM 调用，作为快速兜底）"""
    sentences = _split_sentences(content)
    if not sentences:
        return _normalize_summary_text(content, max_chars=max_chars)

    ranked = sorted(
        sentences,
        key=lambda s: (
            1 if _extract_numeric_tokens(s) else 0,
            1 if _contains_hint(s, ACTION_HINTS) else 0,
            1 if _contains_hint(s, CONCLUSION_HINTS) else 0,
            min(len(s), 60),
        ),
        reverse=True,
    )

    selected: List[str] = []
    for sentence in ranked:
        if sentence in selected:
            continue
        candidate = "；".join(selected + [sentence]) if selected else sentence
        if len(candidate) > max_chars and selected:
            continue
        selected.append(sentence)
        if len("；".join(selected)) >= max_chars or len(selected) >= 3:
            break

    if not selected:
        selected = [ranked[0]]
    return _normalize_summary_text("；".join(selected), max_chars=max_chars)


# ── 语义一致性评分 ────────────────────────────────────────────────────

def score_summary_consistency(source: str, summary: str) -> float:
    """评估摘要与原文的语义一致性（0-100）"""
    source_text = _safe_text(source)
    summary_text = _normalize_summary_text(summary)
    if not source_text:
        return 100.0
    if not summary_text:
        return 0.0

    reference = build_extractive_summary(source_text, max_chars=160)
    reference_bigrams = _char_bigrams(reference)
    summary_bigrams = _char_bigrams(summary_text)
    overlap_score = 100.0
    if reference_bigrams:
        overlap_score = 100.0 * len(reference_bigrams & summary_bigrams) / len(reference_bigrams)

    source_numbers = set(_extract_numeric_tokens(source_text))
    summary_numbers = set(_extract_numeric_tokens(summary_text))
    number_score = 100.0 if not source_numbers else 100.0 * len(source_numbers & summary_numbers) / len(source_numbers)

    action_score = 100.0
    if _contains_hint(source_text, ACTION_HINTS):
        action_score = 100.0 if _contains_hint(summary_text, ACTION_HINTS) else 0.0

    conclusion_score = 100.0
    if _contains_hint(source_text, CONCLUSION_HINTS):
        conclusion_score = 100.0 if _contains_hint(summary_text, CONCLUSION_HINTS) else 0.0

    length_score = 100.0 if len(summary_text) <= SUMMARY_MAX_CHARS else max(0.0, 100.0 - (len(summary_text) - SUMMARY_MAX_CHARS) * 5.0)

    score = overlap_score * 0.45 + number_score * 0.3 + action_score * 0.15 + conclusion_score * 0.05 + length_score * 0.05
    return round(min(score, 100.0), 2)


# ── 摘要缓存 Key ──────────────────────────────────────────────────────

def build_summary_cache_key(model_id: int, content: str) -> str:
    payload = f"{model_id}:{_safe_text(content)}".encode("utf-8")
    return hashlib.md5(payload).hexdigest()


# ── LLM 摘要 prompt ──────────────────────────────────────────────────

def build_message_summary_prompt(content: str) -> str:
    """构建消息摘要 prompt"""
    return f"""请将以下角色回复压缩为不超过120字的中文摘要。
要求：
1. 必须保留关键结论、行动项、数值结论。
2. 删除冗余修辞、铺垫、客套和重复表达。
3. 与原文语义保持一致，不得新增事实。
4. 只输出摘要正文，不要加标题或说明。

原文：
{content}
"""


# ── 消息摘要生成器 ────────────────────────────────────────────────────

class SummaryService:
    """消息摘要服务。

    策略：
    1. 先用抽取式方法快速生成兜底摘要
    2. 同时尝试 LLM 生成更精炼的摘要
    3. 如果 LLM 摘要质量评分 >= 95 分，采用 LLM 摘要
    4. 否则使用抽取式摘要
    """

    def __init__(self):
        self._call_llm_text_func: Optional[callable] = None

    def set_llm_caller(self, call_llm_text_func: callable) -> None:
        """设置 LLM 文本调用函数"""
        self._call_llm_text_func = call_llm_text_func

    async def generate(
        self,
        content: str,
        *,
        llm_settings: Optional[Dict[str, Any]] = None,
        call_llm_text_func: Optional[callable] = None,
    ) -> Dict[str, Any]:
        """生成消息摘要。

        Args:
            content: 原始内容
            llm_settings: LLM 设置（用于构建调用函数）
            call_llm_text_func: 外部传入的 LLM 调用函数

        Returns:
            {"summary": str, "summary_metrics": dict}
        """
        started = time.perf_counter()

        # 兜底：抽取式摘要
        fallback_summary = build_extractive_summary(content)
        fallback_score = score_summary_consistency(content, fallback_summary)
        summary = fallback_summary
        semantic_consistency = fallback_score
        source = "extractive_guardrail"

        # 尝试 LLM 摘要
        caller = call_llm_text_func or self._call_llm_text_func
        if caller:
            try:
                llm_summary = await caller(
                    llm_settings or {},
                    build_message_summary_prompt(content),
                    "你是严谨的会议摘要助手，负责输出高保真、短摘要，不得遗漏结论、行动项和数值结论。",
                    temperature=0.1,
                )
                llm_summary = _normalize_summary_text(llm_summary)
                llm_score = score_summary_consistency(content, llm_summary)
                if llm_summary and llm_score >= 95.0:
                    summary = llm_summary
                    semantic_consistency = llm_score
                    source = "llm"
            except Exception as e:
                logger.debug("LLM 摘要生成失败，使用抽取式兜底: %s", e)

        duration_ms = int((time.perf_counter() - started) * 1000)
        return {
            "summary": summary,
            "summary_metrics": {
                "duration_ms": duration_ms,
                "summary_length": len(summary),
                "semantic_consistency": semantic_consistency,
                "source": source,
                "generated_at": _utcnow().isoformat(),
                "meets_rt_target": duration_ms <= SUMMARY_RT_TARGET_MS,
            },
        }


# ── 向后兼容的函数 ────────────────────────────────────────────────────

async def generate_message_summary_with_settings(
    llm_settings: Dict[str, Any],
    content: str,
) -> Dict[str, Any]:
    """向后兼容的摘要生成函数"""
    service = SummaryService()

    async def _call_text(settings, prompt, system_prompt, *, temperature=None):
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key=settings["api_key"],
            base_url=settings.get("api_base") or None,
        )
        kwargs: Dict[str, Any] = {
            "model": settings["model_name"],
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt},
            ],
            "temperature": temperature or 0.1,
            "stream": False,
        }
        if settings.get("max_tokens") is not None:
            kwargs["max_tokens"] = settings["max_tokens"]
        response = await client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""

    return await service.generate(content, llm_settings=llm_settings, call_llm_text_func=_call_text)


# ── 全局单例 ──────────────────────────────────────────────────────────

_summary_service: Optional[SummaryService] = None


def get_summary_service() -> SummaryService:
    """获取全局摘要服务"""
    global _summary_service
    if _summary_service is None:
        _summary_service = SummaryService()
    return _summary_service
