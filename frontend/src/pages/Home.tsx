import {
  Avatar,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Form,
  Input,
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
  // localStorage key
  const STORAGE_KEY = 'idearound_workspace';

  // 从 localStorage 加载保存的状态
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
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roundtableStage, setRoundtableStage] = useState<RoundtableStage>(savedState?.roundtableStage || 'brief');
  const [pendingAutoSend, setPendingAutoSend] = useState<{ roomId: string; text: string } | null>(null);
  const [customProbeOptions, setCustomProbeOptions] = useState<Record<string, string>>({});
  const [editingSoulConfigRole, setEditingSoulConfigRole] = useState<RoleMember | null>(null);
  const [editingSoulConfigText, setEditingSoulConfigText] = useState('');
  const [newRoleName, setNewRoleName] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [form] = Form.useForm();

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
    loadModels();
    loadRoleTemplates();
    loadPromptTemplates();
  }, []);

  // 保存工作台状态到 localStorage
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
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.error('保存状态失败:', e);
    }
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

  const confirmRoles = () => {
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
    setMessages([]);
    setCanvasConsensus([]);
    setCanvasDisputes([]);
    setCanvasUpdatedAt('');
    setRoundtableStage('brief');
    setRolesReady(true);
    setRoomReady(true);
    const newRoomId = `room_${Date.now().toString(36)}`;
    setRoomId(newRoomId);
    const newRoom: RoundtableRoom = {
      id: newRoomId,
      name: `圆桌空间-${new Date().toLocaleString()}`,
      createdAt: new Date().toLocaleString(),
    };
    setRoundtableRooms((prev) => [newRoom, ...prev]);
    setStep('roundtable_view');
    setCanvasUpdatedAt(new Date().toLocaleString());
    const seedLines = [
      initialDemand.trim() ? `需求原始描述：${initialDemand.trim()}` : '',
      intentCard.coreGoal ? `核心目标：${intentCard.coreGoal}` : '',
      intentCard.constraints ? `限制条件：${intentCard.constraints}` : '',
      intentCard.painPoints ? `关键痛点：${intentCard.painPoints}` : '',
      '请各角色先给出最关键的 3-5 条核心要点（不要输出总结性方案）。',
    ].filter(Boolean);
    const seedText = seedLines.join('\n');
    if (seedText.trim()) {
      setPendingAutoSend({ roomId: newRoomId, text: seedText });
    }
    message.success('角色矩阵确认完成，已自动创建圆桌空间');
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
  };

  const selectRoundtableRoom = (room: RoundtableRoom) => {
    setRoomId(room.id);
    setStep('roundtable_view');
    setRoomReady(true);
  };

  const deleteRoundtableRoom = (roomIdToDelete: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRoundtableRooms((prev) => prev.filter((room) => room.id !== roomIdToDelete));
    if (roomId === roomIdToDelete) {
      const remaining = roundtableRooms.filter((room) => room.id !== roomIdToDelete);
      if (remaining.length > 0) {
        selectRoundtableRoom(remaining[0]);
      } else {
        createNewRoundtable();
      }
    }
    message.success('圆桌空间已删除');
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
  }, [intentCard.constraints, intentCard.coreGoal, intentCard.painPoints, promptTemplates]);

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

    const transcript = buildTranscript(
      [...messages, { id: userMessageId, speakerId: 'user', speakerName: '我', speakerType: 'user', content: userText, createdAt: now }].map(
        (m) => ({ speakerName: m.speakerName, content: m.content }),
      ),
    );

    try {
      for (const role of speakingRoles) {
        const assistantId = `m_${role.id}_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
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

        await streamChatByLLMConfig(
          selectedModelId,
          {
            message: `对话记录（最近）：\n${transcript}\n\n用户本轮输入：${userText}`,
            system_prompt: `${buildAgentSystemPrompt(role, stage)}\n\n${systemPrompt.trim() ? `补充系统提示词：${systemPrompt.trim()}` : ''}`,
          },
          {
            onDelta: (delta) => {
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
  ]);

  useEffect(() => {
    if (!pendingAutoSend) {
      return;
    }
    if (!roomReady || roomId !== pendingAutoSend.roomId) {
      return;
    }
    if (sending || messages.length > 0) {
      return;
    }
    setPendingAutoSend(null);
    setUserPrompt('');
    void sendToRoundtable(pendingAutoSend.text, 'brief');
  }, [messages.length, pendingAutoSend, roomId, roomReady, sending, sendToRoundtable]);

  const generateFinalPlan = () => {
    if (!roomReady) {
      message.warning('请先创建圆桌空间');
      return;
    }
    if (sending) {
      message.warning('正在生成中，请稍候或点击停止');
      return;
    }
    setRoundtableStage('final');
    const convergeMsg = promptTemplates.prompt_converge_trigger || '我觉得讨论已经收敛，请各角色基于当前讨论输出总结性方案。';
    void sendToRoundtable(convergeMsg, 'final');
  };

  const canGoRoles = intentReady;

  return (
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
              renderItem={(room) => (
                <List.Item
                  key={room.id}
                  onClick={() => selectRoundtableRoom(room)}
                  style={{
                    padding: '12px 16px',
                    cursor: 'pointer',
                    background: roomId === room.id ? '#e6f7ff' : 'transparent',
                  }}
                  actions={[
                    <Button
                      key="edit"
                      type="text"
                      size="small"
                      onClick={(e) => startEditingRoomName(room.id, e)}
                    >
                      编辑
                    </Button>,
                    <Button
                      key="delete"
                      type="text"
                      size="small"
                      danger
                      onClick={(e) => deleteRoundtableRoom(room.id, e)}
                    >
                      删除
                    </Button>,
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
                        />
                      ) : (
                        <Text ellipsis style={{ maxWidth: 160 }}>{room.name}</Text>
                      )
                    }
                    description={<Text type="secondary" style={{ fontSize: 11 }}>{room.createdAt}</Text>}
                  />
                </List.Item>
              )}
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
                            const sampleContent = `我想开发'小秘'，一款本地优先、隐私主权的开源个人 AI 管家。

核心逻辑：必须支持包括语音、拍照、截图、即时消息转发、文档解析等 8 种媒介的零门槛输入。其底层通过分级 AI 架构 (Hybrid AI) 运行，在确保端侧轻量化处理的同时，通过智能知识索引引擎，将碎片化的信息自动转化为可行动的任务与动态关联的个人第二大脑。

硬性约束：
1. 隐私至上：所有 RAG 索引、结构化数据和 SQLite 数据库必须默认存储在本地，支持自建 WebDAV 或 E2EE 加密同步，确保用户数据的绝对所有权。
2. 收件箱缓冲机制：拒绝'任务垃圾场'。所有 AI 解析的内容需进入待确认区，通过类似的高效率交互由用户确认为任务、知识或忽略，维护日程的严肃性。
3. 免打扰主动管理：具备情境感知能力，仅在合适的时间窗口进行批量汇总提醒，而非无休止的即时打扰。

痛点场景：彻底解决我每天在微信截图、语音随笔、网页剪藏与工作邮件之间反复横跳、碎片信息无法结构化统一管理的焦虑。它能从一张活动海报中自动提取时间地点，也能在我要开会前，自动联想并推送出存储在本地的相关项目文档。`;
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
                        <Button type="primary" onClick={confirmIntent}>
                          确认意图并进入角色矩阵
                        </Button>
                      </Space>
                    </Form>
                  </Card>
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
              <Row gutter={16} style={{ height: '100%', overflow: 'hidden' }}>
                {/* 左侧：对话流 */}
                <Col xs={24} xl={17} style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflow: 'hidden' }}>
                  <Card
                    title={
                      <Space>
                        <span>圆桌空间</span>
                        <Tag>{messages.length}</Tag>
                      </Space>
                    }
                    style={{ borderRadius: 8, flex: 1, display: 'flex', flexDirection: 'column' }}
                    bodyStyle={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                  >
                    {!roomReady && <Empty description="请先完成意图洞察与角色确认" />}
                    {roomReady && (
                      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
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
                <Col xs={24} xl={7} style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflow: 'hidden' }}>
                  {/* 共识摘要 */}
                  <Card title="共识摘要" style={{ borderRadius: 8, flex: 1, overflow: 'hidden' }}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Card size="small">
                        <Text strong>需求锚点</Text>
                        <Paragraph style={{ marginBottom: 0 }}>{intentCard.coreGoal || '-'}</Paragraph>
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
              <div style={{ padding: 16 }}>
                <Card
                  title={
                    <Space>
                      <span>创意画布</span>
                      <Tag color="blue">实时</Tag>
                    </Space>
                  }
                  style={{ borderRadius: 8, minHeight: 'calc(100dvh - 64px - 80px)' }}
                >
                  <RoundtableCanvas
                    key={roomId || 'default'}
                    roomId={roomId}
                    intentAnchor={intentCard.coreGoal}
                    messages={messages}
                    roles={roles}
                    canvasConsensus={canvasConsensus}
                    canvasDisputes={canvasDisputes}
                    canvasUpdatedAt={canvasUpdatedAt}
                    onConsensusChange={setCanvasConsensus}
                    onDisputesChange={setCanvasDisputes}
                    onUpdatedAtChange={setCanvasUpdatedAt}
                  />
                </Card>
              </div>
            )}
          </Content>

          <Footer style={{ background: '#ffffff', borderTop: '1px solid #f0f0f0' }}>
            {/* 创意画布页面不显示底部内容 */}
            {step === 'canvas_view' && (
              <Row justify="space-between" align="middle">
                <Col>
                  <Text type="secondary">
                    创意画布模式 - 仅展示讨论共识，可从圆桌空间发送内容到画布
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
            {/* 圆桌空间和查看模式显示状态标签 */}
            {step !== 'roundtable' && step !== 'canvas_view' && (
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
                    rows={2}
                    maxLength={500}
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
        </Layout>
      </Layout>
    </Layout>
  );
};

export default Home;
