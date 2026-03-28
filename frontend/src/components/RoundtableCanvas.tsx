import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnConnect,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Card, Input, Select, Space, Tag, Typography, message } from 'antd';
import { DownloadOutlined, RedoOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { toPng } from 'html-to-image';

const { Text, Title } = Typography;

type NodeKind = 'anchor' | 'expert' | 'relation' | 'milestone' | 'cognitive' | 'sandbox' | 'consensus';
type NodeStatus = 'todo' | 'doing' | 'done';
type ConsensusDecision = 'pending' | 'consensus' | 'dispute';
type ExpertStance = 'positive' | 'negative' | 'neutral' | 'review';

type CanvasNodeData = {
  title: string;
  content: string;
  owner: string;
  status: NodeStatus;
  decision: ConsensusDecision;
  nodeKind: NodeKind;
  // 专家观点扩展
  expertRole?: string;
  expertAvatar?: string;
  expertStance?: ExpertStance;
  originalMessageId?: string;
  thoughtChain?: string;
  // 语义压缩后的摘要
  summary?: string;
};

type CanvasEdgeData = {
  label: string;
  relation: string;
};

type CanvasSnapshot = {
  nodes: Node<CanvasNodeData>[];
  edges: Edge<CanvasEdgeData>[];
  viewport: Viewport;
  updatedAt: string;
};

type BroadcastMessage = {
  senderId: string;
  snapshot: CanvasSnapshot;
};

type MessageItem = {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerType: 'user' | 'agent';
  content: string;
  streaming?: boolean;
  createdAt: string;
};

type RoleMember = {
  id: string;
  name: string;
  stance: '建设' | '对抗' | '中立' | '评审';
  desc: string;
  selected: boolean;
};

type RoundtableCanvasProps = {
  roomId: string;
  intentAnchor: string;
  messages?: MessageItem[];
  roles?: RoleMember[];
  expectedResult?: string;
  canvasConsensus?: string[];
  roundtableStage?: 'brief' | 'final';
  onUpdatedAtChange?: (text: string) => void;
  initialSnapshotData?: Record<string, unknown> | null;
  onSnapshotChange?: (snapshot: Record<string, unknown>) => void;
};

// 四大核心视觉模块元数据
const NODE_KIND_META: Record<NodeKind, { label: string; color: string; defaultContent: string; shape: string }> = {
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
  // 兼容旧类型
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

// 立场颜色映射
const STANCE_COLORS: Record<ExpertStance, string> = {
  positive: '#52c41a',  // 绿色 - 建设性
  negative: '#ff4d4f',  // 红色 - 对抗性
  neutral: '#1890ff',   // 蓝色 - 中立
  review: '#faad14',    // 黄色 - 评审
};

const STATUS_OPTIONS: { label: string; value: NodeStatus }[] = [
  { label: '待处理', value: 'todo' },
  { label: '进行中', value: 'doing' },
  { label: '已完成', value: 'done' },
];

const DECISION_OPTIONS: { label: string; value: ConsensusDecision }[] = [
  { label: '待定', value: 'pending' },
  { label: '达成共识', value: 'consensus' },
  { label: '存在争议', value: 'dispute' },
];

const RELATION_OPTIONS = ['支持', '补充', '冲突', '前置依赖', '因果影响'];
const STOP_WORDS = new Set([
  '我们',
  '你们',
  '他们',
  '这个',
  '那个',
  '以及',
  '进行',
  '需要',
  '可以',
  '已经',
  '如果',
  '因为',
  '关于',
  '通过',
  '为了',
  '当前',
  '阶段',
  '讨论',
  '问题',
  '方案',
  '总结',
  '最终',
  '目标',
  '结果',
]);

const getNowText = () => new Date().toLocaleString();

const createId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now()}`;

const serializeGraph = (nodes: Node<CanvasNodeData>[], edges: Edge<CanvasEdgeData>[]) =>
  JSON.stringify({
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
      selected: Boolean(node.selected),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      data: edge.data,
      label: edge.label,
      selected: Boolean(edge.selected),
    })),
  });

const buildNode = (kind: NodeKind, position: { x: number; y: number }, seed?: Partial<CanvasNodeData>): Node<CanvasNodeData> => ({
  id: createId(kind),
  type: 'roundtableNode',
  position,
  data: {
    title: seed?.title ?? NODE_KIND_META[kind].label,
    content: seed?.content ?? NODE_KIND_META[kind].defaultContent,
    owner: seed?.owner ?? '协作组',
    status: seed?.status ?? 'todo',
    decision: seed?.decision ?? 'pending',
    nodeKind: kind,
  },
});

// 构建四大核心视觉模块的初始节点
const buildStarterNodes = (intentAnchor: string): Node<CanvasNodeData>[] => {
  const anchor = intentAnchor.trim() || '目标待补充';
  return [
    // 1. 核心意图锚点 - 位于顶部
    buildNode('anchor', { x: 280, y: 30 }, {
      title: '核心意图锚点',
      content: anchor,
      status: 'done',
    }),
    // 2. 专家观点分支 - 左侧
    buildNode('expert', { x: 30, y: 180 }, {
      title: '专家观点区域',
      content: '等待圆桌讨论生成专家观点节点',
      status: 'todo',
    }),
    // 3. 冲突与关联线 - 中间
    buildNode('relation', { x: 280, y: 180 }, {
      title: '观点关系网络',
      content: '显示观点之间的反驳、补充、派生关系',
      status: 'todo',
    }),
    // 4. 共识里程碑 - 底部
    buildNode('milestone', { x: 280, y: 350 }, {
      title: '决策收敛',
      content: '已达成共识的结论',
      decision: 'pending',
      status: 'todo',
    }),
  ];
};

const createInitialSnapshot = (
  storageKey: string,
  intentAnchor: string,
  initialSnapshotData?: Record<string, unknown> | null,
): CanvasSnapshot => {
  if (initialSnapshotData?.nodes && initialSnapshotData?.edges && initialSnapshotData?.viewport) {
    try {
      return initialSnapshotData as unknown as CanvasSnapshot;
    } catch {
      //
    }
  }
  const saved = localStorage.getItem(storageKey);
  if (saved) {
    try {
      return JSON.parse(saved) as CanvasSnapshot;
    } catch {
      const starterNodes = buildStarterNodes(intentAnchor);
      return {
        nodes: starterNodes,
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        updatedAt: getNowText(),
      };
    }
  }
  const starterNodes = buildStarterNodes(intentAnchor);
  const starterSnapshot: CanvasSnapshot = {
    nodes: starterNodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: getNowText(),
  };
  localStorage.setItem(storageKey, JSON.stringify(starterSnapshot));
  return starterSnapshot;
};

const downloadData = (dataUrl: string, name: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = name;
  link.click();
};

// 专家观点节点 - 矩形带头像和立场色
const ExpertNodeCard = ({ data, selected }: NodeProps<Node<CanvasNodeData>>) => {
  const meta = NODE_KIND_META.expert;
  const stanceColor = data.expertStance ? STANCE_COLORS[data.expertStance] : meta.color;
  const statusColor = data.status === 'done' ? 'green' : data.status === 'doing' ? 'processing' : 'default';

  // 压缩内容为摘要
  const summary = data.summary || compressText(data.content, 20);

  return (
    <div
      style={{
        width: 200,
        borderRadius: 8,
        border: selected ? `2px solid ${stanceColor}` : `2px solid ${stanceColor}`,
        background: '#fff',
        boxShadow: selected ? `0 0 8px ${stanceColor}40` : '0 2px 6px rgba(0,0,0,0.1)',
      }}
    >
      <Handle type="target" position={Position.Left} />
      {/* 头部：角色头像 + 立场色条 */}
      <div
        style={{
          background: `${stanceColor}15`,
          padding: '6px 10px',
          borderBottom: `2px solid ${stanceColor}`,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: stanceColor,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 'bold',
          }}
        >
          {data.expertRole?.slice(0, 1) || '专'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ fontSize: 13, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {data.expertRole || data.title}
          </Text>
          <Tag color={stanceColor} style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
            {data.expertStance === 'positive' ? '建设' : data.expertStance === 'negative' ? '对抗' : data.expertStance === 'review' ? '评审' : '中立'}
          </Tag>
        </div>
      </div>
      {/* 内容：语义压缩后的摘要 */}
      <div style={{ padding: 10 }}>
        <Text style={{ fontSize: 13, lineHeight: 1.5 }}>{summary}</Text>
      </div>
      {/* 底部：状态 */}
      <div style={{ padding: '6px 10px', borderTop: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between' }}>
        <Tag color={statusColor} style={{ fontSize: 10, margin: 0 }}>
          {STATUS_OPTIONS.find((item) => item.value === data.status)?.label}
        </Tag>
      </div>
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Top} id="top" />
    </div>
  );
};

// 核心意图锚点 - 六边形
const AnchorNodeCard = ({ data, selected }: NodeProps<Node<CanvasNodeData>>) => {
  const meta = NODE_KIND_META.anchor;
  return (
    <div
      style={{
        width: 240,
        borderRadius: 12,
        border: selected ? `3px solid ${meta.color}` : `2px solid ${meta.color}`,
        background: `linear-gradient(135deg, ${meta.color}10, ${meta.color}05)`,
        boxShadow: selected ? `0 0 12px ${meta.color}30` : '0 4px 12px rgba(0,0,0,0.08)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ padding: 14, textAlign: 'center' }}>
        <Tag color={meta.color} style={{ marginBottom: 8 }}>🎯 {meta.label}</Tag>
        <div style={{ background: '#fff', borderRadius: 8, padding: 10, marginTop: 8 }}>
          <Text strong style={{ fontSize: 14, color: meta.color }}>{data.title}</Text>
          <Text type="secondary" style={{ display: 'block', fontSize: 13, marginTop: 6 }}>
            {compressText(data.content, 40)}
          </Text>
        </div>
      </div>
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

// 共识里程碑 - 圆形
const MilestoneNodeCard = ({ data, selected }: NodeProps<Node<CanvasNodeData>>) => {
  const decisionColor = data.decision === 'consensus' ? '#52c41a' : data.decision === 'dispute' ? '#faad14' : '#d9d9d9';
  const isResolved = data.decision === 'consensus';

  return (
    <div
      style={{
        width: 200,
        height: 100,
        borderRadius: 50,
        border: selected ? `3px solid ${decisionColor}` : `2px solid ${decisionColor}`,
        background: isResolved ? `linear-gradient(135deg, ${decisionColor}20, ${decisionColor}10)` : '#fff',
        boxShadow: selected ? `0 0 12px ${decisionColor}40` : '0 4px 12px rgba(0,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div style={{ textAlign: 'center', padding: 10 }}>
        <Tag color={decisionColor} style={{ marginBottom: 4 }}>
          {isResolved ? '✓ 共识' : data.decision === 'dispute' ? '⚠ 争议' : '○ 待定'}
        </Tag>
        <Text strong style={{ display: 'block', fontSize: 13 }}>{compressText(data.title, 25)}</Text>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
};

// 关系节点 - 带标签的连线
const RelationNodeCard = ({ data, selected }: NodeProps<Node<CanvasNodeData>>) => {
  const meta = NODE_KIND_META.relation;
  return (
    <div
      style={{
        width: 180,
        borderRadius: 20,
        border: selected ? `2px dashed ${meta.color}` : `1px dashed ${meta.color}`,
        background: `${meta.color}10`,
        boxShadow: 'none',
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div style={{ padding: '8px 12px', textAlign: 'center' }}>
        <Text strong style={{ fontSize: 12, color: meta.color }}>{data.title}</Text>
        <Text type="secondary" style={{ display: 'block', fontSize: 11 }}>
          {compressText(data.content, 30)}
        </Text>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
};

// 默认节点卡片
const RoundtableNodeCard = ({ data, selected }: NodeProps<Node<CanvasNodeData>>) => {
  const meta = NODE_KIND_META[data.nodeKind] || NODE_KIND_META.cognitive;
  const statusColor = data.status === 'done' ? 'green' : data.status === 'doing' ? 'processing' : 'default';
  const decisionColor = data.decision === 'consensus' ? 'green' : data.decision === 'dispute' ? 'gold' : 'default';

  return (
    <div
      style={{
        width: 220,
        borderRadius: 10,
        border: selected ? `2px solid ${meta.color}` : '1px solid #d9d9d9',
        background: '#fff',
        boxShadow: selected ? `0 0 0 2px ${meta.color}20` : '0 1px 3px rgba(0,0,0,0.08)',
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div style={{ padding: 10 }}>
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
            <Tag color={meta.color} style={{ fontSize: 11 }}>{meta.label}</Tag>
            <Tag color={statusColor} style={{ fontSize: 10 }}>{STATUS_OPTIONS.find((item) => item.value === data.status)?.label}</Tag>
          </Space>
          <Text strong style={{ fontSize: 13 }}>{data.title}</Text>
          <Text type="secondary" style={{ fontSize: 11, whiteSpace: 'pre-wrap' }}>
            {compressText(data.content, 50)}
          </Text>
          {data.nodeKind === 'consensus' && (
            <Tag color={decisionColor}>{DECISION_OPTIONS.find((item) => item.value === data.decision)?.label}</Tag>
          )}
        </Space>
      </div>
      <Handle type="source" position={Position.Right} />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Top} id="top" />
    </div>
  );
};

const nodeTypes = {
  roundtableNode: RoundtableNodeCard,
  expert: ExpertNodeCard,
  anchor: AnchorNodeCard,
  milestone: MilestoneNodeCard,
  relation: RelationNodeCard,
};

// 语义压缩函数：将长文本压缩为20字以内的摘要
const compressText = (text: string, maxLength: number = 20): string => {
  if (!text) return '';
  // 移除 markdown 格式
  const cleanText = text.replace(/[#*`[\]()]/g, '').replace(/\n+/g, ' ').trim();
  if (cleanText.length <= maxLength) return cleanText;
  return cleanText.slice(0, maxLength - 1) + '…';
};

