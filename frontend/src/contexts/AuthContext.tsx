import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { message } from 'antd';

interface UserInfo {
  id: number;
  username: string;
  email: string;
  nickname?: string;
  avatar?: string;
  is_active: boolean;
  is_superuser: boolean;
  roles?: Array<{
    id: number;
    name: string;
    description?: string;
  }>;
}

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

// API 基础 URL
const API_BASE_URL = '/api/v1';

// 存储 key
const TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [refreshToken, setRefreshToken] = useState<string | null>(
    localStorage.getItem(REFRESH_TOKEN_KEY)
  );
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
      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
        setIsLoading(false);
        return true;
      } else if (response.status === 401) {
        // Token 可能过期，尝试刷新
        const refreshed = await refreshAccessToken();
        if (refreshed) {
          // 刷新成功后使用新 token 重新获取用户信息
          const newToken = localStorage.getItem(TOKEN_KEY);
          return await fetchUserInfo(newToken);
        }
      }
      // 其他错误状态
      setIsLoading(false);
      return false;
    } catch (error) {
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
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
      return false;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        setToken(data.access_token);
        setRefreshToken(data.refresh_token);
        localStorage.setItem(TOKEN_KEY, data.access_token);
        localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
        return true;
      } else {
        // 刷新失败，清除所有 token
        logout();
        return false;
      }
    } catch (error) {
      console.error('刷新令牌失败:', error);
      logout();
      return false;
    }
  };

  // 登录
  const login = async (username: string, password: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || '登录失败');
      }

      const data = await response.json();
      
      // 先保存到 localStorage
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token);
      
      // 更新 state
      setToken(data.access_token);
      setRefreshToken(data.refresh_token);
      
      // 使用新 token 获取用户信息
      await fetchUserInfo(data.access_token);
      
      message.success('登录成功');
    } catch (error: any) {
      message.error(error.message || '登录失败，请检查用户名和密码');
      throw error;
    }
  };

  // 登出
  const logout = () => {
    setToken(null);
    setRefreshToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
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
