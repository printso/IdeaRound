import {
  Avatar,
  Button,
  Card,
  Col,
  Divider,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  List,
  Row,
  Space,
  Switch,
  Select,
  Tag,
  Typography,
  message,
  Modal,
  Progress,
  Tooltip,
} from 'antd';
import { RedoOutlined, PlusOutlined, AppstoreAddOutlined } from '@ant-design/icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getLLMConfigs, streamChatByLLMConfig } from '../api/llm';
import type { LLMConfig } from '../api/llm';
import AppHeader from '../components/AppHeader';
import RoundtableCanvas from '../components/RoundtableCanvas';
import MaterialUploader from '../components/MaterialUploader';
import MaterialIntentSynthesis from '../components/MaterialIntentSynthesis';
import type { MaterialInfo } from '../api/material';
import ConsensusSummary from '../components/ConsensusSummary';
import {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  type WorkspaceData,
} from '../api/workspace';
import {
  cancelRuntimeTask,
  getRoomRuntimeSnapshot,
  startRoundtableRun,
  streamRuntimeTask,
  trackRuntimeEvent,
} from '../api/runtime';
import { useAuth } from '../contexts/AuthContext';

const { Sider, Content, Footer } = Layout;
const { Paragraph, Text } = Typography;

type IntentCardState = {
  coreGoal: string;
  constraints: string;
  painPoints: string;
};

type StepKey = 'roundtable' | 'roles' | 'roundtable_view' | 'consensus_summary' | 'canvas_view';

type RoundtableRoom = {
  id: string;
  name: string;
  createdAt: string;
};

type RoundtableStage = 'brief' | 'final';

type JudgeState = {
  score: number;
  reason: string;
  reached: boolean;
  consensusCount: number;
  resolvedPainPoints: number;
  nextFocus: string;
  updatedAt?: string;
};

type BoardDispute = {
  topic: string;
  pro: string;
  con: string;
};

type ConsensusBoardState = {
  summary: string;
  consensus: string[];
  disputes: BoardDispute[];
  nextQuestions: string[];
  updatedAt?: string;
};

type ProbeOption = {
  id: string;
  label: string;
};

type ProbeQuestion = {
  id: string;
  question: string;
  options: ProbeOption[];
};

type ProbeTurn = {
  id: string;
  role: 'user' | 'system';
  content: string;
};

type RoleMember = {
  id: string;
  name: string;
  stance: '建设' | '对抗' | '中立' | '评审';
  desc: string;
  selected: boolean;
  soulConfig?: string;  // 灵魂配置长文本
};

