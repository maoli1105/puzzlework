import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Plan gate: 402 → UpgradeModal
api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 402) {
      const msg: string = error.response?.data?.error ?? 'この機能には上位プランが必要です';
      // 動的 import で循環依存を回避しつつ store をトリガー
      import('../store/upgradeStore').then(({ useUpgradeStore }) => {
        useUpgradeStore.getState().show(msg);
      });
    }
    return Promise.reject(error);
  }
);

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
  registerWorker: (data: { name: string; email: string; password: string }) =>
    api.post('/auth/register-worker', data).then((r) => r.data),
  invite: (role: 'worker' | 'admin', email?: string) =>
    api.post('/auth/invite', { role, email }).then((r) => r.data as { token: string; expires_at: string; email_sent: boolean }),
  join: (data: { token: string; name: string; email: string; password: string }) =>
    api.post('/auth/join', data).then((r) => r.data),
  joinExisting: (data: { token: string; email: string; password: string }) =>
    api.post('/auth/join-existing', data).then((r) => r.data),
  inviteInfo: (token: string) =>
    api.get(`/auth/invite-info/${token}`).then((r) => r.data as {
      token: string; role: string; company_name: string; company_id: string;
      expires_at: string; status: 'valid' | 'used' | 'expired';
    }),
  me: () => api.get('/auth/me').then((r) => r.data),
  invites: () => api.get('/auth/invites').then((r) => r.data as {
    id: string; token: string; role: string;
    expires_at: string; used_at: string | null; used_by_name: string | null;
  }[]),
};

