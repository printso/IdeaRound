import React from 'react';
import { Layout, Menu, Breadcrumb } from 'antd';
import { UserOutlined, LaptopOutlined } from '@ant-design/icons';
import { Outlet, Link } from 'react-router-dom';

const { Header, Content, Sider } = Layout;

const AdminLayout: React.FC = () => {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header className="header" style={{ display: 'flex', alignItems: 'center' }}>
        <div className="logo" style={{ color: 'white', fontSize: '1.2rem', fontWeight: 'bold', marginRight: '20px' }}>
          圆桌创意 · 管理中枢
        </div>
        <Menu theme="dark" mode="horizontal" defaultSelectedKeys={['2']} items={[
          { key: '1', label: <Link to="/">前台</Link> },
          { key: '2', label: <Link to="/admin">后台</Link> },
        ]} />
      </Header>
      <Layout>
        <Sider width={200} style={{ background: '#fff' }}>
          <Menu
            mode="inline"
            defaultSelectedKeys={['1']}
            defaultOpenKeys={['sub1']}
            style={{ height: '100%', borderRight: 0 }}
            items={[
              {
                key: 'sub1',
                icon: <UserOutlined />,
                label: '灵魂矩阵配置',
                children: [
                  { key: '1', label: <Link to="/admin/models">模型中枢</Link> },
                  { key: '2', label: '角色矩阵' },
                  { key: '3', label: '提示词中枢' },
                ],
              },
              {
                key: 'sub2',
                icon: <LaptopOutlined />,
                label: '运行态',
                children: [
                  { key: '5', label: '圆桌空间' },
                  { key: '6', label: '全链路日志' },
                ],
              },
            ]}
          />
        </Sider>
        <Layout style={{ padding: '0 24px 24px' }}>
          <Breadcrumb style={{ margin: '16px 0' }} items={[
             { title: '管理后台' },
             { title: '模型中枢' },
          ]} />
          <Content
            className="site-layout-background"
            style={{
              padding: 24,
              margin: 0,
              minHeight: 280,
              background: '#fff',
            }}
          >
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;
