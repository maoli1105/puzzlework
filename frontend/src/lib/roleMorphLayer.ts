/**
 * roleMorphLayer — 構造内での作用を計算
 * ────────────────────────────────────────
 * 肩書きを見ない。構造の中でその人が何をしているかを見る。
 *
 * 4つの役割（ラベルではなく、行動結果のパターン）:
 *
 *   repair     — 孤立・停滞箇所を担当する。空白を埋める作用。
 *   connect    — 多数の接続点を持ち、複数領域をまたぐ。橋の作用。
 *   distribute — 広く分散して担当。集中を解消する作用。
 *   accelerate — 完了率が高く、停滞していた箇所を前進させる。
 *
 * 設計原則：
 *   - 診断/称号/バッジは絶対に出力しない
 *   - 既存の視覚パラメータを微修正するだけ
 *   - 「行動結果だけを残す」= 現在の構造状態 = その人の作用の痕跡
 */

import { Piece, Connection } from '../types';
import type { IsolationVisual } from './missingLayer';
import type { PatinaStyle } from './usagePatina';

// ─── 役割シグネチャ型 ──────────────────────────────────────────────────────────
export type RoleSignature = 'repair' | 'connect' | 'distribute' | 'accelerate' | 'neutral';

export interface PersonRoleSignature {
  assigneeId: string;
  role:       RoleSignature;
  intensity:  number;  // 0–1: 作用の強度
}

// ─── 役割スコア計算 ──────────────────────────────────────────────────────────
const MIN_PIECES      = 2;    // スコア計算に必要な最低担当数
const ROLE_THRESHOLD  = 0.36; // この閾値以上を有意な役割とする

export function computeRoleSignatures(
  pieces:       Piece[],
  connections:  Connection[],
  isolationMap: Record<string, number>,
): PersonRoleSignature[] {

  // ── 接続数マップ ──────────────────────────────────────────────────────────
  const connCount: Record<string, number> = {};
  for (const p of pieces) connCount[p.id] = 0;
  for (const c of connections) {
    connCount[c.from_piece_id] = (connCount[c.from_piece_id] ?? 0) + 1;
    connCount[c.to_piece_id]   = (connCount[c.to_piece_id]   ?? 0) + 1;
  }
  const maxConn = Math.max(1, ...Object.values(connCount));

  // ── 担当者ごとにピースをグループ化 ──────────────────────────────────────
  const byAssignee: Record<string, Piece[]> = {};
  for (const p of pieces) {
    if (!p.assignee_id) continue;
    if (!byAssignee[p.assignee_id]) byAssignee[p.assignee_id] = [];
    byAssignee[p.assignee_id].push(p);
  }

  // ── ボード全体の統計 ──────────────────────────────────────────────────────
  const now             = Date.now();
  const boardProjects   = new Set(pieces.map(p => p.project_id).filter(Boolean));
  const totalProjects   = Math.max(1, boardProjects.size);

  const result: PersonRoleSignature[] = [];

  for (const [assigneeId, myPieces] of Object.entries(byAssignee)) {
    if (myPieces.length < MIN_PIECES) continue;

    const active = myPieces.filter(p => p.status !== 'done' && p.status !== 'locked');
    const done   = myPieces.filter(p => p.status === 'done');

    // ── repair score ──────────────────────────────────────────────────────
    // 孤立ピースを担当 + 長期停滞ピースに着手している
    const isolatedFrac  = active.length > 0
      ? active.filter(p => (isolationMap[p.id] ?? 0) > 0.45).length / active.length
      : 0;

    const staleInProgress = active
      .filter(p => p.status === 'in_progress' && p.started_at)
      .map(p => (now - new Date(p.started_at!).getTime()) / 86_400_000);
    const avgStaleDays  = staleInProgress.length > 0
      ? staleInProgress.reduce((a, b) => a + b, 0) / staleInProgress.length
      : 0;
    // 30日以上の停滞ピースを持つ = 修復役の痕跡
    const repairScore   = isolatedFrac * 0.60 + Math.min(1, avgStaleDays / 30) * 0.40;

    // ── connect score ──────────────────────────────────────────────────────
    // 担当ピースの平均接続数 + プロジェクト横断率
    const avgConn       = myPieces.reduce((s, p) => s + (connCount[p.id] ?? 0), 0) / myPieces.length;
    const myProjects    = new Set(myPieces.map(p => p.project_id).filter(Boolean));
    const projectSpan   = myProjects.size / totalProjects;
    const connectScore  = (avgConn / maxConn) * 0.70 + projectSpan * 0.30;

    // ── distribute score ───────────────────────────────────────────────────
    // 広い種類のスキルタグ + 多プロジェクト担当
    const allTags       = new Set(myPieces.flatMap(p => p.skill_tags ?? []));
    const tagVariety    = Math.min(1, allTags.size / Math.max(1, myPieces.length * 0.8));
    const distributeScore = tagVariety * 0.40 + projectSpan * 0.60;

    // ── accelerate score ──────────────────────────────────────────────────
    // 完了率 + 最近完了した新鮮度
    const doneFrac      = done.length / myPieces.length;
    const recentDones   = done.filter(p => {
      if (!p.completed_at) return false;
      const days = (now - new Date(p.completed_at).getTime()) / 86_400_000;
      return days <= 14;
    }).length;
    const recentFrac    = done.length > 0 ? recentDones / done.length : 0;
    const accelerateScore = doneFrac * 0.50 + recentFrac * 0.50;

    // ── 最も強いスコアの役割を採用 ────────────────────────────────────────
    const scores: [RoleSignature, number][] = [
      ['repair',      repairScore],
      ['connect',     connectScore],
      ['distribute',  distributeScore],
      ['accelerate',  accelerateScore],
    ];
    scores.sort((a, b) => b[1] - a[1]);
    const [topRole, topScore] = scores[0];

    if (topScore >= ROLE_THRESHOLD) {
      result.push({ assigneeId, role: topRole, intensity: Math.min(1, topScore) });
    }
  }

  return result;
}

