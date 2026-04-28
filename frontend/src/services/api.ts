import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
let refreshing: Promise<string> | null = null;
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) return Promise.reject(error);
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) return Promise.reject(error);

    original._retry = true;
    if (!refreshing) {
      refreshing = axios.post('/api/auth/refresh', { refresh_token: refreshToken })
        .then((r) => {
          localStorage.setItem('token', r.data.token);
          return r.data.token as string;
        })
        .catch((e) => {
          localStorage.removeItem('token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
          return Promise.reject(e);
        })
        .finally(() => { refreshing = null; });
    }

    const newToken = await refreshing;
    original.headers.Authorization = `Bearer ${newToken}`;
    return api(original);
  }
);

export const auth = {
  login: async (email: string, password: string) => {
    const r = await api.post('/auth/login', { email, password });
    if (r.data.refresh_token) localStorage.setItem('refresh_token', r.data.refresh_token);
    return r.data;
  },
  register: (data: Record<string, string>) =>
    api.post('/auth/register', data).then((r) => r.data),
};

export const pieces = {
  list: (params?: Record<string, string>) =>
    api.get('/pieces', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/pieces/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post('/pieces', data).then((r) => r.data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/pieces/${id}/status`, { status }).then((r) => r.data),
  assign: (id: string, assignee_id: string | null) =>
    api.patch(`/pieces/${id}/assign`, { assignee_id }).then((r) => r.data),
  connect: (id: string, data: { to_piece_id: string; type: string; condition?: string }) =>
    api.post(`/pieces/${id}/connect`, data).then((r) => r.data),
  reportBlocker: (id: string, reason: string) => api.post(`/pieces/${id}/report-blocker`, { reason }).then((r) => r.data),
  getComments: (id: string) => api.get(`/pieces/${id}/comments`).then((r) => r.data),
  addComment: (id: string, content: string) => api.post(`/pieces/${id}/comments`, { content }).then((r) => r.data),
  getBottlenecks: () => api.get('/pieces/bottlenecks').then((r) => r.data),
  getOrgHealth: () => api.get('/pieces/org-health').then((r) => r.data),
  getVelocityInsights: () => api.get('/pieces/velocity').then((r) => r.data),
  getStandupReport: () => api.get('/pieces/standup').then((r) => r.data),
  search: (q: string) => api.get('/pieces/search', { params: { q } }).then((r) => r.data),
  getConnections: () => api.get('/pieces/connections').then((r) => r.data),
  deleteConnection: (id: string) => api.delete(`/pieces/connections/${id}`).then((r) => r.data),
  updateConnection: (id: string, data: { type: string }) =>
    api.patch(`/pieces/connections/${id}`, data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) =>
    api.patch(`/pieces/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/pieces/${id}`).then((r) => r.data),
  publish: (id: string, reward: number) =>
    api.patch(`/pieces/${id}/publish`, { reward }).then((r) => r.data),
  unpublish: (id: string) =>
    api.patch(`/pieces/${id}/unpublish`).then((r) => r.data),
  cascadeImpact: (id: string, deltaDays: number) =>
    api.get(`/pieces/${id}/cascade-impact`, { params: { delta_days: deltaDays } }).then((r) => r.data),
  getActivity: (limit?: number) =>
    api.get('/pieces/activity', { params: { limit } }).then((r) => r.data),
  bulkCreate: (rows: Record<string, unknown>[]) =>
    api.post('/pieces/bulk', rows).then((r) => r.data),
  getTimeLogs: (id: string) => api.get(`/pieces/${id}/time-logs`).then((r) => r.data),
  addTimeLog: (id: string, data: { logged_minutes: number; note?: string; logged_date?: string }) =>
    api.post(`/pieces/${id}/time-logs`, data).then((r) => r.data),
  deleteTimeLog: (logId: string) => api.delete(`/pieces/time-logs/${logId}`).then((r) => r.data),
  updateWorkerProgress: (id: string, progress: number) =>
    api.patch(`/pieces/${id}/progress`, { progress }).then((r) => r.data),
  listPaged: (params: { limit: number; cursor?: string; cursor_id?: string; status?: string }) =>
    api.get('/pieces', { params }).then((r) => r.data as {
      items: Record<string, unknown>[]; hasMore: boolean;
      nextCursor: string | null; nextCursorId: string | null;
    }),
  reorder: (id: string, before_order?: number, after_order?: number) =>
    api.patch(`/pieces/${id}/reorder`, { before_order, after_order }).then((r) => r.data),
  getLogs: (id: string, limit?: number) =>
    api.get(`/pieces/${id}/logs`, { params: { limit } }).then((r) => r.data as {
      id: string; event_type: string; old_value: string | null;
      new_value: string | null; created_at: string; user_name: string | null;
    }[]),
};

export const ai = {
  suggestPiece: (title: string) =>
    api.post('/ai/suggest-piece', { title }).then((r) => r.data as {
      objective: string;
      skill_tags: string[];
      priority: number;
      estimated_days: number;
      due_date_suggestion: string;
      reason: string;
    }),
  suggestSprintName: (goal: string) =>
    api.post('/ai/suggest-sprint-name', { goal }).then((r) => r.data as { suggestions: string[] }),
  suggestSprint: (pieces: unknown[], workers: unknown[]) =>
    api.post('/ai/suggest-sprint', { pieces, workers }).then((r) => r.data as {
      assignments: { piece_id: string; worker_id: string; reason: string }[];
      source: string;
    }),
};

export const marketplace = {
  list: () => api.get('/marketplace').then((r) => r.data),
  accept: (id: string) => api.post(`/marketplace/${id}/accept`).then((r) => r.data),
};

export const users = {
  me: () => api.get('/users/me').then((r) => r.data),
  currentPiece: () => api.get('/users/me/current-piece').then((r) => r.data),
  workers: () => api.get('/users/company/workers').then((r) => r.data),
  smartSuggest: (tags: string[]) => api.get('/users/smart-suggest', { params: { tags } }).then((r) => r.data),
  skills: (id: string) => api.get(`/users/${id}/skills`).then((r) => r.data),
  stats: (id: string) => api.get(`/users/${id}/stats`).then((r) => r.data),
  changePassword: (current_password: string, new_password: string) =>
    api.post('/users/me/change-password', { current_password, new_password }).then((r) => r.data),
};

export const projects = {
  list: () => api.get('/projects').then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/projects', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/projects/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/projects/${id}`).then((r) => r.data),
  pieces: (id: string) => api.get(`/projects/${id}/pieces`).then((r) => r.data),
  saveTemplate: (id: string) => api.post(`/projects/${id}/save-template`).then((r) => r.data),
  listTemplates: () => api.get('/projects/templates').then((r) => r.data),
  createFromTemplate: (template_id: string, name: string) => api.post('/projects/from-template', { template_id, name }).then((r) => r.data),
  report: () => api.get('/projects/report').then((r) => r.data),
};

export const leave = {
  list: () => api.get('/leave').then((r) => r.data),
  create: (data: { start_date: string; end_date: string; reason: string }) =>
    api.post('/leave', data).then((r) => r.data),
  updateStatus: (id: string, status: 'approved' | 'rejected') =>
    api.patch(`/leave/${id}/status`, { status }).then((r) => r.data),
  delete: (id: string) => api.delete(`/leave/${id}`).then((r) => r.data),
};

export const retros = {
  list: () => api.get('/retros').then((r) => r.data),
  get: (id: string) => api.get(`/retros/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/retros', data).then((r) => r.data),
  close: (id: string) => api.patch(`/retros/${id}/close`).then((r) => r.data),
  delete: (id: string) => api.delete(`/retros/${id}`).then((r) => r.data),
  addItem: (retroId: string, category: string, content: string) =>
    api.post(`/retros/${retroId}/items`, { category, content }).then((r) => r.data),
  vote: (itemId: string) => api.post(`/retros/items/${itemId}/vote`).then((r) => r.data),
  deleteItem: (itemId: string) => api.delete(`/retros/items/${itemId}`).then((r) => r.data),
};

export const okrs = {
  list: (quarter?: string) => api.get('/okrs', { params: quarter ? { quarter } : {} }).then((r) => r.data),
  quarters: () => api.get('/okrs/quarters').then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/okrs', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/okrs/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/okrs/${id}`).then((r) => r.data),
  createKR: (okrId: string, data: Record<string, unknown>) => api.post(`/okrs/${okrId}/key-results`, data).then((r) => r.data),
  updateKR: (krId: string, data: Record<string, unknown>) => api.patch(`/okrs/key-results/${krId}`, data).then((r) => r.data),
  deleteKR: (krId: string) => api.delete(`/okrs/key-results/${krId}`).then((r) => r.data),
};

export default api;