export const pieces = {
  list: (params?: Record<string, string>) =>
    api.get('/pieces', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/pieces/${id}`).then((r) => r.data),
  create: (data: Record<string, unknown>) =>
    api.post('/pieces', data).then((r) => r.data),
  createPersonal: (data: { title: string; due_date?: string; objective?: string; recurrence_rule?: string }) =>
    api.post('/pieces/personal', data).then((r) => r.data),
  updatePersonal: (id: string, data: {
    title?: string; due_date?: string | null; objective?: string;
    recurrence_rule?: string | null; is_today_focus?: boolean;
    estimated_minutes?: number | null; actual_minutes?: number | null;
    personal_tags?: string[];
  }) =>
    api.patch(`/pieces/personal/${id}`, data).then((r) => r.data),
  deletePersonal: (id: string) =>
    api.delete(`/pieces/personal/${id}`).then((r) => r.data),
  completePersonal: (id: string) =>
    api.post(`/pieces/personal/${id}/complete`).then((r) => r.data),
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
  getVelocityGrowth: () => api.get('/pieces/velocity/growth').then((r) => r.data),
  getCriticalPath: () => api.get('/pieces/critical-path').then((r) => r.data as {
    pieces: CriticalPiece[];
    total_duration: number;
    critical_count: number;
    critical_chain: string[];
    isolated_count: number;
  }),
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
  cascadeApply: (id: string, deltaDays: number) =>
    api.post(`/pieces/${id}/cascade-apply`, { delta_days: deltaDays }).then((r) => r.data),
  getDeps: (id: string) =>
    api.get(`/pieces/${id}/deps`).then((r) => r.data),
  getActivity: (limit?: number) =>
    api.get('/pieces/activity', { params: { limit } }).then((r) => r.data),
  getMyStats: () => api.get('/pieces/my-stats').then((r) => r.data),
  getPortfolio: () => api.get('/pieces/portfolio').then((r) => r.data as PortfolioPiece[]),
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
  getResidues: (id: string) =>
    api.get(`/pieces/${id}/residue`).then((r) => r.data as {
      id: string; piece_id: string; author_id: string | null;
      type: string; body: string; created_at: string; author_name: string | null;
    }[]),
  addResidue: (id: string, data: { type: string; body: string }) =>
    api.post(`/pieces/${id}/residue`, data).then((r) => r.data as {
      id: string; piece_id: string; author_id: string | null;
      type: string; body: string; created_at: string;
    }),
};

// ── Portfolio piece type ──────────────────────────────────────────────────
export interface PortfolioPiece {
  id: string;
  title: string;
  objective: string;
  skill_tags: string[];
  personal_tags: string[];
  source: string;
  status: string;
  completed_at: string;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  business_impact: number | null;
  company_id: string | null;
  company_name: string | null;
  is_confidential?: boolean;
  confidential_until?: string | null;
  currently_confidential?: boolean;
}

export interface ConfidentialSummary {
  company_name: string | null;
  tags: string[];
  count: number;
  earliest: string;
  latest: string;
}

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
  parseText: (text: string, projectNames?: string[]) =>
    api.post('/ai/parse-pieces', { text, project_names: projectNames }).then((r) => r.data as {
      pieces: ParsedPiece[];
      model: string;
    }),
  suggestProjectStructure: (name: string, description?: string) =>
    api.post('/ai/suggest-project-structure', { name, description }).then((r) => r.data as {
      pieces: SuggestedProjectPiece[];
      source: 'ai' | 'template' | 'fallback';
      model?: string;
      template_name?: string;
    }),
};

export interface SuggestedProjectPiece {
  index: number;
  title: string;
  objective: string;
  skill_tags: string[];
  estimated_days: number;
  priority: number;
  depends_on: number[];
}

export interface ParsedPiece {
  title: string;
  objective?: string;
  status?: string;
  due_date?: string | null;
  assignee_hint?: string;
  project_name?: string;
  priority?: number;
  skill_tags?: string[];
}

export interface SmartSuggestResult {
  id: string;
  name: string;
  score: number;
  active_pieces: number;
  overdue_pieces: number;
  total_done: number;
  on_leave: boolean;
  skill_match_count: number;
  matched_tags: string[];
  weighted_avg_days: number | null;
  org_avg_days: number;
  breakdown: { skillScore: number; speedScore: number; loadScore: number; availScore: number };
  reason: string;
}

export interface BulkSuggestion {
  piece_id: string;
  piece_title: string;
  skill_tags: string[];
  priority: number;
  due_date: string | null;
  business_impact: number;
  status: string;
  project_id: string | null;
  project_name: string | null;
  top_candidates: {
    worker_id: string;
    worker_name: string;
    score: number;
    reason: string;
    matched_tags: string[];
    active_pieces: number;
    on_leave: boolean;
  }[];
}

// ── Proposals ─────────────────────────────────────────────────────────────────
export interface Proposal {
  id: string;
  company_id: string;
  proposed_by: string;
  title: string;
  objective: string;
  skill_tags: string[];
  priority: number;
  estimated_days: number | null;
  due_date: string | null;
  project_id: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_piece_id: string | null;
  created_at: string;
  // joined
  proposer_name?: string;
  reviewer_name?: string;
  project_name?: string;
}

export interface CriticalPiece {
  id: string;
  title: string;
  status: string;
  estimated_days: number;
  due_date: string | null;
  priority: number;
  business_impact: number;
  skill_tags: string[];
  project_id: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  float: number;
  is_critical: boolean;
  successors: string[];
  predecessors: string[];
}

export const marketplace = {
  list: (params?: { q?: string; tags?: string }) =>
    api.get('/marketplace', { params }).then((r) => r.data),
  accept: (id: string) => api.post(`/marketplace/${id}/accept`).then((r) => r.data),
};

export const users = {
  me: () => api.get('/users/me').then((r) => r.data),
  updateCompany: (name: string) => api.patch('/users/company', { name }).then((r) => r.data),
  updateRole: (id: string, role: 'admin' | 'worker') =>
    api.patch(`/users/${id}/role`, { role }).then((r) => r.data),
  remove: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
  currentPiece: () => api.get('/users/me/current-piece').then((r) => r.data),
  workers: () => api.get('/users/workers').then((r) => r.data),
  smartSuggest: (tags: string[]) => api.get('/users/smart-suggest', { params: { tags: tags.join(',') } }).then((r) => r.data as SmartSuggestResult[]),
  bulkSuggest: () => api.get('/users/bulk-suggest').then((r) => r.data as { suggestions: BulkSuggestion[] }),
  skills: (id: string) => api.get(`/users/${id}/skills`).then((r) => r.data),
  stats: (id: string) => api.get(`/users/${id}/stats`).then((r) => r.data),
  changePassword: (current_password: string, new_password: string) =>
    api.post('/users/me/change-password', { current_password, new_password }).then((r) => r.data),
  updatePlan: (plan: 'free' | 'pro' | 'enterprise') =>
    api.patch('/users/company/plan', { plan }).then((r) => r.data),
  companySkills: () => api.get('/users/company/skills').then((r) => r.data as {
    skills: { tag: string; total_done: number; level: number; workers: { id: string; name: string; count: number }[] }[];
    worker_count: number;
    total_done: number;
  }),
  myCompanies: () => api.get('/users/my-companies').then((r) => r.data as {
    id: string; name: string; plan: string;
    role: string; status: string; joined_at: string;
  }[]),
  completeOnboarding: (user_skills: string[]) =>
    api.patch('/users/me/onboarding', { user_skills }).then((r) => r.data),
  updateSkills: (user_skills: string[]) =>
    api.patch('/users/me/skills', { user_skills }).then((r) => r.data),
  getPortfolioVisibility: () =>
    api.get('/users/portfolio-visibility').then((r) => r.data as { is_public: boolean; user_id: string }),
  setPortfolioVisibility: (is_public: boolean) =>
    api.patch('/users/portfolio-visibility', { is_public }).then((r) => r.data as { is_public: boolean }),
  sendContact: (userId: string, data: { sender_name: string; sender_email: string; message: string }) =>
    axios.post(`${api.defaults.baseURL}/users/contact/${userId}`, data).then((r) => r.data),
  getMyContacts: () =>
    api.get('/users/my-contacts').then((r) => r.data as {
      id: string; sender_name: string; sender_email: string;
      message: string; created_at: string; read_at: string | null;
    }[]),
  markContactRead: (id: string) =>
    api.patch(`/users/my-contacts/${id}/read`).then((r) => r.data),
  getPublicPortfolio: (userId: string) =>
    axios.get(`${api.defaults.baseURL}/users/public-portfolio/${userId}`).then((r) => r.data as {
      user: { id: string; name: string; member_since: string; user_skills: string[] };
      pieces: PortfolioPiece[];
      confidential_summary: ConfidentialSummary[];
      skill_breakdown: { tag: string; count: number; minutes: number }[];
      summary: { total_pieces: number; total_companies: number; total_hours: number };
    }),
};

export const projects = {
  list: () => api.get('/projects').then((r) => r.data),
  create: (data: Record<string, unknown>) => api.post('/projects', data).then((r) => r.data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/projects/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/projects/${id}`).then((r) => r.data),
  pieces: (id: string) => api.get(`/projects/${id}/pieces`).then((r) => r.data),
  saveTemplate: (id: string, name: string) => api.post(`/projects/${id}/save-as-template`, { name }).then((r) => r.data),
  listTemplates: () => api.get('/projects/templates').then((r) => r.data),
  deleteTemplate: (id: string) => api.delete(`/projects/templates/${id}`).then((r) => r.data),
  createFromTemplate: (template_id: string, name: string, color?: string) => api.post('/projects/from-template', { template_id, name, color }).then((r) => r.data),
  report: () => api.get('/projects/report').then((r) => r.data),
  zoomDetail: (id: string) => api.get(`/projects/zoom/${id}`).then((r) => r.data as {
    project: Record<string, unknown>;
    pieces: Record<string, unknown>[];
    members: { id: string; name: string; total: number; in_progress: number; done: number; overdue: number; delivered_impact: number; next_due: string | null }[];
  }),
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

export const proposals = {
  mine: () => api.get('/proposals').then((r) => r.data as Proposal[]),
  create: (data: {
    title: string; objective?: string; skill_tags?: string[];
    priority?: number; estimated_days?: number; due_date?: string;
    project_id?: string; reason?: string; target_company_id?: string;
  }) => api.post('/proposals', data).then((r) => r.data as Proposal),
  cancel: (id: string) => api.delete(`/proposals/${id}`).then((r) => r.data),
  pending: () => api.get('/proposals/pending').then((r) => r.data as Proposal[]),
  approve: (id: string, assignee_id?: string, project_id?: string) =>
    api.post(`/proposals/${id}/approve`, { assignee_id, project_id }).then((r) => r.data),
  reject: (id: string, reject_reason?: string) =>
    api.post(`/proposals/${id}/reject`, { reject_reason }).then((r) => r.data),
  all: () => api.get('/proposals/all').then((r) => r.data as Proposal[]),
};

export interface Subtask {
  id: string
  piece_id: string
  title: string
  done: boolean
  position: number
  created_at: string
}

export const subtasks = {
  list:   (pieceId: string) =>
    api.get(`/pieces/${pieceId}/subtasks`).then(r => r.data as Subtask[]),
  create: (pieceId: string, title: string) =>
    api.post(`/pieces/${pieceId}/subtasks`, { title }).then(r => r.data as Subtask),
  update: (id: string, data: { done?: boolean; title?: string }) =>
    api.patch(`/subtasks/${id}`, data).then(r => r.data as Subtask),
  remove: (id: string) =>
    api.delete(`/subtasks/${id}`).then(r => r.data),
  updateMemo: (pieceId: string, memo: string) =>
    api.patch(`/pieces/${pieceId}/memo`, { memo }).then(r => r.data),
};

export default api;
