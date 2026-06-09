// ============================================================
// PuzzleWork 共有型定義
// Antigravity修正ポイント：型名・フィールド名の変更はここを変更
// ============================================================

export type PieceStatus = 'locked' | 'ready' | 'in_progress' | 'done';
export type ConnectionType = 'sequential' | 'parallel' | 'conditional';
export type UserRole = 'admin' | 'worker' | 'external';
export type CompanyPlan = 'free' | 'pro' | 'enterprise';

export interface Piece {
  id: string;
  title: string;
  objective: string;
  value_metric: string;
  expected_impact: string;
  assignee_id: string | null;
  status: PieceStatus;
  priority: number;
  skill_tags: string[];
  is_external: boolean;
  reward: number;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
  company_id: string;
}

export interface Connection {
  id: string;
  from_piece_id: string;
  to_piece_id: string;
  type: ConnectionType;
  condition: string | null;
  created_at: Date;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  company_id: string;
  skill_tree: SkillTree;
  total_pieces_done: number;
  created_at: Date;
}

export interface Company {
  id: string;
  name: string;
  plan: CompanyPlan;
  skill_tree: CompanySkillTree;
  external_pieces_published: number;
  created_at: Date;
}

export interface SkillCategory {
  level: number;
  pieces_done: number;
  avg_rating: number;
  sub_skills?: Record<string, { pieces: number; level: number }>;
}

export interface SkillTree {
  user_id: string;
  skills: Record<string, SkillCategory>;
  total_pieces_done: number;
  overall_rating: number;
  badges: string[];
}

export interface CompanySkillTree {
  company_id: string;
  industry_profile: Record<string, number>;
  completion_score: number;
  speed_score: number;
  worker_rating: number;
  external_pieces_published: number;
  external_pieces_completed: number;
}

export interface BottleneckReport {
  stale_pieces: Piece[];
  overloaded_users: { user: User; piece_count: number }[];
  blocked_chains: { blocked_piece: Piece; upstream_piece: Piece }[];
}

// WebSocket イベント型
export interface WSEvent {
  type: 'piece_ready' | 'piece_done' | 'piece_assigned' | 'piece_status_changed'
      | 'bottleneck_alert' | 'skill_levelup' | 'alert' | 'auto_promoted'
      | 'cursor_move' | 'cursor_leave';
  payload: Record<string, unknown>;
}
