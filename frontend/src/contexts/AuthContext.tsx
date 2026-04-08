import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { message } from 'antd';
import { getCurrentUser, loginByPassword, refreshAccessToken as refreshAccessTokenApi, type UserInfo } from '../api/auth';
import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  persistAuthSession,
} from '../auth/session';

interface AuthContextType {
  user: UserInfo | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  hasPermission: (permission: string) => boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setToken] = useState<string | null>(getAccessToken());
  const [refreshToken, setRefreshToken] = useState<string | null>(getRefreshToken());
  const [isLoading, setIsLoading] = useState(true);

  // 获取当前用户信息 - 接受可选的 token 参数
  const fetchUserInfo = async (authToken?: string | null) => {
    // 使用传入的 token 或当前 state 中的 token
    const currentToken = authToken ?? token;
    
    if (!currentToken) {
      setIsLoading(false);
      return false;
    }

    try {
      const userData = await getCurrentUser();
      setUser(userData);
      setIsLoading(false);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('401') || errorMessage.includes('无效的认证令牌') || errorMessage.includes('未提供认证令牌')) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          return fetchUserInfo(getAccessToken());
        }
      }
      console.error('获取用户信息失败:', error);
      setUser(null);
      setIsLoading(false);
      return false;
    }
  };

  // 刷新访问令牌
  const refreshAccessToken = async (): Promise<boolean> => {
    if (!refreshToken) {
      setToken(null);
      setRefreshToken(null);
      clearAuthSession();
      return false;
    }

    try {
      const data = await refreshAccessTokenApi(refreshToken);
      persistAuthSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      setToken(data.access_token);
      setRefreshToken(data.refresh_token);
      return true;
    } catch (error) {
      console.error('刷新令牌失败:', error);
      logout();
      return false;
    }
  };

  // 登录
  const login = async (username: string, password: string) => {
    try {
      const data = await loginByPassword(username, password);
      
      persistAuthSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      });
      
      // 更新 state
      setToken(data.access_token);
      setRefreshToken(data.refresh_token);
      
      const userLoaded = await fetchUserInfo(data.access_token);
      if (!userLoaded) {
        throw new Error('登录成功，但获取用户信息失败');
      }
      
      message.success('登录成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '登录失败，请检查用户名和密码';
      message.error(errorMessage);
      throw error;
    }
  };

  // 登出
  const logout = () => {
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    clearAuthSession();
    message.success('已退出登录');
  };

  // 检查权限
  const hasPermission = (_permission: string): boolean => {
    if (!user) return false;
    
    // 管理员拥有所有权限
    if (user.is_superuser) return true;
    
    // TODO: 实现基于角色的权限检查
    // 目前简化处理，只要登录用户就有基本权限
    return true;
  };

  // 是否为管理员
  const isAdmin = user?.is_superuser ?? false;

  useEffect(() => {
    fetchUserInfo();
  }, [token]);

  const value: AuthContextType = {
    user,
    token,
    refreshToken,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    hasPermission,
    isAdmin,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用');
  }
  return context;
};
