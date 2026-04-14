import React, { useEffect, useState } from 'react';
import {
  Button,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, MessageOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  createLLMConfig,
  deleteLLMConfig,
  getLLMConfigs,
  streamChatByLLMConfig,
  updateLLMConfig,
} from '../../api/llm';
import type { LLMConfig } from '../../api/llm';

// 协议类型选项
const PROVIDER_OPTIONS = [
  { value: 'openai_compatible', label: 'OpenAI 兼容' },
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'azure_openai', label: 'Azure OpenAI' },
  { value: 'google', label: 'Google Gemini' },
  { value: 'moonshot', label: 'Moonshot 月之暗面' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'qwen', label: '通义千问' },
  { value: 'other', label: '其他' },
];

const ModelManagement: React.FC = () => {
  const navigate = useNavigate();
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [chatDrawerVisible, setChatDrawerVisible] = useState(false);
  const [chatTarget, setChatTarget] = useState<LLMConfig | null>(null);
  const [chatPrompt, setChatPrompt] = useState('');
  const [chatSystemPrompt, setChatSystemPrompt] = useState('');
  const [chatStreaming, setChatStreaming] = useState(false);
  const [chatMarkdown, setChatMarkdown] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();
  const { Text } = Typography;

  const navigateToChat = (record: LLMConfig) => {
    navigate('/admin/chat', { state: { modelId: record.id } });
  };

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const data = await getLLMConfigs();
      setConfigs(data);
    } catch {
      message.error('Failed to load LLM configurations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleAdd = () => {
    setEditingId(null);
    form.setFieldsValue({
      provider: 'openai_compatible',
      temperature: 0.7,
      is_active: true,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: LLMConfig) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteLLMConfig(id);
      message.success('模型配置已删除');
      fetchConfigs();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        temperature: Number(values.temperature ?? 0.7),
        max_tokens: values.max_tokens ? Number(values.max_tokens) : undefined,
        top_p: values.top_p != null ? Number(values.top_p) : undefined,
        context_length: values.context_length ? Number(values.context_length) : undefined,
        frequency_penalty: values.frequency_penalty != null ? Number(values.frequency_penalty) : undefined,
        presence_penalty: values.presence_penalty != null ? Number(values.presence_penalty) : undefined,
      };
      // 清除空值，避免将空字符串传给后端
      if (!payload.api_key || payload.api_key.trim() === '') {
        delete payload.api_key;
      }
      if (!payload.max_tokens) delete payload.max_tokens;
      if (!payload.context_length) delete payload.context_length;
      if (payload.top_p == null) delete payload.top_p;
      if (payload.frequency_penalty == null) delete payload.frequency_penalty;
      if (payload.presence_penalty == null) delete payload.presence_penalty;
      if (!payload.auxiliary_model_id) delete payload.auxiliary_model_id;
      if (editingId) {
        await updateLLMConfig(editingId, payload);
        message.success('模型配置已更新');
      } else {
        await createLLMConfig(payload);
        message.success('模型配置已创建');
      }
      setModalVisible(false);
      fetchConfigs();
    } catch (error) {
      const maybeError = error as {
        response?: { data?: { detail?: string | { msg?: string }[] } };
      };
      const detail = maybeError.response?.data?.detail;
      if (typeof detail === 'string') {
        message.error(detail);
        return;
      }
      if (Array.isArray(detail) && detail.length > 0 && typeof detail[0]?.msg === 'string') {
        message.error(detail[0].msg as string);
        return;
      }
      message.error('操作失败，请检查输入');
    }
  };

  const handleStreamChat = async () => {
    if (!chatTarget || !chatPrompt.trim()) {
      message.warning('请输入测试消息');
      return;
    }
    setChatStreaming(true);
    setChatMarkdown('');
    await streamChatByLLMConfig(
      chatTarget.id,
      { message: chatPrompt.trim(), system_prompt: chatSystemPrompt.trim() || undefined },
      {
        onDelta: (delta) => setChatMarkdown((prev) => prev + delta),
        onDone: () => setChatStreaming(false),
        onError: (msg) => {
          setChatStreaming(false);
          message.error(msg);
        },
      },
    );
  };

  const tableColumns = [
    {
      title: '模型名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <b>{text}</b>,
    },
    {
      title: '协议类型',
      dataIndex: 'provider',
      key: 'provider',
      render: (text: string) => <Tag color="blue">{text}</Tag>,
    },
    {
      title: '模型 ID',
      dataIndex: 'model_name',
      key: 'model_name',
    },
    {
      title: 'OpenAI 兼容地址',
      dataIndex: 'api_base',
      key: 'api_base',
      render: (text: string) => text || '-',
    },
    {
      title: '上下文参数',
      key: 'context_params',
      render: (_: unknown, record: LLMConfig) => (
        <Space size={4} wrap>
          {record.context_length && <Tag color="cyan">ctx {record.context_length.toLocaleString()}</Tag>}
          {record.max_tokens && <Tag color="purple">out {record.max_tokens.toLocaleString()}</Tag>}
          {record.top_p != null && <Tag>top_p {record.top_p}</Tag>}
          {record.frequency_penalty != null && <Tag>freq {record.frequency_penalty}</Tag>}
          {record.presence_penalty != null && <Tag>pres {record.presence_penalty}</Tag>}
          {record.auxiliary_model_id != null && <Tag color="cyan">aux #{record.auxiliary_model_id}</Tag>}
          {!record.context_length && !record.max_tokens && record.top_p == null && record.frequency_penalty == null && record.presence_penalty == null && !record.auxiliary_model_id && <span style={{ color: '#999' }}>默认</span>}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean, record: LLMConfig) => (
        <Space>
          <Tag color={active ? 'green' : 'red'}>{active ? '启用' : '停用'}</Tag>
          {record.enable_thinking && <Tag color="orange">思考模式</Tag>}
        </Space>
      )
    },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: LLMConfig) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => handleEdit(record)} size="small">
            编辑
          </Button>
          <Button
            size="small"
            icon={<MessageOutlined />}
            onClick={() => navigateToChat(record)}
          >
            聊天
          </Button>
          <Popconfirm title="确认删除该模型配置？" onConfirm={() => handleDelete(record.id)}>
            <Button icon={<DeleteOutlined />} danger size="small">
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between' }}>
        <h2>模型中枢（OpenAI 兼容）</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增模型
        </Button>
      </div>

      <Table
        columns={tableColumns}
        dataSource={configs}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={editingId ? '编辑模型配置' : '新增模型配置'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="展示名称" rules={[{ required: true, message: '请输入展示名称' }]}>
            <Input placeholder="例如：GPT-4 Turbo / DeepSeek-V3" />
          </Form.Item>
          <Form.Item name="provider" label="协议类型" rules={[{ required: true, message: '请选择协议类型' }]}>
            <Select options={PROVIDER_OPTIONS} placeholder="请选择协议类型" showSearch />
          </Form.Item>
          <Form.Item name="model_name" label="模型 ID" rules={[{ required: true, message: '请输入模型 ID' }]}>
            <Input placeholder="例如：gpt-4o-mini / deepseek-chat" />
          </Form.Item>
          <Form.Item name="api_key" label="API Key">
            <Input.Password placeholder="编辑时留空可保持不变" />
          </Form.Item>
          <Form.Item name="api_base" label="OpenAI 兼容接口地址">
            <Input placeholder="例如：https://api.openai.com/v1 或私有网关地址" />
          </Form.Item>
          <Form.Item name="temperature" label="默认温度" initialValue={0.7}>
            <InputNumber style={{ width: '100%' }} step={0.1} min={0} max={2} />
          </Form.Item>
          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0 16px' }}>上下文参数</Divider>
          <Form.Item name="context_length" label="上下文长度" tooltip="模型支持的最大上下文 token 数，用于上下文溢出时的截断策略参考">
            <InputNumber style={{ width: '100%' }} min={1} step={1024} placeholder="例如：128000" />
          </Form.Item>
          <Form.Item name="max_tokens" label="最大输出 Tokens" tooltip="单次回复的最大生成 token 数">
            <InputNumber style={{ width: '100%' }} min={1} step={256} placeholder="例如：4096" />
          </Form.Item>
          <Form.Item name="top_p" label="Top P" tooltip="核采样参数，控制多样性。1.0 为不限制">
            <InputNumber style={{ width: '100%' }} step={0.05} min={0} max={1} placeholder="0 ~ 1" />
          </Form.Item>
          <Form.Item name="frequency_penalty" label="频率惩罚" tooltip="已出现 token 的惩罚系数，值越大越避免重复">
            <InputNumber style={{ width: '100%' }} step={0.1} min={-2} max={2} placeholder="-2 ~ 2" />
          </Form.Item>
          <Form.Item name="presence_penalty" label="存在惩罚" tooltip="新 topic 的鼓励系数，值越大越倾向谈论新话题">
            <InputNumber style={{ width: '100%' }} step={0.1} min={-2} max={2} placeholder="-2 ~ 2" />
          </Form.Item>
          <Divider orientation="left" style={{ fontSize: 13, margin: '8px 0 16px' }}>状态</Divider>
          <Form.Item name="is_active" label="是否启用" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
          <Form.Item name="enable_thinking" label="思考模式" valuePropName="checked" initialValue={false}>
            <Switch checkedChildren="思考" unCheckedChildren="标准" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`流式对话测试：${chatTarget?.name ?? ''}`}
        width={720}
        open={chatDrawerVisible}
        onClose={() => {
          setChatDrawerVisible(false);
          setChatTarget(null);
        }}
      >
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Input.TextArea
            rows={3}
            value={chatSystemPrompt}
            onChange={(e) => setChatSystemPrompt(e.target.value)}
            placeholder="系统提示词（可选）"
          />
          <Input.TextArea
            rows={4}
            value={chatPrompt}
            onChange={(e) => setChatPrompt(e.target.value)}
            placeholder="输入消息，点击开始流式对话"
          />
          <Button type="primary" loading={chatStreaming} onClick={handleStreamChat}>
            开始流式对话
          </Button>
          <Text type="secondary">输出采用 Markdown 渲染展示</Text>
          <div
            style={{
              border: '1px solid #f0f0f0',
              borderRadius: 8,
              minHeight: 240,
              padding: 16,
              background: '#fff',
              overflowY: 'auto',
            }}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {chatMarkdown || '暂无输出'}
            </ReactMarkdown>
          </div>
        </Space>
      </Drawer>
    </div>
  );
};

export default ModelManagement;
