// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { useCallback, useState } from 'react';
import { message } from 'antd';
import {
  createWorkspace,
  listWorkspaces,
  updateWorkspace,
  deleteWorkspace,
  type WorkspaceData,
} from '../api/workspace';
import { useAuth } from '../contexts/AuthContext';

export type StepKey = 'roundtable' | 'roles' | 'roundtable_view' | 'consensus_summary' | 'canvas_view';

export type RoundtableRoom = {
  id: string;
  name: string;
  createdAt: string;
};

export type IntentCardState = {
  coreGoal: string;
  constraints: string;
  painPoints: string;
};

export type RoleMember = {
  id: string;
  name: string;
  stance: '建设' | '对抗' | '中立' | '评审';
  desc: string;
  selected: boolean;
  soulConfig?: string;
};

export type RoundtableStage = 'brief' | 'final';

export type JudgeState = {
  score: number;
  reason: string;
  reached: boolean;
  consensusCount: number;
  resolvedPainPoints: number;
  nextFocus: string;
  updatedAt?: string;
};

export type BoardDispute = {
  topic: string;
  pro: string;
  con: string;
};

export type ConsensusBoardState = {
  summary: string;
  consensus: string[];
  disputes: BoardDispute[];
  nextQuestions: string[];
  updatedAt?: string;
};

export type MessageSummaryMetrics = {
  duration_ms?: number;
  summary_length?: number;
  semantic_consistency?: number;
  source?: string;
  generated_at?: string;
  meets_rt_target?: boolean;
};

export type RoundtableMessage = {
  id: string;
  speakerId: string;
  speakerName: string;
  speakerType: 'user' | 'agent';
  content: string;
  summary?: string;
  summaryMetrics?: MessageSummaryMetrics | null;
  summaryStatus?: 'idle' | 'loading' | 'ready' | 'failed';
  streaming?: boolean;
  createdAt: string;
};

export const normalizeSummaryMetrics = (value: unknown): MessageSummaryMetrics | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as Record<string, unknown>;
  return {
    duration_ms: typeof item.duration_ms === 'number' ? item.duration_ms : undefined,
    summary_length: typeof item.summary_length === 'number' ? item.summary_length : undefined,
    semantic_consistency: typeof item.semantic_consistency === 'number' ? item.semantic_consistency : undefined,
    source: typeof item.source === 'string' ? item.source : undefined,
    generated_at: typeof item.generated_at === 'string' ? item.generated_at : undefined,
    meets_rt_target: typeof item.meets_rt_target === 'boolean' ? item.meets_rt_target : undefined,
  };
};

export const normalizeRoundtableMessage = (msg: Record<string, unknown>): RoundtableMessage => ({
  id: String(msg.id || ''),
  speakerId: String(msg.speaker_id || msg.speakerId || ''),
  speakerName: String(msg.speaker_name || msg.speakerName || ''),
  speakerType: (msg.speaker_type || msg.speakerType || 'agent') as 'user' | 'agent',
  content: String(msg.content || ''),
  summary: typeof msg.summary === 'string' ? msg.summary : undefined,
  summaryMetrics: normalizeSummaryMetrics(msg.summary_metrics || msg.summaryMetrics),
  summaryStatus: typeof msg.summary === 'string' && msg.summary.trim() ? 'ready' : 'idle',
  streaming: Boolean(msg.streaming),
  createdAt: String(msg.created_at || msg.createdAt || ''),
});

