import api from './index';

export interface User {
  id: number;
  username: string;
  email: string;
  nickname?: string;
  avatar?: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
  updated_at: string;
  last_login?: string;
  roles?: Array<{
    id: number;
    name: string;
    description?: string;
  }>;
}

export interface UserListResponse {
  total: number;
  users: User[];
}

export interface UserCreate {
  username: string;
  email: string;
  nickname?: string;
  password: string;
}

export interface UserUpdate {
  email?: string;
  nickname?: string;
  avatar?: string;
  is_active?: boolean;
  is_superuser?: boolean;
  role_ids?: number[];
}

export const getUsers = async (skip = 0, limit = 20, keyword?: string) => {
  const params = new URLSearchParams();
  params.append('skip', String(skip));
  params.append('limit', String(limit));
  if (keyword) {
    params.append('keyword', keyword);
  }
  const response = await api.get<UserListResponse>(`/users/?${params.toString()}`);
  return response.data;
};

export const getUser = async (id: number) => {
  const response = await api.get<User>(`/users/${id}`);
  return response.data;
};

export const createUser = async (data: UserCreate) => {
  const response = await api.post<User>('/users/', data);
  return response.data;
};

export const updateUser = async (id: number, data: UserUpdate) => {
  const response = await api.put<User>(`/users/${id}`, data);
  return response.data;
};

export const deleteUser = async (id: number) => {
  const response = await api.delete(`/users/${id}`);
  return response.data;
};

export const resetUserPassword = async (id: number, newPassword: string) => {
  const response = await api.put(`/users/${id}/password`, { new_password: newPassword });
  return response.data;
};

export const changePassword = async (oldPassword: string, newPassword: string) => {
  const response = await api.put('/auth/password', {
    old_password: oldPassword,
    new_password: newPassword,
  });
  return response.data;
};
