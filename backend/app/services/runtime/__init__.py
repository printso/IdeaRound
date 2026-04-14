"""运行时编排模块 - 平台化治理架构。

核心内核：会话、工具、配置、安全
可插拔扩展：策略、记忆、压缩、路由

模块划分：
- context_compressor: 智能上下文压缩（结构化LLM摘要替代粗暴截断）
- model_router: 辅助模型路由与任务分离（多后端路由、降级策略）
- memory_manager: 分层持久化记忆（共识层、分歧层、行动项层）
- prompt_registry: Prompt 注册表（可插拔 Prompt 模板）
- strategy_registry: 调度策略注册表（可插拔调度模式）
- safety_guard: 安全防护（Prompt 注入扫描、上下文隔离）
- stream_bus: 流式推送与事件总线
- task_orchestrator: 任务编排器（圆桌流程编排）
- summary_service: 消息摘要服务
"""

from .context_compressor import ContextCompressor, estimate_token_count, estimate_messages_tokens, build_compressor_llm_caller
from .model_router import ModelRouter, TaskType, get_model_router
from .memory_manager import MemoryManager, LayeredMemory, merge_memory_summary_v2, rebuild_memory_from_messages_v2
from .prompt_registry import PromptRegistry, PromptTemplate, get_prompt_registry
from .strategy_registry import StrategyRegistry, SchedulingContext, get_strategy_registry
from .safety_guard import SafetyGuard, ScanResult, get_safety_guard
from .stream_bus import StreamBus
from .summary_service import SummaryService, get_summary_service
from .task_orchestrator import RoundtableOrchestrator, get_orchestrator

__all__ = [
    "ContextCompressor",
    "estimate_token_count",
    "estimate_messages_tokens",
    "build_compressor_llm_caller",
    "ModelRouter",
    "TaskType",
    "get_model_router",
    "MemoryManager",
    "LayeredMemory",
    "merge_memory_summary_v2",
    "rebuild_memory_from_messages_v2",
    "PromptRegistry",
    "PromptTemplate",
    "get_prompt_registry",
    "StrategyRegistry",
    "SchedulingContext",
    "get_strategy_registry",
    "SafetyGuard",
    "ScanResult",
    "get_safety_guard",
    "StreamBus",
    "SummaryService",
    "get_summary_service",
    "RoundtableOrchestrator",
    "get_orchestrator",
]
