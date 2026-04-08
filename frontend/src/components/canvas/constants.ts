import type { ConsensusDecision, ExpertStance, NodeKind, NodeStatus } from './types';

export const NODE_KIND_META: Record<NodeKind, { label: string; color: string; defaultContent: string; shape: string }> = {
  anchor: {
    label: '核心意图锚点',
    color: '#1677ff',
    defaultContent: '显示由意图探针生成的结构化意图卡片',
    shape: 'hexagon',
  },
  expert: {
    label: '专家观点',
    color: '#722ed1',
    defaultContent: '显示各角色的核心论点摘要',
    shape: 'rectangle',
  },
  relation: {
    label: '冲突与关联',
    color: '#d46b08',
    defaultContent: '显示观点之间的关系',
    shape: 'line',
  },
  milestone: {
    label: '共识里程碑',
    color: '#389e0d',
    defaultContent: '圆桌讨论后达成的确定性结论',
    shape: 'circle',
  },
  cognitive: {
    label: '认知增强',
    color: '#1677ff',
    defaultContent: '拆解问题边界、补充视角、给出深度追问',
    shape: 'hexagon',
  },
  sandbox: {
    label: '沙盘推演',
    color: '#722ed1',
    defaultContent: '假设场景A/B/C，比较关键变量与结果分布',
    shape: 'rectangle',
  },
  consensus: {
    label: '共识',
    color: '#389e0d',
    defaultContent: '聚合观点，标记已共识与遗留争议',
    shape: 'circle',
  },
};

export const STANCE_COLORS: Record<ExpertStance, string> = {
  positive: '#52c41a',
  negative: '#ff4d4f',
  neutral: '#1890ff',
  review: '#faad14',
};

export const STATUS_OPTIONS: { label: string; value: NodeStatus }[] = [
  { label: '待处理', value: 'todo' },
  { label: '进行中', value: 'doing' },
  { label: '已完成', value: 'done' },
];

export const DECISION_OPTIONS: { label: string; value: ConsensusDecision }[] = [
  { label: '待定', value: 'pending' },
  { label: '达成共识', value: 'consensus' },
  { label: '存在争议', value: 'dispute' },
];

export const RELATION_OPTIONS = ['支持', '补充', '冲突', '前置依赖', '因果影响'];

export const STOP_WORDS = new Set([
  '我们', '你们', '他们', '这个', '那个', '以及', '进行', '需要', '可以', '已经',
  '如果', '因为', '关于', '通过', '为了', '当前', '阶段', '讨论', '问题', '方案',
  '总结', '最终', '目标', '结果',
]);
