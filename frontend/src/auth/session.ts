// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
export const ACCESS_TOKEN_KEY = 'access_token';
export const REFRESH_TOKEN_KEY = 'refresh_token';

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
};

/**
 * 获取当前访问令牌。
 */
export const getAccessToken = (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY);

/**
 * 获取当前刷新令牌。
 */
export const getRefreshToken = (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY);

/**
 * 持久化认证会话。
 */
export const persistAuthSession = (session: AuthSession): void => {
  localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
};

/**
 * 清理认证会话。
 */
export const clearAuthSession = (): void => {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};