export function useWorkspace() {
  const { isAuthenticated } = useAuth();

  const [step, setStep] = useState<StepKey>('roundtable');
  const [roomId, setRoomId] = useState('');
  const [roomReady, setRoomReady] = useState(false);
  const [roundtableRooms, setRoundtableRooms] = useState<RoundtableRoom[]>([]);
  const [backendWorkspaceIds, setBackendWorkspaceIds] = useState<Set<string>>(new Set());

  const [initialDemand, setInitialDemand] = useState('');
  const [intentCard, setIntentCard] = useState<IntentCardState>({ coreGoal: '', constraints: '', painPoints: '' });
  const [intentReady, setIntentReady] = useState(false);

  const [roles, setRoles] = useState<RoleMember[]>([]);
  const [rolesReady, setRolesReady] = useState(false);

  const [systemPrompt, setSystemPrompt] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<number | undefined>();

  const [messages, setMessages] = useState<RoundtableMessage[]>([]);
  const [roundtableStage, setRoundtableStage] = useState<RoundtableStage>('brief');
  const [maxDialogueRounds, setMaxDialogueRounds] = useState<number>(6);
  const [autoRoundCount, setAutoRoundCount] = useState<number>(0);

  const [judgeState, setJudgeState] = useState<JudgeState>({
    score: 0,
    reason: '',
    reached: false,
    consensusCount: 0,
    resolvedPainPoints: 0,
    nextFocus: '',
  });
  const [consensusBoard, setConsensusBoard] = useState<ConsensusBoardState>({
    summary: '',
    consensus: [],
    disputes: [],
    nextQuestions: [],
  });

  const [canvasConsensus, setCanvasConsensus] = useState<string[]>([]);
  const [canvasDisputes, setCanvasDisputes] = useState<string[]>([]);
  const [canvasUpdatedAt, setCanvasUpdatedAt] = useState('');
  const [canvasSnapshot, setCanvasSnapshot] = useState<Record<string, unknown> | null>(null);

  const loadWorkspaceData = useCallback((data: WorkspaceData) => {
    setStep((data.step as StepKey) || 'roundtable');
    setInitialDemand(data.initial_demand || '');
    if (data.intent_card) setIntentCard(data.intent_card);
    setIntentReady(!!data.intent_ready);
    
    if (data.roles) {
      setRoles(data.roles.map(role => ({
        id: role.id,
        name: role.name,
        stance: role.stance as '建设' | '对抗' | '中立' | '评审',
        desc: role.desc,
        selected: !!role.selected,
        soulConfig: role.soul_config || role.soulConfig,
      })));
    }
    setRolesReady(!!data.roles_ready);
    setRoomReady(!!data.room_ready);
    setRoomId(data.room_id || '');
    setSystemPrompt(data.system_prompt || '');
    
    if (data.messages) {
      setMessages(data.messages.map(msg => normalizeRoundtableMessage(msg as unknown as Record<string, unknown>)));
    }
    
    setCanvasConsensus(data.canvas_consensus || []);
    setCanvasDisputes(data.canvas_disputes || []);
    setCanvasUpdatedAt(data.canvas_updated_at || '');
    setRoundtableStage((data.roundtable_stage as RoundtableStage) || 'brief');
    setSelectedModelId(data.selected_model_id);
    setExpectedResult(data.expected_result || '');
    setMaxDialogueRounds(data.max_dialogue_rounds || 6);
    setAutoRoundCount(data.auto_round_count || 0);
    
    if (data.judge_state) {
      setJudgeState({
        score: data.judge_state.score || 0,
        reason: data.judge_state.reason || '',
        reached: !!data.judge_state.reached,
        consensusCount: data.judge_state.consensusCount || 0,
        resolvedPainPoints: data.judge_state.resolvedPainPoints || 0,
        nextFocus: data.judge_state.nextFocus || '',
        updatedAt: data.judge_state.updated_at,
      });
    }
    
    if (data.consensus_board) {
      setConsensusBoard({
        summary: data.consensus_board.summary || '',
        consensus: data.consensus_board.consensus || [],
        disputes: data.consensus_board.disputes || [],
        nextQuestions: data.consensus_board.nextQuestions || [],
        updatedAt: data.consensus_board.updated_at,
      });
    }
    
    setCanvasSnapshot((data.canvas_snapshot as Record<string, unknown>) || null);
  }, []);

  const loadWorkspaces = useCallback(async () => {
    if (!isAuthenticated) return null;

    try {
      const workspaces = await listWorkspaces();
      if (workspaces.length > 0) {
        const rooms = workspaces.map(ws => ({
          id: ws.room_id || ws.data.room_id,
          name: ws.data.room_name || ws.room_id,
          createdAt: ws.updated_at || ws.created_at,
        }));
        setRoundtableRooms(rooms);
        setBackendWorkspaceIds(new Set(rooms.map((item) => item.id)));

        const latestWorkspace = workspaces[0];
        loadWorkspaceData(latestWorkspace.data);
        return latestWorkspace.data.room_id;
      } else {
        setBackendWorkspaceIds(new Set());
      }
    } catch (error) {
      console.error('加载工作台列表失败:', error);
    }
    return null;
  }, [isAuthenticated, loadWorkspaceData]);

  const saveWorkspaceToBackend = useCallback(async () => {
    if (!isAuthenticated || !roomId) return;

    try {
      const workspaceData: WorkspaceData = {
        room_id: roomId,
        room_name: roundtableRooms.find(r => r.id === roomId)?.name || `圆桌空间-${new Date().toLocaleString()}`,
        step,
        initial_demand: initialDemand,
        intent_card: intentCard,
        intent_ready: intentReady,
        roles: roles.map(role => ({
          id: role.id,
          name: role.name,
          stance: role.stance,
          desc: role.desc,
          selected: role.selected,
          soul_config: role.soulConfig,
        })),
        roles_ready: rolesReady,
        room_ready: roomReady,
        system_prompt: systemPrompt,
        messages: messages.map(msg => ({
          id: msg.id,
          speaker_id: msg.speakerId,
          speaker_name: msg.speakerName,
          speaker_type: msg.speakerType,
          content: msg.content,
          summary: msg.summary,
          summary_metrics: msg.summaryMetrics,
          streaming: msg.streaming,
          created_at: msg.createdAt,
        })),
        canvas_consensus: canvasConsensus,
        canvas_disputes: canvasDisputes,
        canvas_updated_at: canvasUpdatedAt,
        roundtable_stage: roundtableStage,
        selected_model_id: selectedModelId,
        expected_result: expectedResult,
        max_dialogue_rounds: maxDialogueRounds,
        auto_round_count: autoRoundCount,
        judge_state: {
          score: judgeState.score,
          reason: judgeState.reason,
          reached: judgeState.reached,
          consensusCount: judgeState.consensusCount,
          resolvedPainPoints: judgeState.resolvedPainPoints,
          nextFocus: judgeState.nextFocus,
          updated_at: judgeState.updatedAt,
        },
        consensus_board: {
          summary: consensusBoard.summary,
          consensus: consensusBoard.consensus,
          disputes: consensusBoard.disputes,
          nextQuestions: consensusBoard.nextQuestions,
          updated_at: consensusBoard.updatedAt,
        },
        canvas_snapshot: canvasSnapshot,
      };

      if (backendWorkspaceIds.has(roomId)) {
        try {
          await updateWorkspace(roomId, workspaceData);
        } catch {
          await createWorkspace(workspaceData);
        }
      } else {
        await createWorkspace(workspaceData);
      }
      setBackendWorkspaceIds((prev) => {
        const next = new Set(prev);
        next.add(roomId);
        return next;
      });
    } catch (error) {
      console.error('保存工作台到后端失败:', error);
    }
  }, [
    isAuthenticated, roomId, roundtableRooms, step, initialDemand, intentCard, intentReady,
    roles, rolesReady, roomReady, systemPrompt, messages, canvasConsensus, canvasDisputes,
    canvasUpdatedAt, roundtableStage, selectedModelId, expectedResult, maxDialogueRounds,
    autoRoundCount, judgeState, consensusBoard, canvasSnapshot, backendWorkspaceIds
  ]);

  const removeWorkspace = useCallback(async (id: string) => {
    try {
      await deleteWorkspace(id);
      message.success('已删除');
      
      setRoundtableRooms(prev => prev.filter(r => r.id !== id));
      setBackendWorkspaceIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      
      if (roomId === id) {
        // 重置状态
        setRoomId('');
        setStep('roundtable');
        setInitialDemand('');
        setIntentCard({ coreGoal: '', constraints: '', painPoints: '' });
        setIntentReady(false);
        setRoles([]);
        setRolesReady(false);
        setRoomReady(false);
        setMessages([]);
        setCanvasConsensus([]);
        setCanvasDisputes([]);
        setExpectedResult('');
      }
    } catch (error) {
      console.error('删除工作台失败:', error);
      message.error('删除失败');
    }
  }, [roomId]);

  return {
    state: {
      step, setStep,
      roomId, setRoomId,
      roomReady, setRoomReady,
      roundtableRooms, setRoundtableRooms,
      initialDemand, setInitialDemand,
      intentCard, setIntentCard,
      intentReady, setIntentReady,
      roles, setRoles,
      rolesReady, setRolesReady,
      systemPrompt, setSystemPrompt,
      expectedResult, setExpectedResult,
      selectedModelId, setSelectedModelId,
      messages, setMessages,
      roundtableStage, setRoundtableStage,
      maxDialogueRounds, setMaxDialogueRounds,
      autoRoundCount, setAutoRoundCount,
      judgeState, setJudgeState,
      consensusBoard, setConsensusBoard,
      canvasConsensus, setCanvasConsensus,
      canvasDisputes, setCanvasDisputes,
      canvasUpdatedAt, setCanvasUpdatedAt,
      canvasSnapshot, setCanvasSnapshot,
    },
    actions: {
      loadWorkspaces,
      loadWorkspaceData,
      saveWorkspaceToBackend,
      removeWorkspace,
    }
  };
}
