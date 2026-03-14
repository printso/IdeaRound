import React, { useState } from 'react';
import { Layout, Menu, Typography } from 'antd';
import {
  SettingOutlined,
  RobotOutlined,
  ExperimentOutlined,
  MessageOutlined,
  DashboardOutlined,
  UserOutlined,
} from '@ant-design/icons';
import AppHeader from '../../components/AppHeader';
import ModelManagement from './ModelManagement';
import PromptManagement from './PromptManagement';
import StyleConfigManagement from './StyleConfigManagement';
import RoleTemplateManagement from './RoleTemplateManagement';
import RoundtableConfigManagement from './RoundtableConfigManagement';
import UserManagement from './UserManagement';

const { Sider, Content } = Layout;
const { Title } = Typography;

type MenuKey = 'models' | 'prompts' | 'styles' | 'roles' | 'roundtable' | 'users';

const AdminDashboard: React.FC = () => {
  const [selectedMenu, setSelectedMenu] = useState<MenuKey>('models');

  const menuItems = [
    {
      key: 'models',
      icon: <DashboardOutlined />,
      label: '模型配置管理',
    },
    {
      key: 'prompts',
      icon: <MessageOutlined />,
      label: '系统提示词管理',
    },
    {
      key: 'styles',
      icon: <ExperimentOutlined />,
      label: '风格配置管理',
    },
    {
      key: 'roles',
      icon: <RobotOutlined />,
      label: '角色模板管理',
    },
    {
      key: 'roundtable',
      icon: <SettingOutlined />,
      label: '圆桌配置管理',
    },
    {
      key: 'users',
      icon: <UserOutlined />,
      label: '用户管理',
    },
  ];

  const renderContent = () => {
    switch (selectedMenu) {
      case 'models':
        return <ModelManagement />;
      case 'prompts':
        return <PromptManagement />;
      case 'styles':
        return <StyleConfigManagement />;
      case 'roles':
        return <RoleTemplateManagement />;
      case 'roundtable':
        return <RoundtableConfigManagement />;
      case 'users':
        return <UserManagement />;
      default:
        return <ModelManagement />;
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppHeader />
      <Layout>
        <Sider width={250} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
            <Title level={4} style={{ margin: 0 }}>配置管理</Title>
          </div>
          <Menu
            mode="inline"
            selectedKeys={[selectedMenu]}
            items={menuItems}
            onClick={({ key }) => setSelectedMenu(key as MenuKey)}
            style={{ borderRight: 0 }}
          />
        </Sider>
        <Content style={{ padding: 24, background: '#fff' }}>
          {renderContent()}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AdminDashboard;
