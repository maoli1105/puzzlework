/**
 * concentrationScore — 構造偏重の計算
 * ────────────────────────────────────
 * 「誰かに集中しすぎている」「ここに繋がりすぎている」を
 * 数値として計算する。UIは数値を見せない。影と密度で感じさせる。
 *
 * 設計原則：
 *   個人責任ではなく、構造偏重を示す。
 *   アラートではなく、触感（圧力）として表現する。
 */

import { Piece, Connection } from '../types';

// ─── 事前計算マップ ─────────────────────────────────────────────────────────
export interface ConcentrationMaps {
  /** assigneeId → normalized load (0=軽, 1=過重) */
  ownerLoadMap:  Record<string, number>;
  /** pieceId → edge count */
  connCountMap:  Record<string, number>;
  /** pieceId → 最終的な pressure score (0–1) */
  pressureMap:   Record<string, number>;
  /** 最大接続数（正規化用） */
  maxConnCount:  number;
}

export function computeConcentrationMaps(
  pieces: Piece[],
  connections: Connection[],
): ConcentrationMaps {
  // ── Owner load ─────────────────────────────────────────────────────────────
  // 対象: 完了・locked でないアクティブなピースのみ
  const active = pieces.filter(p => p.status !== 'done' && p.status !== 'locked');

  // assignee ごとの担当数
  const assigneeCount: Record<string, number> = {};
  for (const p of active) {
    if (!p.assignee_id) continue;
    assigneeCount[p.assignee_id] = (assigneeCount[p.assignee_id] ?? 0) + 1;
  }

  const activeWorkers = Object.keys(assigneeCount).length;
  const avgLoad = activeWorkers > 0
    ? active.filter(p => p.assignee_id).length / activeWorkers
    : 1;

  // normalized: 平均の2.5倍を超えたら 1.0
  const ownerLoadMap: Record<string, number> = {};
  for (const [aid, cnt] of Object.entries(assigneeCount)) {
    ownerLoadMap[aid] = Math.min(1, (cnt / avgLoad) / 2.5);
  }

  // ── Connection load ────────────────────────────────────────────────────────
  const connCountMap: Record<string, number> = {};
  for (const c of connections) {
    connCountMap[c.from_piece_id] = (connCountMap[c.from_piece_id] ?? 0) + 1;
    connCountMap[c.to_piece_id]   = (connCountMap[c.to_piece_id]   ?? 0) + 1;
  }
  const maxConnCount = Math.max(1, ...Object.values(connCountMap));

  // ── Pressure score ─────────────────────────────────────────────────────────
  const pressureMap: Record<string, number> = {};
  for (const piece of pieces) {
    if (piece.status === 'done' || piece.status === 'locked') {
      pressureMap[piece.id] = 0;
      continue;
    }

    const ownerLoad  = piece.assignee_id ? (ownerLoadMap[piece.assignee_id] ?? 0) : 0;
    const connLoad   = (connCountMap[piece.id] ?? 0) / maxConnCount;
    pressureMap[piece.id] = Math.min(1, ownerLoad * 0.65 + connLoad * 0.35);
  }

  return { ownerLoadMap, connCountMap, pressureMap, maxConnCount };
}

// ─── pressure score → shadow 計算 ──────────────────────────────────────────
// 重さ = 影の濃さ・深さ
// アラート色なし。純粋に影で「圧」を表現。
export function pressureToShadow(score: number): string | undefined {
  if (score < 0.28) return undefined; // 感知不要

  // score 0.28 → 1.0 を影の強さにマッピング
  const t      = (score - 0.28) / 0.72;        // 0–1
  const yOff   = (2  + t * 7).toFixed(1);      // 2px → 9px
  const blur   = (6  + t * 16).toFixed(0);     // 6px → 22px
  const alpha  = (0.12 + t * 0.28).toFixed(2); // 0.12 → 0.40

  return `drop-shadow(0 ${yOff}px ${blur}px rgba(0,0,0,${alpha}))`;
}

// ─── edge pressure → stroke 補正 ────────────────────────────────────────────
// bundle感: 高圧ノードに繋がる edge を微増
export function pressureToEdgeWidth(
  baseWidth: number,
  srcPressure: number,
  tgtPressure: number,
): number {
  const maxPressure = Math.max(srcPressure, tgtPressure);
  if (maxPressure < 0.35) return baseWidth;
  const boost = (maxPressure - 0.35) / 0.65 * 0.8; // 最大 +0.8px
  return parseFloat((baseWidth + boost).toFixed(2));
}

// ─── Orb 局所摩耗: 優勢メンバーによる偏り角度 ──────────────────────────────
// 一番担当が多いメンバーの id から角度を決定論的に生成
// → 「一方向だけ削れた」外観になる
export function computeWearAngle(
  members: { name: string; pieces_done: number }[] | undefined,
): number {
  if (!members || members.length === 0) return 0;
  const top  = members.reduce((a, b) => a.pieces_done >= b.pieces_done ? a : b, members[0]);
  // name から決定論的に角度を出す
  let h = 0;
  for (let i = 0; i < top.name.length; i++) h = Math.imul(h * 31 + top.name.charCodeAt(i), 1);
  return ((h >>> 0) % 360);
}
