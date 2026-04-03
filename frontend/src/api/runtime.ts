type RuntimePayload = Record<string, unknown>;

export interface RuntimeTaskRequest {
  room_id: string;
  model_id: number;
  transcript: string;
  expected_result?: string;
  current_round?: number;
  intent_card?: Record<string, string>;
  trigger?: string;
}

export interface RuntimeRoundtableRole {
  id: string;
  name: string;
  stance: string;
  desc: string;
  selected: boolean;
  soul_config?: string;
}

export interface RuntimeRoundtableMessage {
  id: string;
  speaker_id: string;
  speaker_name: string;
  speaker_type: 'user' | 'agent';
  content: string;
  created_at: string;
  streaming?: boolean;
}

export interface RuntimeRoundtableRunRequest {
  room_id: string;
  model_id: number;
  user_message: string;
  user_message_id?: string;
  roundtable_stage: 'brief' | 'final';
  auto_brainstorm: boolean;
  auto_continue: boolean;
  max_dialogue_rounds: number;
  auto_round_count: number;
  intent_card?: Record<string, string>;
  expected_result?: string;
  system_prompt?: string;
  prompt_templates?: Record<string, string>;
  roles: RuntimeRoundtableRole[];
  prior_messages: RuntimeRoundtableMessage[];
  trigger?: string;
}

export interface RuntimeTaskResponse {
  task_id: string;
  task_type: string;
  room_id?: string;
  status: string;
  model_id?: number;
  result_payload?: RuntimePayload | null;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at: string;
}

export interface RuntimeSnapshot {
  room_id: string;
  latest_progress?: RuntimePayload | null;
  latest_board?: RuntimePayload | null;
  pending_tasks: number;
}

export interface RuntimeEvent {
  id: number;
  room_id?: string | null;
  task_id?: string | null;
  event_type: string;
  success: boolean;
  duration_ms?: number | null;
  event_payload?: RuntimePayload | null;
  created_at: string;
}

export interface RuntimeMetricsSummary {
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  pending_tasks: number;
  avg_task_duration_ms: number;
  total_events: number;
  host_events: number;
  material_events: number;
  latest_events: RuntimeEvent[];
}

export interface RuntimeTaskCancelResponse {
  task_id: string;
  status: string;
}

const getHeaders = () => {
  const token = localStorage.getItem('access_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const requestJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...getHeaders(),
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || '请求失败');
  }
  return response.json();
};

export const startProgressEvaluation = (payload: RuntimeTaskRequest) =>
  requestJson<RuntimeTaskResponse>('/api/v1/runtime/progress-evaluations', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const startConsensusBoard = (payload: RuntimeTaskRequest) =>
  requestJson<RuntimeTaskResponse>('/api/v1/runtime/consensus-boards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const startRoundtableRun = (payload: RuntimeRoundtableRunRequest) =>
  requestJson<RuntimeTaskResponse>('/api/v1/runtime/roundtable-runs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getRuntimeTask = (taskId: string) =>
  requestJson<RuntimeTaskResponse>(`/api/v1/runtime/tasks/${encodeURIComponent(taskId)}`);

export const streamRuntimeTask = async (
  taskId: string,
  callbacks: {
    onTask: (task: RuntimeTaskResponse, event: string) => void;
    onDone: () => void;
    onError: (error: string) => void;
  },
  options?: { signal?: AbortSignal },
) => {
  try {
    const response = await fetch(`/api/v1/runtime/tasks/${encodeURIComponent(taskId)}/stream`, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        ...(localStorage.getItem('access_token')
          ? { Authorization: `Bearer ${localStorage.getItem('access_token')}` }
          : {}),
      },
      signal: options?.signal,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.detail || '任务流订阅失败');
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No reader available');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let currentEvent = 'message';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';

      for (const chunk of chunks) {
        const lines = chunk.split('\n');
        let dataStr = '';
        currentEvent = 'message';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            dataStr += line.slice(6);
          }
        }
        if (!dataStr) {
          continue;
        }
        try {
          const data = JSON.parse(dataStr) as { event?: string; task?: RuntimeTaskResponse };
          if (data.task) {
            callbacks.onTask(data.task, data.event || currentEvent);
          }
          if ((data.event || currentEvent) === 'task.done') {
            callbacks.onDone();
            return;
          }
        } catch (error) {
          console.error('SSE parse error:', error, dataStr);
        }
      }
    }
    callbacks.onDone();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      callbacks.onDone();
    } else {
      callbacks.onError(error.message || '任务流连接失败');
    }
  }
};

export const cancelRuntimeTask = (taskId: string) =>
  requestJson<RuntimeTaskCancelResponse>(`/api/v1/runtime/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: 'POST',
  });

export const getRoomRuntimeSnapshot = (roomId: string) =>
  requestJson<RuntimeSnapshot>(`/api/v1/runtime/rooms/${encodeURIComponent(roomId)}/snapshot`);

export const trackRuntimeEvent = (payload: {
  room_id?: string;
  event_type: string;
  task_id?: string;
  success?: boolean;
  duration_ms?: number;
  event_payload?: RuntimePayload;
}) =>
  requestJson<RuntimeEvent>('/api/v1/runtime/events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const getRuntimeMetricsSummary = () =>
  requestJson<RuntimeMetricsSummary>('/api/v1/runtime/metrics/summary');

export const getRecentRuntimeEvents = (limit = 20) =>
  requestJson<RuntimeEvent[]>(`/api/v1/runtime/events/recent?limit=${limit}`);
