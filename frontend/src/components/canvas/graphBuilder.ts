import type { Edge, Node } from '@xyflow/react';
import type { CanvasEdgeData, CanvasNodeData, CanvasSnapshot, MessageItem, NodeKind, RoleMember } from './types';
import { NODE_KIND_META } from './constants';
import { createId, getNowText, getStanceColor, toNodeSafeId, compressText, extractDeliverableFindings } from './utils';


export const serializeGraph = (nodes: Node<CanvasNodeData>[], edges: Edge<CanvasEdgeData>[]) =>
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

export const buildNode = (kind: NodeKind, position: { x: number; y: number }, seed?: Partial<CanvasNodeData>): Node<CanvasNodeData> => ({
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
    ...seed,
  },
});

export const buildStarterNodes = (topic: string): Node<CanvasNodeData>[] => {
  const anchor = (topic ?? '').trim() || '议题待补充';
  return [
    buildNode('anchor', { x: 280, y: 30 }, { title: '核心议题', content: anchor, status: 'done' }),
    buildNode('expert', { x: 30, y: 180 }, { title: '专家观点区域', content: '等待圆桌讨论生成专家观点节点', status: 'todo' }),
    buildNode('relation', { x: 280, y: 180 }, { title: '观点关系网络', content: '显示观点之间的反驳、补充、派生关系', status: 'todo' }),
    buildNode('milestone', { x: 280, y: 350 }, { title: '决策收敛', content: '已达成共识的结论', decision: 'pending', status: 'todo' }),
  ];
};

export const createInitialSnapshot = (
  storageKey: string,
  topic: string,
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
      const starterNodes = buildStarterNodes(topic);
      return {
        nodes: starterNodes,
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
        updatedAt: getNowText(),
      };
    }
  }
  const starterNodes = buildStarterNodes(topic);
  const starterSnapshot: CanvasSnapshot = {
    nodes: starterNodes,
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    updatedAt: getNowText(),
  };
  localStorage.setItem(storageKey, JSON.stringify(starterSnapshot));
  return starterSnapshot;
};

export const buildStructuredGraph = (
  topic: string,
  messages: MessageItem[],
  roles: RoleMember[],
  expectedResult: string,
  canvasConsensus: string[],
  roundtableStage: 'brief' | 'final',
): { nodes: Node<CanvasNodeData>[]; edges: Edge<CanvasEdgeData>[] } => {
  const anchorText = (topic ?? '').trim() || '议题待补充';
  const anchorNode: Node<CanvasNodeData> = {
    id: 'anchor_main',
    type: 'anchor',
    position: { x: 460, y: 30 },
    data: {
      title: '核心议题',
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
    topic,
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
  const deliverableNodes: Node<CanvasNodeData>[] = deliverableFindings.map((item: string, index: number) => {
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
