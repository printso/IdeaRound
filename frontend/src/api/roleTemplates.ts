/**
 * 角色模板管理 API
 */
import api from './index';

export interface DialogueExample {
  user: string;
  assistant: string;
  scenario?: string;
}

export interface RoleTemplate {
  id: number;
  name: string;
  stance: string;
  category: string;
  description?: string;
  personality?: string;
  background?: string;
  skill_tags: string[];
  dialogue_examples: DialogueExample[];
  value_proposition?: string;
  soul_prompt_id?: number;
  style_prompt_id?: number;
  soul_config?: string;
  is_default: boolean;
  is_active: boolean;
  version: number;
  parent_id?: number;
  version_note?: string;
  usage_count: number;
  rating: number;
  rating_count: number;
  author?: string;
  author_id?: number;
  copyright_notice?: string;
  license_type?: string;
  created_at: string;
  updated_at?: string;
  created_by?: number;
  last_used_at?: string;
}

export interface RoleTemplateCreate {
  name: string;
  stance: string;
  category: string;
  description?: string;
  personality?: string;
  background?: string;
  skill_tags?: string[];
  dialogue_examples?: DialogueExample[];
  value_proposition?: string;
  soul_prompt_id?: number;
  style_prompt_id?: number;
  soul_config?: string;
  is_default?: boolean;
  is_active?: boolean;
  author?: string;
  author_id?: number;
  copyright_notice?: string;
  license_type?: string;
}

export interface RoleTemplateUpdate {
  name?: string;
  stance?: string;
  category?: string;
  description?: string;
  personality?: string;
  background?: string;
  skill_tags?: string[];
  dialogue_examples?: DialogueExample[];
  value_proposition?: string;
  soul_prompt_id?: number;
  style_prompt_id?: number;
  soul_config?: string;
  is_default?: boolean;
  is_active?: boolean;
  author?: string;
  copyright_notice?: string;
  license_type?: string;
  version_note?: string;
}

export interface RoleTemplateClone {
  name: string;
  category?: string;
}

export interface RoleTemplateVersion {
  id: number;
  template_id: number;
  version: number;
  snapshot_data: RoleTemplate;
  change_summary?: string;
  created_at: string;
  created_by?: number;
}

export interface UsageStats {
  total_templates: number;
  active_templates: number;
  inactive_templates: number;
  category_stats: Record<string, number>;
  top_used: RoleTemplate[];
  recent_used: RoleTemplate[];
}

export interface RoleTemplateListResponse {
  total: number;
  templates: RoleTemplate[];
  stats?: {
    category_stats: Record<string, number>;
  };
}

// API Functions

export const getRoleTemplates = async (params?: {
  skip?: number;
  limit?: number;
  category?: string;
  stance?: string;
  is_active?: boolean;
  is_default?: boolean;
  search?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}): Promise<RoleTemplateListResponse> => {
  const response = await api.get('/role-templates/', { params });
  return response.data;
};

export const getRoleTemplate = async (id: number): Promise<RoleTemplate> => {
  const response = await api.get(`/role-templates/${id}`);
  return response.data;
};

export const createRoleTemplate = async (data: RoleTemplateCreate): Promise<RoleTemplate> => {
  const response = await api.post('/role-templates/', data);
  return response.data;
};

export const updateRoleTemplate = async (id: number, data: RoleTemplateUpdate): Promise<RoleTemplate> => {
  const response = await api.put(`/role-templates/${id}`, data);
  return response.data;
};

export const deleteRoleTemplate = async (id: number): Promise<void> => {
  await api.delete(`/role-templates/${id}`);
};

export const cloneRoleTemplate = async (id: number, data: RoleTemplateClone): Promise<RoleTemplate> => {
  const response = await api.post(`/role-templates/${id}/clone`, data);
  return response.data;
};

export const toggleRoleTemplateActive = async (id: number): Promise<RoleTemplate> => {
  const response = await api.patch(`/role-templates/${id}/toggle-active`);
  return response.data;
};

export const getRoleTemplateVersions = async (id: number): Promise<RoleTemplateVersion[]> => {
  const response = await api.get(`/role-templates/${id}/versions`);
  return response.data;
};

export const restoreRoleTemplateVersion = async (id: number, versionNum: number): Promise<RoleTemplate> => {
  const response = await api.post(`/role-templates/${id}/restore/${versionNum}`);
  return response.data;
};

export const updateRoleTemplateUsage = async (id: number): Promise<{ usage_count: number }> => {
  const response = await api.patch(`/role-templates/${id}/usage`);
  return response.data;
};

export const updateRoleTemplateRating = async (id: number, rating: number): Promise<{ rating: number; rating_count: number }> => {
  const response = await api.patch(`/role-templates/${id}/rating`, null, { params: { rating } });
  return response.data;
};

export const getUsageStats = async (): Promise<UsageStats> => {
  const response = await api.get('/role-templates/stats');
  return response.data;
};

export const getCategories = async (): Promise<string[]> => {
  const response = await api.get('/role-templates/categories');
  return response.data;
};

export const importRoleTemplates = async (
  file: File,
  importMode: 'create' | 'merge' | 'update' = 'create',
  overwrite: boolean = false
): Promise<{
  imported_count: number;
  skipped_count: number;
  skipped_names: string[];
  imported_ids: number[];
}> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/role-templates/import', formData, {
    params: { import_mode: importMode, overwrite },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const exportRoleTemplates = async (params?: {
  category?: string;
  include_inactive?: boolean;
  export_format?: 'json' | 'csv';
}): Promise<RoleTemplate[]> => {
  const response = await api.get('/role-templates/export/all', { params });
  return response.data;
};
