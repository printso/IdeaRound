import React, { useEffect, useState, useRef } from 'react';
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
  Dropdown,
  Typography,
  Row,
  Col,
  Statistic,
  Progress,
  Upload,
  Tooltip,
  Descriptions,
  Tabs,
  InputNumber,
  Rate,
  Badge,
  Alert,
  Divider,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  CopyOutlined,
  HistoryOutlined,
  SearchOutlined,
  FilterOutlined,
  CloudUploadOutlined,
  CloudDownloadOutlined,
  BarChartOutlined,
  EyeOutlined,
  ReloadOutlined,
  MoreOutlined,
  CheckCircleOutlined,
  StopOutlined,
  StarOutlined,
  TagsOutlined,
  UserOutlined,
  FileTextOutlined,
  SettingOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { MenuProps, UploadProps } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import * as roleTemplateApi from '../../api/roleTemplates';

const { TextArea } = Input;
const { Text, Title } = Typography;
const { TabPane } = Tabs;

// 场景分类选项
const CATEGORY_OPTIONS = [
  { value: '技术架构', label: '技术架构', color: 'blue' },       // 对应：系统设计、技术选型
  { value: '产品方案', label: '产品方案', color: 'purple' },     // 对应：产品规划、功能设计
  { value: '市场增长', label: '市场增长', color: 'green' },      // 对应：增长策略、营销获客
  { value: '战略规划', label: '战略规划', color: 'red' },        // 对应：业务战略、长期方向
  { value: '个人创业', label: '个人创业', color: 'orange' },     // 保留原项
  { value: '组织效能', label: '组织效能', color: 'gold' },       // 对应：团队管理、流程优化
  { value: '个人情感', label: '个人情感', color: 'magenta' },    // 保留原项
  { value: '行业分析', label: '行业分析', color: 'cyan' },       // 对应：行业趋势、竞品研究
  { value: '投融资', label: '投融资', color: 'volcano' },        // 对应：融资、估值
  { value: '运营管理', label: '运营管理', color: 'geekblue' },   // 对应：日常运营、供应链
  { value: '其他', label: '其他', color: 'default' },            // 保留原项
];

// 立场选项
const STANCE_OPTIONS = [
    {"value": "建设", "label": "建设", "color": "blue"},
    {"value": "支持", "label": "支持", "color": "green"},
    {"value": "中立", "label": "中立", "color": "default"},
    {"value": "评审", "label": "评审", "color": "gold"},
    {"value": "质疑", "label": "质疑", "color": "volcano"},
    {"value": "保守", "label": "保守", "color": "orange"},
    {"value": "创新", "label": "创新", "color": "cyan"},
]

// 许可证类型
const LICENSE_OPTIONS = [
  { value: 'MIT', label: 'MIT License' },
  { value: 'Apache-2.0', label: 'Apache 2.0' },
  { value: 'GPL-3.0', label: 'GPL 3.0' },
  { value: 'CC-BY-4.0', label: 'CC BY 4.0' },
  { value: 'CC-BY-NC-4.0', label: 'CC BY-NC 4.0' },
  { value: 'Proprietary', label: '专有/商业授权' },
];

interface RoleTemplateFormValues {
  name: string;
  stance: string;
  category: string;
  description?: string;
  personality?: string;
  background?: string;
  skill_tags?: string[];
  value_proposition?: string;
  soul_prompt_id?: number;
  style_prompt_id?: number;
  soul_config?: string;
  is_default: boolean;
  is_active: boolean;
  author?: string;
  copyright_notice?: string;
  license_type?: string;
  dialogue_examples?: Array<{ user: string; assistant: string; scenario?: string }>;
}

interface CloneFormValues {
  name: string;
  category?: string;
}