// 根据角色立场获取颜色
const getStanceColor = (stance: string): ExpertStance => {
  switch (stance) {
    case '建设':
      return 'positive';
    case '对抗':
      return 'negative';
    case '评审':
      return 'review';
    default:
      return 'neutral';
  }
};

const toNodeSafeId = (text: string) => text.replace(/[^a-zA-Z0-9_-]/g, '_');

const normalizeText = (value: string) =>
  value
    .replace(/\s+/g, ' ')
    .replace(/[。！？!?,，；;：:（）()[\]{}"'`]/g, '')
    .trim();

const extractKeywordCandidates = (text: string) => {
  const tokens = text.match(/[\u4e00-\u9fa5a-zA-Z0-9]+/g) || [];
  return Array.from(
    new Set(
      tokens
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item.length >= 2 && !STOP_WORDS.has(item)),
    ),
  ).slice(0, 25);
};

const extractBulletLikePoints = (content: string) => {
  const lines = content
    .split('\n')
    .map((line) => line.replace(/^[-*+\d.\s]+/, '').trim())
    .filter(Boolean);
  return lines.filter((line) => line.length >= 8 && line.length <= 120);
};

const scoreByIntent = (text: string, keywords: string[], isFinal: boolean) => {
  const normalized = text.toLowerCase();
  const hitCount = keywords.filter((keyword) => normalized.includes(keyword)).length;
  const planBonus = /(路径|行动|里程碑|指标|验证|风险|落地|优先级|时间线)/.test(text) ? 2 : 0;
  const finalBonus = isFinal ? 3 : 0;
  return hitCount * 2 + planBonus + finalBonus;
};

const extractDeliverableFindings = (
  intentAnchor: string,
  expectedResult: string,
  messages: MessageItem[],
  canvasConsensus: string[],
  roundtableStage: 'brief' | 'final',
) => {
  const keywords = extractKeywordCandidates(`${intentAnchor} ${expectedResult}`);
  const agentMessages = messages.filter((item) => item.speakerType === 'agent');
  const candidates: Array<{ text: string; score: number }> = [];

  canvasConsensus.forEach((item) => {
    candidates.push({
      text: item,
      score: scoreByIntent(item, keywords, roundtableStage === 'final'),
    });
  });

  agentMessages.slice(-10).forEach((msg) => {
    extractBulletLikePoints(msg.content).forEach((item) => {
      candidates.push({
        text: item,
        score: scoreByIntent(item, keywords, roundtableStage === 'final'),
      });
    });
  });

  const deduped = new Map<string, { text: string; score: number }>();
  candidates.forEach((item) => {
    const key = normalizeText(item.text).toLowerCase();
    if (!key) {
      return;
    }
    const exist = deduped.get(key);
    if (!exist || item.score > exist.score) {
      deduped.set(key, item);
    }
  });

  return Array.from(deduped.values())
    .sort((a, b) => b.score - a.score || b.text.length - a.text.length)
    .slice(0, 8)
    .map((item) => item.text);
};

const buildStructuredGraph = (
  intentAnchor: string,
  messages: MessageItem[],
  roles: RoleMember[],
  expectedResult: string,
  canvasConsensus: string[],
  roundtableStage: 'brief' | 'final',
): { nodes: Node<CanvasNodeData>[]; edges: Edge<CanvasEdgeData>[] } => {
  const anchorText = intentAnchor.trim() || '目标待补充';
  const anchorNode: Node<CanvasNodeData> = {
    id: 'anchor_main',
    type: 'anchor',
    position: { x: 460, y: 30 },
    data: {
      title: '核心意图锚点',
      content: anchorText,
      owner: '用户',
      status: 'done',
      decision: 'pending',
      nodeKind: 'anchor',
      summary: compressText(anchorText, 40),
    },
  };

  const latestBySpeaker = new Map<string, MessageItem>();
  messages.forEach((item) => {
    if (item.speakerType === 'agent' && item.content.trim()) {
      latestBySpeaker.set(item.speakerId || item.speakerName, item);
    }
  });

  const selectedRoles = roles.filter((item) => item.selected);
  const expertSeeds =
    latestBySpeaker.size > 0
      ? Array.from(latestBySpeaker.values())
      : selectedRoles.map((role) => ({
          id: `seed_${role.id}`,
          speakerId: role.id,
          speakerName: role.name,
          speakerType: 'agent' as const,
          content: `${role.name}视角：待生成观点`,
          createdAt: '',
        }));

  const expertsCount = expertSeeds.length || 1;
  const cols = Math.min(4, Math.max(2, expertsCount));
  const spacingX = 250;
  const startX = 120;
  const startY = 230;

  const expertNodes: Node<CanvasNodeData>[] = expertSeeds.map((item, index) => {
    const role = roles.find((r) => r.id === item.speakerId) ?? roles.find((r) => r.name === item.speakerName);
    const stance = role ? getStanceColor(role.stance) : 'neutral';
    const row = Math.floor(index / cols);
    const col = index % cols;
    return {
      id: `expert_${toNodeSafeId(item.speakerId || item.speakerName)}_${index}`,
      type: 'expert',
      position: {
        x: startX + col * spacingX,
        y: startY + row * 140,
      },
      data: {
        title: role?.name || item.speakerName,
        content: item.content,
        owner: role?.name || item.speakerName,
        status: 'done',
        decision: 'pending',
        nodeKind: 'expert',
        expertRole: role?.name || item.speakerName,
        expertAvatar: (role?.name || item.speakerName).slice(0, 1),
        expertStance: stance,
        originalMessageId: item.id,
        summary: compressText(item.content, 28),
      },
    };
  });

  const negativeCount = expertNodes.filter((node) => node.data.expertStance === 'negative').length;
  const deliverableFindings = extractDeliverableFindings(
    intentAnchor,
    expectedResult,
    messages,
    canvasConsensus,
    roundtableStage,
  );
  const relationText = negativeCount > 0 ? `存在 ${negativeCount} 个冲突视角，需重点协调` : '观点总体可兼容，建议合并推进';
  const relationY = startY + (Math.ceil(expertsCount / cols) - 1) * 140 + 190;
  const relationNode: Node<CanvasNodeData> = {
    id: 'relation_hub',
    type: 'relation',
    position: { x: 460, y: relationY },
    data: {
      title: '冲突与关联网络',
      content: relationText,
      owner: '系统',
      status: 'doing',
      decision: 'pending',
      nodeKind: 'relation',
      summary: compressText(relationText, 30),
    },
  };

  const milestoneText = negativeCount > 0 ? '仍有争议待决策' : '已具备形成共识条件';
  const milestoneNode: Node<CanvasNodeData> = {
    id: 'milestone_main',
    type: 'milestone',
    position: { x: 460, y: relationY + 170 },
    data: {
      title: '方案收敛与决策',
      content: deliverableFindings.length > 0 ? `${milestoneText}，已转化 ${deliverableFindings.length} 项可交付成果` : milestoneText,
      owner: '圆桌',
      status: negativeCount > 0 ? 'doing' : 'done',
      decision: negativeCount > 0 ? 'dispute' : 'consensus',
      nodeKind: 'milestone',
      summary: deliverableFindings.length > 0 ? `已转化 ${deliverableFindings.length} 项可交付成果` : milestoneText,
    },
  };

  const deliverableCols = Math.min(3, Math.max(1, deliverableFindings.length >= 4 ? 3 : 2));
  const deliverableSpacingX = 260;
  const deliverableStartX = 460 - ((deliverableCols - 1) * deliverableSpacingX) / 2;
  const deliverableStartY = relationY + 330;
  const deliverableNodes: Node<CanvasNodeData>[] = deliverableFindings.map((item, index) => {
    const row = Math.floor(index / deliverableCols);
    const col = index % deliverableCols;
    return {
      id: `deliverable_${toNodeSafeId(item)}_${index}`,
      type: 'roundtableNode',
      position: {
        x: deliverableStartX + col * deliverableSpacingX,
        y: deliverableStartY + row * 140,
      },
      data: {
        title: `可交付成果 ${index + 1}`,
        content: item,
        owner: '共识摘要',
        status: 'done',
        decision: 'consensus',
        nodeKind: 'consensus',
        summary: compressText(item, 45),
      },
    };
  });

  const edges: Edge<CanvasEdgeData>[] = [];
  expertNodes.forEach((node) => {
    edges.push({
      id: `edge_anchor_${node.id}`,
      source: anchorNode.id,
      target: node.id,
      type: 'smoothstep',
      markerEnd: { type: 'arrowclosed' },
      label: '视角输入',
      data: { relation: '视角输入', label: '视角输入' },
    });
    edges.push({
      id: `edge_expert_${node.id}`,
      source: node.id,
      target: relationNode.id,
      type: 'smoothstep',
      markerEnd: { type: 'arrowclosed' },
      label: node.data.expertStance === 'negative' ? '冲突' : '补充',
      data: { relation: node.data.expertStance === 'negative' ? '冲突' : '补充', label: node.data.expertStance === 'negative' ? '冲突' : '补充' },
    });
  });
  edges.push({
    id: 'edge_relation_milestone',
    source: relationNode.id,
    target: milestoneNode.id,
    type: 'smoothstep',
    markerEnd: { type: 'arrowclosed' },
    label: '收敛决策',
    data: { relation: '收敛决策', label: '收敛决策' },
  });
  deliverableNodes.forEach((node, index) => {
    edges.push({
      id: `edge_milestone_deliverable_${index}`,
      source: milestoneNode.id,
      target: node.id,
      type: 'smoothstep',
      markerEnd: { type: 'arrowclosed' },
      label: '成果转化',
      data: { relation: '成果转化', label: '成果转化' },
    });
  });

  return {
    nodes: [anchorNode, ...expertNodes, relationNode, milestoneNode, ...deliverableNodes],
    edges,
  };
};

const RoundtableCanvas = ({
  roomId,
  intentAnchor,
  messages = [],
  roles = [],
  expectedResult = '',
  canvasConsensus = [],
  roundtableStage = 'brief',
  onUpdatedAtChange,
  initialSnapshotData,
  onSnapshotChange,
}: RoundtableCanvasProps) => {
  const storageKey = useMemo(() => `idearound_roundtable_canvas_${roomId || 'default'}`, [roomId]);
  const [initialSnapshot] = useState<CanvasSnapshot>(() => createInitialSnapshot(storageKey, intentAnchor, initialSnapshotData));
  const clientIdRef = useRef(createId('client'));
  const channelRef = useRef<BroadcastChannel | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);
  const reactFlowRef = useRef<ReactFlowInstance<Node<CanvasNodeData>, Edge<CanvasEdgeData>> | null>(null);
  const viewportRef = useRef<Viewport>(initialSnapshot.viewport);
  const syncLockRef = useRef(false);
  const nodesRef = useRef<Node<CanvasNodeData>[]>(initialSnapshot.nodes);
  const edgesRef = useRef<Edge<CanvasEdgeData>[]>(initialSnapshot.edges);

  const [nodes, setNodes] = useState<Node<CanvasNodeData>[]>(initialSnapshot.nodes);
  const [edges, setEdges] = useState<Edge<CanvasEdgeData>[]>(initialSnapshot.edges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [historyPast, setHistoryPast] = useState<CanvasSnapshot[]>([]);
  const [historyFuture, setHistoryFuture] = useState<CanvasSnapshot[]>([]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  useEffect(() => {
    onUpdatedAtChange?.(initialSnapshot.updatedAt);
  }, [initialSnapshot.updatedAt, onUpdatedAtChange]);

  const getSnapshot = useCallback(
    (nextNodes?: Node<CanvasNodeData>[], nextEdges?: Edge<CanvasEdgeData>[], nextViewport?: Viewport): CanvasSnapshot => ({
      nodes: nextNodes ?? nodesRef.current,
      edges: nextEdges ?? edgesRef.current,
      viewport: nextViewport ?? viewportRef.current,
      updatedAt: getNowText(),
    }),
    [],
  );

  const persistSnapshot = useCallback(
    (snapshot: CanvasSnapshot) => {
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
      onUpdatedAtChange?.(snapshot.updatedAt);
      onSnapshotChange?.(snapshot as unknown as Record<string, unknown>);
    },
    [onSnapshotChange, onUpdatedAtChange, storageKey],
  );

  const broadcastSnapshot = useCallback((snapshot: CanvasSnapshot) => {
    if (!channelRef.current) {
      return;
    }
    const msg: BroadcastMessage = {
      senderId: clientIdRef.current,
      snapshot,
    };
    channelRef.current.postMessage(msg);
  }, []);

  const commitGraph = useCallback(
    (
      nextNodes: Node<CanvasNodeData>[],
      nextEdges: Edge<CanvasEdgeData>[],
      options?: { recordHistory?: boolean; broadcast?: boolean; resetFuture?: boolean },
    ) => {
      const prevNodes = nodesRef.current;
      const prevEdges = edgesRef.current;
      if (serializeGraph(prevNodes, prevEdges) === serializeGraph(nextNodes, nextEdges)) {
        return;
      }

      if (options?.recordHistory !== false) {
        const prevSnapshot = getSnapshot(prevNodes, prevEdges);
        setHistoryPast((prev) => [...prev.slice(-59), prevSnapshot]);
      }
      if (options?.resetFuture !== false) {
        setHistoryFuture([]);
      }

      setNodes(nextNodes);
      setEdges(nextEdges);
      nodesRef.current = nextNodes;
      edgesRef.current = nextEdges;

      const snapshot = getSnapshot(nextNodes, nextEdges);
      persistSnapshot(snapshot);

      if (options?.broadcast !== false && !syncLockRef.current) {
        broadcastSnapshot(snapshot);
      }
    },
    [broadcastSnapshot, getSnapshot, persistSnapshot],
  );

  const restoreSnapshot = useCallback(
    (snapshot: CanvasSnapshot, options?: { pushCurrentToFuture?: boolean; broadcast?: boolean }) => {
      const currentSnapshot = getSnapshot();
      if (options?.pushCurrentToFuture) {
        setHistoryFuture((prev) => [...prev.slice(-59), currentSnapshot]);
      }
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      nodesRef.current = snapshot.nodes;
      edgesRef.current = snapshot.edges;
      viewportRef.current = snapshot.viewport;
      persistSnapshot({ ...snapshot, updatedAt: getNowText() });
      reactFlowRef.current?.setViewport(snapshot.viewport, { duration: 150 });
      if (options?.broadcast !== false && !syncLockRef.current) {
        broadcastSnapshot({ ...snapshot, updatedAt: getNowText() });
      }
    },
    [broadcastSnapshot, getSnapshot, persistSnapshot],
  );

  useEffect(() => {
    if (!initialSnapshotData?.nodes || !initialSnapshotData?.edges || !initialSnapshotData?.viewport) {
      return;
    }
    const incoming = initialSnapshotData as unknown as CanvasSnapshot;
    if (serializeGraph(nodesRef.current, edgesRef.current) === serializeGraph(incoming.nodes, incoming.edges)) {
      return;
    }
    const timer = window.setTimeout(() => {
      syncLockRef.current = true;
      restoreSnapshot(incoming, { broadcast: false });
      syncLockRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialSnapshotData, restoreSnapshot]);

  const applyStructuredLayout = useCallback(() => {
    const { nodes: structuredNodes, edges: structuredEdges } = buildStructuredGraph(
      intentAnchor,
      messages,
      roles,
      expectedResult,
      canvasConsensus,
      roundtableStage,
    );
    commitGraph(structuredNodes, structuredEdges, { recordHistory: false, broadcast: true, resetFuture: false });
    reactFlowRef.current?.fitView({ padding: 0.16, duration: 200 });
  }, [canvasConsensus, commitGraph, expectedResult, intentAnchor, messages, roles, roundtableStage]);

  useEffect(() => {
    applyStructuredLayout();
  }, [applyStructuredLayout]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }
    const channel = new BroadcastChannel(`idearound_canvas_channel_${roomId || 'default'}`);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<BroadcastMessage>) => {
      const data = event.data;
      if (!data || data.senderId === clientIdRef.current) {
        return;
      }
      syncLockRef.current = true;
      restoreSnapshot(data.snapshot, { broadcast: false });
      syncLockRef.current = false;
      message.info('已同步其他协作者的画布更新');
    };
    return () => {
      channel.close();
      channelRef.current = null;
    };
  }, [restoreSnapshot, roomId]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== storageKey || !event.newValue) {
        return;
      }
      try {
        const snapshot = JSON.parse(event.newValue) as CanvasSnapshot;
        syncLockRef.current = true;
        restoreSnapshot(snapshot, { broadcast: false });
      } catch {
        syncLockRef.current = false;
        return;
      }
      syncLockRef.current = false;
    };
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('storage', onStorage);
    };
  }, [restoreSnapshot, storageKey]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<CanvasNodeData>>[]) => {
      const nextNodes = applyNodeChanges(changes, nodesRef.current);
      commitGraph(nextNodes, edgesRef.current);
      const selectedNode = nextNodes.find((node) => node.selected);
      setSelectedNodeId(selectedNode?.id ?? null);
    },
    [commitGraph],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge<CanvasEdgeData>>[]) => {
      const nextEdges = applyEdgeChanges(changes, edgesRef.current);
      commitGraph(nodesRef.current, nextEdges);
      const selectedEdge = nextEdges.find((edge) => edge.selected);
      setSelectedEdgeId(selectedEdge?.id ?? null);
    },
    [commitGraph],
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      const nextEdges = addEdge<Edge<CanvasEdgeData>>(
        {
          ...connection,
          id: createId('edge'),
          type: 'smoothstep',
          markerEnd: { type: 'arrowclosed' },
          label: '支持',
          data: { label: '支持', relation: '支持' },
        },
        edgesRef.current,
      );
      commitGraph(nodesRef.current, nextEdges);
    },
    [commitGraph],
  );

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId) ?? null,
    [edges, selectedEdgeId],
  );

  const updateSelectedNode = useCallback(
    (patch: Partial<CanvasNodeData>) => {
      if (!selectedNodeId) {
        return;
      }
      const nextNodes = nodesRef.current.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                ...patch,
              },
            }
          : node,
      );
      commitGraph(nextNodes, edgesRef.current);
    },
    [commitGraph, selectedNodeId],
  );

  const updateSelectedEdge = useCallback(
    (patch: Partial<CanvasEdgeData>) => {
      if (!selectedEdgeId) {
        return;
      }
      const nextEdges = edgesRef.current.map((edge) => {
        if (edge.id !== selectedEdgeId) {
          return edge;
        }
        const label = patch.label ?? edge.data?.label ?? edge.label?.toString() ?? '';
        return {
          ...edge,
          data: {
            label,
            relation: patch.relation ?? edge.data?.relation ?? '',
          },
          label,
        };
      });
      commitGraph(nodesRef.current, nextEdges);
    },
    [commitGraph, selectedEdgeId],
  );

  const removeSelected = useCallback(() => {
    const nextNodes = nodesRef.current.filter((node) => !node.selected);
    const selectedNodeIds = new Set(nodesRef.current.filter((node) => node.selected).map((node) => node.id));
    const nextEdges = edgesRef.current.filter(
      (edge) => !edge.selected && !selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target),
    );
    commitGraph(nextNodes, nextEdges);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, [commitGraph]);

  const undo = useCallback(() => {
    if (historyPast.length === 0) {
      return;
    }
    const target = historyPast[historyPast.length - 1];
    const current = getSnapshot();
    setHistoryPast((prev) => prev.slice(0, -1));
    setHistoryFuture((prev) => [...prev.slice(-59), current]);
    restoreSnapshot(target, { broadcast: true });
  }, [getSnapshot, historyPast, restoreSnapshot]);

  const redo = useCallback(() => {
    if (historyFuture.length === 0) {
      return;
    }
    const target = historyFuture[historyFuture.length - 1];
    const current = getSnapshot();
    setHistoryFuture((prev) => prev.slice(0, -1));
    setHistoryPast((prev) => [...prev.slice(-59), current]);
    restoreSnapshot(target, { broadcast: true });
  }, [getSnapshot, historyFuture, restoreSnapshot]);

  const exportPng = useCallback(async () => {
    if (!canvasWrapperRef.current) {
      return;
    }
    const dataUrl = await toPng(canvasWrapperRef.current, {
      pixelRatio: 2,
      backgroundColor: '#f7f8fa',
    });
    downloadData(dataUrl, `roundtable-canvas-${roomId || 'default'}.png`);
    message.success('PNG 导出完成');
  }, [roomId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;
      if (isMod && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if ((isMod && event.key.toLowerCase() === 'y') || (isMod && event.shiftKey && event.key.toLowerCase() === 'z')) {
        event.preventDefault();
        redo();
      } else if (isMod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        const snapshot = getSnapshot();
        persistSnapshot(snapshot);
        broadcastSnapshot(snapshot);
        message.success('画布已保存');
      } else if (isMod && event.key.toLowerCase() === 'e') {
        event.preventDefault();
        void exportPng();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        removeSelected();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [broadcastSnapshot, exportPng, getSnapshot, persistSnapshot, redo, removeSelected, undo]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', height: '100%', minHeight: 0 }}>
      <Card size="small" bodyStyle={{ padding: '8px 12px' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <Space>
            <Tag color="blue">结构图模式</Tag>
            <Text type="secondary">自动按“锚点 → 专家观点 → 关系网络 → 收敛决策”组织</Text>
          </Space>
          <Space>
            <Button icon={<UndoOutlined />} onClick={undo} disabled={historyPast.length === 0}>
              撤销
            </Button>
            <Button icon={<RedoOutlined />} onClick={redo} disabled={historyFuture.length === 0}>
              重做
            </Button>
            <Button onClick={applyStructuredLayout}>一键结构化</Button>
            <Button
              icon={<SaveOutlined />}
              onClick={() => {
                const snapshot = getSnapshot();
                persistSnapshot(snapshot);
                broadcastSnapshot(snapshot);
                message.success('已保存');
              }}
            >
              保存
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => void exportPng()}>
              导出PNG
            </Button>
          </Space>
        </Space>
      </Card>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
        <div
          ref={canvasWrapperRef}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 8,
            overflow: 'hidden',
            background: 'linear-gradient(180deg, #f7f8fa 0%, #f0f5ff 100%)',
          }}
        >
          <ReactFlow<Node<CanvasNodeData>, Edge<CanvasEdgeData>>
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onInit={(instance) => {
              reactFlowRef.current = instance;
              instance.setViewport(viewportRef.current);
            }}
            onMoveEnd={(_, viewport) => {
              viewportRef.current = viewport;
            }}
            fitView
            minZoom={0.2}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'smoothstep',
              animated: true,
              style: { strokeWidth: 2 },
            }}
          >
            <Background gap={16} size={1} color="#d9d9d9" />
            <MiniMap
              zoomable
              pannable
              nodeColor={(node) => {
                const data = node.data as CanvasNodeData;
                if (data.expertStance) return STANCE_COLORS[data.expertStance];
                return NODE_KIND_META[data.nodeKind]?.color ?? '#1677ff';
              }}
              maskColor="rgba(0,0,0,0.1)"
            />
            <Controls />
          </ReactFlow>
        </div>
      </div>

      <Card size="small" style={{ width: 260, flexShrink: 0, minHeight: 0, overflow: 'auto' }}>
        <Space direction="vertical" size={10} style={{ width: '100%' }}>
          <Title level={5} style={{ margin: 0 }}>
            属性编辑
          </Title>
          {!selectedNode && !selectedEdge && <Text type="secondary" style={{ fontSize: 11 }}>点击节点/连线编辑</Text>}
          {selectedNode && (
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Input
                size="small"
                value={selectedNode.data.title}
                onChange={(event) => updateSelectedNode({ title: event.target.value })}
                placeholder="标题"
              />
              <Input.TextArea
                size="small"
                rows={20}
                value={selectedNode.data.content}
                onChange={(event) => updateSelectedNode({ content: event.target.value })}
                placeholder="内容"
              />
              <Select<NodeStatus>
                size="small"
                value={selectedNode.data.status}
                options={STATUS_OPTIONS}
                onChange={(value) => updateSelectedNode({ status: value })}
              />
              {(selectedNode.data.nodeKind === 'milestone' || selectedNode.data.nodeKind === 'consensus') && (
                <Select<ConsensusDecision>
                  size="small"
                  value={selectedNode.data.decision}
                  options={DECISION_OPTIONS}
                  onChange={(value) => updateSelectedNode({ decision: value })}
                />
              )}
              {selectedNode.data.nodeKind === 'expert' && (
                <div>
                  <Text type="secondary" style={{ fontSize: 10 }}>原始消息ID:</Text>
                  <Text style={{ fontSize: 10 }}>{selectedNode.data.originalMessageId?.slice(0, 12) || '-'}</Text>
                </div>
              )}
            </Space>
          )}
          {selectedEdge && (
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
              <Select
                size="small"
                value={selectedEdge.data?.relation ?? '支持'}
                options={RELATION_OPTIONS.map((item) => ({ label: item, value: item }))}
                onChange={(value) => updateSelectedEdge({ relation: value, label: value })}
              />
              <Input
                size="small"
                value={selectedEdge.data?.label ?? selectedEdge.label?.toString() ?? ''}
                onChange={(event) => updateSelectedEdge({ label: event.target.value })}
                placeholder="连线标签"
              />
            </Space>
          )}
        </Space>
      </Card>
      </div>
    </div>
  );
};

export default RoundtableCanvas;
