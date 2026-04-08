import { Handle, Position } from '@xyflow/react';
import type { NodeProps, Node } from '@xyflow/react';
import { Space, Tag, Typography } from 'antd';
import { NODE_KIND_META, STANCE_COLORS, STATUS_OPTIONS, DECISION_OPTIONS } from './constants';
import type { CanvasNodeData } from './types';
import { compressText } from './utils';

const { Text } = Typography;

export const ExpertNodeCard = ({ data, selected }: NodeProps<Node<CanvasNodeData>>) => {
  const meta = NODE_KIND_META.expert;
  const stanceColor = data.expertStance ? STANCE_COLORS[data.expertStance] : meta.color;
  const statusColor = data.status === 'done' ? 'green' : data.status === 'doing' ? 'processing' : 'default';
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
      <div style={{ padding: 10 }}>
        <Text style={{ fontSize: 13, lineHeight: 1.5 }}>{summary}</Text>
      </div>
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

export const AnchorNodeCard = ({ data, selected }: NodeProps<Node<CanvasNodeData>>) => {
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

export const MilestoneNodeCard = ({ data, selected }: NodeProps<Node<CanvasNodeData>>) => {
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

export const RelationNodeCard = ({ data, selected }: NodeProps<Node<CanvasNodeData>>) => {
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

export const RoundtableNodeCard = ({ data, selected }: NodeProps<Node<CanvasNodeData>>) => {
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

export const nodeTypes = {
  roundtableNode: RoundtableNodeCard,
  expert: ExpertNodeCard,
  anchor: AnchorNodeCard,
  milestone: MilestoneNodeCard,
  relation: RelationNodeCard,
};
