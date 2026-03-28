import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
  Popconfirm,
  Select,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;
const { TextArea } = Input;

interface ScenarioTemplate {
  id: number;
  name: string;
  description?: string;
  preset_roles: any[];
  system_prompt_override?: string;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at?: string;
}

interface RoleTemplate {
  id: number;
  name: string;
  stance: string;
}

const ScenarioTemplateManagement: React.FC = () => {
  const [templates, setTemplates] = useState<ScenarioTemplate[]>([]);
  const [roleOptions, setRoleOptions] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm();

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/scenario-templates/');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setTemplates(data);
    } catch {
      message.error('加载场景模板失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoleOptions = async () => {
    try {
      const response = await fetch('/api/v1/role-templates/');
      if (response.ok) {
        const data = await response.json();
        setRoleOptions(data);
      }
    } catch {
      console.error('加载角色模板失败');
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchRoleOptions();
  }, []);

  const handleAdd = () => {
    setEditingId(null);
    form.setFieldsValue({
      is_active: true,
      sort_order: 0,
      preset_roles: [],
    });
    setModalVisible(true);
  };

  const handleEdit = (record: ScenarioTemplate) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/v1/scenario-templates/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete');
      message.success('模板已删除');
      fetchTemplates();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const url = editingId !== null ? `/api/v1/scenario-templates/${editingId}` : '/api/v1/scenario-templates/';
      const method = editingId !== null ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error('Failed to save');

      message.success(editingId !== null ? '模板已更新' : '模板已创建');
      setModalVisible(false);
      fetchTemplates();
    } catch {
      message.error('保存失败');
    }
  };

  const columns: ColumnsType<ScenarioTemplate> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: '模板名称',
      dataIndex: 'name',
      width: 200,
      render: (text) => <Text strong>{text}</Text>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
    },
    {
      title: '预设角色数',
      dataIndex: 'preset_roles',
      width: 120,
      render: (roles) => <Tag color="blue">{roles?.length || 0} 个角色</Tag>,
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      width: 80,
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
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除此模板？" onConfirm={() => handleDelete(record.id)}>
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
            新建场景模板
          </Button>
        }
      >
        <Table columns={columns} dataSource={templates} loading={loading} rowKey="id" pagination={{ pageSize: 20 }} />
      </Card>

      <Modal
        title={editingId !== null ? '编辑场景模板' : '新建场景模板'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]}>
            <Input placeholder="例如：产品功能杀手局" />
          </Form.Item>
          <Form.Item name="description" label="模板描述">
            <TextArea rows={2} placeholder="一句话描述这个场景的作用" />
          </Form.Item>
          <Form.Item name="preset_roles" label="预设角色" rules={[{ required: true, message: '请至少选择一个角色' }]}>
            <Select
              mode="multiple"
              placeholder="选择参与此场景的角色"
              options={roleOptions.map(r => ({ label: `${r.name} (${r.stance})`, value: r.id }))}
            />
          </Form.Item>
          <Form.Item name="system_prompt_override" label="专属系统提示词 (可选)">
            <TextArea rows={4} placeholder="如果需要覆盖默认的系统提示词，请填写" />
          </Form.Item>
          <Space>
            <Form.Item name="sort_order" label="排序权重">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="is_active" label="启用状态" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
};

export default ScenarioTemplateManagement;
