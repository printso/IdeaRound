import {
  Avatar,
  Badge,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Form,
  Input,
  Layout,
  List,
  Menu,
  Row,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getLLMConfigs, streamChatByLLMConfig } from '../api/llm';
import type { LLMConfig } from '../api/llm';

const { Header, Sider, Content, Footer } = Layout;
const { Title, Paragraph, Text } = Typography;

type IntentCardState = {
  coreGoal: string;
  constraints: string;
  painPoints: string;
};

type StepKey = 'intent' | 'roles' | 'roundtable';

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
};

const Home = () => {
  const [models, setModels] = useState<LLMConfig[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<number | undefined>(undefined);
  const [step, setStep] = useState<StepKey>('intent');
  const [initialDemand, setInitialDemand] = useState('');
  const [probeQuestions, setProbeQuestions] = useState<ProbeQuestion[]>([]);
  const [probeTurns, setProbeTurns] = useState<ProbeTurn[]>([]);
  const [intentCard, setIntentCard] = useState<IntentCardState>({
    coreGoal: '',
    constraints: '',
    painPoints: '',
  });
  const [intentReady, setIntentReady] = useState(false);
  const [roles, setRoles] = useState<RoleMember[]>([]);
  const [rolesReady, setRolesReady] = useState(false);
  const [roomReady, setRoomReady] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [autoBrainstorm, setAutoBrainstorm] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState('');
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
  >([]);
  const [canvasConsensus, setCanvasConsensus] = useState<string[]>([]);
  const [canvasDisputes, setCanvasDisputes] = useState<string[]>([]);
  const [canvasUpdatedAt, setCanvasUpdatedAt] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const [form] = Form.useForm();

  const activeModels = useMemo(() => models.filter((item) => item.is_active), [models]);
  const modelSelectOptions = useMemo(
    () =>
      activeModels.map((item) => ({
        value: item.id,
        label: `${item.name} (${item.model_name})`,
      })),
    [activeModels],
  );

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

  useEffect(() => {
    loadModels();
  }, []);

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
    const generatedRoles: RoleMember[] = [
      { id: 'pm', name: '产品策略官', stance: '建设', desc: '目标拆解、需求路径、里程碑', selected: true },
      { id: 'arch', name: '技术架构师', stance: '建设', desc: '可实施性、复杂度、工程风险', selected: true },
      { id: 'ops', name: '增长运营官', stance: '中立', desc: '转化漏斗、数据指标、增长实验', selected: true },
      { id: 'risk', name: '黑帽风控官', stance: '对抗', desc: '挑刺、压力测试、边界与风险', selected: true },
      { id: 'audit', name: '审计官', stance: '评审', desc: '严格评审回答质量并提出优缺点', selected: true },
    ];
    setRoles(generatedRoles);
    message.success('意图洞察完成，已生成初始角色矩阵');
  };

  const toggleRoleSelected = (roleId: string) => {
    setRoles((prev) => prev.map((role) => (role.id === roleId ? { ...role, selected: !role.selected } : role)));
  };

  const confirmRoles = () => {
    const selected = roles.filter((r) => r.selected);
    const hasBlackhat = selected.some((r) => r.id === 'risk');
    const hasAudit = selected.some((r) => r.id === 'audit');
    if (selected.length < 4 || !hasBlackhat) {
      message.warning('至少选择 3 位角色 + 1 位对抗性角色（黑帽）');
      return;
    }
    if (!hasAudit) {
      message.warning('必须包含审计官角色');
      return;
    }
    setRolesReady(true);
    setRoomReady(true);
    setRoomId(`room_${Date.now().toString(36)}`);
    setStep('roundtable');
    setCanvasUpdatedAt(new Date().toLocaleString());
    message.success('角色矩阵确认完成，已自动创建圆桌空间');
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
  };

  const buildTranscript = (items: { speakerName: string; content: string }[]) => {
    const slice = items.slice(-12);
    return slice.map((m) => `${m.speakerName}：${m.content}`).join('\n');
  };

  const buildAgentSystemPrompt = (role: RoleMember) => {
    const base = [
      '你是圆桌创意中的一个角色，请保持高信噪比，给出可执行建议，避免客套话。',
      `你的身份：${role.name}（立场：${role.stance}）。`,
      `用户意图锚点：${intentCard.coreGoal || '未提供'}。`,
      intentCard.constraints ? `限制条件：${intentCard.constraints}` : '',
      intentCard.painPoints ? `待解决痛点：${intentCard.painPoints}` : '',
      '请用 Markdown 输出，结构清晰（要点/步骤/风险/指标）。',
    ].filter(Boolean);
    return base.join('\n');
  };

  const sendToRoundtable = async () => {
    if (!selectedModelId) {
      message.warning('请选择一个可用模型');
      return;
    }
    if (!userPrompt.trim()) {
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

    const controller = new AbortController();
    abortRef.current = controller;
    setSending(true);

    const now = new Date().toLocaleTimeString();
    const userMessageId = `m_user_${Date.now()}`;
    const userText = userPrompt.trim();
    setUserPrompt('');

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
            system_prompt: `${buildAgentSystemPrompt(role)}\n\n${systemPrompt.trim() ? `补充系统提示词：${systemPrompt.trim()}` : ''}`,
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
        if (!next.includes('已生成可执行思路草案')) {
          next.push('已生成可执行思路草案');
        }
        return next.slice(-6);
      });
      setCanvasDisputes((prev) => {
        const next = [...prev];
        if (!next.includes('存在风险与投入产出不确定性，需要进一步验证')) {
          next.push('存在风险与投入产出不确定性，需要进一步验证');
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
  };

  const canGoRoles = intentReady;
  const canGoRoundtable = rolesReady;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#ffffff', borderBottom: '1px solid #f0f0f0', padding: '0 16px' }}>
        <Row justify="space-between" align="middle" style={{ height: '100%' }}>
          <Col>
            <Space>
              <Title level={4} style={{ margin: 0 }}>
                圆桌创意 · 工作台
              </Title>
              <Tag color={step === 'intent' ? 'blue' : step === 'roles' ? 'gold' : 'green'}>
                {step === 'intent' ? '意图洞察' : step === 'roles' ? '角色矩阵' : '圆桌空间'}
              </Tag>
              {roomReady && (
                <Text type="secondary">
                  房间：{roomId}
                </Text>
              )}
              <Button type="link" href="/admin" style={{ padding: 0 }}>
                后台管理
              </Button>
            </Space>
          </Col>
          <Col>
            <Space>
              <Select
                loading={loadingModels}
                value={selectedModelId}
                placeholder="选择模型"
                style={{ width: 280 }}
                onChange={(value) => setSelectedModelId(value)}
                options={modelSelectOptions}
              />
              <Input
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="补充系统提示词（可选）"
                style={{ width: 320 }}
              />
            </Space>
          </Col>
        </Row>
      </Header>

      <Layout>
        <Sider width={220} style={{ background: '#ffffff', borderRight: '1px solid #f0f0f0' }}>
          <Menu
            mode="inline"
            selectedKeys={[step]}
            items={[
              { key: 'intent', label: '意图洞察' },
              { key: 'roles', label: '角色矩阵', disabled: !canGoRoles },
              { key: 'roundtable', label: '圆桌空间', disabled: !canGoRoundtable },
            ]}
            onClick={(e) => setStep(e.key as StepKey)}
          />
          <Divider style={{ margin: '12px 0' }} />
          <div style={{ padding: '0 16px 12px 16px' }}>
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              流程：意图洞察 → 角色矩阵 → 圆桌空间
            </Paragraph>
          </div>
        </Sider>

        <Layout style={{ background: '#f5f5f5' }}>
          <Content style={{ padding: 16 }}>
            {step === 'intent' && (
              <Row gutter={16}>
                <Col xs={24} xl={14}>
                  <Card title="意图洞察交互" style={{ borderRadius: 8 }}>
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                      <Input.TextArea
                        rows={3}
                        value={initialDemand}
                        onChange={(e) => setInitialDemand(e.target.value)}
                        placeholder="请简要描述你的需求（回车后不会立即建群，而是先澄清意图）"
                      />
                      <Space>
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
                      {probeTurns.length === 0 && <Empty description="输入需求后点击“开始洞察”，系统将提出澄清问题并生成需求卡片" />}
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
                              </Space>
                            </Card>
                          ))}
                        </Space>
                      )}
                    </Space>
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
                  <Card title="角色矩阵（请确认参与圆桌的角色）" style={{ borderRadius: 8 }}>
                    {!intentReady && <Empty description="请先完成意图洞察" />}
                    {intentReady && (
                      <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Row gutter={[12, 12]}>
                          {roles.map((role) => (
                            <Col xs={24} md={12} key={role.id}>
                              <Card
                                hoverable
                                onClick={() => toggleRoleSelected(role.id)}
                                style={{
                                  borderRadius: 8,
                                  border:
                                    role.id === 'risk'
                                      ? '1px solid #d4380d'
                                      : role.selected
                                        ? '1px solid #1677ff'
                                        : '1px solid #f0f0f0',
                                }}
                              >
                                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                    <Space>
                                      <Text strong>{role.name}</Text>
                                      <Tag color={role.id === 'risk' ? 'volcano' : role.stance === '建设' ? 'blue' : 'default'}>
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
                        圆桌空间中，你（“我”）是特殊角色：可以发言、暂停生成、清空讨论、通过系统提示词进行纠偏。
                      </Text>
                    </Space>
                  </Card>
                </Col>
              </Row>
            )}

            {step === 'roundtable' && (
              <Row gutter={16}>
                <Col xs={24} xl={15}>
                  <Card title="圆桌空间（群聊）" style={{ borderRadius: 8 }}>
                    {!roomReady && <Empty description="请先完成意图洞察与角色确认" />}
                    {roomReady && (
                      <div style={{ height: 520, overflowY: 'auto' }}>
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
                              <Space align="start">
                                {item.speakerType !== 'user' && (
                                  <Avatar style={{ background: '#52c41a' }}>{item.speakerName.slice(0, 1)}</Avatar>
                                )}
                                <Card
                                  size="small"
                                  style={{
                                    maxWidth: 820,
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
                <Col xs={24} xl={9}>
                  <Space direction="vertical" size={16} style={{ width: '100%' }}>
                    <Card title="共识画布" style={{ borderRadius: 8 }}>
                      <Space direction="vertical" size={10} style={{ width: '100%' }}>
                        <Card size="small">
                          <Text strong>需求锚点</Text>
                          <Paragraph style={{ marginBottom: 0 }}>{intentCard.coreGoal || '-'}</Paragraph>
                        </Card>
                        <Card size="small">
                          <Tag color="green">已达成共识</Tag>
                          <List
                            size="small"
                            dataSource={canvasConsensus}
                            locale={{ emptyText: '暂无共识' }}
                            renderItem={(text) => (
                              <List.Item style={{ border: 'none', padding: '2px 0' }}>
                                <Badge color="#52C41A" text={text} />
                              </List.Item>
                            )}
                          />
                        </Card>
                        <Card size="small">
                          <Tag color="gold">遗留争议</Tag>
                          <List
                            size="small"
                            dataSource={canvasDisputes}
                            locale={{ emptyText: '暂无争议' }}
                            renderItem={(text) => (
                              <List.Item style={{ border: 'none', padding: '2px 0' }}>
                                <Badge color="#FAAD14" text={text} />
                              </List.Item>
                            )}
                          />
                        </Card>
                        <Text type="secondary">更新时间：{canvasUpdatedAt || '-'}</Text>
                      </Space>
                    </Card>

                    <Card title="对话控制（用户特殊角色）" style={{ borderRadius: 8 }}>
                      <Space direction="vertical" size={10} style={{ width: '100%' }}>
                        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                          <Text>群聊模式</Text>
                          <Switch checked={autoBrainstorm} onChange={(v) => setAutoBrainstorm(v)} />
                        </Space>
                        <Button
                          onClick={() => {
                            setMessages([]);
                            setCanvasConsensus([]);
                            setCanvasDisputes([]);
                            setCanvasUpdatedAt(new Date().toLocaleString());
                          }}
                        >
                          清空讨论
                        </Button>
                        <Button danger disabled={!sending} onClick={stopStreaming}>
                          停止生成
                        </Button>
                      </Space>
                    </Card>
                  </Space>
                </Col>
              </Row>
            )}
          </Content>

          <Footer style={{ background: '#ffffff', borderTop: '1px solid #f0f0f0' }}>
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
            {step === 'roundtable' && (
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
                    <Button type="primary" loading={sending} onClick={sendToRoundtable}>
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
