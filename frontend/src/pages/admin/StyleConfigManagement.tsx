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
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;
const { TextArea } = Input;

interface StyleConfig {
  id: number;
  s_key: string;
  name: string;
  content: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

interface StyleConfigFormValues {
  s_key: string;
  name: string;
  content: string;
  description?: string;
  is_active: boolean;
}

const StyleConfigManagement: React.FC = () => {
  const [configs, setConfigs] = useState<StyleConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<StyleConfigFormValues>();

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/style-configs/');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setConfigs(data);
    } catch {
      message.error('加载风格配置失败');
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
      is_active: true,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: StyleConfig) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/v1/style-configs/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete');
      message.success('风格配置已删除');
      fetchConfigs();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const url = editingId !== null ? `/api/v1/style-configs/${editingId}` : '/api/v1/style-configs/';
      const method = editingId !== null ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error('Failed to save');

      message.success(editingId !== null ? '风格配置已更新' : '风格配置已创建');
      setModalVisible(false);
      fetchConfigs();
    } catch {
      message.error('保存失败');
    }
  };

  const columns: ColumnsType<StyleConfig> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: '配置键',
      dataIndex: 's_key',
      width: 150,
      render: (text) => <Text code>{text}</Text>,
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 200,
    },
    {
      title: '配置内容',
      dataIndex: 'content',
      minWidth: 300,
      ellipsis: true,
      render: (text) => <Text>{text}</Text>,
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
            title="确定删除此配置？"
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
            新建风格配置
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={configs}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editingId !== null ? '编辑风格配置' : '新建风格配置'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="s_key"
            label="配置键"
            rules={[{ required: true, message: '请输入配置键' }]}
          >
            <Input placeholder="例如：brief_stage" disabled={editingId !== null} />
          </Form.Item>
          <Form.Item
            name="name"
            label="配置名称"
            rules={[{ required: true, message: '请输入配置名称' }]}
          >
            <Input placeholder="例如：脑暴发散阶段风格" />
          </Form.Item>
          <Form.Item
            name="content"
            label="配置内容"
            rules={[{ required: true, message: '请输入配置内容' }]}
          >
            <TextArea rows={8} placeholder="描述输出风格要求" />
          </Form.Item>
          <Form.Item
            name="description"
            label="配置描述"
          >
            <TextArea rows={3} placeholder="可选的配置描述信息" />
          </Form.Item>
          <Form.Item
            name="is_active"
            label="启用状态"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default StyleConfigManagement;
