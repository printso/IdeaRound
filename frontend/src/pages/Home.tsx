// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { Button, Dropdown, Col, Form, Grid, Input, Layout, List, Modal, Row, Space, Tag, Typography, message } from 'antd';

import { useCallback, useEffect, useRef, useState } from 'react';

import { getLLMConfigs, streamChatByLLMConfig, syncChatByLLMConfig } from '../api/llm';
import type { LLMConfig } from '../api/llm';
import AppHeader from '../components/AppHeader';
import RoundtableCanvas from '../components/RoundtableCanvas';
import type { MaterialInfo } from '../api/material';
import ConsensusSummary from '../components/ConsensusSummary';
import {
  cancelRuntimeTask,
  getRoomRuntimeSnapshot,
  startRoundtableRun,
  streamRuntimeTask,
  summarizeRoundtableMessages,
  trackRuntimeEvent,
} from '../api/runtime';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../hooks/useWorkspace';
import type { StepKey, RoundtableRoom, IntentCardState, RoleMember, RoundtableStage, JudgeState, BoardDispute } from '../hooks/useWorkspace';
import { normalizeRoundtableMessage } from '../hooks/useWorkspace';
import type { WorkspaceData } from '../api/workspace';
import { createWorkspace, listWorkspaces, getWorkspace, updateWorkspace, deleteWorkspace } from '../api/workspace';

const { Sider, Content, Footer } = Layout;
const { Text } = Typography;

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

type ReplyViewMode = 'compact' | 'detailed';

const getReplyViewModeStorageKey = (userId?: number) => `idearound_reply_view_mode_${userId ?? 'guest'}`;







import { StepDemandRecognition } from './home/StepDemandRecognition';
import { StepRoleMatrix } from './home/StepRoleMatrix';
import { StepRoundtableView } from './home/StepRoundtableView';
import { RoleModals } from './home/RoleModals';
import { ExpertModeConfig } from './home/ExpertModeConfig';
import './Home.css';

