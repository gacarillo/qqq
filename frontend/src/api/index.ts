import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

export const authApi = {
  register: (data: { name: string; email: string; password: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

export const matchesApi = {
  getAll: (params?: { stage?: string; status?: string }) =>
    api.get('/matches', { params }),
  getStages: () => api.get('/matches/stages'),
  updateResult: (id: string, data: { home_score: number; away_score: number; status: string }) =>
    api.put(`/matches/${id}/result`, data),
};

export const groupsApi = {
  getAll: () => api.get('/groups'),
  create: (data: { name: string; description?: string }) =>
    api.post('/groups', data),
  join: (code: string) => api.post('/groups/join', { code }),
  getById: (id: string) => api.get(`/groups/${id}`),
  leave: (id: string) => api.delete(`/groups/${id}/leave`),
};

export const predictionsApi = {
  getMine: (group_id: string) =>
    api.get('/predictions/mine', { params: { group_id } }),
  getAll: (group_id: string, match_id?: string) =>
    api.get('/predictions', { params: { group_id, match_id } }),
  upsert: (data: { match_id: string; group_id: string; home_score: number; away_score: number }) =>
    api.post('/predictions', data),
};

export const rankingApi = {
  get: (group_id: string) =>
    api.get('/ranking', { params: { group_id } }),
};
