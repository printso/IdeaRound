import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
  Popconfirm,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ColumnsType } from 'antd/es/table';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

interface Prompt {
  id: number;
  p_key: string;
  content: string;
  is_active: boolean;
  version_hash?: string;
  created_at: string;
  updated_at?: string;
}

interface PromptFormValues {
  p_key: string;
  content: string;
  is_active: boolean;
}

const PromptManagement: React.FC = () => {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<PromptFormValues>();

  const fetchPrompts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/prompts/');
      if (!response.ok) throw new Error('Failed to fetch prompts');
      const data = await response.json();
      setPrompts(data);
    } catch {
      message.error('加载提示词失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompts();
  }, []);

  const handleAdd = () => {
    setEditingId(null);
    form.setFieldsValue({
      is_active: true,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: Prompt) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/v1/prompts/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete');
      message.success('提示词已删除');
      fetchPrompts();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const url = editingId !== null ? `/api/v1/prompts/${editingId}` : '/api/v1/prompts/';
      const method = editingId !== null ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error('Failed to save');

      message.success(editingId !== null ? '提示词已更新' : '提示词已创建');
      setModalVisible(false);
      fetchPrompts();
    } catch {
      message.error('保存失败');
    }
  };

  const columns: ColumnsType<Prompt> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: '键名',
      dataIndex: 'p_key',
      width: 200,
      render: (text) => <Text code>{text}</Text>,
    },
    {
      title: '内容预览',
      dataIndex: 'content',
      minWidth: 300,
      render: (text) => (
        <Paragraph ellipsis={{ rows: 2 }} style={{ marginBottom: 0 }}>
          {text}
        </Paragraph>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      width: 80,
      render: (active) => <Tag color={active ? 'green' : 'default'}>{active ? '启用' : '禁用'}</Tag>,
    },
    {
      title: '操作',
      width: 150,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此提示词？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新建提示词
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={prompts}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editingId !== null ? '编辑提示词' : '新建提示词'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={800}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="p_key"
            label="提示词键名"
            rules={[{ required: true, message: '请输入提示词键名' }]}
          >
            <Input placeholder="例如：intent_probe_system" disabled={editingId !== null} />
          </Form.Item>
          <Form.Item
            name="content"
            label="提示词内容"
            rules={[{ required: true, message: '请输入提示词内容' }]}
          >
            <TextArea rows={12} placeholder="输入提示词内容，支持 Markdown 格式" />
          </Form.Item>
          <Form.Item
            name="is_active"
            label="启用状态"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>

        {form.getFieldValue('content') && (
          <Card title="预览效果" size="small" style={{ marginTop: 16 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{form.getFieldValue('content')}</ReactMarkdown>
          </Card>
        )}
      </Modal>
    </>
  );
};

export default PromptManagement;
