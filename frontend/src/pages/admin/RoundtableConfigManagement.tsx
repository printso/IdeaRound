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
} from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { Text } = Typography;
const { TextArea } = Input;

interface RoundtableConfig {
  id: number;
  config_key: string;
  config_value: string;
  description?: string;
  min_value?: number;
  max_value?: number;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

interface RoundtableConfigFormValues {
  config_key: string;
  config_value: string;
  description?: string;
  min_value?: number;
  max_value?: number;
  is_active: boolean;
}

const RoundtableConfigManagement: React.FC = () => {
  const [configs, setConfigs] = useState<RoundtableConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<RoundtableConfigFormValues>();

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/roundtable-configs/');
      if (!response.ok) throw new Error('Failed to fetch');
      const data = await response.json();
      setConfigs(data);
    } catch {
      message.error('加载圆桌配置失败');
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

  const handleEdit = (record: RoundtableConfig) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/v1/roundtable-configs/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete');
      message.success('圆桌配置已删除');
      fetchConfigs();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const url = editingId !== null ? `/api/v1/roundtable-configs/${editingId}` : '/api/v1/roundtable-configs/';
      const method = editingId !== null ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) throw new Error('Failed to save');

      message.success(editingId !== null ? '圆桌配置已更新' : '圆桌配置已创建');
      setModalVisible(false);
      fetchConfigs();
    } catch {
      message.error('保存失败');
    }
  };

  const columns: ColumnsType<RoundtableConfig> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
    },
    {
      title: '配置键',
      dataIndex: 'config_key',
      width: 200,
      render: (text) => <Text code>{text}</Text>,
    },
    {
      title: '配置值',
      dataIndex: 'config_value',
      width: 150,
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      minWidth: 200,
    },
    {
      title: '范围',
      width: 120,
      render: (_, record) => {
        if (record.min_value != null && record.max_value != null) {
          return <Text>{record.min_value} ~ {record.max_value}</Text>;
        }
        return <Text type="secondary">-</Text>;
      },
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
            新建圆桌配置
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
        title={editingId !== null ? '编辑圆桌配置' : '新建圆桌配置'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={700}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="config_key"
            label="配置键"
            rules={[{ required: true, message: '请输入配置键' }]}
          >
            <Input placeholder="例如：max_brief_rounds" disabled={editingId !== null} />
          </Form.Item>
          <Form.Item
            name="config_value"
            label="配置值"
            rules={[{ required: true, message: '请输入配置值' }]}
          >
            <Input placeholder="配置值（支持 JSON 格式）" />
          </Form.Item>
          <Form.Item
            name="description"
            label="配置描述"
          >
            <TextArea rows={3} placeholder="描述此配置的用途" />
          </Form.Item>
          <Form.Item label="数值范围（可选）">
            <Space.Compact>
              <Form.Item name="min_value" noStyle>
                <InputNumber placeholder="最小值" style={{ width: 120 }} />
              </Form.Item>
              <span style={{ padding: '0 8px' }}>~</span>
              <Form.Item name="max_value" noStyle>
                <InputNumber placeholder="最大值" style={{ width: 120 }} />
              </Form.Item>
            </Space.Compact>
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

export default RoundtableConfigManagement;
