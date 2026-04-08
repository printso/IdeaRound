import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OnConnect } from '@xyflow/react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Card, Input, Select, Space, Tag, Typography, message } from 'antd';
import { DownloadOutlined, RedoOutlined, SaveOutlined, UndoOutlined } from '@ant-design/icons';
import { toPng } from 'html-to-image';

import type {
  CanvasEdgeData,
  CanvasNodeData,
  CanvasSnapshot,
  BroadcastMessage,
  RoundtableCanvasProps,
} from './canvas/types';
import { nodeTypes } from './canvas/nodes';
import { NODE_KIND_META, RELATION_OPTIONS, STATUS_OPTIONS, DECISION_OPTIONS, STANCE_COLORS } from './canvas/constants';
import type { NodeStatus, ConsensusDecision } from './canvas/types';
import { createId, getNowText, downloadData } from './canvas/utils';
import {
  createInitialSnapshot,
  buildStructuredGraph,
  serializeGraph,
} from './canvas/graphBuilder';

const { Text, Title } = Typography;

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
