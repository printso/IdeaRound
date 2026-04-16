// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import api from './index';
import { buildApiUrl, buildRequestHeaders, requestJson } from './fetchClient';

export interface LLMConfig {
  id: number;
  name: string;
  provider: string;
  api_key?: string;
  api_base?: string;
  model_name: string;
  is_active: boolean;
  enable_thinking: boolean;
  temperature: number;
  max_tokens?: number;
  top_p?: number;
  context_length?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  auxiliary_model_id?: number;
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
  enable_thinking?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  context_length?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  auxiliary_model_id?: number;
}

export interface LLMConfigUpdate {
  name?: string;
  provider?: string;
  api_key?: string;
  api_base?: string;
  model_name?: string;
  is_active?: boolean;
  enable_thinking?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  context_length?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  auxiliary_model_id?: number;
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
  enable_thinking?: boolean;
  max_tokens?: number;
}

export const streamChatByLLMConfig = async (
  configId: number,
  request: LLMChatStreamRequest,
  callbacks: {
    onDelta: (content: string) => void;
    onThinking?: (content: string) => void;
    onDone: () => void;
    onError: (error: string) => void;
  },
  options?: { signal?: AbortSignal }
) => {
  try {
    const streamBody = JSON.stringify(request);
    const response = await fetch(buildApiUrl(`/llm/${configId}/chat/stream`), {
      method: 'POST',
      headers: (() => {
        const headers = buildRequestHeaders({
          body: streamBody,
        });
        headers.set('Accept', 'text/event-stream');
        return headers;
      })(),
      body: streamBody,
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
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';

      for (const eventChunk of events) {
        const lines = eventChunk.split(/\r?\n/);
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
          }
        }
        if (dataLines.length === 0) {
          continue;
        }
        const dataStr = dataLines.join('\n').trim();
        if (!dataStr) {
          continue;
        }
        if (dataStr === '[DONE]') {
          callbacks.onDone();
          return;
        }
        try {
          const data = JSON.parse(dataStr) as { type?: string; content?: string; message?: string };
          if (data.type === 'delta') {
            callbacks.onDelta(data.content || '');
          } else if (data.type === 'thinking') {
            callbacks.onThinking?.(data.content || '');
          } else if (data.type === 'error') {
            callbacks.onError(data.message || '流式响应异常');
            return;
          }
        } catch (e) {
          console.error('SSE JSON parse error:', e, dataStr);
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
  const data = await requestJson<{ content: string }>(`/llm/${configId}/chat/sync`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
  return data.content;
};

export const judgeDiscussionProgress = async (
  configId: number,
  request: LLMChatStreamRequest
): Promise<{ score: number; reason: string; reached: boolean }> => {
  return requestJson<{ score: number; reason: string; reached: boolean }>(`/llm/${configId}/chat/judge`, {
    method: 'POST',
    body: JSON.stringify(request),
  });
};
