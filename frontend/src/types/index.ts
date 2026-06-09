// フロントエンド共有型定義（バックエンド types/index.ts と対応）

export type PieceStatus = 'locked' | 'ready' | 'in_progress' | 'done';
export type ConnectionType = 'sequential' | 'parallel' | 'conditional';
export type UserRole = 'admin' | 'worker' | 'external';

export interface Piece {
  id: string;
  title: string;
  objective: string;
  value_metric: string;
  expected_impact: string;
  assignee_id: string | null;
  assignee_name?: string | null;
  company_id: string;
  status: PieceStatus;
  priority: number;
  skill_tags: string[];
  is_external: boolean;
  reward: number;
  due_date: string | null;
  start_date: string | null;
  progress: number;
  business_impact: number;
  project_id: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  display_order: number;
  parent_id: string | null;
}

export interface Project {
  id: string;
  company_id: string;
  name: string;
  description: string;
  color: string;
  status: 'active' | 'completed' | 'archived';
  due_date: string | null;
  created_at: string;
}

export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequest {
  id: string;
  user_id: string;
  company_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  created_at: string;
  user_name?: string;
}

export interface Connection {
  id: string;
  from_piece_id: string;
  to_piece_id: string;
  type: ConnectionType;
  condition: string | null;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  company_id: string;
  company_name?: string;
  plan?: 'free' | 'pro' | 'enterprise';
  skill_tree: SkillTree;
  total_pieces_done: number;
  onboarded?: boolean;
  user_skills?: string[];
}

export interface SkillTree {
  user_id: string;
  skills: Record<string, { level: number; pieces_done: number; avg_rating: number }>;
  total_pieces_done: number;
  overall_rating: number;
  badges: string[];
}

export interface BottleneckReport {
  stale_pieces: Piece[];
  overloaded_users: { user: User; piece_count: number }[];
  blocked_chains: { blocked_piece: Piece; upstream_piece: Piece }[];
}

export interface WSEvent {
  type: 'piece_ready' | 'piece_assigned' | 'piece_done' | 'piece_status_changed'
      | 'bottleneck_alert' | 'skill_levelup' | 'alert' | 'auto_promoted'
      | 'cursor_move' | 'cursor_leave';
  payload: Record<string, unknown>;
}

// カーソル共有
export interface RemoteCursor {
  userId:    string;
  name:      string;
  x:         number;   // flow 座標
  y:         number;
  updatedAt: number;   // timestamp for stale detection
}
