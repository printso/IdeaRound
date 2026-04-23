// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { Button, Dropdown, Col, Grid, Input, Layout, List, Modal, Row, Space, Tag, Typography, message } from 'antd';

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
import type { StepKey, RoundtableRoom, RoleMember, RoundtableStage, JudgeState, BoardDispute } from '../hooks/useWorkspace';
import { normalizeRoundtableMessage } from '../hooks/useWorkspace';
import type { WorkspaceData } from '../api/workspace';
import { createWorkspace, listWorkspaces, getWorkspace, updateWorkspace, deleteWorkspace } from '../api/workspace';
import {
  exportRoundtableDocx,
  exportRoundtableMarkdown,
  exportRoundtablePdf,
} from '../utils/roundtableExport';

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








import { StepDemandRecognition } from './home/StepDemandRecognition';
import { StepRoleMatrix } from './home/StepRoleMatrix';
import { StepRoundtableView } from './home/StepRoundtableView';
import { RoleModals } from './home/RoleModals';
import { ExpertModeConfig } from './home/ExpertModeConfig';
import './Home.css';

function Home() {
  const { isAuthenticated } = useAuth();
  const { state: workspaceState, actions: _workspaceActions } = useWorkspace();
  const {
    step, setStep,
    roomId, setRoomId,
    roomReady, setRoomReady,
    roundtableRooms, setRoundtableRooms,
    initialDemand, setInitialDemand,
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
  const [promptTemplates, setPromptTemplates] = useState<Record<string, string>>({});
  const [moderatorSummaryMode, setModeratorSummaryMode] = useState<'disabled' | 'manual' | 'per_round' | 'auto'>('auto');
  
  const [autoBrainstorm, setAutoBrainstorm] = useState(true);
  const [userPrompt, setUserPrompt] = useState('');
  const [sending, setSending] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'md' | 'pdf' | 'docx' | null>(null);
  const [roundtableNotice, setRoundtableNotice] = useState<{
    type: 'info' | 'warning' | 'error';
    message: string;
    actionText?: string;
    onAction?: () => void;
  } | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [backendWorkspaceIds, setBackendWorkspaceIds] = useState<Set<string>>(new Set());
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [pendingRoundtableRun, setPendingRoundtableRun] = useState<{ roomId: string; text: string; stage: RoundtableStage; trigger?: 'user' | 'host'; systemPrompt?: string } | null>(null);
  const [uploadedMaterials, setUploadedMaterials] = useState<MaterialInfo[]>([]);
  const [preUploadRoomId] = useState<string>(`pre_${Date.now().toString(36)}`);
  const [generatingExpectedResult, setGeneratingExpectedResult] = useState(false);
  const [autoConversationEnabled, setAutoConversationEnabled] = useState(true);
  const [judgeScore, setJudgeScore] = useState<number>(judgeState.score);
  const [judgeReason, setJudgeReason] = useState<string>(judgeState.reason);
  const [discussionMetrics, setDiscussionMetrics] = useState<{
    round: number;
    new_points: number;
    duplicate_rate: number;
    problem_solution_ratio: string;
    conflict_count: number;
    avg_role_duration_ms: number;
    resolved_topics: number;
  } | null>(null);
  
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
  const intentAnalysisRunIdRef = useRef<number>(0);
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  const [siderDrawerOpen, setSiderDrawerOpen] = useState(false);

  // 生成基于意图洞察的摘要标题
  const generateIntentSummaryTitle = async (intentData: {
    initialDemand: string;
    probeTurns: ProbeTurn[];
    expectedResult?: string;
  }, creationTime?: Date): Promise<string> => {
    try {
      const { initialDemand, probeTurns, expectedResult } = intentData;
      const timeToUse = creationTime || new Date();
      
      // 如果没有选择模型或没有数据，返回默认标题
      if (!selectedModelId || !initialDemand.trim()) {
        return `圆桌空间_${timeToUse.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      // 构建提示词
      const prompt = `基于以下意图洞察信息，生成一个20字以内的中文摘要标题。要求：简洁明了，概括核心意图，不包含技术术语，适合作为圆桌空间名称。
      
原始需求：${initialDemand || '无'}
期望结果：${expectedResult || '无'}
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
        const defaultTitle = initialDemand ? `${initialDemand.substring(0, 15)}` : '圆桌空间';
        return `${defaultTitle}_${timeToUse.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
      }
      
      return `${cleanSummary}_${timeToUse.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (error) {
      console.error('生成意图摘要标题失败:', error);
      // 生成备选标题
      const fallbackTitle = intentData.initialDemand ? `${intentData.initialDemand.substring(0, 15)}` : '圆桌空间';
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

  const generateExpectedResultByDemand = async (demandText: string) => {
    const demand = demandText.trim() || '当前需求';
    const fallback = `围绕「${demand.slice(0, 30)}」形成可执行方案，并明确关键路径、风险对策与可验证指标。`;
    if (!selectedModelId) {
      return fallback;
    }
    const prompt = `基于意图洞察生成"期望结果"，不超过80字，不用标题和列表。
原始需求:${demand.slice(0, 1500) || '无'}`;
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
      setMessages((prev) => {
        const normalized = nextMessages.map((msg) => normalizeRoundtableMessage(msg as Record<string, unknown>));
        if (prev.length === 0) {
          return normalized;
        }
        const prevMap = new Map(prev.map((item) => [item.id, item]));
        return normalized.map((item) => {
          const prevItem = prevMap.get(item.id);
          if (!prevItem) {
            return item;
          }
          if (item.streaming && prevItem.streaming) {
            const prevContent = prevItem.content || '';
            const nextContent = item.content || '';
            if (prevContent.length > nextContent.length) {
              return { ...item, content: prevContent };
            }
          }
          return item;
        });
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
    if (payload.discussion_metrics && typeof payload.discussion_metrics === 'object') {
      const metrics = payload.discussion_metrics as Record<string, unknown>;
      setDiscussionMetrics({
        round: Number(metrics.round || 0),
        new_points: Number(metrics.new_points || 0),
        duplicate_rate: Number(metrics.duplicate_rate || 0),
        problem_solution_ratio: String(metrics.problem_solution_ratio || '0:0'),
        conflict_count: Number(metrics.conflict_count || 0),
        avg_role_duration_ms: Number(metrics.avg_role_duration_ms || 0),
        resolved_topics: Number(metrics.resolved_topics || 0),
      });
    }
  }, [applyBoardResult, applyJudgeResult]);

  const streamRoundtableTaskUpdates = useCallback(async (taskId: string) => {
    roundtableStreamAbortRef.current?.abort();
    const controller = new AbortController();
    roundtableStreamAbortRef.current = controller;

    await streamRuntimeTask(
      taskId,
      {
        onDelta: (delta) => {
          setMessages((prev) =>
            prev.map((item) => {
              if (item.id !== delta.msg_id) {
                return item;
              }
              return {
                ...item,
                content: `${item.content || ''}${delta.text}`,
                streaming: true,
              };
            }),
          );
        },
        onTask: (task, eventName) => {
          if (task.result_payload) {
            applyRoundtableTaskPayload(task.result_payload as Record<string, unknown>);
          }

          if (task.status === 'failed') {
            setSending(false);
            const raw = String(task.error_message || '').trim();
            const isContextOverflow = /context|上下文|maximum context|token|长度超限|too long/i.test(raw);
            const isNetwork = /Connection error|Failed to fetch|NetworkError|timeout|超时/i.test(raw);
            const userMessage = isContextOverflow
              ? '内容过长，已达到模型上下文上限。请缩短输入或清空对话后重试。'
              : isNetwork
                ? '网络连接异常，生成已中断。请检查网络后重试。'
                : '生成失败，请稍后重试。';
            setRoundtableNotice({
              type: 'error',
              message: userMessage,
              actionText: '继续输入',
              onAction: () => {
                const textarea = document.querySelector('textarea');
                (textarea as HTMLTextAreaElement | null)?.focus();
              },
            });
            if (task.room_id) {
              void trackRuntimeEvent({
                room_id: task.room_id,
                event_type: 'roundtable.task_failed',
                event_payload: { reason: raw || 'unknown' },
              }).catch(() => undefined);
            }
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
          setRoundtableNotice({
            type: 'error',
            message: '连接中断，已停止生成。请检查网络后重试。',
            actionText: '刷新',
            onAction: () => window.location.reload(),
          });
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
  }, [autoRoundCount, canvasConsensus, canvasDisputes, canvasSnapshot, canvasUpdatedAt, consensusBoard, expectedResult, initialDemand, isAuthenticated, judgeState, maxDialogueRounds, messages, roles, rolesReady, roomId, roomReady, roundtableRooms, roundtableStage, selectedModelId, step, systemPrompt, intentReady]);

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
    const update = () => {
      const online = typeof navigator === 'undefined' ? true : navigator.onLine;
      setIsOnline(online);
      if (!online) {
        setRoundtableNotice({
          type: 'warning',
          message: '当前处于离线状态：可查看历史内容，但无法发起生成',
        });
      } else {
        setRoundtableNotice((prev) => (prev?.message?.includes('离线状态') ? null : prev));
      }
    };
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  useEffect(() => {
    void requestMissingSummaries();
  }, [requestMissingSummaries]);

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
        question: `${hint}，用一句话说明你希望本次圆桌最终解决什么/达成什么？`,
        options: [
          { id: 'q1o1', label: '产出可执行方案' },
          { id: 'q1o2', label: '验证方向可行性' },
          { id: 'q1o3', label: '识别关键风险' },
          { id: 'q1o4', label: '明确下一步行动' },
        ],
      },
    ];
  };

  const generateRolesByDemandWithAI = async (
    demandText: string,
    availableTemplates: typeof roleTemplates,
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
原始需求:${(demandText || '无').slice(0, 1500)}
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
          ? `附件材料摘要：${uploadedMaterials.slice(0, 3).map(m => m.summary || m.filename).join(';')}` 
          : '';
        const fullDemand = `${initialDemand}\n${materialContent}`.trim();
        const demandForModel = fullDemand.slice(0, 1500);
        const runId = Date.now();
        intentAnalysisRunIdRef.current = runId;

        // 构建紧凑的角色候选列表（去除长文本减少token消耗）
        const roleCandidates = roleTemplates
          .filter((tpl) => tpl.is_active !== false)
          .slice(0, 60)
          .map((tpl) => ({ id: tpl.id, name: tpl.name, stance: tpl.stance, cat: tpl.category || '' }));

        const intentPrompt = `根据用户输入生成"期望结果"。
用户输入：${demandForModel}
严格输出JSON：{"expectedResult":"期望结果(≤80字)"} 只输出JSON，不要有任何额外文字。`;

        // 紧凑 prompt：角色选择（独立调用，与意图分析并行）
        const rolePrompt = `从候选角色中选3-6个参与讨论，确保覆盖建设+对抗/评审立场。
需求：${demandForModel}
候选：${JSON.stringify(roleCandidates)}
只输出ID数组如[1,5,8]`;

        const intentPromise = syncChatByLLMConfig(selectedModelId, {
          message: intentPrompt,
          system_prompt: '只输出合法JSON，不要包含任何其他文字。',
          max_tokens: 256,
        }).then(raw => ({ raw, parsed: parseJsonObject(raw) }));

        const rolePromise = syncChatByLLMConfig(selectedModelId, {
          message: rolePrompt,
          system_prompt: '只输出JSON格式的角色ID数组，不要有任何解释文字。',
          max_tokens: 96,
        }).then(raw => parseJsonObject(raw));

        const resultsPromise = Promise.all([intentPromise, rolePromise]) as Promise<[any, any]>;

        const timeoutMs = 4800;
        const timeoutPromise = new Promise<'timeout'>((resolve) => {
          window.setTimeout(() => resolve('timeout'), timeoutMs);
        });

        const raced = await Promise.race([
          resultsPromise.then((res) => ({ kind: 'ok' as const, res })),
          timeoutPromise.then(() => ({ kind: 'timeout' as const })),
        ]);

        const applyFallbackAndProceed = () => {
          const fallbackExpected = `围绕「${(initialDemand.trim() || '当前需求').slice(0, 30)}」形成可执行方案`;
          setExpectedResult(fallbackExpected);
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
          setRolesReady(true);
          setIntentReady(true);
          setStep('roles');
        };

        if (raced.kind === 'timeout') {
          applyFallbackAndProceed();
          loadingMsg();
          message.success('已快速进入角色矩阵（后台继续补全中）');

          void resultsPromise.then(([intentResult, roleResult]) => {
            if (intentAnalysisRunIdRef.current !== runId) {
              return;
            }
            const parsedData = intentResult?.parsed;
            const expectedText = String(parsedData?.expectedResult || '').trim();
            if (expectedText) {
              setExpectedResult(expectedText.slice(0, 120));
            }

            if (Array.isArray(roleResult) && roleResult.length > 0) {
              const selectedRoles = roleTemplates
                .filter((tpl) => roleResult.includes(tpl.id))
                .map((tpl) => ({
                  id: `role_${tpl.id}`,
                  name: tpl.name,
                  stance: tpl.stance as '建设' | '对抗' | '中立' | '评审',
                  desc: tpl.description || '',
                  selected: true,
                  soulConfig: tpl.soul_config,
                }));
              if (selectedRoles.length > 0) {
                setRoles(selectedRoles);
                setRolesReady(true);
              }
            }
          }).catch(() => undefined);

          return;
        }

        const [intentResult, roleResult] = raced.res;

        const parsedData = intentResult.parsed;
        if (!parsedData) {
          console.warn('期望结果JSON解析失败，模型原始响应:', intentResult.raw, '— 将使用降级期望结果');
        }

        const fallbackExpected = `围绕「${(initialDemand.trim() || '当前需求').slice(0, 30)}」形成可执行方案`;
        const expectedText = String(parsedData?.expectedResult || '').trim();
        setExpectedResult(expectedText ? expectedText.slice(0, 120) : fallbackExpected);

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
        setRolesReady(true);
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
        content: '我将通过几个问题澄清你的真实意图，并生成期望结果建议。',
      },
    ]);
  };

  const applyProbeAnswer = (questionId: string, answer: string) => {
    setProbeTurns((prev) => [...prev, { id: `u_${Date.now()}`, role: 'user', content: `${answer}` }]);
    if (questionId === 'q1') {
      setExpectedResult((prev) => (prev.trim() ? prev : `${answer}`));
    }
  };

  const confirmIntent = async () => {
    const demandText = initialDemand.trim();
    if (!demandText) {
      message.warning('请先输入需求或上传相关材料');
      return;
    }
    // 并行执行：生成期望结果 + 智能选择角色（两者无依赖关系）
    const loadingMsg = message.loading('正在分析意图并匹配角色...', 0);
    setGeneratingExpectedResult(true);
    try {
      const needExpectedResult = !expectedResult.trim();
      const [expectedResultText, generatedRoles] = await Promise.all([
        needExpectedResult
          ? generateExpectedResultByDemand(demandText)
          : Promise.resolve(expectedResult.trim()),
        generateRolesByDemandWithAI(demandText, roleTemplates),
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
      const generatedRoles = await generateRolesByDemandWithAI(initialDemand, roleTemplates);
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
            probeTurns,
            expectedResult,
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

  const buildPriorMessagesForRuntime = useCallback((
    source: typeof messages,
    options?: { maxItems?: number; maxChars?: number; perItemMaxChars?: number; preferSummary?: boolean },
  ) => {
    const maxItems = options?.maxItems ?? 12;
    const maxChars = options?.maxChars ?? 6000;
    const perItemMaxChars = options?.perItemMaxChars ?? 1200;
    const preferSummary = options?.preferSummary ?? false;

    const picked: any[] = [];
    let used = 0;
    for (let i = source.length - 1; i >= 0 && picked.length < maxItems; i -= 1) {
      const msg = source[i];
      const rawContent = String(msg.content || '');
      const candidate = preferSummary && msg.speakerType === 'agent' && msg.summary?.trim()
        ? msg.summary.trim()
        : rawContent;
      const clipped = candidate.length > perItemMaxChars ? candidate.slice(0, perItemMaxChars) : candidate;
      const remaining = maxChars - used;
      if (remaining <= 0) {
        break;
      }
      const finalText = clipped.length > remaining ? clipped.slice(0, Math.max(0, remaining)) : clipped;
      if (!finalText.trim()) {
        continue;
      }
      used += finalText.length;
      picked.push({
        id: msg.id,
        speaker_id: msg.speakerId,
        speaker_name: msg.speakerName,
        speaker_type: msg.speakerType,
        content: finalText,
        summary: msg.summary,
        summary_metrics: msg.summaryMetrics,
        created_at: msg.createdAt,
        streaming: false,
      });
    }
    return picked.reverse();
  }, [messages]);

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
    if (!isOnline) {
      setRoundtableNotice({ type: 'warning', message: '当前离线：无法发起生成。请联网后重试。' });
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

    const shouldClearPrompt = !overrideText;
    if (shouldClearPrompt) {
      setUserPrompt('');
    }
    setRoundtableStage(stage);
    setMessages(nextMessages);
    setSending(true);
    setRoundtableNotice(null);

    try {
      const basePayload = {
        room_id: roomId,
        model_id: selectedModelId,
        user_message: userText,
        user_message_id: userMessageId,
        roundtable_stage: stage,
        auto_brainstorm: autoBrainstorm,
        auto_continue: forceAutoContinue ?? (stage === 'brief' ? autoConversationEnabled : false),
        max_dialogue_rounds: maxDialogueRounds,
        auto_round_count: autoRoundCount,
        initial_demand: initialDemand,
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
        prior_messages: buildPriorMessagesForRuntime(messages),
        trigger,
      } as any;

      const errorTextOf = (err: unknown) => (err instanceof Error ? err.message : String(err));
      const isContextOverflow = (text: string) =>
        /context|上下文|maximum context|token|长度超限|too long/i.test(text);
      const isRetryable = (text: string) =>
        /Failed to fetch|NetworkError|Connection error|请求失败: 5|502|503|504|timeout|超时/i.test(text);

      let task: any;
      try {
        task = await startRoundtableRun(basePayload);
      } catch (err) {
        const text = errorTextOf(err);
        if (isContextOverflow(text)) {
          setRoundtableNotice({ type: 'info', message: '内容过长，已自动压缩上下文并重试…' });
          if (roomId) {
            void trackRuntimeEvent({
              room_id: roomId,
              event_type: 'roundtable.context_overflow.retry',
              event_payload: { stage, trigger },
            }).catch(() => undefined);
          }
          const retryPayload = {
            ...basePayload,
            prior_messages: buildPriorMessagesForRuntime(messages, { maxItems: 6, maxChars: 2500, perItemMaxChars: 600, preferSummary: true }),
          };
          task = await startRoundtableRun(retryPayload);
        } else if (isRetryable(text)) {
          setRoundtableNotice({ type: 'info', message: '网络波动，正在重试…' });
          if (roomId) {
            void trackRuntimeEvent({
              room_id: roomId,
              event_type: 'roundtable.network_retry',
              event_payload: { stage, trigger },
            }).catch(() => undefined);
          }
          await new Promise((resolve) => setTimeout(resolve, 800));
          task = await startRoundtableRun(basePayload);
        } else {
          throw err;
        }
      }
      activeRoundtableTaskIdRef.current = task.task_id;
      void streamRoundtableTaskUpdates(task.task_id);
    } catch (err) {
      if (roomId) {
        void trackRuntimeEvent({
          room_id: roomId,
          event_type: 'roundtable.run_failed',
          event_payload: { stage, trigger },
        }).catch(() => undefined);
      }
      setRoundtableNotice({
        type: 'error',
        message: '生成失败，请稍后重试或缩短输入内容',
        actionText: '重试',
        onAction: () => {
          if (shouldClearPrompt) {
            setUserPrompt(userText);
          }
          void sendToRoundtable();
        },
      });
      setMessages(messages);
      setSending(false);
      activeRoundtableTaskIdRef.current = null;
      roundtableStreamAbortRef.current = null;
      if (shouldClearPrompt) {
        setUserPrompt(userText);
      }
    }
  }, [
    autoBrainstorm,
    autoConversationEnabled,
    autoRoundCount,
    buildPriorMessagesForRuntime,
    expectedResult,
    initialDemand,
    isOnline,
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
        overrideText = '（主持人提示）各位专家跑题了，请立刻回到我们的原始需求与期望结果上！';
        hiddenPrompt = `【系统最高指令】用户认为当前讨论已经偏离主题。请你接下来的发言必须强行拉回到原始需求「${(initialDemand || '').slice(0, 300)}」和期望结果「${(expectedResult || '').slice(0, 200)}」，停止发散。`;
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
  }, [expectedResult, generateFinalPlan, initialDemand, roomId, roomReady, roundtableStage, sendToRoundtable, sending]);

  const exportRoundtable = useCallback(async (format: 'md' | 'pdf' | 'docx') => {
    if (!roomReady || messages.length === 0) {
      message.warning('当前没有可导出的圆桌内容');
      return;
    }

    setExportingFormat(format);
    try {
      const roomName = roundtableRooms.find((item) => item.id === roomId)?.name || initialDemand.slice(0, 24) || '圆桌讨论';
      const payload = {
        fileBaseName: `${roomName}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}`,
        initialDemand,
        expectedResult,
        messages: messages.filter((item) => !item.streaming && item.content.trim()),
        judgeState,
        judgeScore,
        judgeReason,
        discussionMetrics,
        consensusBoard,
      };

      if (format === 'md') {
        await exportRoundtableMarkdown(payload);
      } else if (format === 'pdf') {
        await exportRoundtablePdf(payload);
      } else {
        await exportRoundtableDocx(payload);
      }
      message.success(`已导出 ${format.toUpperCase()} 文件`);
    } catch (error) {
      console.error('导出圆桌内容失败:', error);
      message.error('导出失败，请稍后重试');
    } finally {
      setExportingFormat(null);
    }
  }, [
    roomReady,
    messages,
    roundtableRooms,
    roomId,
    initialDemand,
    expectedResult,
    judgeState,
    judgeScore,
    judgeReason,
    discussionMetrics,
    consensusBoard,
  ]);

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
                isExpertMode={isExpertMode}
                roomId={roomId}
                preUploadRoomId={preUploadRoomId}
                onInitialDemandChange={setInitialDemand}
                onMaterialsAnalyzed={handleMaterialsAnalyzed}
                onIntentSynthesized={(result: any) => {
                  const expected = String(result?.synthesized_intent?.expected_result || '').trim();
                  if (expected && !expectedResult.trim()) {
                    setExpectedResult(expected);
                  }
                }}
                onStartIntentProbing={startIntentProbing}
                onIsExpertModeChange={setIsExpertMode}
              />
            )}
            
            {step === 'roundtable' && isExpertMode && (
              <ExpertModeConfig
                initialDemand={initialDemand}
                uploadedMaterials={uploadedMaterials}
                isExpertMode={isExpertMode}
                roomId={roomId}
                preUploadRoomId={preUploadRoomId}
                onInitialDemandChange={setInitialDemand}
                onMaterialsAnalyzed={handleMaterialsAnalyzed}
                onIntentSynthesized={(result: any) => {
                  const expected = String(result?.synthesized_intent?.expected_result || '').trim();
                  if (expected && !expectedResult.trim()) {
                    setExpectedResult(expected);
                  }
                }}
                onStartIntentProbing={startIntentProbing}
                onIsExpertModeChange={setIsExpertMode}
                probeTurns={probeTurns}
                probeQuestions={probeQuestions}
                customProbeOptions={customProbeOptions}
                onCustomProbeOptionsChange={setCustomProbeOptions}
                onApplyProbeAnswer={applyProbeAnswer}
                onResetAnalysisState={() => {
                  setProbeQuestions([]);
                  setProbeTurns([]);
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
                generatingExpectedResult={generatingExpectedResult}
                onGenerateExpectedResult={async () => {
                  if (!initialDemand.trim()) {
                    message.warning('请先输入需求或上传相关材料');
                    return;
                  }
                  setGeneratingExpectedResult(true);
                  try {
                    const generated = await generateExpectedResultByDemand(initialDemand);
                    setExpectedResult(generated);
                    message.success('已生成期望结果');
                  } finally {
                    setGeneratingExpectedResult(false);
                  }
                }}
                onConfirmIntent={confirmIntent}
              />
            )}

            {step === 'roles' && (
              <StepRoleMatrix
                roles={roles}
                isReGeneratingRoles={isReGeneratingRoles}
                initialDemand={initialDemand}
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
                judgeState={judgeState}
                judgeScore={judgeScore}
                judgeReason={judgeReason}
                discussionMetrics={discussionMetrics}
                consensusBoard={consensusBoard}
                runtimePendingTasks={runtimePendingTasks}
                isSending={sending}
                exportingFormat={exportingFormat}
                onStartDemo={() => void sendToRoundtable('请各角色先给出最关键的 3-5 条核心要点（不要输出总结性方案）。', 'brief', undefined, 'host', false)}
                onExport={exportRoundtable}
                notice={roundtableNotice ? { ...roundtableNotice, closable: true, onClose: () => setRoundtableNotice(null) } : null}
              />
            )}

            {/* 共识摘要独立页面 */}
            {step === 'consensus_summary' && (
              <ConsensusSummary
                initialDemand={initialDemand}
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
                  topic={initialDemand}
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
                      <Button type="primary" loading={sending} disabled={!isOnline} onClick={() => void sendToRoundtable()}>
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
