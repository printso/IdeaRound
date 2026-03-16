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
  Tag,
  Typography,
  message,
  Modal,
} from 'antd';
import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getLLMConfigs, streamChatByLLMConfig } from '../api/llm';
import type { LLMConfig } from '../api/llm';
import AppHeader from '../components/AppHeader';
import RoundtableCanvas from '../components/RoundtableCanvas';
import {
  createWorkspace,
  listWorkspaces,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  type WorkspaceData,
} from '../api/workspace';
import { useAuth } from '../contexts/AuthContext';

const { Sider, Content, Footer } = Layout;
const { Paragraph, Text } = Typography;

type IntentCardState = {
  coreGoal: string;
  constraints: string;
  painPoints: string;
};

type StepKey = 'roundtable' | 'roles' | 'roundtable_view' | 'canvas_view';

type RoundtableRoom = {
  id: string;
  name: string;
  createdAt: string;
};

type RoundtableStage = 'brief' | 'final';

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

const Home = () => {
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
  const [roleTemplates, setRoleTemplates] = useState<{id: number; name: string; stance: string; description?: string; soul_config?: string; is_active?: boolean}[]>([]);
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
  const [pendingAutoSend, setPendingAutoSend] = useState<{ roomId: string; text: string; stage: RoundtableStage } | null>(null);
  const [expectedResult, setExpectedResult] = useState(savedState?.expectedResult || '');
  const [generatingExpectedResult, setGeneratingExpectedResult] = useState(false);
  const [maxDialogueRounds, setMaxDialogueRounds] = useState<number>(savedState?.maxDialogueRounds || 6);
  const [autoRoundCount, setAutoRoundCount] = useState<number>(savedState?.autoRoundCount || 0);
  const [autoConversationEnabled, setAutoConversationEnabled] = useState(true);
  const [customProbeOptions, setCustomProbeOptions] = useState<Record<string, string>>({});
  const [editingSoulConfigRole, setEditingSoulConfigRole] = useState<RoleMember | null>(null);
  const [editingSoulConfigText, setEditingSoulConfigText] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const suppressBackendSaveRef = useRef(false);
  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedInitialDataRef = useRef(false);
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

  const evaluateExpectedResultReached = useCallback(async (conversationText: string, currentRound: number) => {
    if (!selectedModelId || !expectedResult.trim()) {
      return { reached: false, reason: '', nextPrompt: '' };
    }
    const prompt = `你是圆桌对话收敛检查器，请判断当前讨论是否已经达到期望结果。
请严格输出 JSON，不要额外说明：
{"reached":true/false,"reason":"不超过60字","next_prompt":"若未达到，给出下一轮用户引导语；若已达到可留空"}

期望结果：${expectedResult}
当前轮次：${currentRound}/${maxDialogueRounds}
核心目标：${intentCard.coreGoal || '无'}
限制条件：${intentCard.constraints || '无'}
待解决痛点：${intentCard.painPoints || '无'}
最近对话：
${conversationText || '无'}
`;
    const raw = await collectModelText(
      prompt,
      '你擅长判断目标达成度，要求判断保守、明确，避免误判。',
    );
    const json = parseJsonObject(raw);
    if (!json) {
      return { reached: false, reason: '', nextPrompt: '' };
    }
    return {
      reached: Boolean(json.reached),
      reason: typeof json.reason === 'string' ? json.reason.trim() : '',
      nextPrompt: typeof json.next_prompt === 'string' ? json.next_prompt.trim() : '',
    };
  }, [
    selectedModelId,
    expectedResult,
    maxDialogueRounds,
    intentCard.coreGoal,
    intentCard.constraints,
    intentCard.painPoints,
    collectModelText,
  ]);

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
    setAutoConversationEnabled(true);
  };

  const saveWorkspaceToBackend = async () => {
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
  };

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
        setRoleTemplates(data);
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

  useEffect(() => {
    // 防止在 React StrictMode 下重复加载
    if (hasLoadedInitialDataRef.current) {
      return;
    }
    hasLoadedInitialDataRef.current = true;

    loadModels();
    loadRoleTemplates();
    loadPromptTemplates();
    loadWorkspaces(); // 加载工作台列表
  }, []);

  // 保存工作台状态到 localStorage（作为 fallback）和后端
  useEffect(() => {
    const stateToSave = {
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
    backendWorkspaceIds,
  ]);

  useEffect(() => {
    form.setFieldsValue(intentCard);
  }, [form, intentCard]);

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

  const startIntentProbing = () => {
    if (!initialDemand.trim()) {
      message.warning('请先输入你的需求');
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

    // 从数据库加载的角色模板生成角色
    const generatedRoles: RoleMember[] = roleTemplates
      .filter((tpl) => tpl.is_active !== false)
      .map((tpl) => ({
        id: `role_${tpl.id}`,
        name: tpl.name,
        stance: tpl.stance as '建设' | '对抗' | '中立' | '评审',
        desc: tpl.description || '',
        selected: true,
        soulConfig: tpl.soul_config,
      }));

    setRoles(generatedRoles);
    message.success('意图洞察完成，已生成初始角色矩阵');
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
      stance: '建设',
      desc: '自定义角色',
      selected: true,
    };
    setRoles((prev) => [...prev, newRole]);
    setNewRoleName('');
    message.success(`已添加角色：${newRole.name}`);
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
    // 检查是否包含黑帽风控官（stance为"对抗"或名称包含"黑帽"）
    const hasBlackhat = selected.some((r) => r.stance === '对抗' || r.name.includes('黑帽'));
    // 检查是否包含审计官（stance为"评审"或名称包含"审计"）
    const hasAudit = selected.some((r) => r.stance === '评审' || r.name.includes('审计'));
    if (selected.length < 4 || !hasBlackhat) {
      message.warning('至少选择 3 位角色 + 1 位对抗性角色（黑帽）');
      return;
    }
    if (!hasAudit) {
      message.warning('必须包含审计官角色');
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
      setPendingAutoSend(null);
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
        setPendingAutoSend({ roomId: newRoomId, text: seedText, stage: 'brief' });
      }
      message.success('角色矩阵确认完成，已自动创建圆桌空间');
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
    setPendingAutoSend(null);
    setExpectedResult('');
    setMaxDialogueRounds(6);
    setAutoRoundCount(0);
    setAutoConversationEnabled(true);
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
        if (isAuthenticated && backendWorkspaceIds.has(nextRoom.id)) {
          const workspaceData = await getWorkspace(nextRoom.id);
          if (workspaceData) {
            loadWorkspaceData(workspaceData.data);
          }
        }
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

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
    setPendingAutoSend(null);
    setAutoConversationEnabled(false);
  };

  const buildTranscript = useCallback((items: { speakerName: string; content: string }[]) => {
    const slice = items.slice(-12);
    return slice.map((m) => `${m.speakerName}：${m.content}`).join('\n');
  }, []);

  const buildAgentSystemPrompt = useCallback((role: RoleMember, stage: RoundtableStage) => {
    const base = [
      promptTemplates.prompt_base || '你是圆桌创意中的一个角色，请保持高信噪比，避免客套话与重复。',
      `你的身份：${role.name}（立场：${role.stance}）。`,
      `用户意图锚点：${intentCard.coreGoal || '未提供'}。`,
      expectedResult ? `本轮收敛目标（期望结果）：${expectedResult}` : '',
      intentCard.constraints ? `限制条件：${intentCard.constraints}` : '',
      intentCard.painPoints ? `待解决痛点：${intentCard.painPoints}` : '',
    ].filter(Boolean);

    // 注入灵魂配置
    if (role.soulConfig) {
      base.push('', role.soulConfig);
    }

    if (stage === 'brief') {
      const isAudit = role.id === 'audit' || role.name.includes('审计官');
      if (isAudit && promptTemplates.prompt_audit_brief) {
        base.push('', promptTemplates.prompt_audit_brief);
      } else if (promptTemplates.prompt_brief_stage) {
        base.push('', promptTemplates.prompt_brief_stage);
      } else {
        // 默认值（如果数据库未配置）
        base.push(
          '当前处于「脑暴发散阶段」。',
          '只输出核心要点：3-5 条，短句，单条不超过 100 个字。',
          '不要输出总结性方案，不要写步骤/里程碑/落地计划，不要写"综上/总结/最终方案"。',
          '直接给出你认为最关键的点即可。',
          '用 Markdown 输出，建议使用无序列表。',
        );
      }
    } else {
      const isAudit = role.id === 'audit' || role.name.includes('审计官');
      if (isAudit && promptTemplates.prompt_audit_final) {
        base.push('', promptTemplates.prompt_audit_final);
      } else if (promptTemplates.prompt_final_stage) {
        base.push('', promptTemplates.prompt_final_stage);
      } else {
        // 默认值（如果数据库未配置）
        base.push(
          '当前处于「收敛定稿阶段」。',
          '请基于当前对话给出总结性方案：目标拆解 → 关键路径 → 风险与对策 → 指标与验证 → 下一步行动清单。',
          '请给出可执行的落地方案，避免空话。',
          '用 Markdown 输出，结构清晰。',
        );
      }
    }

    return base.join('\n');
  }, [expectedResult, intentCard.constraints, intentCard.coreGoal, intentCard.painPoints, promptTemplates]);

  const sendToRoundtable = useCallback(async (overrideText?: string, overrideStage?: RoundtableStage) => {
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
    setAutoConversationEnabled(true);

    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);

    const now = new Date().toLocaleTimeString();
    const userMessageId = `m_user_${Date.now()}`;
    if (!overrideText) {
      setUserPrompt('');
    }

    setMessages((prev) => [
      ...prev,
      {
        id: userMessageId,
        speakerId: 'user',
        speakerName: '我',
        speakerType: 'user',
        content: userText,
        createdAt: now,
      },
    ]);

    const selectedRoles = roles.filter((r) => r.selected);
    const speakingRoles = autoBrainstorm ? selectedRoles : selectedRoles.slice(0, 1);

    const conversationItems = [
      ...messages,
      { id: userMessageId, speakerId: 'user', speakerName: '我', speakerType: 'user' as const, content: userText, createdAt: now },
    ].map((m) => ({ speakerName: m.speakerName, content: m.content }));

    try {
      // 串行处理每个角色，确保每个角色都能看到前面所有角色的回答
      for (const role of speakingRoles) {
        const assistantId = `m_${role.id}_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
        let roleReply = '';
        
        // 为当前角色创建消息条目
        setMessages((prev) => [
          ...prev,
          {
            id: assistantId,
            speakerId: role.id,
            speakerName: role.name,
            speakerType: 'agent',
            content: '',
            streaming: true,
            createdAt: new Date().toLocaleTimeString(),
          },
        ]);

        // 构建包含前面所有角色回答的对话记录
        // conversationItems 已经包含了前面角色的回答
        const fullTranscript = buildTranscript(conversationItems);
        
        // 增强系统提示词，强调需要考虑前面角色的回答和主题一致性
        const previousRolesReplies = conversationItems
          .filter(item => speakingRoles.some(r => r.name === item.speakerName))
          .map(item => `${item.speakerName}：${item.content}`)
          .join('\n\n');
        
        const enhancedSystemPrompt = `${buildAgentSystemPrompt(role, stage)}

【对话上下文与主题一致性要求】
你正在参与一个结构化圆桌讨论，前面已有其他角色发表观点。请严格遵循以下要求：

1. 主题锚点：核心讨论围绕「${intentCard.coreGoal || '未指定目标'}」
2. 上下文继承：前面角色的回答：
${previousRolesReplies || '暂无其他角色回答，你是第一个发言的角色。'}

3. 回答要求：
   - 必须基于前面角色的观点进行回应或拓展
   - 避免重复前面已经阐述过的内容
   - 如提出新观点，需与前面讨论逻辑衔接
   - 如有反对意见，需引用具体观点并给出理由
   - 保持专业讨论氛围，避免偏离核心主题

4. 输出格式：请直接给出你的观点，无需客套话。

当前对话阶段：${stage === 'brief' ? '脑暴发散阶段 - 提出3-5个核心要点' : '收敛定稿阶段 - 给出总结性方案'}

${systemPrompt.trim() ? `补充系统提示词：${systemPrompt.trim()}` : ''}`;

        // 为主题一致性检查构建提示
        const topicCheckPrompt = previousRolesReplies ? 
          `（请注意：前面已有${conversationItems.filter(item => speakingRoles.some(r => r.name === item.speakerName)).length}位角色发言，请确保你的回答与他们的观点连贯，不要偏离核心主题）」` : 
          '（你是第一个发言的角色，请围绕主题展开）」';
        
        await streamChatByLLMConfig(
          selectedModelId,
          {
            message: `【对话主题】${intentCard.coreGoal || '未指定目标'}
            
【历史对话摘要】
${fullTranscript || '暂无历史对话'}

【本轮用户输入】
${userText}

【你的角色任务】
作为「${role.name}」（立场：${role.stance}），请基于以上对话历史进行回应${topicCheckPrompt}`,
            system_prompt: enhancedSystemPrompt,
          },
          {
            onDelta: (delta) => {
              roleReply += delta;
              // 实时更新当前角色的消息内容
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) {
                    return m;
                  }
                  return { ...m, content: m.content + delta, streaming: true };
                }),
              );
            },
            onDone: () => {
              // 标记当前角色完成流式传输
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) {
                    return m;
                  }
                  return { ...m, streaming: false };
                }),
              );
            },
            onError: (err) => {
              roleReply = `${roleReply}\n\n> 错误：${err}`;
              setMessages((prev) =>
                prev.map((m) => {
                  if (m.id !== assistantId) {
                    return m;
                  }
                  return { ...m, content: `${m.content}\n\n> 错误：${err}`, streaming: false };
                }),
              );
            },
          },
          { signal: controller.signal },
        );
        
        // 将当前角色的回答添加到对话记录中，供后续角色参考
        conversationItems.push({ speakerName: role.name, content: roleReply });
      }

      setCanvasConsensus((prev) => {
        const next = [...prev];
        const text = stage === 'final' ? '已输出总结性方案' : '已生成核心要点';
        if (!next.includes(text)) {
          next.push(text);
        }
        return next.slice(-6);
      });
      setCanvasDisputes((prev) => {
        const next = [...prev];
        const text = stage === 'final' ? '仍需验证关键假设与指标' : '仍有未验证假设';
        if (!next.includes(text)) {
          next.push(text);
        }
        return next.slice(-6);
      });
      setCanvasUpdatedAt(new Date().toLocaleString());

      if (stage === 'brief' && !controller.signal.aborted) {
        const nextRound = autoRoundCount + 1;
        setAutoRoundCount(nextRound);

        const reachedMaxRound = nextRound >= maxDialogueRounds;
        const checkResult = await evaluateExpectedResultReached(buildTranscript(conversationItems), nextRound);
        const reachedExpectedResult = checkResult.reached;
        const convergeMsg = promptTemplates.prompt_converge_trigger || '我觉得讨论已经收敛，请各角色基于当前讨论输出总结性方案。';

        if (reachedExpectedResult) {
          message.success('已达到期望结果，自动停止脑暴并生成最终方案');
          setRoundtableStage('final');
          setPendingAutoSend({ roomId, text: convergeMsg, stage: 'final' });
        } else if (reachedMaxRound) {
          message.warning('已达到对话轮数上限，自动停止脑暴并生成最终方案');
          setRoundtableStage('final');
          setPendingAutoSend({ roomId, text: convergeMsg, stage: 'final' });
        } else if (autoConversationEnabled) {
          const nextPrompt = checkResult.nextPrompt || `请继续围绕期望结果推进，当前仍未收敛。${checkResult.reason ? `参考：${checkResult.reason}` : ''}`;
          setPendingAutoSend({ roomId, text: nextPrompt, stage: 'brief' });
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        const msg = err instanceof Error ? err.message : '请求失败';
        message.error(msg);
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }, [
    autoBrainstorm,
    buildAgentSystemPrompt,
    buildTranscript,
    messages,
    roomReady,
    roles,
    roundtableStage,
    selectedModelId,
    sending,
    systemPrompt,
    userPrompt,
    autoRoundCount,
    maxDialogueRounds,
    evaluateExpectedResultReached,
    promptTemplates.prompt_converge_trigger,
    roomId,
    autoConversationEnabled,
  ]);

  useEffect(() => {
    if (!pendingAutoSend) {
      return;
    }
    if (!roomReady || roomId !== pendingAutoSend.roomId) {
      return;
    }
    if (sending) {
      return;
    }
    setPendingAutoSend(null);
    setUserPrompt('');
    void sendToRoundtable(pendingAutoSend.text, pendingAutoSend.stage);
  }, [pendingAutoSend, roomId, roomReady, sending, sendToRoundtable]);

  const generateFinalPlan = () => {
    if (!roomReady) {
      message.warning('请先创建圆桌空间');
      return;
    }
    if (sending) {
      message.warning('正在生成中，请稍候或点击停止');
      return;
    }
    setPendingAutoSend(null);
    setAutoConversationEnabled(false);
    setRoundtableStage('final');
    const convergeMsg = promptTemplates.prompt_converge_trigger || '我觉得讨论已经收敛，请各角色基于当前讨论输出总结性方案。';
    void sendToRoundtable(convergeMsg, 'final');
  };

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
              <Row gutter={16}>
                <Col xs={24} xl={14}>
                  <Card title="意图洞察交互" style={{ borderRadius: 8 }}>
                    <div style={{ maxHeight: 'calc(100dvh - 64px - 140px)', overflowY: 'auto', paddingRight: 8 }}>
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Input.TextArea
                        rows={3}
                        value={initialDemand}
                        onChange={(e) => setInitialDemand(e.target.value)}
                        placeholder="请简要描述你的需求（回车后不会立即建群，而是先澄清意图）"
                      />
                      <Space>
                        <Button 
                          onClick={() => {
                            const sampleContent = `“小秘”：你的隐私优先、全感官个人 AI 管家
核心理念：将碎片信息转化为有序智慧，打造属于你的“数字第二大脑”。
• 零门槛全能录入：支持语音、截图、文档、即时消息等 8 种媒介，随手拍、随口说、随心存，彻底打破应用间的“信息孤岛”。
• 隐私主权架构：坚持“本地优先”，所有 RAG 索引与数据库均存于本地，支持端侧轻量化运行。你的数据，只有你拥有。
• 反焦虑缓冲机制：首创“收件箱缓冲区”，AI 解析的内容需经你确认才进入日程或知识库，拒绝任务堆积，维护生活的秩序感。
• 情境感知助手：它懂你的节奏。平日里它是静默的守门人，在开会前或关键时刻，它会精准推送关联文档与任务汇总，化碎片为行动。`;
                            setInitialDemand(sampleContent);
                          }}
                        >
                          加载示例输入
                        </Button>
                        <Button type="primary" onClick={startIntentProbing}>
                          开始洞察
                        </Button>
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
                          重置
                        </Button>
                      </Space>
                      <Divider style={{ margin: '8px 0' }} />
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
                    </Space>
                    </div>
                  </Card>
                </Col>
                <Col xs={24} xl={10}>
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Card title="期望结果" style={{ borderRadius: 8 }}>
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
                    <Card title="结构化需求卡片（可编辑）" style={{ borderRadius: 8 }}>
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
                </Col>
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
                      </Space>
                    } 
                    style={{ borderRadius: 8 }}
                  >
                    {!intentReady && <Empty description="请先完成意图洞察" />}
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
                          <Space>
                            <Input
                              placeholder="新角色名称"
                              value={newRoleName}
                              onChange={(e) => setNewRoleName(e.target.value)}
                              style={{ width: 200 }}
                              onPressEnter={addCustomRole}
                            />
                            <Button onClick={addCustomRole} type="primary">
                              添加角色
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

            {step === 'roundtable_view' && (
              <Row gutter={16} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
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
                    {!roomReady && <Empty description="请先完成意图洞察与角色确认" />}
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

                {/* 右侧：共识摘要 + 对话控制（占30%） */}
                <Col xs={24} xl={7} style={{ display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflow: 'hidden' }}>
                  {/* 共识摘要 */}
                  <Card title="共识摘要" style={{ borderRadius: 8, overflow: 'hidden' }} bodyStyle={{ maxHeight: 'calc(100vh - 450px)', overflowY: 'auto' }}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Card size="small">
                        <Text strong>需求锚点</Text>
                        <Paragraph style={{ marginBottom: 0 }}>{intentCard.coreGoal || '-'}</Paragraph>
                      </Card>
                      <Card size="small" style={{ background: '#f6ffed', borderColor: '#95de64' }}>
                        <Text strong>期望结果</Text>
                        <Paragraph style={{ marginBottom: 0 }}>{expectedResult || '-'}</Paragraph>
                      </Card>
                      <Card size="small" style={{ background: '#f6ffed', borderColor: '#b7eb8f' }}>
                        <Space>
                          <Tag color="green">已达成共识</Tag>
                          <Text type="secondary">({canvasConsensus.length} 项)</Text>
                        </Space>
                        <List
                          size="small"
                          dataSource={canvasConsensus}
                          locale={{ emptyText: '暂无共识' }}
                          renderItem={(text) => <List.Item style={{ border: 'none', padding: '4px 0' }}>{text}</List.Item>}
                        />
                      </Card>
                      <Card size="small" style={{ background: '#fffbe6', borderColor: '#ffe58f' }}>
                        <Space>
                          <Tag color="gold">遗留争议</Tag>
                          <Text type="secondary">({canvasDisputes.length} 项)</Text>
                        </Space>
                        <List
                          size="small"
                          dataSource={canvasDisputes}
                          locale={{ emptyText: '暂无争议' }}
                          renderItem={(text) => <List.Item style={{ border: 'none', padding: '4px 0' }}>{text}</List.Item>}
                        />
                      </Card>
                      <Text type="secondary">更新时间：{canvasUpdatedAt || '-'}</Text>
                    </Space>
                  </Card>

                  {/* 对话控制 */}
                  <Card title="对话控制" style={{ borderRadius: 8 }}>
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Text>群聊模式</Text>
                        <Switch checked={autoBrainstorm} onChange={(v) => setAutoBrainstorm(v)} />
                      </Space>
                      <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Text>对话轮数上限</Text>
                        <InputNumber min={1} max={30} value={maxDialogueRounds} onChange={(v) => setMaxDialogueRounds(Number(v || 6))} />
                      </Space>
                      <Text type="secondary">当前轮次：{autoRoundCount}/{maxDialogueRounds}</Text>
                      <Input.TextArea
                        rows={3}
                        value={expectedResult}
                        onChange={(e) => setExpectedResult(e.target.value)}
                        placeholder="可在对话中修改期望结果，后续自动收敛将按新目标继续。"
                      />
                      <Space wrap>
                        <Button type="primary" disabled={!roomReady || sending || messages.length === 0} onClick={generateFinalPlan}>
                          生成最终方案
                        </Button>
                        <Button
                          onClick={() => {
                            setMessages([]);
                            setCanvasConsensus([]);
                            setCanvasDisputes([]);
                            setCanvasUpdatedAt(new Date().toLocaleString());
                            setRoundtableStage('brief');
                            setAutoRoundCount(0);
                            setPendingAutoSend(null);
                            setAutoConversationEnabled(false);
                          }}
                        >
                          清空讨论
                        </Button>
                        <Button danger disabled={!sending} onClick={stopStreaming}>
                          停止生成
                        </Button>
                      </Space>
                    </Space>
                  </Card>
                </Col>
              </Row>
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
                  onUpdatedAtChange={setCanvasUpdatedAt}
                />
              </div>
            )}
          </Content>

          {step !== 'canvas_view' && (
            <Footer style={{ background: '#ffffff', borderTop: '1px solid #f0f0f0' }}>
              {/* 圆桌空间和查看模式显示状态标签 */}
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
              {/* 圆桌空间和查看模式显示输入框 */}
              {(step === 'roundtable_view') && (
              <Row gutter={12} align="middle">
                <Col flex="auto">
                  <Input.TextArea
                    rows={3}
                    maxLength={1000}
                    showCount
                    value={userPrompt}
                    onChange={(e) => setUserPrompt(e.target.value)}
                    placeholder="输入你的观点/问题（你是特殊角色，可通过系统提示词纠偏整个圆桌）"
                  />
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
    </>  );
};

export default Home;
