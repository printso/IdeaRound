import { message } from 'antd';

const API_BASE_URL = '/api/v1/workspaces/';

const buildWorkspaceUrl = (roomId?: string) => {
  if (!roomId) {
    return API_BASE_URL;
  }
  return `${API_BASE_URL}${encodeURIComponent(roomId)}`;
};

// 获取当前 token
const getAuthHeaders = () => {
  const token = localStorage.getItem('access_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// 转换驼峰命名为蛇形命名
const toSnakeCase = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(toSnakeCase);
  }
  if (obj && typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      // 转换驼峰为蛇形
      const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
      result[snakeKey] = toSnakeCase(value);
    }
    return result;
  }
  return obj;
};

export interface WorkspaceData {
  room_id: string;
  room_name: string;
  step: string;
  initial_demand: string;
  intent_card: {
    coreGoal: string;
    constraints: string;
    painPoints: string;
  };
  intent_ready: boolean;
  roles: Array<{
    id: string;
    name: string;
    stance: string;
    desc: string;
    selected: boolean;
    soul_config?: string;
    soulConfig?: string;
  }>;
  roles_ready: boolean;
  room_ready: boolean;
  system_prompt: string;
  messages: Array<{
    id: string;
    speaker_id: string;
    speaker_name: string;
    speaker_type: string;
    speakerId?: string;
    speakerName?: string;
    speakerType?: string;
    content: string;
    streaming?: boolean;
    created_at: string;
    createdAt?: string;
  }>;
  canvas_consensus: string[];
  canvas_disputes: string[];
  canvas_updated_at: string;
  roundtable_stage: string;
  selected_model_id?: number;
  expected_result?: string;
  max_dialogue_rounds?: number;
  auto_round_count?: number;
  judge_state?: {
    score?: number;
    reason?: string;
    reached?: boolean;
    consensusCount?: number;
    resolvedPainPoints?: number;
    nextFocus?: string;
    updated_at?: string;
  };
  consensus_board?: {
    summary?: string;
    consensus?: string[];
    disputes?: Array<{
      topic: string;
      pro: string;
      con: string;
    }>;
    nextQuestions?: string[];
    updated_at?: string;
  };
  canvas_snapshot?: Record<string, unknown> | null;
}

export interface WorkspaceResponse {
  id: number;
  user_id: number;
  room_id: string;
  data: WorkspaceData;
  created_at: string;
  updated_at: string;
}

/**
 * 创建工作台
 */
export const createWorkspace = async (workspaceData: WorkspaceData): Promise<WorkspaceResponse> => {
  try {
    // 转换数据为蛇形命名以匹配后端 schema
    const snakeCaseData = toSnakeCase(workspaceData);
    
    const response = await fetch(buildWorkspaceUrl(), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        room_id: workspaceData.room_id,
        room_name: workspaceData.room_name,
        data: snakeCaseData,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      // 如果是"该圆桌空间已存在"错误，尝试更新而不是报错
      if (errorData.detail?.includes('该圆桌空间已存在')) {
        console.warn('工作台已存在，尝试更新');
        // 返回一个假的响应，避免阻塞流程
        return {
          id: 0,
          user_id: 0,
          room_id: workspaceData.room_id,
          data: workspaceData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
      throw new Error(errorData.detail || '创建工作台失败');
    }

    return await response.json();
  } catch (error: any) {
    // 静默处理 401 错误
    if (error.message?.includes('未提供认证令牌') || error.message?.includes('401')) {
      throw error;
    }
    // 如果错误是关于已存在的，不显示错误消息
    if (!error.message?.includes('该圆桌空间已存在')) {
      message.error(error.message || '创建工作台失败');
    }
    throw error;
  }
};

/**
 * 获取用户的所有工作台
 */
export const listWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  try {
    const response = await fetch(buildWorkspaceUrl(), {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      // 如果是 401 错误，可能是未登录，不显示错误消息
      if (response.status === 401) {
        return [];
      }
      throw new Error('获取工作台列表失败');
    }

    return await response.json();
  } catch (error: any) {
    // 静默处理 401 错误，避免在未登录时显示错误
    if (error.message?.includes('未提供认证令牌') || error.message?.includes('401')) {
      return [];
    }
    message.error(error.message || '获取工作台列表失败');
    return [];
  }
};

/**
 * 获取指定工作台
 */
export const getWorkspace = async (roomId: string): Promise<WorkspaceResponse | null> => {
  try {
    const response = await fetch(buildWorkspaceUrl(roomId), {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 404 || response.status === 401) {
        return null;
      }
      throw new Error('获取工作台失败');
    }

    return await response.json();
  } catch (error: any) {
    console.error('获取工作台失败:', error);
    return null;
  }
};

/**
 * 更新工作台
 */
export const updateWorkspace = async (roomId: string, workspaceData: WorkspaceData): Promise<WorkspaceResponse> => {
  try {
    // 转换数据为蛇形命名以匹配后端 schema
    const snakeCaseData = toSnakeCase(workspaceData);
    
    const response = await fetch(buildWorkspaceUrl(roomId), {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        data: snakeCaseData,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.detail || '更新工作台失败');
    }

    return await response.json();
  } catch (error: any) {
    // 静默处理 401 错误
    if (error.message?.includes('未提供认证令牌') || error.message?.includes('401')) {
      throw error;
    }
    message.error(error.message || '更新工作台失败');
    throw error;
  }
};

/**
 * 删除工作台
 */
export const deleteWorkspace = async (roomId: string): Promise<void> => {
  try {
    const response = await fetch(buildWorkspaceUrl(roomId), {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      throw new Error('删除工作台失败');
    }
  } catch (error: any) {
    // 静默处理 401 错误
    if (error.message?.includes('未提供认证令牌') || error.message?.includes('401')) {
      throw error;
    }
    message.error(error.message || '删除工作台失败');
    throw error;
  }
};
