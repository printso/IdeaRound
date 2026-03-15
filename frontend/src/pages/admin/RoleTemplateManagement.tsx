import React, { useEffect, useState } from 'react';
import {
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
  Popconfirm,
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { TextArea } = Input;

interface RoleTemplate {
  id: number;
  name: string;
  stance: string;
  description?: string;
  soul_prompt_id?: number;
  style_prompt_id?: number;
  soul_config?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

interface RoleTemplateFormValues {
  name: string;
  stance: string;
  description?: string;
  soul_prompt_id?: number;
  style_prompt_id?: number;
  soul_config?: string;
  is_default: boolean;
  is_active: boolean;
}

const STANCE_OPTIONS = [
  { value: '建设', label: '建设' },
  { value: '对抗', label: '对抗' },
  { value: '中立', label: '中立' },
  { value: '评审', label: '评审' },
];

const RoleTemplateManagement: React.FC = () => {
  const [roles, setRoles] = useState<RoleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<RoleTemplateFormValues>();

  const fetchRoles = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/role-templates/');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setRoles(data);
    } catch {
      message.error('加载角色模板失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleAdd = () => {
    setEditingId(null);
    form.setFieldsValue({
      stance: '建设',
      is_default: false,
      is_active: true,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: RoleTemplate) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/v1/role-templates/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete');
      message.success('角色模板已删除');
      fetchRoles();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const url = editingId !== null ? `/api/v1/role-templates/${editingId}` : '/api/v1/role-templates/';
      const method = editingId !== null ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error('Failed to save');

      message.success(editingId !== null ? '角色模板已更新' : '角色模板已创建');
      setModalVisible(false);
      fetchRoles();
    } catch {
      message.error('保存失败');
    }
  };

  const columns: ColumnsType<RoleTemplate> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: '角色名称',
      dataIndex: 'name',
      width: 150,
    },
    {
      title: '立场',
      dataIndex: 'stance',
      width: 80,
      render: (stance) => {
        const colorMap: Record<string, string> = {
          '建设': 'blue',
          '对抗': 'volcano',
          '中立': 'gray',
          '评审': 'gold',
        };
        return <Tag color={colorMap[stance] || 'default'}>{stance}</Tag>;
      },
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      minWidth: 200,
    },
    {
      title: '默认',
      dataIndex: 'is_default',
      width: 60,
      render: (isDefault) => <Tag color={isDefault ? 'green' : 'default'}>{isDefault ? '是' : '否'}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      width: 60,
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
          {!record.is_default && (
            <Popconfirm
              title="确定删除此角色模板？"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新建角色模板
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={roles}
          loading={loading}
          rowKey="id"
          pagination={{ pageSize: 20 }}
        />
      </Card>

      <Modal
        title={editingId !== null ? '编辑角色模板' : '新建角色模板'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="例如：产品策略官" />
          </Form.Item>
          <Form.Item
            name="stance"
            label="立场"
            rules={[{ required: true, message: '请选择立场' }]}
          >
            <Select options={STANCE_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="description"
            label="角色描述"
          >
            <TextArea rows={3} placeholder="描述角色职责" />
          </Form.Item>
          <Form.Item
            name="is_default"
            label="默认角色"
            valuePropName="checked"
          >
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
          <Form.Item
            name="is_active"
            label="启用状态"
            valuePropName="checked"
          >
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
          <Form.Item
            name="soul_config"
            label="灵魂配置"
            help="定义角色的性格、偏好、表达风格等，可用于AI对话时的角色设定"
          >
            <TextArea rows={12} placeholder="【角色名称】

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
- 语气：..." />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default RoleTemplateManagement;