function Home() {
  const { isAuthenticated } = useAuth();

  // 添加自定义样式用于列表项hover效果和菜单
  const listItemStyle = `
    .roundtable-list-item {
      transition: all 0.2s ease-in-out;
    }
    .roundtable-list-item:hover {
      background: #fafafa !important;
      border-color: #d9d9d9 !important;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08) !important;
      transform: translateY(-1px);
    }
    .roundtable-list-item.selected:hover {
      background: linear-gradient(135deg, #e6f4ff 0%, #d4ebff 100%) !important;
      border-color: #91caff !important;
      boxShadow: 0 4px 12px rgba(22, 119, 255, 0.16) !important;
      transform: translateY(-1px);
    }
    /* 自定义下拉菜单样式 */
    .roundtable-settings-menu .ant-dropdown-menu {
      border-radius: 8px;
      box-shadow: 0 3px 12px rgba(0, 0, 0, 0.12);
      border: 1px solid #f0f0f0;
      padding: 4px 0;
    }
    .roundtable-settings-menu .ant-dropdown-menu-item {
      padding: 8px 12px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .roundtable-settings-menu .ant-dropdown-menu-item:hover {
      background-color: #f5f5f5;
    }
    .roundtable-settings-menu .ant-dropdown-menu-item-danger {
      color: #ff4d4f;
    }
    .roundtable-settings-menu .ant-dropdown-menu-item-danger:hover {
      background-color: #fff2f0;
    }
    /* 三点按钮悬停效果 */
    .roundtable-settings-button {
      opacity: 0.7;
    }
    .roundtable-list-item:hover .roundtable-settings-button,
    .roundtable-settings-button:hover {
      opacity: 1;
      background-color: rgba(0, 0, 0, 0.04);
      color: #1677ff !important;
    }
    .roundtable-list-item.selected .roundtable-settings-button:hover {
      background-color: rgba(22, 119, 255, 0.1);
    }
  `;

  // localStorage key
  const STORAGE_KEY = 'idearound_workspace';

  // 从 localStorage 加载保存的状态（作为 fallback）
  const loadSavedState = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('加载保存的状态失败:', e);
    }
    return null;
  };

  const savedState = loadSavedState();

  const [models, setModels] = useState<LLMConfig[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<number | undefined>(savedState?.selectedModelId || undefined);
  const [step, setStep] = useState<StepKey>(savedState?.step || 'roundtable');
  const [initialDemand, setInitialDemand] = useState(savedState?.initialDemand || '');
  const [probeQuestions, setProbeQuestions] = useState<ProbeQuestion[]>([]);
  const [probeTurns, setProbeTurns] = useState<ProbeTurn[]>([]);
  const [intentCard, setIntentCard] = useState<IntentCardState>(savedState?.intentCard || {
    coreGoal: '',
    constraints: '',
    painPoints: '',
  });
  const [intentReady, setIntentReady] = useState(savedState?.intentReady || false);
  const [roles, setRoles] = useState<RoleMember[]>(savedState?.roles || []);
  const [rolesReady, setRolesReady] = useState(savedState?.rolesReady || false);
  const [roleTemplates, setRoleTemplates] = useState<{id: number; name: string; stance: string; description?: string; soul_config?: string; is_active?: boolean; is_default?: boolean; skill_tags?: string[]; category?: string}[]>([]);
  const [scenarioTemplates, setScenarioTemplates] = useState<{id: number; name: string; description?: string; preset_roles: number[]; system_prompt_override?: string; is_active: boolean}[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<Record<string, string>>({});
  const [roomReady, setRoomReady] = useState(savedState?.roomReady || false);
  const [roomId, setRoomId] = useState(savedState?.roomId || '');
  const [autoBrainstorm, setAutoBrainstorm] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState(savedState?.systemPrompt || '');
  const [userPrompt, setUserPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<
    {
      id: string;
      speakerId: string;
      speakerName: string;
      speakerType: 'user' | 'agent';
      content: string;
      streaming?: boolean;
      createdAt: string;
    }[]
  >(savedState?.messages || []);
  const [canvasConsensus, setCanvasConsensus] = useState<string[]>(savedState?.canvasConsensus || []);
  const [canvasDisputes, setCanvasDisputes] = useState<string[]>(savedState?.canvasDisputes || []);
  const [canvasUpdatedAt, setCanvasUpdatedAt] = useState(savedState?.canvasUpdatedAt || '');
  const [roundtableRooms, setRoundtableRooms] = useState<RoundtableRoom[]>(savedState?.roundtableRooms || []);
  const [backendWorkspaceIds, setBackendWorkspaceIds] = useState<Set<string>>(new Set());
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roundtableStage, setRoundtableStage] = useState<RoundtableStage>(savedState?.roundtableStage || 'brief');
  const [pendingRoundtableRun, setPendingRoundtableRun] = useState<{ roomId: string; text: string; stage: RoundtableStage; trigger?: 'user' | 'host'; systemPrompt?: string } | null>(null);
  const [expectedResult, setExpectedResult] = useState(savedState?.expectedResult || '');
  const [uploadedMaterials, setUploadedMaterials] = useState<MaterialInfo[]>([]);
  const [preUploadRoomId] = useState<string>(`pre_${Date.now().toString(36)}`);
  const [generatingExpectedResult, setGeneratingExpectedResult] = useState(false);
  const [maxDialogueRounds, setMaxDialogueRounds] = useState<number>(savedState?.maxDialogueRounds || 6);
  const [autoRoundCount, setAutoRoundCount] = useState<number>(savedState?.autoRoundCount || 0);
  const [autoConversationEnabled, setAutoConversationEnabled] = useState(true);
  const [judgeScore, setJudgeScore] = useState<number>(savedState?.judgeState?.score || 0);
  const [judgeReason, setJudgeReason] = useState<string>(savedState?.judgeState?.reason || '');
  const [judgeState, setJudgeState] = useState<JudgeState>({
    score: savedState?.judgeState?.score || 0,
    reason: savedState?.judgeState?.reason || '',
    reached: savedState?.judgeState?.reached || false,
    consensusCount: savedState?.judgeState?.consensusCount || 0,
    resolvedPainPoints: savedState?.judgeState?.resolvedPainPoints || 0,
    nextFocus: savedState?.judgeState?.nextFocus || '',
    updatedAt: savedState?.judgeState?.updatedAt,
  });
  const [consensusBoard, setConsensusBoard] = useState<ConsensusBoardState>({
    summary: savedState?.consensusBoard?.summary || '',
    consensus: savedState?.consensusBoard?.consensus || [],
    disputes: savedState?.consensusBoard?.disputes || [],
    nextQuestions: savedState?.consensusBoard?.nextQuestions || [],
    updatedAt: savedState?.consensusBoard?.updatedAt,
  });
  const [canvasSnapshot, setCanvasSnapshot] = useState<Record<string, unknown> | null>(savedState?.canvasSnapshot || null);
  const [runtimePendingTasks, setRuntimePendingTasks] = useState(0);
  const [customProbeOptions, setCustomProbeOptions] = useState<Record<string, string>>({});
  const [editingSoulConfigRole, setEditingSoulConfigRole] = useState<RoleMember | null>(null);
  const [editingSoulConfigText, setEditingSoulConfigText] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [addRoleModalVisible, setAddRoleModalVisible] = useState(false);
  const [addRoleForm, setAddRoleForm] = useState({ name: '', stance: '建设' as '建设' | '对抗' | '中立' | '评审', desc: '' });
  const [templatePickerVisible, setTemplatePickerVisible] = useState(false);
  const [isReGeneratingRoles, setIsReGeneratingRoles] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [isExpertMode, setIsExpertMode] = useState(false);
  const [newIdeaModalOpen, setNewIdeaModalOpen] = useState(false);
  const [newIdeaDraft, setNewIdeaDraft] = useState('');
  const activeRoundtableTaskIdRef = useRef<string | null>(null);
  const roundtableStreamAbortRef = useRef<AbortController | null>(null);
  const suppressBackendSaveRef = useRef(false);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedInitialDataRef = useRef(false);
  const backendWorkspaceIdsRef = useRef<Set<string>>(new Set());  // 避免闭包问题
  const [form] = Form.useForm();

  // 生成基于意图洞察的摘要标题
  const generateIntentSummaryTitle = async (intentData: {
    initialDemand: string;
    intentCard: IntentCardState;
    probeTurns: ProbeTurn[];
  }, creationTime?: Date): Promise<string> => {
    try {
      const { initialDemand, intentCard, probeTurns } = intentData;
      const timeToUse = creationTime || new Date();
      
      // 如果没有选择模型或没有数据，返回默认标题
      if (!selectedModelId || (!initialDemand && !intentCard.coreGoal)) {
        return `圆桌空间_${timeToUse.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      // 构建提示词
      const prompt = `基于以下意图洞察信息，生成一个20字以内的中文摘要标题。要求：简洁明了，概括核心意图，不包含技术术语，适合作为圆桌空间名称。
      
原始需求：${initialDemand || '无'}
核心目标：${intentCard.coreGoal || '无'}
限制条件：${intentCard.constraints || '无'}
关键痛点：${intentCard.painPoints || '无'}
澄清对话：${probeTurns.map(turn => `${turn.role}: ${turn.content}`).join(' | ') || '无'}

请直接输出摘要标题，不要添加任何解释。`;

      let summary = '';
      let summaryComplete = false;
      let summaryError: string | null = null;
      
      // 使用现有的流式API生成摘要
      await streamChatByLLMConfig(
        selectedModelId,
        {
          message: prompt,
          system_prompt: '你是一个专业的标题生成器。根据用户提供的意图洞察信息，生成简洁明了的20字以内中文标题。'
        },
        {
          onDelta: (delta) => {
            summary += delta;
          },
          onDone: () => {
            summaryComplete = true;
          },
          onError: (err) => {
            console.error('生成标题失败:', err);
            summaryError = err;
            summaryComplete = true;
          },
        }
      );

      // 等待摘要完成（最长等待10秒）
      await new Promise<void>((resolve) => {
        const startTime = Date.now();
        const check = () => {
          if (summaryComplete || Date.now() - startTime > 10000) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });

      // 检查是否有错误
      if (summaryError) {
        throw new Error(summaryError);
      }
      
      // 清理和格式化标题
      let cleanSummary = summary.trim();
      
      // 移除可能的引号、冒号等标点
      cleanSummary = cleanSummary.replace(/["'【】《》：：]/g, '');
      
      // 如果标题过长，截断到20字
      if (cleanSummary.length > 20) {
        cleanSummary = cleanSummary.substring(0, 20);
      }
      
      // 如果生成失败或为空，使用默认标题
      if (!cleanSummary) {
        const defaultTitle = intentCard.coreGoal 
          ? `${intentCard.coreGoal.substring(0, 15)}`
          : initialDemand 
            ? `${initialDemand.substring(0, 15)}`
            : '圆桌空间';
        return `${defaultTitle}_${timeToUse.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      return `${cleanSummary}_${timeToUse.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (error) {
      console.error('生成意图摘要标题失败:', error);
      // 生成备选标题
      const fallbackTitle = intentData.intentCard.coreGoal 
        ? `${intentData.intentCard.coreGoal.substring(0, 15)}`
        : intentData.initialDemand 
          ? `${intentData.initialDemand.substring(0, 15)}`
          : '圆桌空间';
      const timeToUse = creationTime || new Date();
      return `${fallbackTitle}_${timeToUse.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    }
  };

  const collectModelText = useCallback(async (prompt: string, systemPromptText: string) => {
    if (!selectedModelId) {
      return '';
    }
    let output = '';
    let done = false;
    await streamChatByLLMConfig(
      selectedModelId,
      {
        message: prompt,
        system_prompt: systemPromptText,
      },
      {
        onDelta: (delta) => {
          output += delta;
        },
        onDone: () => {
          done = true;
        },
        onError: () => {
          done = true;
        },
      },
    );
    if (!done) {
      return output.trim();
    }
    return output.trim();
  }, [selectedModelId]);

  const parseJsonObject = (text: string) => {
    const candidate = text.match(/\{[\s\S]*\}/)?.[0];
    if (!candidate) {
      return null;
    }
    try {
      return JSON.parse(candidate);
    } catch {
      return null;
    }
  };

  const generateExpectedResultByIntent = async (intentData: IntentCardState) => {
    const fallback = `围绕「${intentData.coreGoal || '当前需求'}」形成可执行方案，并明确关键路径、风险对策与可验证指标。`;
    if (!selectedModelId) {
      return fallback;
    }
    const prompt = `你需要基于意图洞察生成“期望结果”。
请只输出一段中文，不超过120字，不要使用标题，不要使用列表。

原始需求：${initialDemand || '无'}
核心目标：${intentData.coreGoal || '无'}
限制条件：${intentData.constraints || '无'}
待解决痛点：${intentData.painPoints || '无'}
澄清交互：${probeTurns.map((turn) => `${turn.role}:${turn.content}`).join(' | ') || '无'}
`;
    const text = await collectModelText(
      prompt,
      '你是产品目标设定专家，擅长把需求转化为可检验的期望结果描述。',
    );
    return text || fallback;
  };

  const applyJudgeResult = useCallback((payload?: Record<string, unknown> | null) => {
    if (!payload) {
      return;
    }
    const nextState: JudgeState = {
      score: Number(payload.score) || 0,
      reason: typeof payload.reason === 'string' ? payload.reason : '',
      reached: Boolean(payload.reached),
      consensusCount: Number(payload.consensusCount) || 0,
      resolvedPainPoints: Number(payload.resolvedPainPoints) || 0,
      nextFocus: typeof payload.nextFocus === 'string' ? payload.nextFocus : '',
      updatedAt: new Date().toISOString(),
    };
    setJudgeState(nextState);
    setJudgeScore(nextState.score);
    setJudgeReason(nextState.reason);
  }, []);

  const applyBoardResult = useCallback((payload?: Record<string, unknown> | null) => {
    if (!payload) {
      return;
    }
    setConsensusBoard({
      summary: typeof payload.summary === 'string' ? payload.summary : '',
      consensus: Array.isArray(payload.consensus) ? payload.consensus as string[] : [],
      disputes: Array.isArray(payload.disputes) ? payload.disputes as BoardDispute[] : [],
      nextQuestions: Array.isArray(payload.nextQuestions) ? payload.nextQuestions as string[] : [],
      updatedAt: new Date().toISOString(),
    });
  }, []);

  const refreshRuntimeSnapshot = useCallback(async (targetRoomId?: string) => {
    if (!targetRoomId) {
      return;
    }
    try {
      const snapshot = await getRoomRuntimeSnapshot(targetRoomId);
      setRuntimePendingTasks(snapshot.pending_tasks || 0);
      applyJudgeResult(snapshot.latest_progress || null);
      applyBoardResult(snapshot.latest_board || null);
    } catch (error) {
      console.error('加载运行时快照失败:', error);
    }
  }, [applyBoardResult, applyJudgeResult]);

  const applyRoundtableTaskPayload = useCallback((payload?: Record<string, unknown> | null) => {
    if (!payload) {
      return;
    }

    const nextMessages = Array.isArray(payload.messages) ? payload.messages : [];
    if (nextMessages.length > 0) {
      setMessages(
        nextMessages.map((msg) => {
          const item = msg as Record<string, unknown>;
          return {
            id: String(item.id || ''),
            speakerId: String(item.speaker_id || item.speakerId || ''),
            speakerName: String(item.speaker_name || item.speakerName || ''),
            speakerType: (item.speaker_type || item.speakerType || 'agent') as 'user' | 'agent',
            content: String(item.content || ''),
            streaming: Boolean(item.streaming),
            createdAt: String(item.created_at || item.createdAt || ''),
          };
        }),
      );
    }

    applyJudgeResult((payload.judge_state as Record<string, unknown> | undefined) || null);
    applyBoardResult((payload.consensus_board as Record<string, unknown> | undefined) || null);
    setCanvasConsensus(Array.isArray(payload.canvas_consensus) ? payload.canvas_consensus as string[] : []);
    setCanvasDisputes(Array.isArray(payload.canvas_disputes) ? payload.canvas_disputes as string[] : []);
    setCanvasUpdatedAt(new Date().toLocaleString());
    if (payload.stage === 'brief' || payload.stage === 'final') {
      setRoundtableStage(payload.stage);
    }
    if (typeof payload.auto_round_count === 'number') {
      setAutoRoundCount(payload.auto_round_count);
    }
  }, [applyBoardResult, applyJudgeResult]);

  const streamRoundtableTaskUpdates = useCallback(async (taskId: string) => {
    roundtableStreamAbortRef.current?.abort();
    const controller = new AbortController();
    roundtableStreamAbortRef.current = controller;

    await streamRuntimeTask(
      taskId,
      {
        onTask: (task, eventName) => {
          if (task.result_payload) {
            applyRoundtableTaskPayload(task.result_payload as Record<string, unknown>);
          }

          if (task.status === 'failed') {
            setSending(false);
            message.warning(task.error_message || '后台任务执行失败');
          } else if (task.status === 'canceled') {
            setSending(false);
            message.info('圆桌任务已停止');
          } else if (task.status === 'completed') {
            setSending(false);
          }

          if (eventName === 'task.done' || task.status === 'completed' || task.status === 'failed' || task.status === 'canceled') {
            activeRoundtableTaskIdRef.current = null;
            roundtableStreamAbortRef.current = null;
            void refreshRuntimeSnapshot(task.room_id);
          }
        },
        onDone: () => {
          roundtableStreamAbortRef.current = null;
        },
        onError: (error) => {
          console.error('订阅圆桌任务流失败:', error);
          setSending(false);
          roundtableStreamAbortRef.current = null;
          activeRoundtableTaskIdRef.current = null;
          message.error(error);
        },
      },
      { signal: controller.signal },
    );
  }, [applyRoundtableTaskPayload, refreshRuntimeSnapshot]);

  const loadWorkspaces = async () => {
    if (!isAuthenticated) {
      return;
    }

    try {
      const workspaces = await listWorkspaces();
      if (workspaces.length > 0) {
        // 将后端数据转换为前端格式
        const rooms = workspaces.map(ws => ({
          id: ws.room_id || ws.data.room_id,
          name: ws.data.room_name || ws.room_id,
          createdAt: ws.updated_at || ws.created_at,
        }));
        setRoundtableRooms(rooms);
        setBackendWorkspaceIds(new Set(rooms.map((item) => item.id)));

        // 加载最新的工作台数据
        const latestWorkspace = workspaces[0];
        loadWorkspaceData(latestWorkspace.data);
        void refreshRuntimeSnapshot(latestWorkspace.data.room_id);
      } else {
        setBackendWorkspaceIds(new Set());
      }
    } catch (error) {
      console.error('加载工作台列表失败:', error);
    }
  };

  const loadWorkspaceData = (data: WorkspaceData) => {
    setStep(data.step as StepKey);
    setInitialDemand(data.initial_demand);
    setIntentCard(data.intent_card);
    setIntentReady(data.intent_ready);
    setRoles(data.roles.map(role => ({
      id: role.id,
      name: role.name,
      stance: role.stance as '建设' | '对抗' | '中立' | '评审',
      desc: role.desc,
      selected: role.selected,
      soulConfig: role.soul_config || role.soulConfig,
    })));
    setRolesReady(data.roles_ready);
    setRoomReady(data.room_ready);
    setRoomId(data.room_id);
    setSystemPrompt(data.system_prompt);
    setMessages(data.messages.map(msg => ({
      id: msg.id,
      speakerId: (msg.speaker_id || msg.speakerId) as string,
      speakerName: (msg.speaker_name || msg.speakerName) as string,
      speakerType: (msg.speaker_type || msg.speakerType) as 'user' | 'agent',
      content: msg.content,
      streaming: msg.streaming ?? false,
      createdAt: (msg.created_at || msg.createdAt) as string,
    })));
    setCanvasConsensus(data.canvas_consensus);
    setCanvasDisputes(data.canvas_disputes);
    setCanvasUpdatedAt(data.canvas_updated_at);
    setRoundtableStage(data.roundtable_stage as RoundtableStage);
    setSelectedModelId(data.selected_model_id);
    setExpectedResult(data.expected_result || '');
    setMaxDialogueRounds(data.max_dialogue_rounds || 6);
    setAutoRoundCount(data.auto_round_count || 0);
    setJudgeState({
      score: data.judge_state?.score || 0,
      reason: data.judge_state?.reason || '',
      reached: data.judge_state?.reached || false,
      consensusCount: data.judge_state?.consensusCount || 0,
      resolvedPainPoints: data.judge_state?.resolvedPainPoints || 0,
      nextFocus: data.judge_state?.nextFocus || '',
      updatedAt: data.judge_state?.updated_at,
    });
    setJudgeScore(data.judge_state?.score || 0);
    setJudgeReason(data.judge_state?.reason || '');
    setConsensusBoard({
      summary: data.consensus_board?.summary || '',
      consensus: data.consensus_board?.consensus || [],
      disputes: data.consensus_board?.disputes || [],
      nextQuestions: data.consensus_board?.nextQuestions || [],
      updatedAt: data.consensus_board?.updated_at,
    });
    setCanvasSnapshot((data.canvas_snapshot as Record<string, unknown>) || null);
    setAutoConversationEnabled(true);
  };

  const saveWorkspaceToBackend = useCallback(async () => {
    if (!isAuthenticated || !roomId) {
      return;
    }

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

      if (backendWorkspaceIdsRef.current.has(roomId)) {
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
  }, [autoRoundCount, canvasConsensus, canvasDisputes, canvasSnapshot, canvasUpdatedAt, consensusBoard, expectedResult, initialDemand, intentCard, isAuthenticated, judgeState, maxDialogueRounds, messages, roles, rolesReady, roomId, roomReady, roundtableRooms, roundtableStage, selectedModelId, step, systemPrompt, intentReady]);

  const loadModels = async () => {
    setLoadingModels(true);
    try {
      const data = await getLLMConfigs();
      setModels(data);
      const firstActive = data.find((item) => item.is_active);
      if (firstActive) {
        setSelectedModelId(firstActive.id);
      }
    } catch {
      message.error('加载模型列表失败');
    } finally {
      setLoadingModels(false);
    }
  };

  const loadRoleTemplates = async () => {
    try {
      const response = await fetch('/api/v1/role-templates/');
      if (response.ok) {
        const data = await response.json();
        // API 返回格式为 { total, templates, stats }，需要提取 templates 数组
        if (data && Array.isArray(data.templates)) {
          setRoleTemplates(data.templates);
        } else if (Array.isArray(data)) {
          setRoleTemplates(data);
        } else {
          console.error('角色模板数据格式不正确:', data);
          setRoleTemplates([]);
        }
      }
    } catch (e) {
      console.error('加载角色模板失败:', e);
    }
  };

  const loadScenarioTemplates = async () => {
    try {
      const response = await fetch('/api/v1/scenario-templates/');
      if (response.ok) {
        const data = await response.json();
        // 处理可能的分页格式 { total, templates } 或直接数组
        if (data && Array.isArray(data.templates)) {
          setScenarioTemplates(data.templates);
        } else if (Array.isArray(data)) {
          setScenarioTemplates(data);
        } else {
          console.error('场景模板数据格式不正确:', data);
          setScenarioTemplates([]);
        }
      }
    } catch (e) {
      console.error('加载场景模板失败:', e);
    }
  };

  const loadPromptTemplates = async () => {
    try {
      // 从系统提示词管理获取圆桌所需的提示词
      const response = await fetch('/api/v1/prompts/roundtable');
      console.log('提示词模板 API 响应状态:', response.status);
      if (response.ok) {
        const data = await response.json();
        console.log('提示词模板数据:', data);
        // 转换为 promptTemplates 格式
        const templates: Record<string, string> = {};
        if (data.brief_output_style) templates.prompt_brief_stage = data.brief_output_style;
        if (data.final_summary_style) templates.prompt_final_stage = data.final_summary_style;
        if (data.audit_role_system) templates.prompt_audit_brief = data.audit_role_system;
        if (data.audit_role_system) templates.prompt_audit_final = data.audit_role_system;
        if (data.role_agent_base) templates.prompt_base = data.role_agent_base;
        setPromptTemplates(templates);
      } else {
        console.error('加载提示词模板失败，状态码:', response.status);
      }
    } catch (e) {
      console.error('加载提示词模板失败:', e);
    }
  };

  useEffect(() => {
    // 防止在 React StrictMode 下重复加载
    if (hasLoadedInitialDataRef.current) {
      return;
    }
    hasLoadedInitialDataRef.current = true;

    loadModels();
    loadRoleTemplates();
    loadScenarioTemplates();
    loadPromptTemplates();
    loadWorkspaces(); // 加载工作台列表
  }, []);

  // 保存工作台状态到 localStorage（作为 fallback）和后端
  useEffect(() => {
    const stateToSave = isAuthenticated
      ? {
          step,
          initialDemand,
          intentCard,
          intentReady,
          rolesReady,
          roomReady,
          roomId,
          roundtableRooms,
          roundtableStage,
          selectedModelId,
          expectedResult,
          maxDialogueRounds,
          autoRoundCount,
          judgeState,
          consensusBoard,
        }
      : {
          step,
          initialDemand,
          intentCard,
          intentReady,
          roles,
          rolesReady,
          roomReady,
          roomId,
          systemPrompt,
          messages,
          canvasConsensus,
          canvasDisputes,
          canvasUpdatedAt,
          roundtableRooms,
          roundtableStage,
          selectedModelId,
          expectedResult,
          maxDialogueRounds,
          autoRoundCount,
          judgeState,
          consensusBoard,
          canvasSnapshot,
        };

    // 保存到 localStorage（作为 fallback）
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error('保存状态失败:', e);
    }

    // 保存到后端（如果已登录且有 roomId）
    if (isAuthenticated && roomId && roomReady && !suppressBackendSaveRef.current) {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
      }
      saveDebounceRef.current = setTimeout(() => {
        void saveWorkspaceToBackend();
      }, 500);
    }
    return () => {
      if (saveDebounceRef.current) {
        clearTimeout(saveDebounceRef.current);
        saveDebounceRef.current = null;
      }
    };
  }, [
    step,
    initialDemand,
    intentCard,
    intentReady,
    roles,
    rolesReady,
    roomReady,
    roomId,
    systemPrompt,
    messages,
    canvasConsensus,
    canvasDisputes,
    canvasUpdatedAt,
    roundtableRooms,
    roundtableStage,
    selectedModelId,
    expectedResult,
    maxDialogueRounds,
    autoRoundCount,
    isAuthenticated,
    judgeState,
    consensusBoard,
    canvasSnapshot,
    saveWorkspaceToBackend,
    // 注意: 移除 backendWorkspaceIds 因为它是引用类型，引用变化会触发不必要的 effect
    // backendWorkspaceIds 只在 saveWorkspaceToBackend 函数内部使用
  ]);

  // 同步 backendWorkspaceIds 到 ref，避免闭包问题
  useEffect(() => {
    backendWorkspaceIdsRef.current = backendWorkspaceIds;
  }, [backendWorkspaceIds]);

  useEffect(() => {
    form.setFieldsValue(intentCard);
  }, [form, intentCard]);

  useEffect(() => {
    if (!roomId) {
      setRuntimePendingTasks(0);
      return;
    }
    void refreshRuntimeSnapshot(roomId);
  }, [refreshRuntimeSnapshot, roomId]);

  const handleMaterialsAnalyzed = (materials: MaterialInfo[]) => {
    setUploadedMaterials(materials);
    if (materials.length > 0) {
      void trackRuntimeEvent({
        room_id: roomId || preUploadRoomId,
        event_type: 'material.analyzed',
        event_payload: {
          count: materials.length,
          filenames: materials.map((item) => item.filename),
        },
      }).catch((error) => console.error('记录材料事件失败:', error));
    }
  };

  const generateProbeQuestions = (text: string): ProbeQuestion[] => {
    const base = text.trim();
    const hint = base ? `围绕「${base.slice(0, 30)}${base.length > 30 ? '…' : ''}」` : '围绕你的需求';
    return [
      {
        id: 'q1',
        question: `${hint}，你更关心哪类结果？`,
        options: [
          { id: 'q1o1', label: '增长/转化' },
          { id: 'q1o2', label: '降本/效率' },
          { id: 'q1o3', label: '风险/合规' },
          { id: 'q1o4', label: '体验/口碑' },
        ],
      },
      {
        id: 'q2',
        question: '有哪些限制条件必须满足？',
        options: [
          { id: 'q2o1', label: '预算有限' },
          { id: 'q2o2', label: '时间紧' },
          { id: 'q2o3', label: '人手少' },
          { id: 'q2o4', label: '合规要求高' },
        ],
      },
      {
        id: 'q3',
        question: '最担心的痛点是什么？',
        options: [
          { id: 'q3o1', label: '方向跑偏' },
          { id: 'q3o2', label: '落地成本高' },
          { id: 'q3o3', label: '结果不可量化' },
          { id: 'q3o4', label: '团队执行阻力' },
        ],
      },
    ];
  };

  // 基于意图和大模型智能选择角色
  const generateRolesByIntentWithAI = async (
    intentData: IntentCardState,
    availableTemplates: typeof roleTemplates
  ): Promise<RoleMember[]> => {
    if (!selectedModelId || availableTemplates.length === 0) {
      // Fallback: 返回默认角色组合
      return availableTemplates
        .filter((tpl) => tpl.is_default || ['建设', '对抗', '评审'].includes(tpl.stance))
        .slice(0, 5)
        .map((tpl) => ({
          id: `role_${tpl.id}`,
          name: tpl.name,
          stance: tpl.stance as '建设' | '对抗' | '中立' | '评审',
          desc: tpl.description || '',
          selected: true,
          soulConfig: tpl.soul_config,
        }));
    }

    // 构建角色候选列表
    const roleCandidates = availableTemplates
      .filter((tpl) => tpl.is_active !== false)
      .map((tpl) => ({
        id: tpl.id,
        name: tpl.name,
        stance: tpl.stance,
        description: tpl.description || '',
        skill_tags: tpl.skill_tags || [],
        category: tpl.category || '',
      }));

    const prompt = `你是一位专业的"圆桌讨论角色配置专家"。请根据以下需求意图，从候选角色列表中选择最适合参与讨论的角色。

【需求意图】
核心目标：${intentData.coreGoal || '无'}
限制条件：${intentData.constraints || '无'}
核心痛点：${intentData.painPoints || '无'}

【候选角色列表】
${JSON.stringify(roleCandidates, null, 2)}

【选择要求】
1. 选择 3-6 个角色，确保覆盖不同立场（建设、对抗、中立、评审）
2. 优先选择与需求领域相关的专业角色
3. 确保有至少一个建设型角色和一个对抗/评审型角色形成思维碰撞
4. 返回严格的 JSON 数组格式，只包含选中的角色 ID：
[1, 5, 8]  // 示例：只返回 ID 数组`;

    try {
      const rawJson = await collectModelText(
        prompt,
        '你是一个专业的角色配置助手，只输出 JSON 格式的角色 ID 数组，不要有任何其他解释文字。'
      );
      const selectedIds = parseJsonObject(rawJson);

      if (Array.isArray(selectedIds) && selectedIds.length > 0) {
        // 根据大模型选择的 ID 生成角色列表
        const selectedRoles = availableTemplates
          .filter((tpl) => selectedIds.includes(tpl.id))
          .map((tpl) => ({
            id: `role_${tpl.id}`,
            name: tpl.name,
            stance: tpl.stance as '建设' | '对抗' | '中立' | '评审',
            desc: tpl.description || '',
            selected: true,
            soulConfig: tpl.soul_config,
          }));

        if (selectedRoles.length > 0) {
          return selectedRoles;
        }
      }
    } catch (error) {
      console.error('AI 角色选择失败:', error);
    }

    // Fallback: 使用默认逻辑
    return availableTemplates
      .filter((tpl) => tpl.is_default)
      .slice(0, 5)
      .map((tpl) => ({
        id: `role_${tpl.id}`,
        name: tpl.name,
        stance: tpl.stance as '建设' | '对抗' | '中立' | '评审',
        desc: tpl.description || '',
        selected: true,
        soulConfig: tpl.soul_config,
      }));
  };

  const startIntentProbing = async () => {
    if (!initialDemand.trim() && uploadedMaterials.length === 0) {
      message.warning('请先输入你的需求或上传相关材料');
      return;
    }
    
    if (!selectedModelId) {
      message.warning('请先在全局配置中选择一个可用的大模型');
      return;
    }
    
    setIntentReady(false);
    setRolesReady(false);
    setRoomReady(false);
    setRoles([]);
    setMessages([]);
    setCanvasConsensus([]);
    setCanvasDisputes([]);
    setCanvasUpdatedAt('');
    setAutoRoundCount(0);
    setAutoConversationEnabled(true);
    
    // 如果没有开启高级模式，则通过 AI 主持人静默抽取意图，不再显示繁琐的问卷
    if (!isExpertMode) {
      const loadingMsg = message.loading('AI主持人正在分析您的需求并组建圆桌...', 0);
      try {
        const materialContent = uploadedMaterials.length > 0 
          ? `附件材料摘要：${uploadedMaterials.map(m => m.summary || m.filename).join(';')}` 
          : '';
        const fullDemand = `${initialDemand}\n${materialContent}`;

        const prompt = `你是一位经验丰富的"需求分析师"。请根据用户的初始输入，提炼出圆桌讨论所需的结构化意图卡片。
请严格输出 JSON 格式，不要包含任何其他文字：
{
  "coreGoal": "核心目标（不超过30个字）",
  "constraints": "限制条件（如果有，简明扼要；如果没有填无）",
  "painPoints": "核心痛点（如果有，简明扼要；如果没有填无）"
}

用户输入：${fullDemand}`;

        const rawJson = await collectModelText(prompt, '你是一个专业的 JSON 数据提取机器人，只输出合法的 JSON');
        const intentData = parseJsonObject(rawJson);
        
        if (intentData) {
          const newIntent = {
            coreGoal: intentData.coreGoal || initialDemand.slice(0, 20),
            constraints: intentData.constraints || '无',
            painPoints: intentData.painPoints || '无'
          };
          setIntentCard(newIntent);
          
          // 如果用户没有选择具体场景模板，系统默认选出一个包含建设/对抗/评审的通用组合
          // 这里简化处理：直接自动跳到角色确认步骤，并根据模板自动生成
          setIntentReady(true);
          setStep('roles');
          
          // 使用 AI 智能匹配角色
          const generatedRoles = await generateRolesByIntentWithAI(newIntent, roleTemplates);
          setRoles(generatedRoles);
          
          // 可以在这里自动生成预期结果
          const generatedResult = await generateExpectedResultByIntent(newIntent);
          setExpectedResult(generatedResult);

          loadingMsg();
          message.success('需求分析完毕，AI 已为您智能匹配专业角色阵型');
        } else {
          throw new Error('JSON 解析失败');
        }
      } catch (err) {
        loadingMsg();
        console.error(err);
        message.error('AI分析意图失败，请开启高级模式手动配置或重试');
      }
      return;
    }

    // 高级模式下的老逻辑：展示固定的探针问题
    const questions = generateProbeQuestions(initialDemand);
    setProbeQuestions(questions);
    setProbeTurns([
      { id: `u_${Date.now()}`, role: 'user', content: initialDemand.trim() },
      {
        id: `s_${Date.now()}`,
        role: 'system',
        content: '我将通过几个问题澄清你的真实意图，并同步生成结构化需求卡片。',
      },
    ]);
  };

  const applyProbeAnswer = (questionId: string, answer: string) => {
    setProbeTurns((prev) => [...prev, { id: `u_${Date.now()}`, role: 'user', content: `${answer}` }]);
    if (questionId === 'q1') {
      setIntentCard((prev) => ({ ...prev, coreGoal: prev.coreGoal || `围绕「${answer}」获得可执行方案与路径` }));
    }
    if (questionId === 'q2') {
      setIntentCard((prev) => ({ ...prev, constraints: prev.constraints ? `${prev.constraints}；${answer}` : answer }));
    }
    if (questionId === 'q3') {
      setIntentCard((prev) => ({ ...prev, painPoints: prev.painPoints ? `${prev.painPoints}；${answer}` : answer }));
    }
  };

  const confirmIntent = async () => {
    const values = await form.validateFields();
    setIntentCard(values);
    if (!values.coreGoal?.trim()) {
      message.warning('请先完善核心目标');
      return;
    }
    let nextExpectedResult = expectedResult.trim();
    if (!nextExpectedResult) {
      setGeneratingExpectedResult(true);
      try {
        nextExpectedResult = await generateExpectedResultByIntent(values as IntentCardState);
        setExpectedResult(nextExpectedResult);
      } finally {
        setGeneratingExpectedResult(false);
      }
    }
    if (!nextExpectedResult.trim()) {
      message.warning('请先生成或填写期望结果');
      return;
    }
    setIntentReady(true);
    setStep('roles');

    // 使用大模型智能选择角色
    const loadingMsg = message.loading('正在根据意图智能匹配最佳角色组合...', 0);
    try {
      const generatedRoles = await generateRolesByIntentWithAI(
        values as IntentCardState,
        roleTemplates
      );
      setRoles(generatedRoles);
      message.success('意图洞察完成，AI 已为您智能匹配最佳角色矩阵');
    } catch (error) {
      console.error('角色生成失败:', error);
      message.error('角色匹配失败，已使用默认角色组合');
      // Fallback 到默认角色
      const fallbackRoles = roleTemplates
        .filter((tpl) => tpl.is_default)
        .slice(0, 5)
        .map((tpl) => ({
          id: `role_${tpl.id}`,
          name: tpl.name,
          stance: tpl.stance as '建设' | '对抗' | '中立' | '评审',
          desc: tpl.description || '',
          selected: true,
          soulConfig: tpl.soul_config,
        }));
      setRoles(fallbackRoles);
    } finally {
      loadingMsg();
    }
  };

  const toggleRoleSelected = (roleId: string) => {
    setRoles((prev) => prev.map((role) => (role.id === roleId ? { ...role, selected: !role.selected } : role)));
  };

  const selectScenarioTemplate = async (templateId: number) => {
    const template = scenarioTemplates.find(t => t.id === templateId);
    if (!template) return;
    
    // 如果没有输入需求，提示
    if (!initialDemand.trim() && uploadedMaterials.length === 0) {
      message.warning('请先输入一句话需求或上传需求文档');
      return;
    }

    setIsCreatingWorkspace(true);
    try {
      // 1. 设置意图卡片（简单版本，后续可以接入大模型）
      const mockIntent = {
        coreGoal: initialDemand.trim() || `围绕上传的材料进行${template.name}讨论`,
        constraints: '无',
        painPoints: '无',
      };
      setIntentCard(mockIntent);
      setIntentReady(true);

      // 2. 配置角色
      const generatedRoles: RoleMember[] = roleTemplates
        .filter(r => template.preset_roles.includes(r.id))
        .map(r => ({
          id: `role_${r.id}`,
          name: r.name,
          stance: (r.stance as '建设' | '对抗' | '中立' | '评审'),
          desc: r.description || '',
          selected: true,
          soulConfig: r.soul_config,
        }));
      setRoles(generatedRoles);
      setRolesReady(true);
      setJudgeState({ score: 0, reason: '', reached: false, consensusCount: 0, resolvedPainPoints: 0, nextFocus: '' });
      setJudgeScore(0);
      setJudgeReason('');
      setConsensusBoard({ summary: '', consensus: [], disputes: [], nextQuestions: [] });
      setCanvasSnapshot(null);

      // 3. 准备房间
      setRoomReady(true);
      const newRoomId = `room_${Date.now().toString(36)}`;
      setRoomId(newRoomId);
      setStep('roundtable_view');
      
      // 4. 生成期望结果并启动
      let currentExpectedResult = expectedResult;
      if (!currentExpectedResult) {
         currentExpectedResult = `产出符合【${template.name}】视角的结论和可执行方案`;
         setExpectedResult(currentExpectedResult);
      }

      // 如果模板有特定的 system_prompt，可以覆盖
      if (template.system_prompt_override) {
        setSystemPrompt(template.system_prompt_override);
      }

      const seedLines = [
        '【系统提示：圆桌会议已启动】',
        `本次会议主题：${template.name}`,
        `讨论目标：${mockIntent.coreGoal}`,
        currentExpectedResult ? `期望结果：${currentExpectedResult}` : '',
        '请各角色先给出最关键的 3-5 条核心要点。',
      ].filter(Boolean);
      
      setPendingRoundtableRun({ roomId: newRoomId, text: seedLines.join('\n'), stage: 'brief', trigger: 'host' });
      message.success(`已应用模板：${template.name}，并自动进入圆桌开始演练`);
      void trackRuntimeEvent({
        room_id: newRoomId,
        event_type: 'template.selected',
        event_payload: { template_id: template.id, template_name: template.name },
      }).catch((error) => console.error('记录模板事件失败:', error));

      // 创建左侧菜单项
      const defaultTitle = `圆桌空间_${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      const newRoom: RoundtableRoom = {
        id: newRoomId,
        name: defaultTitle,
        createdAt: new Date().toISOString(),
      };
      setRoundtableRooms((prev) => [newRoom, ...prev]);

      // 异步更新标题
      const generateAndUpdateTitle = async () => {
        try {
          const generatedTitle = await generateIntentSummaryTitle({
            initialDemand,
            intentCard: mockIntent,
            probeTurns: [],
          }, new Date());

          setRoundtableRooms((prev) =>
            prev.map((room) =>
              room.id === newRoomId ? { ...room, name: generatedTitle } : room
            )
          );
        } catch (e) {
          console.error(e);
        }
      };
      generateAndUpdateTitle();

    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const addCustomRole = () => {
    if (!newRoleName.trim()) {
      message.warning('请输入角色名称');
      return;
    }
    const newRole: RoleMember = {
      id: `custom_${Date.now()}`,
      name: newRoleName.trim(),
      stance: addRoleForm.stance,
      desc: addRoleForm.desc.trim() || '自定义角色',
      selected: true,
    };
    setRoles((prev) => [...prev, newRole]);
    setNewRoleName('');
    setAddRoleForm({ name: '', stance: '建设', desc: '' });
    setAddRoleModalVisible(false);
    message.success(`已添加角色：${newRole.name}`);
  };

  // 重新智能选择角色
  const reGenerateRoles = async () => {
    if (!intentReady) {
      message.warning('请先完成需求识别');
      return;
    }
    setIsReGeneratingRoles(true);
    const loadingMsg = message.loading('正在重新智能匹配角色组合...', 0);
    try {
      const generatedRoles = await generateRolesByIntentWithAI(intentCard, roleTemplates);
      setRoles(generatedRoles);
      message.success('已重新智能匹配角色组合');
    } catch (error) {
      console.error('角色重新匹配失败:', error);
      message.error('角色重新匹配失败，请重试');
    } finally {
      loadingMsg();
      setIsReGeneratingRoles(false);
    }
  };

  // 从模板库添加角色
  const addRoleFromTemplate = (templateId: number) => {
    const template = roleTemplates.find(t => t.id === templateId);
    if (!template) return;
    // 检查是否已经添加
    const existingRoleId = `role_${template.id}`;
    if (roles.some(r => r.id === existingRoleId)) {
      message.warning(`角色「${template.name}」已在列表中`);
      return;
    }
    const newRole: RoleMember = {
      id: existingRoleId,
      name: template.name,
      stance: template.stance as '建设' | '对抗' | '中立' | '评审',
      desc: template.description || '',
      selected: true,
      soulConfig: template.soul_config,
    };
    setRoles((prev) => [...prev, newRole]);
    message.success(`已添加角色：${template.name}`);
    setTemplatePickerVisible(false);
  };

  const deleteRole = (roleId: string) => {
    const role = roles.find((r) => r.id === roleId);
    if (role?.id === 'pm' || role?.id === 'arch' || role?.id === 'ops' || role?.id === 'risk' || role?.id === 'audit') {
      message.warning('默认角色不能删除');
      return;
    }
    setRoles((prev) => prev.filter((r) => r.id !== roleId));
    message.success(`已删除角色：${role?.name}`);
  };

  const confirmRoles = async () => {
    // 防止重复提交
    if (isCreatingWorkspace) {
      message.warning('正在创建圆桌空间，请稍候...');
      return;
    }

    const selected = roles.filter((r) => r.selected);
    if (selected.length < 2) {
      message.warning('至少选择 2 位角色，才能形成有效讨论');
      return;
    }

    setIsCreatingWorkspace(true);
    try {
      setMessages([]);
      setCanvasConsensus([]);
      setCanvasDisputes([]);
      setCanvasUpdatedAt('');
      setRoundtableStage('brief');
      setAutoRoundCount(0);
      setAutoConversationEnabled(true);
      setPendingRoundtableRun(null);
      setJudgeState({ score: 0, reason: '', reached: false, consensusCount: 0, resolvedPainPoints: 0, nextFocus: '' });
      setJudgeScore(0);
      setJudgeReason('');
      setConsensusBoard({ summary: '', consensus: [], disputes: [], nextQuestions: [] });
      setCanvasSnapshot(null);
      setRolesReady(true);
      setRoomReady(true);
      const newRoomId = `room_${Date.now().toString(36)}`;
      setRoomId(newRoomId);

      // 先生成一个默认标题
      const defaultTitle = `圆桌空间_${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      const newRoom: RoundtableRoom = {
        id: newRoomId,
        name: defaultTitle,
        createdAt: new Date().toISOString(),
      };
      setRoundtableRooms((prev) => [newRoom, ...prev]);
      setStep('roundtable_view');
      setCanvasUpdatedAt(new Date().toLocaleString());

      // 异步生成基于意图洞察的标题
      const generateAndUpdateTitle = async () => {
        try {
          const intentData = {
            initialDemand,
            intentCard,
            probeTurns,
          };
          const generatedTitle = await generateIntentSummaryTitle(intentData, new Date());

          // 更新房间标题
          setRoundtableRooms((prev) =>
            prev.map((room) =>
              room.id === newRoomId ? { ...room, name: generatedTitle } : room
            )
          );

          // 如果已登录，更新后端数据
          if (isAuthenticated && backendWorkspaceIds.has(newRoomId)) {
            try {
              const workspaceData: WorkspaceData = {
                room_id: newRoomId,
                room_name: generatedTitle,
                step: 'roundtable_view',
                initial_demand: initialDemand,
                intent_card: intentCard,
                intent_ready: intentReady,
                roles: roles,
                roles_ready: rolesReady,
                room_ready: roomReady,
                system_prompt: systemPrompt,
                messages: [],
                canvas_consensus: [],
                canvas_disputes: [],
                canvas_updated_at: canvasUpdatedAt,
                roundtable_stage: 'brief',
                selected_model_id: selectedModelId,
                expected_result: expectedResult,
                max_dialogue_rounds: maxDialogueRounds,
                auto_round_count: 0,
              };
              await updateWorkspace(newRoomId, workspaceData);
            } catch (error) {
              console.error('更新工作台标题失败:', error);
            }
          }
        } catch (error) {
          console.error('生成意图摘要标题失败:', error);
        }
      };

      // 启动异步标题生成
      generateAndUpdateTitle();

      // 保存到后端
      if (isAuthenticated) {
        try {
          const workspaceData: WorkspaceData = {
            room_id: newRoomId,
            room_name: newRoom.name,
            step: 'roundtable_view',
            initial_demand: initialDemand,
            intent_card: intentCard,
            intent_ready: intentReady,
            roles: roles,
            roles_ready: rolesReady,
            room_ready: roomReady,
            system_prompt: systemPrompt,
            messages: [],
            canvas_consensus: [],
            canvas_disputes: [],
            canvas_updated_at: canvasUpdatedAt,
            roundtable_stage: 'brief',
            selected_model_id: selectedModelId,
            expected_result: expectedResult,
            max_dialogue_rounds: maxDialogueRounds,
            auto_round_count: 0,
          };
          await createWorkspace(workspaceData);
          setBackendWorkspaceIds((prev) => {
            const next = new Set(prev);
            next.add(newRoomId);
            return next;
          });
        } catch (error) {
          console.error('创建工作台失败:', error);
        }
      }

      const seedLines = [
        initialDemand.trim() ? `需求原始描述：${initialDemand.trim()}` : '',
        intentCard.coreGoal ? `核心目标：${intentCard.coreGoal}` : '',
        intentCard.constraints ? `限制条件：${intentCard.constraints}` : '',
        intentCard.painPoints ? `关键痛点：${intentCard.painPoints}` : '',
        expectedResult.trim() ? `期望结果：${expectedResult.trim()}` : '',
        '请各角色先给出最关键的 3-5 条核心要点（不要输出总结性方案）。',
      ].filter(Boolean);
      const seedText = seedLines.join('\n');
      if (seedText.trim()) {
        setPendingRoundtableRun({ roomId: newRoomId, text: seedText, stage: 'brief', trigger: 'host' });
      }
      message.success('角色矩阵确认完成，已自动创建圆桌空间并开始演练');
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  const createNewRoundtable = () => {
    setStep('roundtable');
    setRoomReady(false);
    setRoomId('');
    setInitialDemand('');
    setProbeQuestions([]);
    setProbeTurns([]);
    setIntentCard({ coreGoal: '', constraints: '', painPoints: '' });
    setIntentReady(false);
    setRolesReady(false);
    setRoles([]);
    setMessages([]);
    setCanvasConsensus([]);
    setCanvasDisputes([]);
    setCanvasUpdatedAt('');
    setRoundtableStage('brief');
    setPendingRoundtableRun(null);
    setExpectedResult('');
    setMaxDialogueRounds(6);
    setAutoRoundCount(0);
    setAutoConversationEnabled(true);
    setJudgeState({ score: 0, reason: '', reached: false, consensusCount: 0, resolvedPainPoints: 0, nextFocus: '' });
    setJudgeScore(0);
    setJudgeReason('');
    setConsensusBoard({ summary: '', consensus: [], disputes: [], nextQuestions: [] });
    setCanvasSnapshot(null);
    setRuntimePendingTasks(0);
  };

  const selectRoundtableRoom = async (room: RoundtableRoom) => {
    suppressBackendSaveRef.current = true;
    setRoomId(room.id);
    setStep('roundtable_view');
    setRoomReady(true);

    // 如果已登录，从后端加载工作台数据
    if (isAuthenticated && backendWorkspaceIds.has(room.id)) {
      try {
        const workspaceData = await getWorkspace(room.id);
        if (workspaceData) {
          loadWorkspaceData(workspaceData.data);
        }
      } catch (error) {
        console.error('加载工作台数据失败:', error);
      }
    }
    void refreshRuntimeSnapshot(room.id);
    setTimeout(() => {
      suppressBackendSaveRef.current = false;
    }, 200);
  };

  const deleteRoundtableRoom = async (roomIdToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    suppressBackendSaveRef.current = true;

    // 从后端删除（如果已登录且工作台存在于后端）
    if (isAuthenticated && backendWorkspaceIds.has(roomIdToDelete)) {
      try {
        await deleteWorkspace(roomIdToDelete);
        setBackendWorkspaceIds((prev) => {
          const next = new Set(prev);
          next.delete(roomIdToDelete);
          return next;
        });
      } catch (error) {
        console.error('删除工作台失败:', error);
        // 即使后端删除失败，也继续删除前端数据
      }
    }

    // 从前端状态中删除
    setRoundtableRooms((prev) => prev.filter((room) => room.id !== roomIdToDelete));

    // 如果删除的是当前选中的房间
    if (roomId === roomIdToDelete) {
      setRoomReady(false);
      setRoomId('');
      const remaining = roundtableRooms.filter((room) => room.id !== roomIdToDelete);
      if (remaining.length > 0) {
        // 加载剩余的第一个工作台
        const nextRoom = remaining[0];
        selectRoundtableRoom(nextRoom);
        // 注意: selectRoundtableRoom 内部已经调用了 getWorkspace 和 loadWorkspaceData
        // 不要重复调用，否则会导致 API 被调用两次
      } else {
        createNewRoundtable();
      }
    }
    message.success('圆桌空间已删除');
    setTimeout(() => {
      suppressBackendSaveRef.current = false;
    }, 300);
  };

  const formatRoomDisplayName = (room: RoundtableRoom, index: number) => {
    // 直接返回房间名称，标题已经是"大模型总结文本_时间"格式
    // 如果名称为空或只包含空格，返回默认标题
    if (!room.name || room.name.trim() === '') {
      return `圆桌空间 #${index + 1}`;
    }
    return room.name.trim();
  };

  const startEditingRoomName = (roomIdToEdit: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRoomId(roomIdToEdit);
  };

  const saveRoomName = (roomIdToSave: string, newName: string) => {
    setRoundtableRooms((prev) =>
      prev.map((room) => (room.id === roomIdToSave ? { ...room, name: newName } : room))
    );
    setEditingRoomId(null);
    message.success('名称已更新');
  };

  const stopStreaming = useCallback(() => {
    roundtableStreamAbortRef.current?.abort();
    roundtableStreamAbortRef.current = null;
    const taskId = activeRoundtableTaskIdRef.current;
    activeRoundtableTaskIdRef.current = null;
    setSending(false);
    if (taskId) {
      void cancelRuntimeTask(taskId).catch((error) => {
        console.error('取消圆桌任务失败:', error);
      });
    }
  }, []);

  const sendToRoundtable = useCallback(async (
    overrideText?: string,
    overrideStage?: RoundtableStage,
    overrideSystemPrompt?: string,
    trigger: 'user' | 'host' = 'user',
    forceAutoContinue?: boolean,
  ) => {
    if (!selectedModelId) {
      message.warning('请选择一个可用模型');
      return;
    }
    const userText = (overrideText ?? userPrompt).trim();
    if (!userText) {
      message.warning('请输入观点/问题');
      return;
    }
    if (!roomReady) {
      message.warning('请按流程完成意图洞察与角色确认');
      return;
    }
    if (sending) {
      message.warning('正在生成中，请稍候或点击停止');
      return;
    }

    const stage = overrideStage ?? roundtableStage;
    const userMessageId = `m_user_${Date.now()}`;
    const optimisticSpeakerName = trigger === 'host' ? '主持人' : '我';
    const nextMessages = [
      ...messages,
      {
        id: userMessageId,
        speakerId: trigger === 'host' ? 'host' : 'user',
        speakerName: optimisticSpeakerName,
        speakerType: 'user' as const,
        content: userText,
        createdAt: new Date().toLocaleTimeString(),
      },
    ];

    if (!overrideText) {
      setUserPrompt('');
    }
    setRoundtableStage(stage);
    setMessages(nextMessages);
    setSending(true);

    try {
      const task = await startRoundtableRun({
        room_id: roomId,
        model_id: selectedModelId,
        user_message: userText,
        user_message_id: userMessageId,
        roundtable_stage: stage,
        auto_brainstorm: autoBrainstorm,
        auto_continue: forceAutoContinue ?? (stage === 'brief' ? autoConversationEnabled : false),
        max_dialogue_rounds: maxDialogueRounds,
        auto_round_count: autoRoundCount,
        intent_card: intentCard,
        expected_result: expectedResult,
        system_prompt: overrideSystemPrompt ?? systemPrompt,
        prompt_templates: promptTemplates,
        roles: roles.map((role) => ({
          id: role.id,
          name: role.name,
          stance: role.stance,
          desc: role.desc,
          selected: role.selected,
          soul_config: role.soulConfig,
        })),
        prior_messages: messages.map((msg) => ({
          id: msg.id,
          speaker_id: msg.speakerId,
          speaker_name: msg.speakerName,
          speaker_type: msg.speakerType,
          content: msg.content,
          created_at: msg.createdAt,
          streaming: false,
        })),
        trigger,
      });
      activeRoundtableTaskIdRef.current = task.task_id;
      void streamRoundtableTaskUpdates(task.task_id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '请求失败';
      message.error(msg);
      setMessages(messages);
      setSending(false);
      activeRoundtableTaskIdRef.current = null;
      roundtableStreamAbortRef.current = null;
    }
  }, [
    autoBrainstorm,
    autoConversationEnabled,
    autoRoundCount,
    expectedResult,
    intentCard,
    maxDialogueRounds,
    messages,
    promptTemplates,
    roles,
    roomId,
    roomReady,
    roundtableStage,
    selectedModelId,
    sending,
    streamRoundtableTaskUpdates,
    systemPrompt,
    userPrompt,
  ]);

  useEffect(() => {
    if (!pendingRoundtableRun) {
      return;
    }
    if (!roomReady || roomId !== pendingRoundtableRun.roomId || sending) {
      return;
    }
    setPendingRoundtableRun(null);
    void sendToRoundtable(
      pendingRoundtableRun.text,
      pendingRoundtableRun.stage,
      pendingRoundtableRun.systemPrompt,
      pendingRoundtableRun.trigger ?? 'host',
    );
  }, [pendingRoundtableRun, roomId, roomReady, sendToRoundtable, sending]);

  const generateFinalPlan = useCallback(() => {
    if (!roomReady) {
      message.warning('请先创建圆桌空间');
      return;
    }
    if (sending) {
      message.warning('正在生成中，请稍候或点击停止');
      return;
    }
    void trackRuntimeEvent({
      room_id: roomId,
      event_type: 'host.summarize',
      event_payload: { stage: roundtableStage, message_count: messages.length },
    }).catch((error) => console.error('记录主持人事件失败:', error));
    setAutoConversationEnabled(false);
    const convergeMsg = promptTemplates.prompt_converge_trigger || '主持人判断讨论已经收敛，请各角色基于当前讨论输出总结性方案。';
    void sendToRoundtable(convergeMsg, 'final', undefined, 'host', false);
  }, [messages.length, promptTemplates.prompt_converge_trigger, roomId, roomReady, roundtableStage, sendToRoundtable, sending]);

  const applyHostAction = useCallback((action: string, injectedIdea?: string) => {
    if (!roomReady) {
      return;
    }
    if (sending) {
      message.warning('正在生成中，请稍候再干预');
      return;
    }

    let overrideText = '';
    let hiddenPrompt = '';
    let eventPayload: Record<string, unknown> = { stage: roundtableStage };

    switch (action) {
      case 'focus':
        overrideText = '（主持人提示）各位专家跑题了，请立刻回到我们的核心目标和痛点上！';
        hiddenPrompt = `【系统最高指令】用户认为当前讨论已经偏离主题。请你接下来的发言必须强行拉回到核心目标「${intentCard.coreGoal}」，并针对痛点「${intentCard.painPoints}」给出看法，停止发散。`;
        break;
      case 'conflict':
        overrideText = '（主持人提示）现在的讨论太温和了，我需要看到更尖锐的批评和对抗！';
        hiddenPrompt = '【系统最高指令】用户希望看到更激烈的对抗。请你在接下来的发言中，必须找到上一位发言者的漏洞，进行尖锐反驳，并提出极具挑战性的问题。';
        break;
      case 'new_idea': {
        const idea = (injectedIdea || '').trim();
        if (!idea) {
          setNewIdeaModalOpen(true);
          return;
        }
        overrideText = `（主持人提示）我有一个新点子：${idea}。请大家评估。`;
        hiddenPrompt = `【系统最高指令】用户提出了一个新点子：「${idea}」。无论当前处于什么阶段，请立即评估这个点子的最大优势和致命风险。`;
        eventPayload = { ...eventPayload, idea };
        break;
      }
      case 'summarize':
        generateFinalPlan();
        return;
      default:
        return;
    }

    void trackRuntimeEvent({
      room_id: roomId,
      event_type: `host.${action}`,
      event_payload: eventPayload,
    }).catch((error) => console.error('记录主持人事件失败:', error));

    if (overrideText) {
      void sendToRoundtable(overrideText, roundtableStage, hiddenPrompt, 'host');
    }
  }, [generateFinalPlan, intentCard.coreGoal, intentCard.painPoints, roomId, roomReady, roundtableStage, sendToRoundtable, sending]);

  const canGoRoles = intentReady;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: listItemStyle }} />
      <Layout style={{ minHeight: '100dvh', overflow: 'hidden' }}>
      <AppHeader
        models={models}
        loadingModels={loadingModels}
        selectedModelId={selectedModelId}
        onModelChange={setSelectedModelId}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
        workspaceStep={step}
        onWorkspaceStepChange={(key) => setStep(key as StepKey)}
        canGoRoles={canGoRoles}
        roomReady={roomReady}
      />

      <Layout style={{ overflow: 'hidden', height: 'calc(100dvh - 64px)' }}>
        <Sider width={220} style={{ background: '#fff', borderRight: '1px solid #f0f0f0' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
            <Space direction="vertical" size="small" style={{ width: '100%' }}>
              <Button type="primary" icon={<span>+</span>} onClick={createNewRoundtable} block>
                新建圆桌空间
              </Button>
            </Space>
          </div>
          <div style={{ maxHeight: 'calc(100dvh - 64px - 80px)', overflowY: 'auto' }}>
            <List
              dataSource={roundtableRooms}
              renderItem={(room) => {
                const isSelected = roomId === room.id;
                const roomIndex = roundtableRooms.findIndex((item) => item.id === room.id) + 1;
                
                return (
                  <List.Item
                    key={room.id}
                    onClick={() => selectRoundtableRoom(room)}
                    className={`roundtable-list-item ${isSelected ? 'selected' : ''}`}
                    style={{
                      padding: '12px 16px',
                      cursor: 'pointer',
                      background: isSelected ? 'linear-gradient(135deg, #f0f7ff 0%, #e6f7ff 100%)' : '#fff',
                      borderLeft: isSelected ? '4px solid #1677ff' : '4px solid transparent',
                      marginBottom: 8,
                      borderRadius: 12,
                      border: isSelected ? '1px solid #bae0ff' : '1px solid #f0f0f0',
                      boxShadow: isSelected 
                        ? '0 2px 8px rgba(22, 119, 255, 0.12)' 
                        : '0 1px 3px rgba(0, 0, 0, 0.04)',
                      transition: 'all 0.2s ease-in-out',
                    }}
                    actions={[
                      <Dropdown
                        key="settings"
                        menu={{
                          items: [
                            {
                              key: 'edit',
                              label: '编辑空间名称',
                              icon: <span style={{ fontSize: 12, color: '#1677ff' }}>✏️</span>,
                              onClick: (e) => {
                                e.domEvent.stopPropagation();
                                const mouseEvent = e.domEvent as React.MouseEvent;
                                startEditingRoomName(room.id, mouseEvent);
                              },
                            },
                            {
                              key: 'delete',
                              label: '删除空间',
                              icon: <span style={{ fontSize: 12, color: '#ff4d4f' }}>🗑️</span>,
                              danger: true,
                              onClick: (e) => {
                                e.domEvent.stopPropagation();
                                const mouseEvent = e.domEvent as React.MouseEvent;
                                deleteRoundtableRoom(room.id, mouseEvent);
                              },
                            },
                          ],
                        }}
                        trigger={['click']}
                        placement="bottomRight"
                      >
                        <Button
                          type="text"
                          size="small"
                          style={{
                            padding: '0',
                            fontSize: 16,
                            height: 24,
                            width: 24,
                            minWidth: 24,
                            color: isSelected ? '#1677ff' : '#8c8c8c',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 4,
                            transition: 'all 0.2s ease-in-out',
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="roundtable-settings-button"
                        >
                          <span style={{ 
                            fontSize: 20,
                            lineHeight: 1,
                            transform: 'translateY(-2px)',
                            fontWeight: 500,
                          }}>⋯</span>
                        </Button>
                      </Dropdown>,
                    ]}
                  >
                    <List.Item.Meta
                      title={
                        editingRoomId === room.id ? (
                          <Input
                            defaultValue={room.name}
                            size="small"
                            onBlur={(e) => saveRoomName(room.id, e.target.value)}
                            onPressEnter={(e) => saveRoomName(room.id, e.currentTarget.value)}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            style={{ width: '100%' }}
                          />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                            <div style={{
                              width: 24,
                              height: 24,
                              borderRadius: 6,
                              background: isSelected ? '#1677ff' : '#f0f0f0',
                              color: isSelected ? '#fff' : '#8c8c8c',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 600,
                              flexShrink: 0,
                            }}>
                              #{roomIndex}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                  fontSize: 14,
                                  fontWeight: 600,
                                  lineHeight: 1.4,
                                  color: isSelected ? '#1677ff' : '#262626',
                                }}
                              >
                                {formatRoomDisplayName(room, roomIndex - 1)}
                              </div>
                            </div>
                          </div>
                        )
                      }
                      description={
                        <div style={{ marginTop: 4 }}>
                          
                        </div>
                      }
                    />
                  </List.Item>
                );
              }}
            />
          </div>
        </Sider>

        <Layout style={{ background: '#f5f5f5', overflow: 'hidden' }}>
          <Content style={{ padding: 16, flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {step === 'roundtable' && (
              <Row gutter={16} justify={isExpertMode ? 'start' : 'center'}>
                <Col xs={24} xl={isExpertMode ? 14 : 16}>
                  <Card title="需求识别交互" style={{ borderRadius: 8 }}>
                    <div style={{ maxHeight: 'calc(100dvh - 64px - 140px)', overflowY: 'auto', paddingRight: 8 }}>
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Input.TextArea
                          rows={3}
                          value={initialDemand}
                          onChange={(e) => setInitialDemand(e.target.value)}
                          placeholder="请简要描述你的需求（一句话，或直接上传文档）"
                        />
                        <MaterialUploader
                          roomId={roomId || preUploadRoomId}
                          onMaterialsAnalyzed={handleMaterialsAnalyzed}
                          maxFiles={10}
                        />

                        {uploadedMaterials.length > 0 && (
                          <MaterialIntentSynthesis
                            roomId={roomId || preUploadRoomId}
                            materials={uploadedMaterials}
                            onIntentSynthesized={(result) => {
                              if (result.synthesized_intent.core_goal && !intentCard.coreGoal) {
                                setIntentCard(prev => ({
                                  ...prev,
                                  coreGoal: result.synthesized_intent.core_goal,
                                  constraints: result.synthesized_intent.constraints || prev.constraints,
                                  painPoints: result.synthesized_intent.pain_points || prev.painPoints,
                                }));
                              }
                            }}
                          />
                        )}

                        <Divider style={{ margin: '12px 0' }} />

                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                          <Button 
                            type="primary" 
                            size="large" 
                            block 
                            onClick={startIntentProbing}
                            style={{ height: 48, fontSize: 16, borderRadius: 8 }}
                          >
                            {isExpertMode ? '开始深度洞察 (多轮问答)' : '✨ 智能分析需求并组建团队'}
                          </Button>

                          <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                            <Button 
                              type="link"
                              onClick={() => {
                                const sampleContent = `“小秘”：你的隐私优先、全感官个人 AI 管家\n核心理念：将碎片信息转化为有序智慧，打造属于你的“数字第二大脑”。\n• 零门槛全能录入：支持语音、截图、文档、即时消息等 8 种媒介，随手拍、随口说、随心存，彻底打破应用间的“信息孤岛”。\n• 隐私主权架构：坚持“本地优先”，所有 RAG 索引与数据库均存于本地，支持端侧轻量化运行。你的数据，只有你拥有。\n• 反焦虑缓冲机制：首创“收件箱缓冲区”，AI 解析的内容需经你确认才进入日程或知识库，拒绝任务堆积，维护生活的秩序感。\n• 情境感知助手：它懂你的节奏。平日里它是静默的守门人，在开会前或关键时刻，它会精准推送关联文档与任务汇总，化碎片为行动。`;
                                setInitialDemand(sampleContent);
                              }}
                            >
                              加载示例输入
                            </Button>
                            <Space>
                              <Switch checked={isExpertMode} onChange={setIsExpertMode} />
                              <Text>高级模式 (自定义探针、角色与结构化意图)</Text>
                            </Space>
                          </Space>
                        </Space>

                        {/* 场景模板快捷入口 */}
                        {scenarioTemplates.length > 0 && (
                          <div style={{ marginTop: 16, padding: '16px', background: '#fafafa', borderRadius: 8 }}>
                            <Text strong style={{ display: 'block', marginBottom: 12 }}>或使用场景模板一键上桌：</Text>
                            <Space wrap>
                              {scenarioTemplates.filter(t => t.is_active).map(template => (
                                <Button 
                                  key={template.id} 
                                  onClick={() => selectScenarioTemplate(template.id)}
                                  disabled={!initialDemand.trim() && uploadedMaterials.length === 0}
                                  title={(!initialDemand.trim() && uploadedMaterials.length === 0) ? "请先输入需求或上传资料" : template.description}
                                >
                                  {template.name}
                                </Button>
                              ))}
                            </Space>
                          </div>
                        )}
                      </Space>
                      {isExpertMode && (
                        <>
                          <Divider style={{ margin: '16px 0' }} />
                          <Space style={{ marginBottom: 16 }}>
                            <Button
                              onClick={() => {
                                setProbeQuestions([]);
                                setProbeTurns([]);
                                setIntentCard({ coreGoal: '', constraints: '', painPoints: '' });
                                setExpectedResult('');
                                setAutoRoundCount(0);
                                setIntentReady(false);
                                setRolesReady(false);
                                setRoomReady(false);
                                setRoles([]);
                                setMessages([]);
                                setCanvasConsensus([]);
                                setCanvasDisputes([]);
                                setCanvasUpdatedAt('');
                                form.resetFields();
                              }}
                            >
                              重置分析状态
                            </Button>
                          </Space>
                          {probeTurns.length === 0 && <Empty description="输入需求后点击「开始洞察」，系统将提出澄清问题并生成需求卡片" />}
                          {probeTurns.length > 0 && (
                            <List
                              dataSource={probeTurns}
                              renderItem={(item) => (
                                <List.Item style={{ border: 'none', padding: '6px 0' }}>
                                  <Space align="start">
                                    <Avatar style={{ background: item.role === 'user' ? '#1677ff' : '#52c41a' }}>
                                      {item.role === 'user' ? '我' : '问'}
                                    </Avatar>
                                    <Card size="small" style={{ width: '100%' }}>
                                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                                    </Card>
                                  </Space>
                                </List.Item>
                              )}
                            />
                          )}
                          {probeQuestions.length > 0 && (
                            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                              {probeQuestions.map((q) => (
                                <Card key={q.id} size="small" title={q.question}>
                                  <Space wrap>
                                    {q.options.map((opt) => (
                                      <Button key={opt.id} onClick={() => applyProbeAnswer(q.id, opt.label)}>
                                        {opt.label}
                                      </Button>
                                    ))}
                                    <Input
                                      key={`input-${q.id}`}
                                      placeholder="其他（请输入）"
                                      style={{ width: 200 }}
                                      value={customProbeOptions[q.id] || ''}
                                      onChange={(e) => setCustomProbeOptions({ ...customProbeOptions, [q.id]: e.target.value })}
                                      onPressEnter={() => {
                                        const customValue = customProbeOptions[q.id]?.trim();
                                        if (customValue) {
                                          applyProbeAnswer(q.id, customValue);
                                          setCustomProbeOptions({ ...customProbeOptions, [q.id]: '' });
                                        }
                                      }}
                                    />
                                    <Button
                                      key={`add-${q.id}`}
                                      onClick={() => {
                                        const customValue = customProbeOptions[q.id]?.trim();
                                        if (customValue) {
                                          applyProbeAnswer(q.id, customValue);
                                          setCustomProbeOptions({ ...customProbeOptions, [q.id]: '' });
                                        }
                                      }}
                                    >
                                      添加
                                    </Button>
                                  </Space>
                                </Card>
                              ))}
                            </Space>
                          )}
                        </>
                      )}
                    </div>
                  </Card>
                </Col>
                {isExpertMode && (
                <Col xs={24} xl={10}>
                  <Card title="高级配置与结构化需求" style={{ borderRadius: 8 }}>
                    <div style={{ maxHeight: 'calc(100dvh - 64px - 140px)', overflowY: 'auto', paddingRight: 8 }}>
                      <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <Card type="inner" title="全局配置" style={{ borderRadius: 8 }}>
                          <Space direction="vertical" style={{ width: '100%' }}>
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                              <Text type="secondary">模型选择</Text>
                              <Select
                                style={{ width: 200 }}
                                value={selectedModelId}
                                onChange={setSelectedModelId}
                                options={models.map((m) => ({ value: m.id, label: m.name }))}
                                loading={loadingModels}
                                placeholder="请选择大模型"
                              />
                            </Space>
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                              <Text type="secondary">全局提示词 (System Prompt)</Text>
                              <Button type="link" size="small" onClick={() => setSystemPrompt(promptTemplates.prompt_base || '')}>重置默认</Button>
                            </Space>
                            <Input.TextArea
                              rows={4}
                              value={systemPrompt}
                              onChange={(e) => setSystemPrompt(e.target.value)}
                              placeholder="可选：输入全局系统提示词，这将影响所有角色的行为"
                            />
                          </Space>
                        </Card>
                        <Card type="inner" title="期望结果" style={{ borderRadius: 8 }}>
                          <Space direction="vertical" size={10} style={{ width: '100%' }}>
                            <Input.TextArea
                              rows={4}
                              value={expectedResult}
                              onChange={(e) => setExpectedResult(e.target.value)}
                              placeholder="填写希望这次圆桌讨论最终达到的结果。可由AI基于意图洞察自动生成，再手动微调。"
                            />
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                              <Button
                                loading={generatingExpectedResult}
                                onClick={async () => {
                                  const values = await form.validateFields();
                                  setGeneratingExpectedResult(true);
                                  try {
                                    const generated = await generateExpectedResultByIntent(values as IntentCardState);
                                    setExpectedResult(generated);
                                    message.success('已生成期望结果');
                                  } finally {
                                    setGeneratingExpectedResult(false);
                                  }
                                }}
                              >
                                AI生成期望结果
                              </Button>
                              <Space>
                                <Text type="secondary">对话轮数上限</Text>
                                <InputNumber min={1} max={30} value={maxDialogueRounds} onChange={(v) => setMaxDialogueRounds(Number(v || 6))} />
                              </Space>
                            </Space>
                          </Space>
                        </Card>
                        <Card type="inner" title="结构化需求卡片（可编辑）" style={{ borderRadius: 8 }}>
                          <Form
                            form={form}
                            layout="vertical"
                            initialValues={intentCard}
                            onValuesChange={(_, values) => setIntentCard(values as IntentCardState)}
                          >
                            <Form.Item
                              name="coreGoal"
                              label="核心目标"
                              rules={[{ required: true, message: '请填写核心目标' }]}
                            >
                              <Input placeholder="例：在两周内验证产品方向并形成可执行方案" />
                            </Form.Item>
                            <Form.Item name="constraints" label="限制条件">
                              <Input placeholder="例：预算有限；人手少；需合规" />
                            </Form.Item>
                            <Form.Item name="painPoints" label="待解决痛点">
                              <Input placeholder="例：方向跑偏；落地成本高；结果不可量化" />
                            </Form.Item>
                            <Space>
                              <Button type="primary" onClick={confirmIntent} loading={generatingExpectedResult}>
                                确认意图并进入角色矩阵
                              </Button>
                            </Space>
                          </Form>
                        </Card>
                      </Space>
                    </div>
                  </Card>
                </Col>
                )}
              </Row>
            )}

            {step === 'roles' && (
              <Row gutter={16}>
                <Col xs={24} xl={14}>
                  <Card 
                    title={
                      <Space>
                        <Button 
                          size="small" 
                          onClick={() => setStep('roundtable')}
                          icon={<span>←</span>}
                        >
                          返回
                        </Button>
                        <span>角色矩阵（请确认参与圆桌的角色）</span>
                        <Button 
                          size="small" 
                          icon={<RedoOutlined />}
                          loading={isReGeneratingRoles}
                          onClick={reGenerateRoles}
                        >
                          重新智能选择
                        </Button>
                      </Space>
                    }
                    style={{ borderRadius: 8 }}
                  >
                    {!intentReady && <Empty description="请先完成需求识别" />}
                    {intentReady && (
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Row gutter={[12, 12]}>
                          {roles.map((role) => (
                            <Col xs={24} md={12} key={role.id}>
                              <Card
                                hoverable
                                style={{
                                  borderRadius: 8,
                                  border:
                                    role.name.includes('黑帽') || role.stance === '对抗'
                                      ? '1px solid #d4380d'
                                      : role.selected
                                        ? '1px solid #1677ff'
                                        : '1px solid #f0f0f0',
                                }}
                                actions={[
                                  <Button
                                    key="soul"
                                    type="text"
                                    size="small"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingSoulConfigRole(role);
                                      setEditingSoulConfigText(role.soulConfig || '');
                                    }}
                                  >
                                    灵魂配置
                                  </Button>,
                                  ...(role.id.startsWith('custom_')
                                    ? [
                                        <Button
                                          key="edit"
                                          type="text"
                                          size="small"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const newName = prompt('编辑角色名称', role.name);
                                            if (newName && newName.trim()) {
                                              setRoles((prev) =>
                                                prev.map((r) => (r.id === role.id ? { ...r, name: newName.trim() } : r))
                                              );
                                              message.success('角色名称已更新');
                                            }
                                          }}
                                        >
                                          编辑
                                        </Button>,
                                        <Button
                                          key="delete"
                                          type="text"
                                          size="small"
                                          danger
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            deleteRole(role.id);
                                          }}
                                        >
                                          删除
                                        </Button>,
                                      ]
                                    : []),
                                ]}
                              >
                                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                    <Space>
                                      <Text strong>{role.name}</Text>
                                      <Tag color={role.name.includes('黑帽') || role.stance === '对抗' ? 'volcano' : role.stance === '建设' ? 'blue' : 'default'}>
                                        {role.stance}
                                      </Tag>
                                    </Space>
                                    <Switch checked={role.selected} onChange={() => toggleRoleSelected(role.id)} />
                                  </Space>
                                  <Text type="secondary">{role.desc}</Text>
                                </Space>
                              </Card>
                            </Col>
                          ))}
                        </Row>
                        <Divider />
                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                          <Text strong>角色管理</Text>
                          <Space wrap>
                            <Button icon={<PlusOutlined />} onClick={() => { setAddRoleForm({ name: '', stance: '建设', desc: '' }); setNewRoleName(''); setAddRoleModalVisible(true); }} type="primary">
                              添加自定义角色
                            </Button>
                            <Button icon={<AppstoreAddOutlined />} onClick={() => setTemplatePickerVisible(true)}>
                              从模板库添加
                            </Button>
                          </Space>
                        </Space>
                      </Space>
                    )}
                  </Card>
                </Col>
                <Col xs={24} xl={10}>
                  <Card title="确认与启动" style={{ borderRadius: 8 }}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Card size="small">
                        <Text strong>意图锚点</Text>
                        <Paragraph style={{ marginBottom: 0 }}>{intentCard.coreGoal || '-'}</Paragraph>
                      </Card>
                      <Card size="small">
                        <Text strong>期望结果</Text>
                        <Paragraph style={{ marginBottom: 0 }}>{expectedResult || '-'}</Paragraph>
                      </Card>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Text>对话轮数上限</Text>
                        <InputNumber min={1} max={30} value={maxDialogueRounds} onChange={(v) => setMaxDialogueRounds(Number(v || 6))} />
                      </Space>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Text>群聊模式（多角色脑暴）</Text>
                        <Switch checked={autoBrainstorm} onChange={(v) => setAutoBrainstorm(v)} />
                      </Space>
                      <Button type="primary" onClick={confirmRoles} disabled={!intentReady}>
                        确认角色并创建圆桌空间
                      </Button>
                      <Text type="secondary">
                        圆桌空间中，你（"我"）是特殊角色：可以发言、暂停生成、清空讨论、通过系统提示词进行纠偏。
                      </Text>
                    </Space>
                  </Card>
                </Col>
              </Row>
            )}

            {/* 灵魂配置编辑弹窗 */}
            <Modal
              title={<Space><span>🧬 灵魂配置</span><Tag color="blue">{editingSoulConfigRole?.name}</Tag></Space>}
              open={!!editingSoulConfigRole}
              onCancel={() => setEditingSoulConfigRole(null)}
              footer={
                <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                  <Button onClick={() => setEditingSoulConfigRole(null)}>取消</Button>
                  <Button 
                    type="primary" 
                    onClick={() => {
                      if (editingSoulConfigRole) {
                        setRoles((prev) =>
                          prev.map((r) =>
                            r.id === editingSoulConfigRole.id ? { ...r, soulConfig: editingSoulConfigText } : r)
                        );
                        message.success('灵魂配置已更新');
                        setEditingSoulConfigRole(null);
                      }
                    }}
                  >
                    保存配置
                  </Button>
                </Space>
              }
              width={700}
            >
              <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                请输入角色的完整灵魂配置提示词，定义角色的性格、偏好、表达风格等
              </Text>
              <Input.TextArea
                rows={20}
                value={editingSoulConfigText}
                onChange={(e) => setEditingSoulConfigText(e.target.value)}
                placeholder="【角色名称】

1. 灵魂内核
- 信条：...
- 性格：...
- 使命：...
- 底色：...

2. 认知偏见与偏好
- 偏好：...
- 反感：...
- 观点：...

3. 专家领域
- 专长：...
- 领地：...

4. 边界与抗拒
- 抗拒：...
- 红线：...

5. 表达风格
- 风格：...
- 语气：..."
              />
            </Modal>

            {/* 添加自定义角色 Modal */}
            <Modal
              title="添加自定义角色"
              open={addRoleModalVisible}
              onCancel={() => setAddRoleModalVisible(false)}
              onOk={addCustomRole}
              okText="添加"
              cancelText="取消"
              destroyOnClose
            >
              <Space direction="vertical" size={14} style={{ width: '100%', marginTop: 8 }}>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 4 }}>角色名称 <span style={{ color: '#ff4d4f' }}>*</span></Text>
                  <Input
                    placeholder="例如：数据安全专家、市场分析师"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    onPressEnter={addCustomRole}
                    maxLength={20}
                    showCount
                  />
                </div>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 4 }}>角色立场</Text>
                  <Select
                    value={addRoleForm.stance}
                    onChange={(val) => setAddRoleForm((prev) => ({ ...prev, stance: val }))}
                    style={{ width: '100%' }}
                    options={[
                      { value: '建设', label: '建设 - 积极推动、贡献方案' },
                      { value: '对抗', label: '对抗 - 质疑挑战、压力测试' },
                      { value: '中立', label: '中立 - 客观分析、多面评估' },
                      { value: '评审', label: '评审 - 严格审核、质量把关' },
                    ]}
                  />
                </div>
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 4 }}>角色描述</Text>
                  <Input.TextArea
                    rows={3}
                    placeholder="简要描述该角色的职责和视角，帮助圆桌讨论时更好地理解角色定位"
                    value={addRoleForm.desc}
                    onChange={(e) => setAddRoleForm((prev) => ({ ...prev, desc: e.target.value }))}
                    maxLength={200}
                    showCount
                  />
                </div>
              </Space>
            </Modal>

            {/* 从模板库添加角色 Modal */}
            <Modal
              title="从模板库添加角色"
              open={templatePickerVisible}
              onCancel={() => setTemplatePickerVisible(false)}
              footer={null}
              width={700}
              destroyOnClose
            >
              <Input
                placeholder="搜索角色名称或描述..."
                style={{ width: '100%', marginBottom: 12 }}
                allowClear
              />
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {roleTemplates.filter(t => t.is_active !== false).length === 0 ? (
                  <Empty description="暂无可用角色模板" />
                ) : (
                  <Row gutter={[8, 8]}>
                    {roleTemplates
                      .filter(t => t.is_active !== false)
                      .filter(t => !roles.some(r => r.id === `role_${t.id}`))
                      .map((template) => (
                        <Col xs={24} md={12} key={template.id}>
                          <Card
                            hoverable
                            size="small"
                            style={{ borderRadius: 6 }}
                            onClick={() => addRoleFromTemplate(template.id)}
                          >
                            <Space direction="vertical" size={2} style={{ width: '100%' }}>
                              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <Text strong>{template.name}</Text>
                                <Tag color={
                                  template.stance === '建设' ? 'blue' :
                                  template.stance === '对抗' ? 'red' :
                                  template.stance === '评审' ? 'gold' : 'default'
                                }>
                                  {template.stance}
                                </Tag>
                              </Space>
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                {template.description || '暂无描述'}
                              </Text>
                              {(template.category || template.skill_tags?.length) && (
                                <Space wrap size={2}>
                                  {template.category && <Tag style={{ fontSize: 10 }}>{template.category}</Tag>}
                                  {(template.skill_tags || []).slice(0, 2).map(tag => (
                                    <Tag key={tag} style={{ fontSize: 10 }} color="processing">{tag}</Tag>
                                  ))}
                                </Space>
                              )}
                            </Space>
                          </Card>
                        </Col>
                      ))
                    }
                  </Row>
                )}
                {roleTemplates.filter(t => t.is_active !== false).length > 0 &&
                  roleTemplates.filter(t => t.is_active !== false).filter(t => !roles.some(r => r.id === `role_${t.id}`)).length === 0 && (
                  <Empty description="所有可用模板角色已添加" />
                )}
              </div>
            </Modal>

            <Modal
              title="输入新点子"
              open={newIdeaModalOpen}
              onCancel={() => {
                setNewIdeaModalOpen(false);
                setNewIdeaDraft('');
              }}
              onOk={() => {
                const idea = newIdeaDraft.trim();
                if (!idea) {
                  message.warning('请输入新点子');
                  return;
                }
                setNewIdeaModalOpen(false);
                setNewIdeaDraft('');
                applyHostAction('new_idea', idea);
              }}
              okText="提交给圆桌"
              cancelText="取消"
            >
              <Input.TextArea
                rows={4}
                value={newIdeaDraft}
                onChange={(e) => setNewIdeaDraft(e.target.value)}
                placeholder="输入你希望圆桌立即评估的新想法"
              />
            </Modal>

            {step === 'roundtable_view' && (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column'}}>

                <Row gutter={16} style={{ flex: 1, minHeight: 0, overflow: 'visible' }}>
                  {/* 左侧：对话流 */}
                  <Col xs={24} xl={17} style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflow: 'hidden' }}>
                    <Card
                      title={
                        <Space>
                          <span>圆桌空间</span>
                          <Tag>{messages.length}</Tag>
                        </Space>
                      }
                      style={{ borderRadius: 8, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
                      bodyStyle={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                    >
                    {!roomReady && <Empty description="请先完成需求识别与角色确认" />}
                    {roomReady && (
                      <div style={{ flex: 1, minHeight: 0, maxHeight: 'calc(100vh - 350px)', overflowY: 'auto', padding: '0 16px 16px', overflowX: 'hidden' }}>
                        {messages.length === 0 && <Empty description="暂无讨论内容，先在底部输入并发送" />}
                        <List
                          dataSource={messages}
                          renderItem={(item) => (
                            <List.Item
                              style={{
                                border: 'none',
                                justifyContent: item.speakerType === 'user' ? 'flex-end' : 'flex-start',
                                padding: '8px 0',
                              }}
                            >
                              <Space align="start" style={{ width: '100%', maxWidth: '100%' }}>
                                {item.speakerType !== 'user' && (
                                  <Avatar style={{ background: '#52c41a' }}>{item.speakerName.slice(0, 1)}</Avatar>
                                )}
                                <Card
                                  size="small"
                                  style={{
                                    maxWidth: '100%',
                                    width: '100%',
                                    borderRadius: 10,
                                    border: item.speakerType === 'user' ? '1px solid #1677ff' : '1px solid #f0f0f0',
                                    background: item.speakerType === 'user' ? '#e6f4ff' : '#ffffff',
                                  }}
                                >
                                  <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                      <Space>
                                        <Text strong>{item.speakerName}</Text>
                                        {item.streaming && <Tag color="processing">流式中</Tag>}
                                      </Space>
                                      <Text type="secondary">{item.createdAt}</Text>
                                    </Space>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                      {item.content || '正在思考...'}
                                    </ReactMarkdown>
                                  </Space>
                                </Card>
                              </Space>
                            </List.Item>
                          )}
                        />
                      </div>
                    )}
                  </Card>
                </Col>

                {/* 右侧：书记员看板（占30%） */}
                <Col xs={24} xl={7} style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
                  {/* 顶部：目标达成度进度条 */}
                  <Card size="small" style={{ borderRadius: 8 }}>
                    <Space direction="vertical" size={4} style={{ width: '100%' }}>
                      <Row align="middle" justify="space-between">
                        <Col>
                          <Text strong>目标达成度</Text>
                        </Col>
                        <Col>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            共识 {judgeState.consensusCount} · 已解痛点 {judgeState.resolvedPainPoints} · 任务 {runtimePendingTasks}
                          </Text>
                        </Col>
                      </Row>
                      <Tooltip title={judgeReason || '等待裁判评估中...'}>
                        <Progress 
                          percent={judgeScore} 
                          status={judgeScore >= 90 ? 'success' : 'active'} 
                          strokeColor={{ '0%': '#108ee9', '100%': '#87d068' }}
                          size="small"
                        />
                      </Tooltip>
                      <Text type="secondary" style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={judgeReason || '等待裁判评估中...'}>
                        {judgeReason || '等待裁判评估中...'}
                      </Text>
                    </Space>
                  </Card>

                  {/* 书记员看板 — 始终展开，置顶 */}
                  <Card
                    title={
                      <Space>
                        <span>书记员看板</span>
                        <Tag color={consensusBoard.disputes.length > 0 ? 'orange' : 'green'}>
                          {consensusBoard.disputes.length > 0 ? '存在争议' : '持续收敛'}
                        </Tag>
                      </Space>
                    }
                    style={{ borderRadius: 8 }}
                    bodyStyle={{ maxHeight: 'calc(100vh - 420px)', overflowY: 'auto' }}
                  >
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      <Text>{consensusBoard.summary || '书记员正在整理当前共识与争议...'}</Text>
                      <div>
                        <Text strong>当前共识</Text>
                        <List
                          size="small"
                          dataSource={consensusBoard.consensus.slice(0, 4)}
                          locale={{ emptyText: '暂无共识' }}
                          renderItem={(text) => (
                            <List.Item style={{ border: 'none', padding: '6px 0' }}>
                              <Text>{text}</Text>
                            </List.Item>
                          )}
                        />
                      </div>
                      <div>
                        <Text strong>核心争议</Text>
                        <List
                          size="small"
                          dataSource={consensusBoard.disputes.slice(0, 2)}
                          locale={{ emptyText: '暂无争议' }}
                          renderItem={(item) => (
                            <List.Item style={{ border: 'none', padding: '6px 0' }}>
                              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                                <Text strong>{item.topic || '未命名争议'}</Text>
                                <Text type="secondary">正方：{item.pro || '待补充'}</Text>
                                <Text type="secondary">反方：{item.con || '待补充'}</Text>
                              </Space>
                            </List.Item>
                          )}
                        />
                      </div>
                    </Space>
                  </Card>

                </Col>
                </Row>
              </div>
            )}

            {/* 共识摘要独立页面 */}
            {step === 'consensus_summary' && (
              <ConsensusSummary
                intentCard={intentCard}
                expectedResult={expectedResult}
                messages={messages}
                roles={roles}
                canvasConsensus={canvasConsensus}
                canvasDisputes={canvasDisputes}
                roundtableStage={roundtableStage}
              />
            )}

            {/* 创意画布独立页面 */}
            {step === 'canvas_view' && (
              <div style={{ flex: 1, minHeight: 0 }}>
                <RoundtableCanvas
                  key={roomId || 'default'}
                  roomId={roomId}
                  intentAnchor={intentCard.coreGoal}
                  messages={messages}
                  roles={roles}
                  expectedResult={expectedResult}
                  canvasConsensus={canvasConsensus}
                  roundtableStage={roundtableStage}
                  onUpdatedAtChange={setCanvasUpdatedAt}
                  initialSnapshotData={canvasSnapshot}
                  onSnapshotChange={(snapshot) => setCanvasSnapshot(snapshot)}
                />
              </div>
            )}
          </Content>

          {step !== 'canvas_view' && (
            <Footer style={{ background: '#ffffff', borderTop: '1px solid #f0f0f0', marginTop: 5 }}>
              {/* 圆桌空间显示状态标签 */}
              {step !== 'roundtable' && (
              <Row justify="space-between" align="middle">
                <Col>
                  <Text type="secondary">
                    先完成意图洞察与角色确认，再进入圆桌空间开始群聊脑暴。
                  </Text>
                </Col>
                <Col>
                  <Space>
                    <Tag color={intentReady ? 'green' : 'default'}>意图洞察 {intentReady ? '已完成' : '未完成'}</Tag>
                    <Tag color={rolesReady ? 'green' : 'default'}>角色矩阵 {rolesReady ? '已完成' : '未完成'}</Tag>
                  </Space>
                </Col>
              </Row>
              )}
              {/* 圆桌空间显示输入框 */}
              {(step === 'roundtable_view') && (
              <Row gutter={12} align="middle">
                <Col flex="auto">
                  <Space direction="vertical" style={{ width: '100%' }}>
                    <Space style={{ marginBottom: 8 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>🎤 主持人干预：</Text>
                      <Button size="small" onClick={() => applyHostAction('focus')}>🎯 跑题拉回</Button>
                      <Button size="small" onClick={() => applyHostAction('conflict')}>⚔️ 加大对抗</Button>
                      <Button size="small" onClick={() => setNewIdeaModalOpen(true)}>💡 提新点子</Button>
                      <Button size="small" onClick={() => applyHostAction('summarize')} danger>🛑 直接总结</Button>
                    </Space>
                    <Input.TextArea
                      rows={3}
                      maxLength={1000}
                      showCount
                      value={userPrompt}
                      onChange={(e) => setUserPrompt(e.target.value)}
                      placeholder="输入你的观点/问题（你是特殊角色，可通过系统提示词纠偏整个圆桌）"
                    />
                  </Space>
                </Col>
                <Col>
                  <Space direction="vertical">
                    <Button type="primary" loading={sending} onClick={() => void sendToRoundtable()}>
                      发送
                    </Button>
                    <Button disabled={!sending} onClick={stopStreaming}>
                      停止
                    </Button>
                  </Space>
                </Col>
              </Row>
              )}
            </Footer>
          )}
        </Layout>
      </Layout>
    </Layout>
    </>
  );

}
export default Home;
