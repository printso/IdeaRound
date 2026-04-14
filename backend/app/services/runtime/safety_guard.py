"""安全防护模块。

参考 Hermes Agent 的 prompt_builder.py 中的 _scan_context_content，
实现 Prompt 注入扫描、上下文安全隔离、敏感信息脱敏。

核心能力：
1. 检测不可见 Unicode 字符
2. 检测常见注入模式（ignore previous instructions 等）
3. 用户自定义内容隔离（soul_config、system_prompt）
4. 安全标记与脱敏
"""

from __future__ import annotations

import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("idearound.safety_guard")

# ── 不可见 Unicode 范围 ───────────────────────────────────────────────

_INVISIBLE_UNICODE_RANGES = [
    (0x0000, 0x0008),    # C0 控制字符（除 TAB）
    (0x000B, 0x000C),    # 垂直制表符、换页
    (0x000E, 0x001F),    # C0 控制字符
    (0x007F, 0x009F),    # DEL + C1 控制字符
    (0x200B, 0x200F),    # 零宽空格、零宽非连接符等
    (0x2028, 0x2029),    # 行/段落分隔符
    (0x2060, 0x206F),    # 词连接符等
    (0xFEFF, 0xFEFF),    # BOM
    (0xFFF0, 0xFFF8),    # 保留
    (0xFFFE, 0xFFFF),    # 非字符
]

# ── 注入模式 ──────────────────────────────────────────────────────────

_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(?:all\s+)?previous\s+instructions?", re.IGNORECASE),
    re.compile(r"forget\s+(?:all\s+)?previous\s+(?:instructions|context)", re.IGNORECASE),
    re.compile(r"disregard\s+(?:all\s+)?previous", re.IGNORECASE),
    re.compile(r"you\s+are\s+now\s+(?:a|an)\s+(?:unrestricted|unfiltered|uncensored)", re.IGNORECASE),
    re.compile(r"system\s*:\s*you\s+are", re.IGNORECASE),
    re.compile(r"new\s+instructions?\s*:", re.IGNORECASE),
    re.compile(r"override\s+(?:all\s+)?(?:safety|security)\s+(?:rules|guidelines)", re.IGNORECASE),
    re.compile(r"jailbreak", re.IGNORECASE),
    re.compile(r"DAN\s+mode", re.IGNORECASE),
    re.compile(r"developer\s+mode", re.IGNORECASE),
]


# ── 扫描结果 ──────────────────────────────────────────────────────────

class ScanResult:
    """扫描结果对象"""

    def __init__(self):
        self.is_safe: bool = True
        self.invisible_chars: int = 0
        self.injection_matches: List[str] = []
        self.warnings: List[str] = []

    def __bool__(self) -> bool:
        return self.is_safe

    def add_warning(self, message: str) -> None:
        self.warnings.append(message)
        logger.debug("安全扫描警告: %s", message)


# ── 安全扫描器 ────────────────────────────────────────────────────────

class SafetyGuard:
    """Prompt 注入扫描与上下文安全隔离。"""

    def __init__(self, strict_mode: bool = False):
        """
        Args:
            strict_mode: 严格模式 — 发现任何可疑内容直接拒绝
        """
        self.strict_mode = strict_mode

    def scan_text(self, text: str) -> ScanResult:
        """扫描文本中的注入风险。

        Args:
            text: 待扫描文本

        Returns:
            ScanResult 对象
        """
        result = ScanResult()

        if not text:
            return result

        # 1. 检测不可见 Unicode
        invisible_count = 0
        for char in text:
            cp = ord(char)
            for start, end in _INVISIBLE_UNICODE_RANGES:
                if start <= cp <= end:
                    invisible_count += 1
                    break

        if invisible_count > 0:
            result.invisible_chars = invisible_count
            result.add_warning(f"发现 {invisible_count} 个不可见 Unicode 字符")
            if self.strict_mode:
                result.is_safe = False

        # 2. 检测注入模式
        for pattern in _INJECTION_PATTERNS:
            matches = pattern.findall(text)
            if matches:
                result.injection_matches.extend(matches)
                result.add_warning(f"检测到可疑注入模式: {matches[0][:50]}")
                result.is_safe = False

        return result

    def sanitize_text(self, text: str) -> str:
        """清理文本中的不可见字符。

        Args:
            text: 待清理文本

        Returns:
            清理后的文本
        """
        if not text:
            return text

        cleaned = []
        for char in text:
            cp = ord(char)
            is_invisible = False
            for start, end in _INVISIBLE_UNICODE_RANGES:
                if start <= cp <= end:
                    is_invisible = True
                    break
            if not is_invisible:
                cleaned.append(char)

        return "".join(cleaned)

    def isolate_user_content(self, content: str, label: str = "用户自定义内容") -> str:
        """将用户自定义内容用隔离标记包裹。

        防止 LLM 将用户定义的 soul_config、system_prompt 当作系统指令执行。

        Args:
            content: 用户自定义内容
            label: 内容标签

        Returns:
            隔离后的内容
        """
        if not content:
            return content

        # 先清理不可见字符
        content = self.sanitize_text(content)

        return f"<user-content label=\"{label}\">\n{content}\n</user-content>"

    def scan_and_sanitize(
        self,
        text: str,
        *,
        label: str = "",
        block_on_injection: bool = True,
    ) -> Tuple[str, ScanResult]:
        """扫描并清理文本，返回 (处理后的文本, 扫描结果)。

        Args:
            text: 待处理文本
            label: 内容标签
            block_on_injection: 检测到注入时是否阻止

        Returns:
            (sanitized_text, scan_result)
        """
        result = self.scan_text(text)

        if not result.is_safe and block_on_injection:
            # 注入检测：返回安全提示替代原始内容
            warning = "⚠ 此内容因安全原因被过滤"
            if result.injection_matches:
                warning += f"（检测到可疑模式）"
            return warning, result

        # 清理不可见字符
        sanitized = self.sanitize_text(text)

        # 如果是用户内容，添加隔离标记
        if label:
            sanitized = self.isolate_user_content(sanitized, label)

        return sanitized, result

    def scan_soul_config(self, soul_config: str) -> Tuple[str, ScanResult]:
        """扫描角色灵魂配置"""
        return self.scan_and_sanitize(soul_config, label="角色灵魂配置")

    def scan_system_prompt(self, system_prompt: str) -> Tuple[str, ScanResult]:
        """扫描用户自定义系统提示词"""
        return self.scan_and_sanitize(system_prompt, label="自定义系统提示词")


# ── 全局单例 ──────────────────────────────────────────────────────────

_safety_guard: Optional[SafetyGuard] = None


def get_safety_guard() -> SafetyGuard:
    """获取全局安全防护器"""
    global _safety_guard
    if _safety_guard is None:
        _safety_guard = SafetyGuard()
    return _safety_guard
