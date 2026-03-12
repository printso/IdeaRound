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

export interface StreamHandlers {
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError: (message: string) => void;
}

export const streamChatByLLMConfig = async (
  id: number,
  payload: { message: string; system_prompt?: string },
  handlers: StreamHandlers,
  options?: { signal?: AbortSignal },
) => {
  const response = await fetch(`/api/v1/llm/${id}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok || !response.body) {
    handlers.onError(`请求失败：${response.status}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      handlers.onDone();
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';

    for (const event of events) {
      const dataLine = event
        .split('\n')
        .find((line) => line.startsWith('data:'));
      if (!dataLine) {
        continue;
      }
      const payloadText = dataLine.replace(/^data:\s*/, '');
      if (payloadText === '[DONE]') {
        handlers.onDone();
        return;
      }
      try {
        const parsed = JSON.parse(payloadText) as { type: string; content?: string; message?: string };
        if (parsed.type === 'delta' && parsed.content) {
          handlers.onDelta(parsed.content);
        }
        if (parsed.type === 'error') {
          handlers.onError(parsed.message ?? '流式请求异常');
        }
      } catch {
        handlers.onError('流式数据解析失败');
      }
    }
  }
};
