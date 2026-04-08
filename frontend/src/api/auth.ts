// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { requestJson } from './fetchClient';

export interface UserInfo {
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

export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

/**
 * 用户登录。
 */
export const loginByPassword = (username: string, password: string) =>
  requestJson<AuthTokenResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    skipAuth: true,
  });

/**
 * 使用刷新令牌续期。
 */
export const refreshAccessToken = (refreshToken: string) =>
  requestJson<AuthTokenResponse>('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
    skipAuth: true,
  });

/**
 * 获取当前用户信息。
 */
export const getCurrentUser = () =>
  requestJson<UserInfo>('/auth/me');
