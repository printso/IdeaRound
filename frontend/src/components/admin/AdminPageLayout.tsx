import React from 'react';
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
import { useNavigate } from 'react-router-dom';
import AppHeader from '../AppHeader';
import { useAuth } from '../../contexts/AuthContext';

const { Sider, Content } = Layout;
const { Title } = Typography;

export type AdminMenuKey = 'models' | 'scenario' | 'prompts' | 'styles' | 'roles' | 'roundtable' | 'users' | 'runtime' | 'search_engines' | 'chat';

interface AdminPageLayoutProps {
  selectedMenu: AdminMenuKey;
  onMenuClick?: (key: AdminMenuKey) => void;
  children: React.ReactNode;
  hideSidebar?: boolean;
}

export const ADMIN_MENU_ITEMS = [
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

const AdminPageLayout: React.FC<AdminPageLayoutProps> = ({
  selectedMenu,
  onMenuClick,
  children,
  hideSidebar = false,
}) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // 如果不是管理员，重定向到首页
  React.useEffect(() => {
    if (user && !user.is_superuser) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleMenuClick = ({ key }: { key: string }) => {
    if (onMenuClick) {
      onMenuClick(key as AdminMenuKey);
    } else {
      if (key === 'chat') {
        navigate('/admin/chat');
      } else {
        navigate('/admin', { state: { selectedMenu: key } });
      }
    }
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <AppHeader />
      <Layout>
        {!hideSidebar && (
          <Sider width={250} theme="light" style={{ borderRight: '1px solid #f0f0f0' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid #f0f0f0' }}>
              <Title level={4} style={{ margin: 0 }}>配置管理</Title>
            </div>
            <Menu
              mode="inline"
              selectedKeys={[selectedMenu]}
              items={ADMIN_MENU_ITEMS}
              onClick={handleMenuClick}
              style={{ borderRight: 0 }}
            />
          </Sider>
        )}
        <Content style={{ padding: hideSidebar ? 0 : 24, background: '#fff' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AdminPageLayout;