// ─── 役割 → isolation visual 微修正 ──────────────────────────────────────────
// 修復役: 孤立ピースがより「存在する」ように見える（修復の痕跡）
// その他: 変化なし
export function applyRoleToIsolation(
  v:         IsolationVisual,
  role:      RoleSignature,
  intensity: number,
): IsolationVisual {
  if (role !== 'repair' || intensity < 0.1) return v;
  // 孤立しているが、修復役が担当すると影が少し戻る（まだそこにいる）
  const anchor = intensity * 0.55;
  return {
    shadowAlpha:  Math.min(1, v.shadowAlpha  + anchor * 0.5),
    borderAlpha:  Math.min(1, v.borderAlpha  + anchor * 0.35),
    contentAlpha: Math.min(1, v.contentAlpha + anchor * 0.2),
  };
}

// ─── 役割 → patina style 微修正 ───────────────────────────────────────────────
// 加速役: 完了の新鮮さが少し強く残る（前進させた痕跡）
// その他: 変化なし
export function applyRoleToPatina(
  p:         PatinaStyle,
  role:      RoleSignature,
  intensity: number,
): PatinaStyle {
  if (role !== 'accelerate' || intensity < 0.1) return p;
  // brightness と warmShift を少し底上げ — 「最近動かした」感
  const boost = intensity * 0.55;
  return {
    ...p,
    brightness:  Math.min(100, p.brightness  + Math.round(boost * 5)),
    saturation:  Math.min(100, p.saturation  + Math.round(boost * 6)),
    warmShift:   Math.min(1,   p.warmShift   + boost * 0.08),
    opacity:     Math.min(1,   p.opacity),
    borderWarm:  p.borderWarm || (role === 'accelerate' && intensity > 0.6),
  };
}

// ─── 役割 → concentration pressure 微修正 ────────────────────────────────────
// 分散役: 担当ピースの重さが少し軽い（集中を解消した痕跡）
// 接続役: 接続圧力がそのまま外に繋がる感覚（変化なし、エッジで表現）
export function applyRoleToPressure(
  score:     number,
  role:      RoleSignature,
  intensity: number,
): number {
  if (role !== 'distribute' || intensity < 0.1) return score;
  // 重さが軽減されている（分散役がそこにいる）
  return score * (1 - intensity * 0.35);
}
