import type { Edge, Node, Viewport } from '@xyflow/react';

export type NodeKind = 'anchor' | 'expert' | 'relation' | 'milestone' | 'cognitive' | 'sandbox' | 'consensus';
export type NodeStatus = 'todo' | 'doing' | 'done';
export type ConsensusDecision = 'pending' | 'consensus' | 'dispute';
export type ExpertStance = 'positive' | 'negative' | 'neutral' | 'review';

export type CanvasNodeData = {
  title: string;
  content: string;
  owner: string;
  status: NodeStatus;
  decision: ConsensusDecision;
  nodeKind: NodeKind;
  expertRole?: string;
  expertAvatar?: string;
  expertStance?: ExpertStance;
  originalMessageId?: string;
  thoughtChain?: string;
  summary?: string;
};

export type CanvasEdgeData = {
  label: string;
  relation: string;
};

export type CanvasSnapshot = {
  nodes: Node<CanvasNodeData>[];
  edges: Edge<CanvasEdgeData>[];
  viewport: Viewport;
  updatedAt: string;
};

export type BroadcastMessage = {
  senderId: string;
  snapshot: CanvasSnapshot;
};

export type MessageItem = {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerType: 'user' | 'agent';
  content: string;
  streaming?: boolean;
  createdAt: string;
};

export type RoleMember = {
  id: string;
  name: string;
  stance: '建设' | '对抗' | '中立' | '评审';
  desc: string;
  selected: boolean;
};

export type RoundtableCanvasProps = {
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
