// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { message } from 'antd';
import { buildApiUrl, buildRequestHeaders, requestJson } from './fetchClient';

const buildWorkspaceUrl = (roomId?: string) =>
  `/workspaces/${roomId ? encodeURIComponent(roomId) : ''}`;

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
      const nextValue = toSnakeCase(value);
      if (typeof nextValue === 'undefined') {
        continue;
      }
      if (typeof result[snakeKey] === 'undefined') {
        result[snakeKey] = nextValue;
        continue;
      }
      result[snakeKey] = nextValue;
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
  intent_ready: boolean;
  intent_card?: Record<string, unknown>;
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
    summary?: string;
    summary_metrics?: Record<string, unknown> | null;
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
    /** Server returns snake_case; kept for backward compat with camelCase */
    consensus_count?: number;
    resolved_pain_points?: number;
    next_focus?: string;
    updated_at?: string;
    /** Legacy camelCase variants (used in older local state snapshots) */
    consensusCount?: number;
    resolvedPainPoints?: number;
    nextFocus?: string;
  };
  consensus_board?: {
    summary?: string;
    consensus?: string[];
    disputes?: Array<{
      topic: string;
      pro: string;
      con: string;
    }>;
    /** Server returns snake_case; kept for backward compat with camelCase */
    next_questions?: string[];
    updated_at?: string;
    /** Legacy camelCase variant */
    nextQuestions?: string[];
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
    const normalized = {
      ...workspaceData,
      intent_card: workspaceData.intent_card ?? {},
    };
    const snakeCaseData = toSnakeCase(normalized);

    return await requestJson<WorkspaceResponse>(buildWorkspaceUrl(), {
      method: 'POST',
      body: JSON.stringify({
        room_id: workspaceData.room_id,
        room_name: workspaceData.room_name,
        data: snakeCaseData,
      }),
    });
  } catch (error: any) {
    if (error.message?.includes('该圆桌空间已存在')) {
      console.warn('工作台已存在，使用当前状态继续流程');
      return {
        id: 0,
        user_id: 0,
        room_id: workspaceData.room_id,
        data: workspaceData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }
    if (error.message?.includes('未提供认证令牌') || error.message?.includes('401')) {
      throw error;
    }
    message.error(error.message || '创建工作台失败');
    throw error;
  }
};

/**
 * 获取用户的所有工作台
 */
export const listWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  try {
    return await requestJson<WorkspaceResponse[]>(buildWorkspaceUrl());
  } catch (error: any) {
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
    return await requestJson<WorkspaceResponse>(buildWorkspaceUrl(roomId));
  } catch (error: any) {
    if (error.message?.includes('404') || error.message?.includes('401') || error.message?.includes('未提供认证令牌')) {
      return null;
    }
    console.error('获取工作台失败:', error);
    return null;
  }
};

/**
 * 更新工作台
 */
export const updateWorkspace = async (roomId: string, workspaceData: WorkspaceData): Promise<WorkspaceResponse> => {
  try {
    const normalized = {
      ...workspaceData,
      intent_card: workspaceData.intent_card ?? {},
    };
    const snakeCaseData = toSnakeCase(normalized);

    return await requestJson<WorkspaceResponse>(buildWorkspaceUrl(roomId), {
      method: 'PUT',
      body: JSON.stringify({
        data: snakeCaseData,
      }),
    });
  } catch (error: any) {
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
    const response = await fetch(buildApiUrl(buildWorkspaceUrl(roomId)), {
      method: 'DELETE',
      headers: buildRequestHeaders({
        method: 'DELETE',
      }),
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
