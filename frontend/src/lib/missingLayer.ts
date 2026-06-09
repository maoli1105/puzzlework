/**
 * missingLayer — 欠損痕の計算
 * ─────────────────────────────
 * 「存在しないこと」をデータから読み取る。
 *
 * 伝えたいのはエラーではない。
 * 「ここ、まだ埋まってない」という構造の素直な状態。
 *
 * 表現方針：
 *   - アラートなし
 *   - アニメーションなし
 *   - 影の薄さ / ボーダーの透け / 弧の断絶 だけで感じさせる
 *   - 「存在しない」部分は描かない。あるべき場所が空くだけ。
 */

import { Piece, Connection } from '../types';

// ─── isolation マップ ──────────────────────────────────────────────────────────
export interface MissingMaps {
  /** pieceId → 孤立度 (0=つながっている, 1=完全孤立) */
  isolationMap: Record<string, number>;
}

export function computeMissingMaps(
  pieces: Piece[],
  connections: Connection[],
): MissingMaps {
  // 全ピースの接続数を集計
  const connCount: Record<string, number> = {};
  for (const p of pieces) connCount[p.id] = 0;
  for (const c of connections) {
    connCount[c.from_piece_id] = (connCount[c.from_piece_id] ?? 0) + 1;
    connCount[c.to_piece_id]   = (connCount[c.to_piece_id]   ?? 0) + 1;
  }

  // done / locked は孤立扱いしない（仕事が終わった後の静けさは問題ではない）
  const active = pieces.filter(p => p.status !== 'done' && p.status !== 'locked');
  const totalConns  = active.reduce((s, p) => s + (connCount[p.id] ?? 0), 0);
  const avgConn     = active.length > 0 ? totalConns / active.length : 1;

  const isolationMap: Record<string, number> = {};
  for (const p of pieces) {
    if (p.status === 'done' || p.status === 'locked') {
      isolationMap[p.id] = 0;
      continue;
    }
    const cnt = connCount[p.id] ?? 0;
    // cnt=0: 完全孤立 → 1.0
    // cnt >= avg*1.2: 十分に接続されている → 0
    isolationMap[p.id] = cnt === 0
      ? 1.0
      : Math.max(0, 1 - cnt / Math.max(1, avgConn * 1.2));
  }

  return { isolationMap };
}

// ─── isolation score → 視覚パラメータ ────────────────────────────────────────
// 「重さの消失」で孤立を表現する。
//  - 影が薄い   → 地面から浮いて見える
//  - ボーダーが透ける → 輪郭が定まっていない
//  - コンテンツが薄い → まだ生きていない
export interface IsolationVisual {
  /** 影アルファ乗数 (0.28–1.0): 孤立するほど影が薄い */
  shadowAlpha:  number;
  /** ボーダー stroke 透明度 (0.35–1.0) */
  borderAlpha:  number;
  /** コンテンツ opacity 乗数 (0.72–1.0) */
  contentAlpha: number;
}

export function isolationToVisual(score: number): IsolationVisual {
  if (score < 0.15) {
    return { shadowAlpha: 1, borderAlpha: 1, contentAlpha: 1 };
  }
  const t = (score - 0.15) / 0.85; // 0–1
  return {
    shadowAlpha:  parseFloat((1 - t * 0.72).toFixed(2)),  // 1.0 → 0.28
    borderAlpha:  parseFloat((1 - t * 0.55).toFixed(2)),  // 1.0 → 0.45
    contentAlpha: parseFloat((1 - t * 0.25).toFixed(2)),  // 1.0 → 0.75
  };
}

// ─── Orb の欠損: 活動痕の「断絶」を計算 ──────────────────────────────────────
// 孤立ピースの割合から「活動痕が途切れる弧の長さ」を返す。
// gapStartAngle: どの方向で途切れるか (0–359°, seeded)
export interface OrbGap {
  /** 欠損弧の割合 (0–1): ここだけ活動痕が繋がっていない */
  missingArcPct:  number;
  /** 欠損が始まる角度 (度) — 決定論的 */
  gapStartAngle:  number;
}

export function computeOrbGap(
  pieces: Piece[],
  isolationMap: Record<string, number>,
  seed: number,
): OrbGap {
  if (pieces.length === 0) return { missingArcPct: 0, gapStartAngle: 0 };

  const active          = pieces.filter(p => p.status !== 'done' && p.status !== 'locked');
  const isolatedCount   = active.filter(p => (isolationMap[p.id] ?? 0) > 0.5).length;
  const missingArcPct   = active.length > 0 ? isolatedCount / active.length : 0;

  // seeded 角度: seed → 決定論的な角度
  let h = seed ^ 0xdeadbeef;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = h ^ (h >>> 16);
  const gapStartAngle = (h >>> 0) % 360;

  return { missingArcPct, gapStartAngle };
}
