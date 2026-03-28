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
  director_events: number;
  material_events: number;
  latest_events: RuntimeEvent[];
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

export const getRuntimeTask = (taskId: string) =>
  requestJson<RuntimeTaskResponse>(`/api/v1/runtime/tasks/${encodeURIComponent(taskId)}`);

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
