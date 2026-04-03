import api from './index';

export interface SearchEngineConfig {
  id: number;
  name: string;
  provider: string;
  base_url: string;
  api_key?: string;
  is_enabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at?: string;
}

export type SearchEngineConfigCreate = Omit<SearchEngineConfig, 'id' | 'created_at' | 'updated_at'>;
export type SearchEngineConfigUpdate = Partial<SearchEngineConfigCreate>;

export const getSearchEngineConfigs = async () => {
  const response = await api.get('/search-engines/');
  return response.data;
};

export const createSearchEngineConfig = async (data: SearchEngineConfigCreate) => {
  const response = await api.post('/search-engines/', data);
  return response.data;
};

export const updateSearchEngineConfig = async (id: number, data: SearchEngineConfigUpdate) => {
  const response = await api.put(`/search-engines/${id}`, data);
  return response.data;
};

export const deleteSearchEngineConfig = async (id: number) => {
  const response = await api.delete(`/search-engines/${id}`);
  return response.data;
};

export const testSearchEngineConfig = async (id: number, query: string, limit: number = 5) => {
  const response = await api.post(`/search-engines/${id}/test`, { query, limit });
  return response.data;
};
