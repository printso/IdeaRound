import React, { useState } from 'react';
import { Layout, Menu, Space, Button, Select, Input, Avatar, Dropdown, Typography, Modal, Form, message } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { UserOutlined, LogoutOutlined, KeyOutlined, MenuOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext';
import { changePassword } from '../api/users';

const { Header } = Layout;

interface AppHeaderProps {
  models?: any[];
  loadingModels?: boolean;
  selectedModelId?: number | undefined;
  onModelChange?: (value: number | undefined) => void;
  systemPrompt?: string;
  onSystemPromptChange?: (value: string) => void;
  workspaceStep?: string;
  onWorkspaceStepChange?: (key: string) => void;
  canGoRoles?: boolean;
  roomReady?: boolean;
  isMobile?: boolean;
  onMenuToggle?: () => void;
}

const AppHeader: React.FC<AppHeaderProps> = ({
  models = [],
  loadingModels = false,
  selectedModelId,
  onModelChange,
  systemPrompt,
  onSystemPromptChange,
  workspaceStep,
  onWorkspaceStepChange,
  canGoRoles = false,
  isMobile = false,
  onMenuToggle,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAdmin } = useAuth();
  const isAdminPage = location.pathname.startsWith('/admin');

  const modelSelectOptions = models.map((m) => ({
    value: m.id,
    label: m.name,
  }));

  const workspaceMenuItems = [
    { key: 'roundtable', label: '🗣️ 需求识别' },
    { key: 'roles', label: '👥 角色矩阵', disabled: !canGoRoles },
    { key: 'roundtable_view', label: '💬 圆桌空间', disabled: !canGoRoles },
    { key: 'consensus_summary', label: '📋 共识摘要', disabled: !canGoRoles },
    { key: 'canvas_view', label: '🎨 共识画布', disabled: !canGoRoles },
  ];

  return (
    <Header
      className="header"
      style={{
        display: 'flex',
        alignItems: 'center',
        background: '#001529',
        padding: isMobile ? '0 8px' : undefined,
        gap: isMobile ? 4 : 0,
      }}
    >
      {isMobile && onMenuToggle && (
        <Button
          type="text"
          icon={<MenuOutlined />}
          onClick={onMenuToggle}
          style={{ color: 'white', fontSize: 18, flexShrink: 0 }}
        />
      )}
      <img
        src="/logo.png"
        alt="IdeaRound Logo"
        style={{ height: '32px', marginRight: isMobile ? '4px' : '12px', borderRadius: '4px', cursor: 'pointer', flexShrink: 0 }}
        onClick={() => navigate('/')}
      />
      {!isMobile && (
        <div
          className="logo"
          style={{
            color: 'white',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            marginRight: '20px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          onClick={() => navigate('/')}
        >
          圆桌创意 · {isAdminPage ? '后台管理' : '工作台'}
        </div>
      )}

      {isAdminPage ? (
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={['admin']}
          style={{ flex: 1, background: 'transparent', minWidth: 0 }}
          items={[{ key: 'admin', label: '配置管理' }]}
          onClick={() => navigate('/admin')}
        />
      ) : (
        onWorkspaceStepChange && workspaceStep && (
          <Menu
            theme="dark"
            mode="horizontal"
            selectedKeys={[workspaceStep]}
            style={{ flex: 1, background: 'transparent', minWidth: 0 }}
            items={isMobile
              ? workspaceMenuItems.map((item) => ({ ...item, label: (item.label as string).replace(/^.\s*/, '') }))
              : workspaceMenuItems
            }
            onClick={(e) => onWorkspaceStepChange(e.key)}
          />
        )
      )}

      <Space size={isMobile ? 4 : 'middle'} style={{ flexShrink: 0 }}>
        {!isMobile && onSystemPromptChange && (
          <Input
            value={systemPrompt}
            onChange={(e) => onSystemPromptChange(e.target.value)}
            placeholder="系统提示词"
            style={{ width: 240 }}
            variant="filled"
          />
        )}

        {onModelChange && (
          <Select
            loading={loadingModels}
            value={selectedModelId}
            placeholder={isMobile ? '模型' : '选择模型'}
            style={{ width: isMobile ? 100 : 200 }}
            onChange={onModelChange}
            options={modelSelectOptions}
            dropdownStyle={{ background: '#fff' }}
          />
        )}

        {!isMobile && isAdmin && (
          <Button
            type="link"
            href={isAdminPage ? '/' : '/admin'}
            style={{ color: 'rgba(255,255,255,0.85)' }}
          >
            {isAdminPage ? '返回工作台' : '后台管理'}
          </Button>
        )}

        <UserMenu isMobile={isMobile} />
      </Space>
    </Header>
  );
};

const UserMenu: React.FC<{ isMobile?: boolean }> = ({ isMobile = false }) => {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [passwordForm] = Form.useForm();

  if (!user) {
    return (
      <Button type="primary" onClick={() => navigate('/login')}>
        登录
      </Button>
    );
  }

  const handleChangePassword = async (values: any) => {
    try {
      await changePassword(values.old_password, values.new_password);
      message.success('密码修改成功');
      setIsPasswordModalVisible(false);
      passwordForm.resetFields();
    } catch (error: any) {
      message.error(error.response?.data?.detail || '密码修改失败');
    }
  };

  const menuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: `当前用户：${user.username}`,
      disabled: true,
    },
    {
      key: 'changePassword',
      icon: <KeyOutlined />,
      label: '修改密码',
      onClick: () => setIsPasswordModalVisible(true),
    },
    { type: 'divider' as const },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout,
    },
  ];

  if (isAdmin) {
    menuItems.unshift({
      key: 'admin',
      icon: <UserOutlined />,
      label: `管理员：${user.username}`,
      disabled: true,
    });
  }

  return (
    <>
      <Dropdown menu={{ items: menuItems }} placement="bottomRight" arrow>
        <Space style={{ cursor: 'pointer', color: 'white' }}>
          <Avatar
            size="small"
            style={{ backgroundColor: '#87d068' }}
            icon={<UserOutlined />}
          />
          {!isMobile && (
            <Typography.Text style={{ color: 'rgba(255,255,255,0.85)' }}>
              {user.nickname || user.username}
            </Typography.Text>
          )}
        </Space>
      </Dropdown>

      <Modal
        title="修改密码"
        open={isPasswordModalVisible}
        onOk={() => passwordForm.submit()}
        onCancel={() => {
          setIsPasswordModalVisible(false);
          passwordForm.resetFields();
        }}
      >
        <Form form={passwordForm} layout="vertical" onFinish={handleChangePassword}>
          <Form.Item
            name="old_password"
            label="当前密码"
            rules={[{ required: true, message: '请输入当前密码' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirm_password"
            label="确认新密码"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
};

export default AppHeader;
