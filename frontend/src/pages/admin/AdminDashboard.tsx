import React, { useState } from 'react';
import { Layout, Menu, Typography } from 'antd';
import {
  SettingOutlined,
  ApiOutlined,
  FileTextOutlined,
  BgColorsOutlined,
  TeamOutlined,
  UserOutlined,
  AppstoreOutlined,
  DashboardOutlined,
} from '@ant-design/icons';
import AppHeader from '../../components/AppHeader';
import ModelManagement from './ModelManagement';
import PromptManagement from './PromptManagement';
import StyleConfigManagement from './StyleConfigManagement';
import RoleTemplateManagement from './RoleTemplateManagement';
import RoundtableConfigManagement from './RoundtableConfigManagement';
import UserManagement from './UserManagement';
import ScenarioTemplateManagement from './ScenarioTemplateManagement';
import RuntimeMonitor from './RuntimeMonitor';
import SearchEngineManagement from './SearchEngineManagement';
import { useAuth } from '../../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const { Sider, Content } = Layout;
const { Title } = Typography;

type MenuKey = 'models' | 'scenario' | 'prompts' | 'styles' | 'roles' | 'roundtable' | 'users' | 'runtime' | 'search_engines';

const AdminDashboard: React.FC = () => {
  const [selectedMenu, setSelectedMenu] = useState<MenuKey>('models');
  const { user } = useAuth();
  const navigate = useNavigate();

  // 如果不是管理员，重定向到首页
  React.useEffect(() => {
    if (user && !user.is_superuser) {
      navigate('/');
    }
  }, [user, navigate]);

  const menuItems = [
    {
      key: 'models',
      icon: <ApiOutlined />,
      label: '模型管理',
    },
    {
      key: 'search_engines',
      icon: <ApiOutlined />,
      label: '搜索引擎',
    },
    {
      key: 'scenario',
      icon: <AppstoreOutlined />,
      label: '场景模板',
    },
    {
      key: 'roles',
      icon: <TeamOutlined />,
      label: '角色模板',
    },
    {
      key: 'prompts',
      icon: <FileTextOutlined />,
      label: '提示词管理',
    },
    {
      key: 'styles',
      icon: <BgColorsOutlined />,
      label: '风格配置',
    },
    {
      key: 'roundtable',
      icon: <SettingOutlined />,
      label: '圆桌配置',
    },
    {
      key: 'users',
      icon: <UserOutlined />,
      label: '用户管理',
    },
    {
      key: 'runtime',
      icon: <DashboardOutlined />,
      label: '运行监控',
    },
  ];

  const renderContent = () => {
    switch (selectedMenu) {
      case 'models':
        return <ModelManagement />;
      case 'search_engines':
        return <SearchEngineManagement />;
      case 'scenario':
        return <ScenarioTemplateManagement />;
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
      case 'runtime':
        return <RuntimeMonitor />;
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
