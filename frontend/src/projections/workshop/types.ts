/**
 * Workshop Projection types
 *
 * Worker が「今日何をすべきか」を5秒で判断できるようにする6層構造。
 * AI 不要。Canonical Data の集約のみ。
 */

import type { Piece } from '../../types/index';

// ── Layer 1 ───────────────────────────────────────────────────────────────

export type HeroPieceReason =
  | 'deadline'        // 期限が迫っている
  | 'downstream'      // 下流への影響が大きい
  | 'in_progress'     // 着手中で最優先
  | 'ready';          // 着手可能で最有望

export interface HeroPiece {
  piece:  Piece;
  score:  number;       // 0–1 選出スコア
  reason: HeroPieceReason;
}

// ── Layer 2 ───────────────────────────────────────────────────────────────

export type ContextRailRole = 'upstream' | 'self' | 'downstream';

export interface ContextRailItem {
  piece:  Piece;
  role:   ContextRailRole;
  depth:  number;       // upstream: -n … -1、self: 0、downstream: 1 … n
}

// ── Layer 3 ───────────────────────────────────────────────────────────────

export type RepairIssue = 'locked' | 'stale' | 'upstream_blocked';

export interface RepairShelfItem {
  piece:     Piece;
  issue:     RepairIssue;
  staleDays: number;    // stale以外は 0
}

// ── Layer 5 ───────────────────────────────────────────────────────────────

export type GrowthReason =
  | 'skill_match'           // 既存スキルタグと一致
  | 'new_project'           // まだ触っていないプロジェクト
  | 'adjacent_difficulty'   // 難易度が近接（到達可能な挑戦）
  | 'mentor_possible';      // 自分より経験が少ない Piece

export interface GrowthCandidate {
  piece:       Piece;
  reason:      GrowthReason;
  matchScore:  number;    // 0–1
}

// ── Layer 6 ───────────────────────────────────────────────────────────────

export interface NextHandoff {
  downstreamPiece:   Piece;
  assigneeId:        string | null;
  isMissingContext:  boolean;     // objective/reason が空
  residueCount:      number;      // 下流への他の上流がまだ locked の数
}

// ── Projection root ───────────────────────────────────────────────────────

export interface WorkshopProjection {
  heroPiece:        HeroPiece | null;
  contextRail:      ContextRailItem[];
  repairShelf:      RepairShelfItem[];
  growthCandidates: GrowthCandidate[];
  nextHandoff:      NextHandoff | null;
}
