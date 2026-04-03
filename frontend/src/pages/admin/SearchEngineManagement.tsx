import React, { useEffect, useState } from 'react';
import {
  Button,
  Drawer,
  Form,
  Input,
  List,
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
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import {
  createSearchEngineConfig,
  deleteSearchEngineConfig,
  getSearchEngineConfigs,
  updateSearchEngineConfig,
  testSearchEngineConfig,
} from '../../api/search_engines';
import type { SearchEngineConfig } from '../../api/search_engines';

const PROVIDER_OPTIONS = [
  { value: 'searxng', label: 'SearXNG' },
];

const SearchEngineManagement: React.FC = () => {
  const [configs, setConfigs] = useState<SearchEngineConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  
  // Test Drawer States
  const [testDrawerVisible, setTestDrawerVisible] = useState(false);
  const [testTarget, setTestTarget] = useState<SearchEngineConfig | null>(null);
  const [testQuery, setTestQuery] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);

  const [form] = Form.useForm();

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const data = await getSearchEngineConfigs();
      setConfigs(data);
    } catch {
      message.error('加载搜索引擎配置失败');
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
      provider: 'searxng',
      is_enabled: true,
      is_default: false,
    });
    setModalVisible(true);
  };

  const handleEdit = (record: SearchEngineConfig) => {
    setEditingId(record.id);
    form.setFieldsValue(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteSearchEngineConfig(id);
      message.success('配置已删除');
      fetchConfigs();
    } catch {
      message.error('删除失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      if (editingId) {
        await updateSearchEngineConfig(editingId, values);
        message.success('更新成功');
      } else {
        await createSearchEngineConfig(values);
        message.success('创建成功');
      }
      setModalVisible(false);
      fetchConfigs();
    } catch (error) {
      console.error('Validate Failed:', error);
    }
  };

  const toggleActive = async (checked: boolean, record: SearchEngineConfig) => {
    try {
      await updateSearchEngineConfig(record.id, { is_enabled: checked });
      message.success(`搜索引擎已${checked ? '启用' : '禁用'}`);
      fetchConfigs();
    } catch {
      message.error('操作失败');
    }
  };

  const toggleDefault = async (checked: boolean, record: SearchEngineConfig) => {
    try {
      await updateSearchEngineConfig(record.id, { is_default: checked });
      message.success(`已${checked ? '设为' : '取消'}默认`);
      fetchConfigs();
    } catch {
      message.error('操作失败');
    }
  };

  const handleTestOpen = (record: SearchEngineConfig) => {
    setTestTarget(record);
    setTestQuery('');
    setTestResults([]);
    setTestDrawerVisible(true);
  };

  const handleTestRun = async () => {
    if (!testQuery.trim() || !testTarget) {
      message.warning('请输入搜索关键词');
      return;
    }
    
    setTesting(true);
    try {
      const response = await testSearchEngineConfig(testTarget.id, testQuery);
      if (response.ok) {
        setTestResults(response.results || []);
        if (!response.results || response.results.length === 0) {
          message.info('未找到搜索结果');
        }
      }
    } catch (error: any) {
      message.error(error.message || '测试失败');
    } finally {
      setTesting(false);
    }
  };

  const tableColumns = [
    {
      title: '展示名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <Typography.Text strong>{text}</Typography.Text>,
    },
    {
      title: '引擎类型',
      dataIndex: 'provider',
      key: 'provider',
      render: (provider: string) => {
        const option = PROVIDER_OPTIONS.find((opt) => opt.value === provider);
        return <Tag color="blue">{option ? option.label : provider}</Tag>;
      },
    },
    {
      title: 'API 地址',
      dataIndex: 'base_url',
      key: 'base_url',
      ellipsis: true,
    },
    {
      title: '状态',
      key: 'is_enabled',
      render: (_: any, record: SearchEngineConfig) => (
        <Switch
          checked={record.is_enabled}
          onChange={(checked) => toggleActive(checked, record)}
          checkedChildren="启用"
          unCheckedChildren="禁用"
        />
      ),
    },
    {
      title: '默认',
      key: 'is_default',
      render: (_: any, record: SearchEngineConfig) => (
        <Switch
          checked={record.is_default}
          onChange={(checked) => toggleDefault(checked, record)}
          checkedChildren="是"
          unCheckedChildren="否"
        />
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: SearchEngineConfig) => (
        <Space size="middle">
          <Button type="text" icon={<SearchOutlined />} onClick={() => handleTestOpen(record)}>
            测试
          </Button>
          <Button type="text" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个配置吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="search-engine-management" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>搜索引擎配置</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          新增配置
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
        title={editingId ? '编辑配置' : '新增配置'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="展示名称" rules={[{ required: true, message: '请输入展示名称' }]}>
            <Input placeholder="例如：本地 SearXNG" />
          </Form.Item>
          <Form.Item name="provider" label="引擎类型" rules={[{ required: true, message: '请选择引擎类型' }]}>
            <Select options={PROVIDER_OPTIONS} placeholder="请选择引擎类型" />
          </Form.Item>
          <Form.Item name="base_url" label="API 地址" rules={[{ required: true, message: '请输入API地址' }]}>
            <Input placeholder="例如：http://localhost:8080" />
          </Form.Item>
          <Form.Item name="api_key" label="API Key">
            <Input.Password placeholder="不需要可留空" />
          </Form.Item>
          <Form.Item name="is_enabled" label="启用状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
          <Form.Item name="is_default" label="设为默认" valuePropName="checked">
            <Switch checkedChildren="是" unCheckedChildren="否" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`测试搜索引擎: ${testTarget?.name || ''}`}
        placement="right"
        width={500}
        onClose={() => setTestDrawerVisible(false)}
        open={testDrawerVisible}
      >
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input 
            placeholder="输入搜索关键词..." 
            value={testQuery}
            onChange={(e) => setTestQuery(e.target.value)}
            onPressEnter={handleTestRun}
          />
          <Button 
            type="primary" 
            icon={<SearchOutlined />} 
            onClick={handleTestRun}
            loading={testing}
          >
            搜索
          </Button>
        </Space.Compact>

        <List
          itemLayout="vertical"
          size="large"
          loading={testing}
          dataSource={testResults}
          renderItem={(item) => (
            <List.Item
              key={item.link}
            >
              <List.Item.Meta
                title={<a href={item.link} target="_blank" rel="noopener noreferrer">{item.title}</a>}
                description={
                  <Space size={0} split={<Typography.Text type="secondary" style={{ margin: '0 8px' }}>•</Typography.Text>}>
                    <Typography.Text type="secondary">{item.source}</Typography.Text>
                    <Typography.Link href={item.link} target="_blank" ellipsis style={{ maxWidth: 200 }}>{item.link}</Typography.Link>
                  </Space>
                }
              />
              {item.snippet}
            </List.Item>
          )}
        />
      </Drawer>
    </div>
  );
};

export default SearchEngineManagement;
