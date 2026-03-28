import api from './index';

export interface LLMConfig {
  id: number;
  name: string;
  provider: string;
  api_key?: string;
  api_base?: string;
  model_name: string;
  is_active: boolean;
  temperature: number;
  created_at: string;
  updated_at?: string;
}

export interface LLMConfigCreate {
  name: string;
  provider: string;
  api_key?: string;
  api_base?: string;
  model_name: string;
  is_active?: boolean;
  temperature?: number;
}

export interface LLMConfigUpdate {
  name?: string;
  provider?: string;
  api_key?: string;
  api_base?: string;
  model_name?: string;
  is_active?: boolean;
  temperature?: number;
}

export const getLLMConfigs = async () => {
  const response = await api.get<LLMConfig[]>('/llm/');
  return response.data;
};

export const getLLMConfig = async (id: number) => {
  const response = await api.get<LLMConfig>(`/llm/${id}`);
  return response.data;
};

export const createLLMConfig = async (data: LLMConfigCreate) => {
  const response = await api.post<LLMConfig>('/llm/', data);
  return response.data;
};

export const updateLLMConfig = async (id: number, data: LLMConfigUpdate) => {
  const response = await api.put<LLMConfig>(`/llm/${id}`, data);
  return response.data;
};

export const deleteLLMConfig = async (id: number) => {
  const response = await api.delete(`/llm/${id}`);
  return response.data;
};

export interface LLMChatStreamRequest {
  message: string;
  system_prompt?: string;
}

export const streamChatByLLMConfig = async (
  configId: number,
  request: LLMChatStreamRequest,
  callbacks: {
    onDelta: (content: string) => void;
    onDone: () => void;
    onError: (error: string) => void;
  },
  options?: { signal?: AbortSignal }
) => {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`/api/v1/llm/${configId}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
      signal: options?.signal,
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || '请求失败');
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No reader available');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') {
            callbacks.onDone();
            return;
          }
          try {
            const data = JSON.parse(dataStr);
            if (data.type === 'delta') {
              callbacks.onDelta(data.content);
            } else if (data.type === 'error') {
              callbacks.onError(data.message);
              return;
            }
          } catch (e) {
            console.error('JSON parse error:', e, dataStr);
          }
        }
      }
    }
    callbacks.onDone();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('Stream aborted');
      callbacks.onDone();
    } else {
      callbacks.onError(error.message || '网络错误');
    }
  }
};

export const syncChatByLLMConfig = async (
  configId: number,
  request: LLMChatStreamRequest
): Promise<string> => {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api/v1/llm/${configId}/chat/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.detail || '请求失败');
  }

  const data = await response.json();
  return data.content;
};

export const judgeDiscussionProgress = async (
  configId: number,
  request: LLMChatStreamRequest
): Promise<{ score: number; reason: string; reached: boolean }> => {
  const token = localStorage.getItem('token');
  const response = await fetch(`/api/v1/llm/${configId}/chat/judge`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errData = await response.json();
    throw new Error(errData.detail || '裁判请求失败');
  }

  return await response.json();
};
