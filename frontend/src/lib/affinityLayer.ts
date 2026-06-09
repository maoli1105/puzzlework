/**
 * affinityLayer — 接続親和性の計算
 * ──────────────────────────────────
 * 「繋がりやすい2つのピースがどれくらい近いか」を計算する。
 *
 * AI提案ではない。
 * 構造が自然にそうなるための物理的な引力計算。
 *
 * スコア要因（0–1）:
 *   同プロジェクト    : +0.30
 *   同担当者          : +0.25
 *   スキルタグ重複    : +0.10 per tag (max 0.20)
 *   共通隣接ノード    : +0.20 (A-C-B のような間接近傍)
 *   孤立ブースト      : +0.15 (どちらかが孤立しているとき)
 *
 * 出力: 未接続かつスコア高上位 N ペア
 */

import { Piece, Connection } from '../types';

export interface AffinityPair {
  pieceIdA:  string;
  pieceIdB:  string;
  score:     number;  // 0–1
}

const MAX_PAIRS = 6;  // 画面に出す最大ゴーストエッジ数
const MIN_SCORE = 0.35;

export function computeAffinityPairs(
  pieces:       Piece[],
  connections:  Connection[],
  isolationMap: Record<string, number>,
): AffinityPair[] {
  // アクティブピースのみ対象
  const active = pieces.filter(p => p.status !== 'done' && p.status !== 'locked');
  if (active.length < 2) return [];

  // ── 既存接続セット ──────────────────────────────────────────────────────────
  const connected = new Set<string>();
  for (const c of connections) {
    connected.add(`${c.from_piece_id}:${c.to_piece_id}`);
    connected.add(`${c.to_piece_id}:${c.from_piece_id}`);
  }

  // ── 隣接マップ (A の接続先セット) ──────────────────────────────────────────
  const neighbors: Record<string, Set<string>> = {};
  for (const p of active) neighbors[p.id] = new Set();
  for (const c of connections) {
    neighbors[c.from_piece_id]?.add(c.to_piece_id);
    neighbors[c.to_piece_id]?.add(c.from_piece_id);
  }

  const pairs: AffinityPair[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i];
      const b = active[j];

      // 既に接続されているペアはスキップ
      if (connected.has(`${a.id}:${b.id}`)) continue;

      let score = 0;

      // 同プロジェクト
      if (a.project_id && a.project_id === b.project_id) score += 0.30;

      // 同担当者
      if (a.assignee_id && a.assignee_id === b.assignee_id) score += 0.25;

      // スキルタグ重複
      const tagsA = a.skill_tags ?? [];
      const tagsB = b.skill_tags ?? [];
      const overlap = tagsA.filter(t => tagsB.includes(t)).length;
      score += Math.min(0.20, overlap * 0.10);

      // 共通隣接ノード (A-C-B の間接近傍)
      const nbA = neighbors[a.id] ?? new Set();
      const nbB = neighbors[b.id] ?? new Set();
      let sharedNeighbors = 0;
      for (const n of nbA) { if (nbB.has(n)) sharedNeighbors++; }
      if (sharedNeighbors > 0) score += Math.min(0.20, sharedNeighbors * 0.10);

      // 孤立ブースト: どちらかが孤立していると「埋まりたがっている」
      const maxIso = Math.max(isolationMap[a.id] ?? 0, isolationMap[b.id] ?? 0);
      if (maxIso > 0.3) score += 0.15 * maxIso;

      if (score >= MIN_SCORE) {
        pairs.push({ pieceIdA: a.id, pieceIdB: b.id, score: Math.min(1, score) });
      }
    }
  }

  // スコア降順、上位 MAX_PAIRS のみ返す
  pairs.sort((a, b) => b.score - a.score);
  return pairs.slice(0, MAX_PAIRS);
}
