import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Spin } from 'antd';

interface AuthGuardProps {
  children: React.ReactNode;
  requireAuth?: boolean;  // 是否需要认证（默认 true）
  requireAdmin?: boolean; // 是否需要管理员权限（默认 false）
}

const AuthGuard: React.FC<AuthGuardProps> = ({
  children,
  requireAuth = true,
  requireAdmin = false,
}) => {
  const { isAuthenticated, isLoading, isAdmin } = useAuth();
  const location = useLocation();

  // 加载中显示 loading
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spin size="large" description="加载中..." />
      </div>
    );
  }

  // 如果不需要认证，直接渲染
  if (!requireAuth) {
    return <>{children}</>;
  }

  // 需要认证但未登录，跳转到登录页
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 需要管理员权限但不是管理员
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // 非管理员访问 /admin 路径时重定向到首页
  if (!isAdmin && location.pathname.startsWith('/admin')) {
    return <Navigate to="/" replace />;
  }

  // 认证通过，渲染子组件
  return <>{children}</>;
};

export default AuthGuard;
