import React, { useEffect, useState } from 'react';
import {
  Button,
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
      };
      if (!payload.api_key || payload.api_key.trim() === '') {
        delete payload.api_key;
      }
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