const RoleTemplateManagement: React.FC = () => {
  const [templates, setTemplates] = useState<roleTemplateApi.RoleTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    current: 1,
    pageSize: 20,
    total: 0,
  });
  const [stats, setStats] = useState<roleTemplateApi.UsageStats | null>(null);
  const [categories, setCategories] = useState<string[]>([]);

  // 筛选状态
  const [searchText, setSearchText] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [selectedStance, setSelectedStance] = useState<string | undefined>();
  const [selectedStatus, setSelectedStatus] = useState<boolean | undefined>();
  const [sortField, setSortField] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modal 状态
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form] = Form.useForm<RoleTemplateFormValues>();

  // 克隆 Modal
  const [cloneModalVisible, setCloneModalVisible] = useState(false);
  const [cloneId, setCloneId] = useState<number | null>(null);
  const [cloneForm] = Form.useForm<CloneFormValues>();

  // 版本历史 Modal
  const [versionModalVisible, setVersionModalVisible] = useState(false);
  const [versions, setVersions] = useState<roleTemplateApi.RoleTemplateVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  // 详情 Modal
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<roleTemplateApi.RoleTemplate | null>(null);

  // 导入 Modal
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importFileList, setImportFileList] = useState<UploadFile[]>([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importMode, setImportMode] = useState<'create' | 'merge' | 'update'>('create');

  // 技能标签输入
  const [skillTagsInput, setSkillTagsInput] = useState('');

  // 获取数据
  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const response = await roleTemplateApi.getRoleTemplates({
        skip: (pagination.current - 1) * pagination.pageSize,
        limit: pagination.pageSize,
        category: selectedCategory,
        stance: selectedStance,
        is_active: selectedStatus,
        search: searchText || undefined,
        sort_by: sortField,
        sort_order: sortOrder,
      });
      setTemplates(response.templates);
      setPagination(prev => ({ ...prev, total: response.total }));
      if (response.stats?.category_stats) {
        setCategories(Object.keys(response.stats.category_stats));
      }
    } catch (error: any) {
      message.error(error?.message || '加载角色模板失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取统计数据
  const fetchStats = async () => {
    try {
      const data = await roleTemplateApi.getUsageStats();
      setStats(data);
    } catch (error) {
      console.error('获取统计数据失败', error);
    }
  };

  // 获取版本历史
  const fetchVersions = async (templateId: number) => {
    setVersionsLoading(true);
    try {
      const data = await roleTemplateApi.getRoleTemplateVersions(templateId);
      setVersions(data);
    } catch (error) {
      message.error('获取版本历史失败');
    } finally {
      setVersionsLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
    fetchStats();
  }, [pagination.current, pagination.pageSize, selectedCategory, selectedStance, selectedStatus, sortField, sortOrder]);

  // 搜索处理
  const handleSearch = () => {
    setPagination(prev => ({ ...prev, current: 1 }));
    fetchTemplates();
  };

  // 表格变化
  const handleTableChange = (pag: TablePaginationConfig, filters: any, sorter: any) => {
    if (pag.current) setPagination(prev => ({ ...prev, current: pag.current }));
    if (pag.pageSize) setPagination(prev => ({ ...prev, pageSize: pag.pageSize as number }));
    if (sorter.field) {
      setSortField(sorter.field as string);
      setSortOrder(sorter.order === 'ascend' ? 'asc' : 'desc');
    }
  };

  // 打开新增 Modal
  const handleAdd = () => {
    setEditingId(null);
    form.setFieldsValue({
      stance: '建设',
      category: '其他',
      is_default: false,
      is_active: true,
      skill_tags: [],
      dialogue_examples: [],
    });
    setSkillTagsInput('');
    setModalVisible(true);
  };

  // 打开编辑 Modal
  const handleEdit = (record: roleTemplateApi.RoleTemplate) => {
    setEditingId(record.id);
    form.setFieldsValue({
      ...record,
      skill_tags: record.skill_tags || [],
    });
    setSkillTagsInput((record.skill_tags || []).join(','));
    setModalVisible(true);
  };

  // 打开详情 Modal
  const handleViewDetail = async (record: roleTemplateApi.RoleTemplate) => {
    try {
      const fullTemplate = await roleTemplateApi.getRoleTemplate(record.id);
      setCurrentTemplate(fullTemplate);
      setDetailModalVisible(true);
    } catch {
      message.error('获取模板详情失败');
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      // 处理技能标签
      const skillTags = skillTagsInput
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      const submitData = {
        ...values,
        skill_tags: skillTags,
      };

      if (editingId !== null) {
        await roleTemplateApi.updateRoleTemplate(editingId, submitData);
        message.success('角色模板已更新');
      } else {
        await roleTemplateApi.createRoleTemplate(submitData as any);
        message.success('角色模板已创建');
      }
      setModalVisible(false);
      fetchTemplates();
      fetchStats();
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请完善必填信息');
      } else {
        message.error(error?.message || '保存失败');
      }
    }
  };

  // 删除
  const handleDelete = async (id: number) => {
    try {
      await roleTemplateApi.deleteRoleTemplate(id);
      message.success('角色模板已删除');
      fetchTemplates();
      fetchStats();
    } catch (error: any) {
      message.error(error?.message || '删除失败');
    }
  };

  // 克隆
  const handleClone = (record: roleTemplateApi.RoleTemplate) => {
    setCloneId(record.id);
    cloneForm.setFieldsValue({
      name: `${record.name} (副本)`,
      category: record.category,
    });
    setCloneModalVisible(true);
  };

  const handleCloneSubmit = async () => {
    try {
      const values = await cloneForm.validateFields();
      if (cloneId) {
        await roleTemplateApi.cloneRoleTemplate(cloneId, values);
        message.success('角色模板克隆成功');
        setCloneModalVisible(false);
        fetchTemplates();
        fetchStats();
      }
    } catch {
      message.error('克隆失败');
    }
  };

  // 切换状态
  const handleToggleActive = async (id: number) => {
    try {
      await roleTemplateApi.toggleRoleTemplateActive(id);
      message.success('状态已更新');
      fetchTemplates();
      fetchStats();
    } catch {
      message.error('状态更新失败');
    }
  };

  // 查看版本历史
  const handleViewVersions = (record: roleTemplateApi.RoleTemplate) => {
    setEditingId(record.id);
    fetchVersions(record.id);
    setVersionModalVisible(true);
  };

  // 恢复版本
  const handleRestoreVersion = async (versionNum: number) => {
    if (!editingId) return;
    try {
      await roleTemplateApi.restoreRoleTemplateVersion(editingId, versionNum);
      message.success('版本已恢复');
      setVersionModalVisible(false);
      fetchTemplates();
    } catch {
      message.error('版本恢复失败');
    }
  };

  // 导入
  const handleImport: UploadProps['customRequest'] = async (options) => {
    const { file, onSuccess, onError } = options;
    setImportLoading(true);
    try {
      const result = await roleTemplateApi.importRoleTemplates(
        file as File,
        importMode,
        false
      );
      message.success(`导入成功: ${result.imported_count} 条`);
      if (result.skipped_count > 0) {
        message.info(`跳过: ${result.skipped_count} 条（已存在）`);
      }
      setImportModalVisible(false);
      setImportFileList([]);
      fetchTemplates();
      fetchStats();
      onSuccess?.(result);
    } catch (error: any) {
      message.error(error?.message || '导入失败');
      onError?.(error as Error);
    } finally {
      setImportLoading(false);
    }
  };

  // 导出
  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const data = await roleTemplateApi.exportRoleTemplates({
        category: selectedCategory,
        include_inactive: true,
      });

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `role_templates_${Date.now()}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      message.success('导出成功');
    } catch {
      message.error('导出失败');
    }
  };

  // 表格列
  const columns: ColumnsType<roleTemplateApi.RoleTemplate> = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
      sorter: true,
    },
    {
      title: '角色名称',
      dataIndex: 'name',
      width: 150,
      ellipsis: true,
      render: (name, record) => (
        <Space>
          <Text strong>{name}</Text>
          {record.is_default && <Tag color="green">默认</Tag>}
        </Space>
      ),
    },
    {
      title: '场景分类',
      dataIndex: 'category',
      width: 100,
      render: (category) => {
        const option = CATEGORY_OPTIONS.find(c => c.value === category);
        return <Tag color={option?.color || 'default'}>{category}</Tag>;
      },
    },
    {
      title: '立场',
      dataIndex: 'stance',
      width: 80,
      render: (stance) => {
        const option = STANCE_OPTIONS.find(s => s.value === stance);
        return <Tag color={option?.color || 'default'}>{stance}</Tag>;
      },
    },
    {
      title: '技能标签',
      dataIndex: 'skill_tags',
      width: 200,
      ellipsis: true,
      render: (tags: string[]) => (
        <Space wrap>
          {(tags || []).slice(0, 3).map(tag => (
            <Tag key={tag} icon={<TagsOutlined />}>{tag}</Tag>
          ))}
          {(tags?.length || 0) > 3 && (
            <Tag>+{(tags?.length || 0) - 3}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '使用频次',
      dataIndex: 'usage_count',
      width: 100,
      sorter: true,
      render: (count) => (
        <Space>
          <RiseOutlined />
          <Text>{count || 0}</Text>
        </Space>
      ),
    },
    {
      title: '评分',
      dataIndex: 'rating',
      width: 120,
      render: (rating, record) => (
        <Space direction="vertical" size={0}>
          <Rate disabled defaultValue={rating} allowHalf style={{ fontSize: 12 }} />
          <Text type="secondary" style={{ fontSize: 11 }}>({record.rating_count})</Text>
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      width: 80,
      render: (active, record) => (
        <Badge
          status={active ? 'success' : 'default'}
          text={active ? '启用' : '停用'}
        />
      ),
    },
    {
      title: '版本',
      dataIndex: 'version',
      width: 60,
      render: (v) => <Text type="secondary">v{v}</Text>,
    },
    {
      title: '操作',
      width: 220,
      render: (_, record) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record)}>
            查看
          </Button>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEdit(record)}>
            编辑
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'clone',
                  icon: <CopyOutlined />,
                  label: '克隆',
                  onClick: () => handleClone(record),
                },
                {
                  key: 'versions',
                  icon: <HistoryOutlined />,
                  label: '版本历史',
                  onClick: () => handleViewVersions(record),
                },
                {
                  key: 'toggle',
                  icon: record.is_active ? <StopOutlined /> : <CheckCircleOutlined />,
                  label: record.is_active ? '停用' : '启用',
                  onClick: () => handleToggleActive(record.id),
                },
                { type: 'divider' },
                {
                  key: 'delete',
                  icon: <DeleteOutlined />,
                  label: '删除',
                  danger: true,
                  disabled: record.is_default,
                },
              ].filter(item => !(record.is_default && item.key === 'delete')) as MenuProps['items'],
            }}
          >
            <Button type="link" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Title level={4}>角色模板管理</Title>

      {/* 统计卡片 */}
      {stats && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small">
              <Statistic title="模板总数" value={stats.total_templates} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="启用中" value={stats.active_templates} valueStyle={{ color: '#52c41a' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="已停用" value={stats.inactive_templates} valueStyle={{ color: '#ff4d4f' }} />
            </Card>
          </Col>
          <Col span={6}>
            <Card size="small">
              <Statistic title="本周新增" value={0} suffix="/" />
            </Card>
          </Col>
        </Row>
      )}

      {/* 分类统计 */}
      {stats && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space wrap>
            {Object.entries(stats.category_stats).map(([cat, count]) => {
              const option = CATEGORY_OPTIONS.find(c => c.value === cat);
              return (
                <Tag key={cat} color={option?.color} style={{ cursor: 'pointer' }} onClick={() => {
                  setSelectedCategory(cat === selectedCategory ? undefined : cat);
                }}>
                  {cat}: {count}
                </Tag>
              );
            })}
          </Space>
        </Card>
      )}

      {/* 筛选和操作栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap align="end">
          <Input
            placeholder="搜索角色名称、描述、背景..."
            prefix={<SearchOutlined />}
            style={{ width: 250 }}
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            onPressEnter={handleSearch}
            allowClear
          />
          <Select
            placeholder="场景分类"
            style={{ width: 120 }}
            allowClear
            value={selectedCategory}
            onChange={val => setSelectedCategory(val)}
            options={CATEGORY_OPTIONS}
          />
          <Select
            placeholder="立场"
            style={{ width: 100 }}
            allowClear
            value={selectedStance}
            onChange={val => setSelectedStance(val)}
            options={STANCE_OPTIONS}
          />
          <Select
            placeholder="状态"
            style={{ width: 100 }}
            allowClear
            value={selectedStatus}
            onChange={val => setSelectedStatus(val)}
            options={[
              { value: true, label: '启用' },
              { value: false, label: '停用' },
            ]}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            搜索
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => {
            setSearchText('');
            setSelectedCategory(undefined);
            setSelectedStance(undefined);
            setSelectedStatus(undefined);
          }}>
            重置
          </Button>
          <Divider type="vertical" />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新建模板
          </Button>
          <Dropdown
            menu={{
              items: [
                {
                  key: 'import',
                  icon: <CloudUploadOutlined />,
                  label: '导入',
                  onClick: () => setImportModalVisible(true),
                },
                {
                  key: 'export_json',
                  icon: <CloudDownloadOutlined />,
                  label: '导出 JSON',
                  onClick: () => handleExport('json'),
                },
                {
                  key: 'export_csv',
                  icon: <CloudDownloadOutlined />,
                  label: '导出 CSV',
                  onClick: () => handleExport('csv'),
                },
              ],
            }}
          >
            <Button icon={<CloudUploadOutlined />}>导入/导出</Button>
          </Dropdown>
        </Space>
      </Card>

      {/* 数据表格 */}
      <Card>
        <Table
          columns={columns}
          dataSource={templates}
          loading={loading}
          rowKey="id"
          pagination={{
            ...pagination,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
          }}
          onChange={handleTableChange}
          scroll={{ x: 1200 }}
          size="middle"
        />
      </Card>

      {/* 新建/编辑 Modal */}
      <Modal
        title={editingId !== null ? '编辑角色模板' : '新建角色模板'}
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={() => setModalVisible(false)}
        width={800}
        okText="保存"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="角色名称"
                rules={[{ required: true, message: '请输入角色名称' }]}
              >
                <Input placeholder="例如：产品策略官" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="category" label="场景分类" rules={[{ required: true }]}>
                <Select options={CATEGORY_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="stance" label="立场" rules={[{ required: true }]}>
                <Select options={STANCE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="is_default" label="设为默认" valuePropName="checked">
                <Switch checkedChildren="是" unCheckedChildren="否" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="description" label="角色简述">
            <TextArea rows={2} placeholder="简要描述角色职责" />
          </Form.Item>

          <Form.Item label="技能标签" help="多个标签用逗号分隔">
            <Input
              placeholder="例如：产品策略,数据分析,用户体验"
              value={skillTagsInput}
              onChange={e => setSkillTagsInput(e.target.value)}
            />
          </Form.Item>

          <Form.Item name="personality" label="性格特征">
            <TextArea rows={3} placeholder="详细描述角色的性格特征" />
          </Form.Item>

          <Form.Item name="background" label="背景故事/人设">
            <TextArea rows={4} placeholder="角色的背景故事、经历设定等" />
          </Form.Item>

          <Form.Item name="value_proposition" label="价值主张">
            <TextArea rows={2} placeholder="角色的独特价值是什么" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="author" label="创作者">
                <Input placeholder="作者/版权方" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="license_type" label="许可证">
                <Select options={LICENSE_OPTIONS} placeholder="选择许可证类型" allowClear />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="copyright_notice" label="版权声明">
            <TextArea rows={2} placeholder="版权声明内容" />
          </Form.Item>

          <Form.Item name="soul_config" label="灵魂配置" help="定义角色的性格、偏好、表达风格等">
            <TextArea
              rows={10}
              placeholder={'【角色名称】\n\n1. 灵魂内核\n- 信条：...\n- 性格：...\n- 使命：...\n- 底色：...\n\n2. 认知偏见与偏好\n- 偏好：...\n- 反感：...\n\n3. 专家领域\n- 专长：...\n- 领地：...\n\n4. 边界与抗拒\n- 抗拒：...\n- 红线：...\n\n5. 表达风格\n- 风格：...\n- 语气：...'}
            />
          </Form.Item>

          <Form.Item name="is_active" label="启用状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 克隆 Modal */}
      <Modal
        title="克隆角色模板"
        open={cloneModalVisible}
        onOk={handleCloneSubmit}
        onCancel={() => setCloneModalVisible(false)}
        okText="克隆"
        cancelText="取消"
      >
        <Form form={cloneForm} layout="vertical" style={{ marginTop: 16 }}>
          <Alert message="克隆将创建一个新的角色模板副本，您可以修改名称和分类" type="info" showIcon style={{ marginBottom: 16 }} />
          <Form.Item
            name="name"
            label="新角色名称"
            rules={[{ required: true, message: '请输入新角色名称' }]}
          >
            <Input placeholder="输入克隆版本的名称" />
          </Form.Item>
          <Form.Item name="category" label="新场景分类">
            <Select options={CATEGORY_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 版本历史 Modal */}
      <Modal
        title="版本历史"
        open={versionModalVisible}
        onCancel={() => setVersionModalVisible(false)}
        footer={null}
        width={700}
      >
        <List
          loading={versionsLoading}
          dataSource={versions}
          renderItem={(version) => (
            <List.Item
              key={version.id}
              actions={[
                <Button
                  type="link"
                  size="small"
                  onClick={() => handleRestoreVersion(version.version)}
                  disabled={version.version === versions[0]?.version}
                >
                  恢复此版本
                </Button>
              ]}
            >
              <List.Item.Meta
                title={`版本 ${version.version}`}
                description={
                  <Space direction="vertical" size={0}>
                    <Text type="secondary">{version.change_summary || '无变更说明'}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {new Date(version.created_at).toLocaleString()}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      </Modal>

      {/* 详情 Modal */}
      <Modal
        title="角色模板详情"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            关闭
          </Button>,
          currentTemplate && (
            <Button key="edit" type="primary" onClick={() => {
              setDetailModalVisible(false);
              handleEdit(currentTemplate);
            }}>
              编辑
            </Button>
          ),
        ]}
        width={800}
      >
        {currentTemplate && (
          <Tabs defaultActiveKey="basic">
            <TabPane tab="基本信息" key="basic">
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label="ID">{currentTemplate.id}</Descriptions.Item>
                <Descriptions.Item label="版本">v{currentTemplate.version}</Descriptions.Item>
                <Descriptions.Item label="角色名称" span={2}>
                  <Space>
                    {currentTemplate.name}
                    {currentTemplate.is_default && <Tag color="green">默认</Tag>}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="场景分类">
                  <Tag color={CATEGORY_OPTIONS.find(c => c.value === currentTemplate.category)?.color}>
                    {currentTemplate.category}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="立场">
                  <Tag color={STANCE_OPTIONS.find(s => s.value === currentTemplate.stance)?.color}>
                    {currentTemplate.stance}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Badge status={currentTemplate.is_active ? 'success' : 'default'} text={currentTemplate.is_active ? '启用' : '停用'} />
                </Descriptions.Item>
                <Descriptions.Item label="启用时间">{currentTemplate.created_at}</Descriptions.Item>
                <Descriptions.Item label="角色简述" span={2}>{currentTemplate.description || '-'}</Descriptions.Item>
                <Descriptions.Item label="技能标签" span={2}>
                  <Space wrap>
                    {(currentTemplate.skill_tags || []).map(tag => (
                      <Tag key={tag} icon={<TagsOutlined />}>{tag}</Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="价值主张" span={2}>{currentTemplate.value_proposition || '-'}</Descriptions.Item>
              </Descriptions>
            </TabPane>

            <TabPane tab="详细背景" key="background">
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="性格特征">
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{currentTemplate.personality || '-'}</pre>
                </Descriptions.Item>
                <Descriptions.Item label="背景故事/人设">
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{currentTemplate.background || '-'}</pre>
                </Descriptions.Item>
              </Descriptions>
            </TabPane>

            <TabPane tab="灵魂配置" key="soul">
              <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: 16, borderRadius: 4 }}>
                {currentTemplate.soul_config || '暂无灵魂配置'}
              </pre>
            </TabPane>

            <TabPane tab="使用统计" key="stats">
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic title="使用次数" value={currentTemplate.usage_count} prefix={<RiseOutlined />} />
                </Col>
                <Col span={8}>
                  <Statistic title="平均评分" value={currentTemplate.rating} suffix={`/ 5 (${currentTemplate.rating_count}人评)`} />
                </Col>
                <Col span={8}>
                  <Statistic title="最后使用" value={currentTemplate.last_used_at ? new Date(currentTemplate.last_used_at).toLocaleDateString() : '从未使用'} />
                </Col>
              </Row>
            </TabPane>

            <TabPane tab="版权信息" key="copyright">
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="创作者">{currentTemplate.author || '-'}</Descriptions.Item>
                <Descriptions.Item label="许可证">{currentTemplate.license_type || '-'}</Descriptions.Item>
                <Descriptions.Item label="版权声明">
                  <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{currentTemplate.copyright_notice || '-'}</pre>
                </Descriptions.Item>
              </Descriptions>
            </TabPane>
          </Tabs>
        )}
      </Modal>

      {/* 导入 Modal */}
      <Modal
        title="批量导入角色模板"
        open={importModalVisible}
        onCancel={() => {
          setImportModalVisible(false);
          setImportFileList([]);
        }}
        footer={null}
      >
        <Alert
          message="支持格式"
          description={
            <div>
              <Text>• <b>JSON</b>: 包含 templates 数组的对象，或直接为模板对象数组</Text>
              <br />
              <Text>• <b>CSV</b>: 第一行为表头，支持字段：name, stance, category, description, personality, background, skill_tags, value_proposition, is_active</Text>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        <Form layout="vertical">
          <Form.Item label="导入模式">
            <Select
              value={importMode}
              onChange={setImportMode}
              options={[
                { value: 'create', label: '仅创建新模板（跳过已存在）' },
                { value: 'merge', label: '合并（保留已存在，更新相同字段）' },
                { value: 'update', label: '覆盖更新（覆盖已存在）' },
              ]}
            />
          </Form.Item>
          <Form.Item label="选择文件">
            <Upload.Dragger
              fileList={importFileList}
              beforeUpload={() => false}
              onChange={({ fileList }) => setImportFileList(fileList)}
              accept=".json,.csv"
              maxCount={1}
            >
              <p className="ant-upload-drag-icon">
                <CloudUploadOutlined />
              </p>
              <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
              <p className="ant-upload-hint">支持 JSON 和 CSV 格式</p>
            </Upload.Dragger>
          </Form.Item>
          <Button
            type="primary"
            block
            loading={importLoading}
            disabled={importFileList.length === 0}
            onClick={() => {
              const file = importFileList[0]?.originFileObj;
              if (file) {
                handleImport({ file } as any);
              }
            }}
          >
            开始导入
          </Button>
        </Form>
      </Modal>
    </div>
  );
};

// 导入 List 组件
const List = ({ dataSource, renderItem, loading, children }: any) => (
  <div style={{ maxHeight: 400, overflow: 'auto' }}>
    {loading ? (
      <div style={{ textAlign: 'center', padding: 24 }}>加载中...</div>
    ) : dataSource?.length === 0 ? (
      <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>暂无数据</div>
    ) : (
      dataSource?.map((item: any, index: number) => renderItem(item, index))
    )}
    {children}
  </div>
);

export default RoleTemplateManagement;
