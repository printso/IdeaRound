// Generated with Engineering Prompt v2026.04 - Quality & Efficiency Enforced
import { message } from 'antd';
import { buildApiUrl, buildRequestHeaders, requestJson } from './fetchClient';

const API_BASE_URL = '/materials/';

export type MaterialType = 'document' | 'image' | 'audio' | 'video';

export interface MaterialInfo {
  id: string;
  filename: string;
  material_type: MaterialType;
  format: string;
  size: number;
  processing_status: 'pending' | 'uploaded' | 'processing' | 'completed' | 'failed';
  extracted_content?: string;
  key_info?: {
    keywords?: string[];
    entities?: {
      organizations?: string[];
      locations?: string[];
      dates?: string[];
      numbers?: string[];
    };
    summary?: string;
    language?: string;
  };
  intent_indicators?: string[];
  summary?: string;
  uploaded_at: string;
}

export interface MaterialAnalysisResult {
  material_id: string;
  status: string;
  extracted_content?: string;
  key_info?: Record<string, unknown>;
  intent_indicators?: string[];
  summary?: string;
}

export interface IntentSynthesisResult {
  room_id: string;
  synthesized_intent: {
    core_goal: string;
    requirements: string;
    constraints: string;
    pain_points: string;
    key_topics: string[];
    intent_types: string[];
    combined_summary: string;
  };
  material_summaries: Array<{
    material_id: string;
    summary: string;
    intent_indicators?: string[];
  }>;
  core_intent_indicators: string[];
  key_topics: string[];
  recommendations: string[];
  content_length: number;
}

export interface SupportedFormats {
  supported_formats: Record<MaterialType, string[]>;
  max_file_sizes: Record<MaterialType, number>;
}

export const getSupportedFormats = async (): Promise<SupportedFormats> => {
  try {
    return await requestJson<SupportedFormats>(`${API_BASE_URL}formats/supported`);
  } catch (error: any) {
    message.error(error.message || '获取支持的格式失败');
    throw error;
  }
};

export const uploadMaterial = async (
  file: File,
  roomId: string,
  onProgress?: (percent: number) => void
): Promise<MaterialInfo> => {
  const formData = new FormData();
  formData.append('file', file);
  // room_id 作为 Query 参数传递，不放在 FormData 中

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid response format'));
        }
      } else {
        try {
          const error = JSON.parse(xhr.responseText);
          reject(new Error(error.detail || '上传失败'));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error during upload'));
    };

    // room_id 作为 Query 参数附加到 URL
    const url = buildApiUrl(`${API_BASE_URL}upload?room_id=${encodeURIComponent(roomId)}`);
    xhr.open('POST', url);
    const headers = buildRequestHeaders(undefined);
    const authHeader = headers.get('Authorization');
    if (authHeader) {
      xhr.setRequestHeader('Authorization', authHeader);
    }
    xhr.send(formData);
  });
};

export const uploadMultipleMaterials = async (
  files: File[],
  roomId: string,
  onProgress?: (percent: number, fileName: string) => void
): Promise<MaterialInfo[]> => {
  const results: MaterialInfo[] = [];
  const totalFiles = files.length;
  let completedFiles = 0;

  for (const file of files) {
    try {
      const result = await uploadMaterial(file, roomId, (percent) => {
        if (onProgress) {
          const overallPercent = Math.round(
            ((completedFiles * 100 + percent) / totalFiles)
          );
          onProgress(overallPercent, file.name);
        }
      });
      results.push(result);
      completedFiles++;
    } catch (error: any) {
      console.error(`Failed to upload ${file.name}:`, error);
      message.warning(`${file.name} 上传失败: ${error.message}`);
    }
  }

  return results;
};

export const getMaterial = async (materialId: string): Promise<MaterialInfo> => {
  try {
    return await requestJson<MaterialInfo>(`${API_BASE_URL}${materialId}`);
  } catch (error: any) {
    message.error(error.message || '获取材料失败');
    throw error;
  }
};

export const listMaterials = async (
  roomId?: string,
  skip: number = 0,
  limit: number = 50
): Promise<MaterialInfo[]> => {
  try {
    const params = new URLSearchParams();
    if (roomId) params.append('room_id', roomId);
    params.append('skip', String(skip));
    params.append('limit', String(limit));
    return await requestJson<MaterialInfo[]>(`${API_BASE_URL}materials?${params.toString()}`);
  } catch (error: any) {
    message.error(error.message || '获取材料列表失败');
    throw error;
  }
};

export const analyzeMaterial = async (
  materialId: string
): Promise<MaterialAnalysisResult> => {
  try {
    return await requestJson<MaterialAnalysisResult>(`${API_BASE_URL}analyze/${materialId}`, {
      method: 'POST',
    });
  } catch (error: any) {
    message.error(error.message || '分析材料失败');
    throw error;
  }
};

export const batchAnalyzeMaterials = async (
  materialIds: string[]
): Promise<{ results: MaterialAnalysisResult[]; total: number; processed: number }> => {
  try {
    return await requestJson<{ results: MaterialAnalysisResult[]; total: number; processed: number }>(
      `${API_BASE_URL}analyze/batch`,
      {
      method: 'POST',
      headers: buildRequestHeaders({
        body: JSON.stringify(materialIds),
      }),
      body: JSON.stringify(materialIds),
    });
  } catch (error: any) {
    message.error(error.message || '批量分析失败');
    throw error;
  }
};

export const synthesizeIntent = async (
  roomId: string,
  materialIds: string[],
  contextText?: string
): Promise<IntentSynthesisResult> => {
  try {
    return await requestJson<IntentSynthesisResult>(`${API_BASE_URL}intent/synthesize`, {
      method: 'POST',
      body: JSON.stringify({
        room_id: roomId,
        materials: materialIds,
        context_text: contextText,
      }),
    });
  } catch (error: any) {
    message.error(error.message || '意图综合失败');
    throw error;
  }
};

export const deleteMaterial = async (materialId: string): Promise<void> => {
  try {
    const response = await fetch(buildApiUrl(`${API_BASE_URL}${materialId}`), {
      method: 'DELETE',
      headers: buildRequestHeaders({
        method: 'DELETE',
      }),
    });
    if (!response.ok) {
      throw new Error('删除材料失败');
    }
  } catch (error: any) {
    message.error(error.message || '删除材料失败');
    throw error;
  }
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

export const getFileTypeIcon = (format: string): string => {
  const formatIcons: Record<string, string> = {
    pdf: '📄',
    doc: '📝',
    docx: '📝',
    txt: '📃',
    jpg: '🖼️',
    jpeg: '🖼️',
    png: '🖼️',
    gif: '🖼️',
    mp3: '🎵',
    mp4: '🎬',
    wav: '🎵',
  };
  return formatIcons[format.toLowerCase()] || '📎';
};