function Home() {
  const { isAuthenticated, user } = useAuth();
  const { state: workspaceState, actions: _workspaceActions } = useWorkspace();
  const {
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
  } = workspaceState;

  // CSS 已提取到 Home.css

  const [models, setModels] = useState<LLMConfig[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [probeQuestions, setProbeQuestions] = useState<ProbeQuestion[]>([]);
  const [probeTurns, setProbeTurns] = useState<ProbeTurn[]>([]);
  
  const [roleTemplates, setRoleTemplates] = useState<{id: number; name: string; stance: string; description?: string; soul_config?: string; is_active?: boolean; is_default?: boolean; skill_tags?: string[]; category?: string}[]>([]);
  const [scenarioTemplates, setScenarioTemplates] = useState<{id: number; name: string; description?: string; preset_roles: number[]; system_prompt_override?: string; is_active: boolean}[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<Record<string, string>>({});
  const [moderatorSummaryMode, setModeratorSummaryMode] = useState<'disabled' | 'manual' | 'per_round' | 'auto'>('auto');
  
  const [autoBrainstorm, setAutoBrainstorm] = useState(true);
  const [userPrompt, setUserPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [replyViewMode, setReplyViewMode] = useState<ReplyViewMode>(() => {
    try {
      const cachedMode = localStorage.getItem(getReplyViewModeStorageKey(user?.id));
      return cachedMode === 'detailed' ? 'detailed' : 'compact';
    } catch {
      return 'compact';
    }
  });
  const [expandedMessageIds, setExpandedMessageIds] = useState<string[]>([]);
  const [backendWorkspaceIds, setBackendWorkspaceIds] = useState<Set<string>>(new Set());
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [pendingRoundtableRun, setPendingRoundtableRun] = useState<{ roomId: string; text: string; stage: RoundtableStage; trigger?: 'user' | 'host'; systemPrompt?: string } | null>(null);
  const [uploadedMaterials, setUploadedMaterials] = useState<MaterialInfo[]>([]);
  const [preUploadRoomId] = useState<string>(`pre_${Date.now().toString(36)}`);
  const [generatingExpectedResult, setGeneratingExpectedResult] = useState(false);
  const [autoConversationEnabled, setAutoConversationEnabled] = useState(true);
  const [judgeScore, setJudgeScore] = useState<number>(judgeState.score);
  const [judgeReason, setJudgeReason] = useState<string>(judgeState.reason);
  
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
  const pendingSummaryIdsRef = useRef<Set<string>>(new Set());
  const trackedReplyModeKeyRef = useRef<string>('');
  const [form] = Form.useForm();
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [siderDrawerOpen, setSiderDrawerOpen] = useState(false);

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

  const parseJsonObject = (text: string) => {
    const normalizedText = text.trim();
    const tryParseCandidate = (candidateText: string, depth = 0): any => {
      if (!candidateText || depth > 2) {
        return null;
      }

      try {
        const parsed = JSON.parse(candidateText);
        if (typeof parsed === 'string') {
          const nestedText = parsed.trim();
          if ((nestedText.startsWith('{') && nestedText.endsWith('}'))
            || (nestedText.startsWith('[') && nestedText.endsWith(']'))) {
            return tryParseCandidate(nestedText, depth + 1);
          }
        }
        return parsed;
      } catch {
        return null;
      }
    };

    const candidates: string[] = [];
    const fencedMatch = normalizedText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      candidates.push(fencedMatch[1].trim());
    }
    candidates.push(normalizedText);

    const extractedCandidates: string[] = [];
    let startIndex = -1;
    const stack: string[] = [];
    let inString = false;
    let isEscaped = false;

    for (let index = 0; index < normalizedText.length; index += 1) {
      const char = normalizedText[index];

      if (inString) {
        if (isEscaped) {
          isEscaped = false;
          continue;
        }
        if (char === '\\') {
          isEscaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === '{' || char === '[') {
        if (stack.length === 0) {
          startIndex = index;
        }
        stack.push(char);
        continue;
      }

      if (char !== '}' && char !== ']') {
        continue;
      }

      if (stack.length === 0) {
        continue;
      }

      const expectedOpening = char === '}' ? '{' : '[';
      if (stack[stack.length - 1] !== expectedOpening) {
        stack.length = 0;
        startIndex = -1;
        continue;
      }

      stack.pop();
      if (stack.length === 0 && startIndex >= 0) {
        extractedCandidates.push(normalizedText.slice(startIndex, index + 1));
        startIndex = -1;
      }
    }

    candidates.push(...extractedCandidates);

    for (const candidate of candidates) {
      const parsed = tryParseCandidate(candidate);
      if (parsed !== null) {
        return parsed;
      }
    }

    return null;
  };

  const generateExpectedResultByIntent = async (intentData: IntentCardState) => {
    const fallback = `围绕「${intentData.coreGoal || '当前需求'}」形成可执行方案，并明确关键路径、风险对策与可验证指标。`;
    if (!selectedModelId) {
      return fallback;
    }
    const prompt = `基于意图洞察生成"期望结果"，不超过80字，不用标题和列表。
目标:${intentData.coreGoal || '无'} 限制:${intentData.constraints || '无'} 痛点:${intentData.painPoints || '无'}`;
    try {
      const text = await syncChatByLLMConfig(selectedModelId, {
        message: prompt,
        system_prompt: '你是产品目标设定专家，把需求转化为可检验的期望结果描述。直接输出结果文本。',
        max_tokens: 256,
      });
      return text || fallback;
    } catch {
      return fallback;
    }
  };

  const applyJudgeResult = useCallback((payload?: Record<string, unknown> | null) => {
    if (!payload) {
      return;
    }
    // 兼容服务端 snake_case（consensus_count / resolved_pain_points / next_focus）
    // 和运行时任务 payload 的 camelCase（consensusCount / resolvedPainPoints / nextFocus）
    const rawConsensusCount = payload.consensus_count ?? payload.consensusCount;
    const rawResolvedPainPoints = payload.resolved_pain_points ?? payload.resolvedPainPoints;
    const rawNextFocus = payload.next_focus ?? payload.nextFocus;
    const nextState: JudgeState = {
      score: Number(payload.score) || 0,
      reason: typeof payload.reason === 'string' ? payload.reason : '',
      reached: Boolean(payload.reached),
      consensusCount: Number(rawConsensusCount) || 0,
      resolvedPainPoints: Number(rawResolvedPainPoints) || 0,
      nextFocus: typeof rawNextFocus === 'string' ? rawNextFocus : '',
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
    // 兼容服务端 snake_case next_questions 和运行时 camelCase nextQuestions
    const rawNextQuestions = Array.isArray(payload.next_questions)
      ? (payload.next_questions as string[])
      : (Array.isArray(payload.nextQuestions) ? (payload.nextQuestions as string[]) : []);
    setConsensusBoard({
      summary: typeof payload.summary === 'string' ? payload.summary : '',
      consensus: Array.isArray(payload.consensus) ? payload.consensus as string[] : [],
      disputes: Array.isArray(payload.disputes) ? payload.disputes as BoardDispute[] : [],
      nextQuestions: rawNextQuestions,
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

  /**
   * 主持人消息发送后，从服务器拉取完整的工作台状态并同步到前端。
   * 仅刷新运行时相关字段（消息列表、评审状态、共识面板、画布），
   * 不覆盖用户主动设置的步骤、模型、角色等配置。
   * 设置 suppressBackendSaveRef 避免刷新后触发反向回写。
   */
  const refreshWorkspaceFromServer = useCallback(async (targetRoomId: string) => {
    if (!isAuthenticated || !targetRoomId) {
      return;
    }
    suppressBackendSaveRef.current = true;
    try {
      const workspace = await getWorkspace(targetRoomId);
      if (!workspace?.data) {
        return;
      }
      const { data } = workspace;

      if (Array.isArray(data.messages) && data.messages.length > 0) {
        setMessages(
          data.messages.map((msg) =>
            normalizeRoundtableMessage(msg as unknown as Record<string, unknown>),
          ),
        );
      }
      if (data.judge_state) {
        applyJudgeResult(data.judge_state as unknown as Record<string, unknown>);
      }
      if (data.consensus_board) {
        applyBoardResult(data.consensus_board as unknown as Record<string, unknown>);
      }
      if (Array.isArray(data.canvas_consensus)) {
        setCanvasConsensus(data.canvas_consensus);
      }
      if (Array.isArray(data.canvas_disputes)) {
        setCanvasDisputes(data.canvas_disputes);
      }
      if (data.canvas_updated_at) {
        setCanvasUpdatedAt(data.canvas_updated_at);
      }
      if (data.roundtable_stage === 'brief' || data.roundtable_stage === 'final') {
        setRoundtableStage(data.roundtable_stage as RoundtableStage);
      }
      if (typeof data.auto_round_count === 'number') {
        setAutoRoundCount(data.auto_round_count);
      }
    } catch (error) {
      console.error('从服务器刷新工作台状态失败:', error);
    } finally {
      // 延迟释放，让 React 批量 setState 先完成再允许回写
      setTimeout(() => {
        suppressBackendSaveRef.current = false;
      }, 300);
    }
  }, [
    isAuthenticated,
    applyBoardResult,
    applyJudgeResult,
    setMessages,
    setCanvasConsensus,
    setCanvasDisputes,
    setCanvasUpdatedAt,
    setRoundtableStage,
    setAutoRoundCount,
  ]);

  const applyRoundtableTaskPayload = useCallback((payload?: Record<string, unknown> | null) => {
    if (!payload) {
      return;
    }

    const nextMessages = Array.isArray(payload.messages) ? payload.messages : [];
    if (nextMessages.length > 0) {
      setMessages(() => {
        // We want to avoid replacing the user's immediate input with an older snapshot
        // when the stream just starts. But the backend's stream is the source of truth
        // for agent messages.
        const normalized = nextMessages.map((msg) => normalizeRoundtableMessage(msg as Record<string, unknown>));
        
        // Let's do a simple optimization: if the new messages are exactly the same 
        // length as prev, and nothing is streaming, we might not need to update.
        // But for safety and simplicity, we just take the backend's state as it's
        // continually streaming updates.
        return normalized;
      });
    }

    if (payload.judge_state) {
      applyJudgeResult((payload.judge_state as Record<string, unknown> | undefined) || null);
    }
    if (payload.consensus_board) {
      applyBoardResult((payload.consensus_board as Record<string, unknown> | undefined) || null);
    }
    
    if (Array.isArray(payload.canvas_consensus)) {
      setCanvasConsensus(payload.canvas_consensus as string[]);
    }
    if (Array.isArray(payload.canvas_disputes)) {
      setCanvasDisputes(payload.canvas_disputes as string[]);
    }
    
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
            // 主持人消息对应任务结束后，从服务器全量同步工作台状态，
            // 确保消息列表、评审评分、共识面板与后端保持一致
            if (task.room_id) {
              void refreshWorkspaceFromServer(task.room_id);
            }
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
  }, [applyRoundtableTaskPayload, refreshRuntimeSnapshot, refreshWorkspaceFromServer]);

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
    setRoles(data.roles.map((role: any) => ({
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
    setMessages(data.messages.map((msg: any) => normalizeRoundtableMessage(msg as unknown as Record<string, unknown>)));
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
      // 兼容服务端 snake_case 和本地快照 camelCase
      consensusCount: data.judge_state?.consensus_count ?? data.judge_state?.consensusCount ?? 0,
      resolvedPainPoints: data.judge_state?.resolved_pain_points ?? data.judge_state?.resolvedPainPoints ?? 0,
      nextFocus: data.judge_state?.next_focus ?? data.judge_state?.nextFocus ?? '',
      updatedAt: data.judge_state?.updated_at,
    });
    setJudgeScore(data.judge_state?.score || 0);
    setJudgeReason(data.judge_state?.reason || '');
    setConsensusBoard({
      summary: data.consensus_board?.summary || '',
      consensus: data.consensus_board?.consensus || [],
      disputes: data.consensus_board?.disputes || [],
      // 兼容服务端 snake_case next_questions 和旧版 camelCase nextQuestions
      nextQuestions: data.consensus_board?.next_questions ?? data.consensus_board?.nextQuestions ?? [],
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

  const handleReplyViewModeChange = useCallback((mode: ReplyViewMode) => {
    setReplyViewMode(mode);
    setExpandedMessageIds([]);
    try {
      localStorage.setItem(getReplyViewModeStorageKey(user?.id), mode);
    } catch (error) {
      console.error('缓存回复展示模式失败:', error);
    }
    if (user?.id) {
      void trackRuntimeEvent({
        room_id: roomId || undefined,
        user_id: user.id,
        event_type: 'ui.reply_view_mode.changed',
        event_payload: {
          mode,
          room_ready: roomReady,
        },
      }).catch((error) => console.error('记录回复展示切换失败:', error));
    }
  }, [roomId, roomReady, user?.id]);

  const toggleExpandedMessage = useCallback((messageId: string) => {
    setExpandedMessageIds((prev) =>
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId],
    );
  }, []);

  const requestMissingSummaries = useCallback(async () => {
    if (!selectedModelId) {
      return;
    }

    const targets = messages.filter(
      (msg) =>
        msg.speakerType === 'agent' &&
        !msg.summary?.trim() &&
        msg.summaryStatus !== 'loading' &&
        !pendingSummaryIdsRef.current.has(msg.id),
    );

    if (targets.length === 0) {
      return;
    }

    const targetIds = new Set(targets.map((msg) => msg.id));
    targets.forEach((msg) => pendingSummaryIdsRef.current.add(msg.id));
    setMessages((prev) =>
      prev.map((msg) => (targetIds.has(msg.id) ? { ...msg, summaryStatus: 'loading' } : msg)),
    );

    try {
      const response = await summarizeRoundtableMessages({
        room_id: roomId || undefined,
        model_id: selectedModelId,
        messages: targets.map((msg) => ({
          id: msg.id,
          speaker_id: msg.speakerId,
          speaker_name: msg.speakerName,
          speaker_type: msg.speakerType,
          content: msg.content,
          summary: msg.summary,
          summary_metrics: msg.summaryMetrics ?? undefined,
          created_at: msg.createdAt,
          streaming: msg.streaming,
        })),
      });
      const summaryById = new Map(response.items.map((item) => [item.message_id, item]));
      setMessages((prev) =>
        prev.map((msg) => {
          const summaryItem = summaryById.get(msg.id);
          if (!summaryItem) {
            return targetIds.has(msg.id) ? { ...msg, summaryStatus: 'failed' } : msg;
          }
          return {
            ...msg,
            summary: summaryItem.summary,
            summaryStatus: 'ready',
            summaryMetrics: {
              ...(msg.summaryMetrics || {}),
              duration_ms: summaryItem.duration_ms,
              semantic_consistency: summaryItem.semantic_consistency,
              meets_rt_target: summaryItem.meets_rt_target,
              summary_length: summaryItem.summary.length,
            },
          };
        }),
      );
    } catch (error) {
      console.error('生成消息摘要失败:', error);
      setMessages((prev) =>
        prev.map((msg) => (targetIds.has(msg.id) ? { ...msg, summaryStatus: 'failed' } : msg)),
      );
    } finally {
      targetIds.forEach((id) => pendingSummaryIdsRef.current.delete(id));
    }
  }, [messages, roomId, selectedModelId]);

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

  const loadModeratorSummaryMode = async () => {
    try {
      const response = await fetch('/api/v1/roundtable-configs/moderator-summary-mode');
      if (response.ok) {
        const data = await response.json();
        if (data.mode && ['disabled', 'manual', 'per_round', 'auto'].includes(data.mode)) {
          setModeratorSummaryMode(data.mode as 'disabled' | 'manual' | 'per_round' | 'auto');
        }
      }
    } catch (e) {
      console.error('加载主持人总结模式失败:', e);
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
    loadModeratorSummaryMode();
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
      localStorage.setItem('idearound_workspace', JSON.stringify(stateToSave));
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
    const cachedMode = (() => {
      try {
        const value = localStorage.getItem(getReplyViewModeStorageKey(user?.id));
        return value === 'detailed' ? 'detailed' : 'compact';
      } catch {
        return 'compact';
      }
    })();
    setReplyViewMode(cachedMode);
    setExpandedMessageIds([]);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) {
      return;
    }
    const trackingKey = `${user.id}:${replyViewMode}`;
    if (trackedReplyModeKeyRef.current === trackingKey) {
      return;
    }
    trackedReplyModeKeyRef.current = trackingKey;
    void trackRuntimeEvent({
      room_id: roomId || undefined,
      user_id: user.id,
      event_type: 'ui.reply_view_mode.applied',
      event_payload: {
        mode: replyViewMode,
        source: 'cached_or_default',
      },
    }).catch((error) => console.error('记录回复展示模式失败:', error));
  }, [replyViewMode, roomId, user?.id]);

  useEffect(() => {
    void requestMissingSummaries();
  }, [requestMissingSummaries]);

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

  // 基于意图和大模型智能选择角色（优化版：使用同步调用+紧凑prompt+max_tokens限制）
  const generateRolesByIntentWithAI = async (
    intentData: IntentCardState,
    availableTemplates: typeof roleTemplates
  ): Promise<RoleMember[]> => {
    if (!selectedModelId || availableTemplates.length === 0) {
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

    // 构建紧凑角色候选列表（去掉长文本字段）
    const roleCandidates = availableTemplates
      .filter((tpl) => tpl.is_active !== false)
      .map((tpl) => ({ id: tpl.id, name: tpl.name, stance: tpl.stance, cat: tpl.category || '' }));

    const prompt = `从候选角色中选3-6个参与讨论，确保覆盖建设+对抗/评审立场。
目标:${intentData.coreGoal || '无'} 限制:${intentData.constraints || '无'} 痛点:${intentData.painPoints || '无'}
候选:${JSON.stringify(roleCandidates)}
只输出ID数组如[1,5,8]`;

    try {
      const rawJson = await syncChatByLLMConfig(selectedModelId, {
        message: prompt,
        system_prompt: '只输出JSON格式的角色ID数组，不要有任何解释文字。',
        max_tokens: 128,
      });
      const selectedIds = parseJsonObject(rawJson);

      if (Array.isArray(selectedIds) && selectedIds.length > 0) {
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
    
    // 如果没有开启高级模式，则并行执行意图分析+角色选择，加速至5秒内
    if (!isExpertMode) {
      const loadingMsg = message.loading('AI主持人正在分析需求并组建圆桌...', 0);
      try {
        const materialContent = uploadedMaterials.length > 0 
          ? `附件材料摘要：${uploadedMaterials.map(m => m.summary || m.filename).join(';')}` 
          : '';
        const fullDemand = `${initialDemand}\n${materialContent}`;

        // 构建紧凑的角色候选列表（去除长文本减少token消耗）
        const roleCandidates = roleTemplates
          .filter((tpl) => tpl.is_active !== false)
          .map((tpl) => ({ id: tpl.id, name: tpl.name, stance: tpl.stance, cat: tpl.category || '' }));

        // 紧凑 prompt：意图分析（单次调用提取意图卡片+期望结果）
        const intentPrompt = `根据用户输入提炼意图卡片和期望结果。
用户输入：${fullDemand}
严格输出JSON：{"coreGoal":"核心目标(≤30字)","constraints":"限制条件(简明;无则填无)","painPoints":"核心痛点(简明;无则填无)","expectedResult":"期望结果(≤80字)"}`;

        // 紧凑 prompt：角色选择（独立调用，与意图分析并行）
        const rolePrompt = `从候选角色中选3-6个参与讨论，确保覆盖建设+对抗/评审立场。
需求：${fullDemand}
候选：${JSON.stringify(roleCandidates)}
只输出ID数组如[1,5,8]`;

        // 并行发起两次 LLM 调用
        const [intentResult, roleResult] = await Promise.all([
          syncChatByLLMConfig(selectedModelId, {
            message: intentPrompt,
            system_prompt: '只输出合法JSON，不要包含任何其他文字。',
            max_tokens: 512,
          }).then(raw => ({ raw, parsed: parseJsonObject(raw) })),
          syncChatByLLMConfig(selectedModelId, {
            message: rolePrompt,
            system_prompt: '只输出JSON格式的角色ID数组，不要有任何解释文字。',
            max_tokens: 128,
          }).then(raw => parseJsonObject(raw)),
        ]);

        const parsedData = intentResult.parsed;
        if (!parsedData) {
          console.warn('意图JSON解析失败，模型原始响应:', intentResult.raw, '— 将使用默认意图卡片降级处理');
        }

        const fallbackGoal = initialDemand.trim().slice(0, 30) || '用户需求';
        const newIntent = {
          coreGoal: parsedData?.coreGoal || fallbackGoal,
          constraints: parsedData?.constraints || '无',
          painPoints: parsedData?.painPoints || '无'
        };
        setIntentCard(newIntent);
        setExpectedResult(parsedData?.expectedResult || `围绕「${newIntent.coreGoal}」形成可执行方案`);

        // 处理角色选择结果
        let selectedRoles: RoleMember[] = [];
        if (Array.isArray(roleResult) && roleResult.length > 0) {
          selectedRoles = roleTemplates
            .filter((tpl) => roleResult.includes(tpl.id))
            .map((tpl) => ({
              id: `role_${tpl.id}`,
              name: tpl.name,
              stance: tpl.stance as '建设' | '对抗' | '中立' | '评审',
              desc: tpl.description || '',
              selected: true,
              soulConfig: tpl.soul_config,
            }));
        }
        // 也兼容旧格式：意图结果中包含 roleIds
        if (selectedRoles.length === 0 && Array.isArray(parsedData?.roleIds) && parsedData.roleIds.length > 0) {
          selectedRoles = roleTemplates
            .filter((tpl) => parsedData.roleIds.includes(tpl.id))
            .map((tpl) => ({
              id: `role_${tpl.id}`,
              name: tpl.name,
              stance: tpl.stance as '建设' | '对抗' | '中立' | '评审',
              desc: tpl.description || '',
              selected: true,
              soulConfig: tpl.soul_config,
            }));
        }
        if (selectedRoles.length === 0) {
          selectedRoles = roleTemplates
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
        }

        setRoles(selectedRoles);
        setIntentReady(true);
        setStep('roles');

        loadingMsg();
        message.success('需求分析完毕，AI 已为您智能匹配专业角色阵型');
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
    // 并行执行：生成期望结果 + 智能选择角色（两者无依赖关系）
    const loadingMsg = message.loading('正在分析意图并匹配角色...', 0);
    setGeneratingExpectedResult(true);
    try {
      const needExpectedResult = !expectedResult.trim();
      const [expectedResultText, generatedRoles] = await Promise.all([
        needExpectedResult
          ? generateExpectedResultByIntent(values as IntentCardState)
          : Promise.resolve(expectedResult.trim()),
        generateRolesByIntentWithAI(values as IntentCardState, roleTemplates),
      ]);
      if (needExpectedResult && expectedResultText) {
        setExpectedResult(expectedResultText);
      }
      if (!expectedResultText && !expectedResult.trim()) {
        message.warning('请先生成或填写期望结果');
        return;
      }
      setRoles(generatedRoles);
      setIntentReady(true);
      setStep('roles');
      message.success('意图洞察完成，AI 已为您智能匹配最佳角色矩阵');
    } catch (error) {
      console.error('意图确认失败:', error);
      message.error('分析失败，已使用默认角色组合');
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
      setIntentReady(true);
      setStep('roles');
    } finally {
      loadingMsg();
      setGeneratingExpectedResult(false);
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
    setSiderDrawerOpen(false);
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
    setSiderDrawerOpen(false);
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
        summary: userText,
        summaryStatus: 'ready' as const,
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
        moderator_summary_mode: moderatorSummaryMode,
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
          summary: msg.summary,
          summary_metrics: msg.summaryMetrics,
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
        isMobile={isMobile}
        onMenuToggle={() => setSiderDrawerOpen(true)}
      />

      <Layout style={{ overflow: 'hidden', height: 'calc(100dvh - 64px)' }}>
        {isMobile && siderDrawerOpen && (
          <div
            className="mobile-sider-backdrop"
            onClick={() => setSiderDrawerOpen(false)}
            style={{ position: 'fixed', inset: 0, top: 64, background: 'rgba(0,0,0,0.45)', zIndex: 99, transition: 'opacity 0.3s' }}
          />
        )}
        <Sider
          width={isMobile ? 280 : 220}
          style={{
            background: '#fff',
            borderRight: '1px solid #f0f0f0',
            ...(isMobile ? {
              position: 'fixed',
              top: 64,
              left: 0,
              bottom: 0,
              zIndex: 100,
              transform: siderDrawerOpen ? 'translateX(0)' : 'translateX(-100%)',
              transition: 'transform 0.3s cubic-bezier(0.23, 1, 0.32, 1)',
              boxShadow: siderDrawerOpen ? '6px 0 16px rgba(0,0,0,0.12)' : 'none',
            } : {}),
          }}
        >
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
                              onClick: (e: any) => {
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
                              onClick: (e: any) => {
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
          <Content style={{ padding: isMobile ? 8 : 16, flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {step === 'roundtable' && !isExpertMode && (
              <StepDemandRecognition
                initialDemand={initialDemand}
                uploadedMaterials={uploadedMaterials}
                intentCard={intentCard}
                isExpertMode={isExpertMode}
                scenarioTemplates={scenarioTemplates}
                roomId={roomId}
                preUploadRoomId={preUploadRoomId}
                onInitialDemandChange={setInitialDemand}
                onMaterialsAnalyzed={handleMaterialsAnalyzed}
                onIntentSynthesized={(result: any) => {
                  if (result.synthesized_intent.core_goal && !intentCard.coreGoal) {
                    setIntentCard((prev) => ({
                      ...prev,
                      coreGoal: result.synthesized_intent.core_goal,
                      constraints: result.synthesized_intent.constraints || prev.constraints,
                      painPoints: result.synthesized_intent.pain_points || prev.painPoints,
                    }));
                  }
                }}
                onStartIntentProbing={startIntentProbing}
                onIsExpertModeChange={setIsExpertMode}
                onSelectScenarioTemplate={selectScenarioTemplate}
              />
            )}
            
            {step === 'roundtable' && isExpertMode && (
              <ExpertModeConfig
                initialDemand={initialDemand}
                uploadedMaterials={uploadedMaterials}
                intentCard={intentCard}
                isExpertMode={isExpertMode}
                scenarioTemplates={scenarioTemplates}
                roomId={roomId}
                preUploadRoomId={preUploadRoomId}
                onInitialDemandChange={setInitialDemand}
                onMaterialsAnalyzed={handleMaterialsAnalyzed}
                onIntentSynthesized={(result: any) => {
                  if (result.synthesized_intent.core_goal && !intentCard.coreGoal) {
                    setIntentCard((prev) => ({
                      ...prev,
                      coreGoal: result.synthesized_intent.core_goal,
                      constraints: result.synthesized_intent.constraints || prev.constraints,
                      painPoints: result.synthesized_intent.pain_points || prev.painPoints,
                    }));
                  }
                }}
                onStartIntentProbing={startIntentProbing}
                onIsExpertModeChange={setIsExpertMode}
                onSelectScenarioTemplate={selectScenarioTemplate}
                probeTurns={probeTurns}
                probeQuestions={probeQuestions}
                customProbeOptions={customProbeOptions}
                onCustomProbeOptionsChange={setCustomProbeOptions}
                onApplyProbeAnswer={applyProbeAnswer}
                onResetAnalysisState={() => {
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
                models={models}
                loadingModels={loadingModels}
                selectedModelId={selectedModelId}
                onSelectedModelIdChange={setSelectedModelId}
                systemPrompt={systemPrompt}
                onSystemPromptChange={setSystemPrompt}
                promptTemplates={promptTemplates}
                expectedResult={expectedResult}
                onExpectedResultChange={setExpectedResult}
                maxDialogueRounds={maxDialogueRounds}
                onMaxDialogueRoundsChange={setMaxDialogueRounds}
                form={form}
                generatingExpectedResult={generatingExpectedResult}
                onGenerateExpectedResult={async () => {
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
                onIntentCardChange={(val) => setIntentCard(val)}
                onConfirmIntent={confirmIntent}
              />
            )}

            {step === 'roles' && (
              <StepRoleMatrix
                roles={roles}
                isReGeneratingRoles={isReGeneratingRoles}
                intentCard={intentCard}
                intentReady={intentReady}
                expectedResult={expectedResult}
                maxDialogueRounds={maxDialogueRounds}
                autoBrainstorm={autoBrainstorm}
                onGenerateRoles={reGenerateRoles}
                onRemoveRole={(id) => {
                  setRoles((prev) => prev.filter((r) => r.id !== id));
                }}
                onToggleRoleSelected={toggleRoleSelected}
                onEditSoulConfig={(role) => {
                  setEditingSoulConfigRole(role);
                  setEditingSoulConfigText(role.soulConfig || '');
                }}
                onShowAddRoleModal={() => {
                  setAddRoleForm({ name: '', stance: '建设', desc: '' });
                  setNewRoleName('');
                  setAddRoleModalVisible(true);
                }}
                onShowTemplatePicker={() => setTemplatePickerVisible(true)}
                  onExpectedResultChange={setExpectedResult}
                  onMaxRoundsChange={setMaxDialogueRounds}
                onAutoBrainstormChange={setAutoBrainstorm}
                onConfirmRoles={confirmRoles}
              />
            )}

            <RoleModals
              editingSoulConfigRole={editingSoulConfigRole}
              editingSoulConfigText={editingSoulConfigText}
              addRoleModalVisible={addRoleModalVisible}
              newRoleName={newRoleName}
              addRoleForm={addRoleForm}
              templatePickerVisible={templatePickerVisible}
              roleTemplates={roleTemplates}
              roles={roles}
              onEditingSoulConfigRoleChange={setEditingSoulConfigRole}
              onEditingSoulConfigTextChange={setEditingSoulConfigText}
              onSaveSoulConfig={() => {
                if (editingSoulConfigRole) {
                  setRoles((prev) =>
                    prev.map((r) =>
                      r.id === editingSoulConfigRole.id ? { ...r, soulConfig: editingSoulConfigText } : r)
                  );
                  message.success('灵魂配置已更新');
                  setEditingSoulConfigRole(null);
                }
              }}
              onAddRoleModalVisibleChange={setAddRoleModalVisible}
              onNewRoleNameChange={setNewRoleName}
              onAddRoleFormChange={setAddRoleForm}
              onAddCustomRole={addCustomRole}
              onTemplatePickerVisibleChange={setTemplatePickerVisible}
              onAddRoleFromTemplate={addRoleFromTemplate}
            />

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
              <StepRoundtableView
                roomReady={roomReady}
                messages={messages}
                expandedMessageIds={expandedMessageIds}
                replyViewMode={replyViewMode}
                judgeState={judgeState}
                judgeScore={judgeScore}
                judgeReason={judgeReason}
                consensusBoard={consensusBoard}
                runtimePendingTasks={runtimePendingTasks}
                onToggleExpandedMessage={toggleExpandedMessage}
                onReplyViewModeChange={handleReplyViewModeChange}
              />
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
            <Footer style={{ background: '#ffffff', borderTop: '1px solid #f0f0f0', marginTop: 5, padding: isMobile ? '12px 8px' : undefined }}>
              {step !== 'roundtable' && (
              <Row justify="space-between" align="middle" wrap>
                <Col xs={24} md={12}>
                  <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>
                    先完成意图洞察与角色确认，再进入圆桌空间开始群聊脑暴。
                  </Text>
                </Col>
                <Col xs={24} md={12} style={{ textAlign: isMobile ? 'left' : 'right', marginTop: isMobile ? 4 : 0 }}>
                  <Space wrap size={4}>
                    <Tag color={intentReady ? 'green' : 'default'}>意图洞察 {intentReady ? '✓' : '○'}</Tag>
                    <Tag color={rolesReady ? 'green' : 'default'}>角色矩阵 {rolesReady ? '✓' : '○'}</Tag>
                  </Space>
                </Col>
              </Row>
              )}
              {(step === 'roundtable_view') && (
              <div>
                <Space wrap size={4} style={{ marginBottom: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>🎤 主持人干预：</Text>
                  <Tag color={moderatorSummaryMode === 'disabled' ? 'red' : moderatorSummaryMode === 'manual' ? 'orange' : moderatorSummaryMode === 'per_round' ? 'blue' : 'green'} style={{ fontSize: 11 }}>
                    {moderatorSummaryMode === 'disabled' ? '总结已禁用' : moderatorSummaryMode === 'manual' ? '手动总结' : moderatorSummaryMode === 'per_round' ? '每轮总结' : '智能总结'}
                  </Tag>
                  <Button size="small" onClick={() => applyHostAction('focus')}>🎯 拉回</Button>
                  <Button size="small" onClick={() => applyHostAction('conflict')}>⚔️ 对抗</Button>
                  <Button size="small" onClick={() => setNewIdeaModalOpen(true)}>💡 新点子</Button>
                  {moderatorSummaryMode !== 'disabled' && (
                    <Button size="small" onClick={() => applyHostAction('summarize')} danger>🛑 总结</Button>
                  )}
                </Space>
                <Row gutter={8} align="bottom">
                  <Col flex="auto">
                    <Input.TextArea
                      rows={isMobile ? 2 : 3}
                      maxLength={1000}
                      showCount
                      value={userPrompt}
                      onChange={(e) => setUserPrompt(e.target.value)}
                      placeholder={isMobile ? '输入观点/问题...' : '输入你的观点/问题（你是特殊角色，可通过系统提示词纠偏整个圆桌）'}
                    />
                  </Col>
                  <Col>
                    <Space direction={isMobile ? 'horizontal' : 'vertical'} size={4}>
                      <Button type="primary" loading={sending} onClick={() => void sendToRoundtable()}>
                        发送
                      </Button>
                      <Button disabled={!sending} onClick={stopStreaming}>
                        停止
                      </Button>
                    </Space>
                  </Col>
                </Row>
              </div>
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
