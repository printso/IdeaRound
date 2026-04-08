// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { clearAuthSession, getAccessToken } from '../auth/session';

const API_BASE_URL = '/api/v1';

type RequestJsonOptions = RequestInit & {
  skipAuth?: boolean;
};

const isFormData = (body: BodyInit | null | undefined): body is FormData =>
  typeof FormData !== 'undefined' && body instanceof FormData;

const readErrorMessage = async (response: Response): Promise<string> => {
  const fallback = `请求失败: ${response.status}`;
  try {
    const payload = (await response.json()) as { detail?: string; message?: string };
    return payload.detail || payload.message || fallback;
  } catch {
    return fallback;
  }
};

/**
 * 统一构建 API 地址，集中管理前缀。
 * 时间复杂度 O(1)。
 */
export const buildApiUrl = (path: string): string => {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  if (path.startsWith('/api/')) {
    return path;
  }
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

/**
 * 为请求补齐认证头和默认头。
 * 时间复杂度 O(1)。
 */
export const buildRequestHeaders = (
  init?: RequestInit,
  options?: { skipAuth?: boolean },
): Headers => {
  const headers = new Headers(init?.headers);
  const token = options?.skipAuth ? null : getAccessToken();
  if (!headers.has('Content-Type') && init?.body && !isFormData(init.body)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
};

/**
 * 统一发送 JSON 请求，并在 401 时清理会话。
 * 时间复杂度 O(1)，网络耗时取决于远端接口。
 */
export const requestJson = async <T>(path: string, init?: RequestJsonOptions): Promise<T> => {
  const response = await fetch(buildApiUrl(path), {
    ...init,
    headers: buildRequestHeaders(init, { skipAuth: init?.skipAuth }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      clearAuthSession();
    }
    throw new Error(await readErrorMessage(response));
  }

  return response.json() as Promise<T>;
};
