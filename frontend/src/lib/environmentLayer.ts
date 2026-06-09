/**
 * environmentLayer — 環境伝播
 * ──────────────────────────────
 * 「ここ」の見た目は「ここ自身」だけでは決まらない。
 * 周囲の状態が静かに滲み出てくる。
 *
 * 伝播の仕組み:
 *   接続グラフの 1ホップ内で品質が伝わる。
 *   force layout では構造的近傍 ≈ 空間的近傍なので、
 *   位置計算なしで「空間的影響」を表現できる。
 *
 * 非対称設計 (entropy の物理):
 *   劣化は改善より 1.5× 強い。
 *   整うのは時間がかかるが、崩れるのは早い。
 *
 * 絶対に出力しないもの:
 *   - ラベル / バッジ / 数値
 *   - 「ここが良い/悪い」の直接表現
 *   - アニメーション
 *   - 新しい視覚要素
 *
 * 出力するもの:
 *   - saturation の微修正 (±8–14%)
 *   - border stability の微修正 (±0.08–0.14)
 *   - ghost edge opacity の微調整
 */

import { Piece, Connection } from '../types';
import type { PatinaStyle } from './usagePatina';
import type { IsolationVisual } from './missingLayer';

// ─── 環境マップ ────────────────────────────────────────────────────────────────
export interface EnvironmentMaps {
  /**
   * pieceId → ambient quality (0=悪い周囲, 1=良い周囲)
   * 自分自身 + 1ホップ隣接の weighted average
   */
  ambientMap: Record<string, number>;

  /**
   * pieceId → raw quality (自分自身のみ, 伝播前)
   * 「環境デルタ」計算用
   */
  rawMap: Record<string, number>;
}

export function computeEnvironmentMaps(
  pieces:       Piece[],
  connections:  Connection[],
  freshnessMap: Record<string, number>,
  isolationMap: Record<string, number>,
  pressureMap:  Record<string, number>,
): EnvironmentMaps {
  // ── 隣接マップ ──────────────────────────────────────────────────────────
  const neighbors: Record<string, string[]> = {};
  for (const p of pieces) neighbors[p.id] = [];
  for (const c of connections) {
    neighbors[c.from_piece_id]?.push(c.to_piece_id);
    neighbors[c.to_piece_id]?.push(c.from_piece_id);
  }

  // ── 各ピースの raw quality ──────────────────────────────────────────────
  // 鮮度(0.45) + 孤立していない度(0.35) + 圧力の低さ(0.20)
  const rawMap: Record<string, number> = {};
  for (const p of pieces) {
    const f = freshnessMap[p.id] ?? 0.4;
    const i = isolationMap[p.id] ?? 0;
    const r = pressureMap[p.id] ?? 0;
    rawMap[p.id] = Math.max(0, Math.min(1, f * 0.45 + (1 - i) * 0.35 + (1 - r) * 0.20));
  }

  // ── 1-hop 伝播: 近傍品質を weight 0.28 で加算 ─────────────────────────
  // weight 0.28: 近傍5つで最大 1.4 の追加 → 自分(1.0)を超えない程度
  // 上限 5ホップ: ハブノードで over-smoothing しないよう cap
  const NEIGHBOR_W = 0.28;
  const MAX_NB     = 5;

  const ambientMap: Record<string, number> = {};
  for (const p of pieces) {
    const self  = rawMap[p.id] ?? 0.5;
    const nbIds = (neighbors[p.id] ?? []).slice(0, MAX_NB);

    if (nbIds.length === 0) {
      ambientMap[p.id] = self;
      continue;
    }

    const nbSum  = nbIds.reduce((s, id) => s + (rawMap[id] ?? 0.4), 0);
    const totalW = 1.0 + nbIds.length * NEIGHBOR_W;
    ambientMap[p.id] = Math.max(0, Math.min(1,
      (self + nbSum * NEIGHBOR_W) / totalW
    ));
  }

  return { ambientMap, rawMap };
}

// ─── 環境デルタ ───────────────────────────────────────────────────────────────
// 正 = 周囲が自分より良い（引き上げられる）
// 負 = 周囲が自分より悪い（引き下げられる）
function envDelta(ambient: number, raw: number): number {
  return ambient - raw;
}

// ─── patina への環境影響 ──────────────────────────────────────────────────────
// saturation / brightness が周囲品質に引きずられる。
// 良い環境の近く: 彩度が少し上がる
// 悪い環境の近く: 彩度が少し落ちる（"うっすら埃っぽい"）
export function applyEnvironmentToPatina(
  patina:         PatinaStyle,
  ambientQuality: number,
  rawQuality:     number,
): PatinaStyle {
  const delta = envDelta(ambientQuality, rawQuality);
  if (Math.abs(delta) < 0.06) return patina;  // 差が小さければ無視

  // 非対称: 劣化(delta<0)は改善(delta>0)の 1.5×
  const satAdj = delta > 0
    ? Math.min(delta * 9, 8)    // max +8%
    : Math.max(delta * 14, -12); // max -12%
  const briAdj = delta > 0
    ? Math.min(delta * 3, 3)
    : Math.max(delta * 5, -5);

  return {
    ...patina,
    saturation: Math.round(Math.max(25, Math.min(100, patina.saturation + satAdj))),
    brightness: Math.round(Math.max(72, Math.min(100, patina.brightness + briAdj))),
  };
}

// ─── isolation visual への環境影響 ───────────────────────────────────────────
// border alpha が周囲品質に引きずられる。
// 良い環境の近く: 輪郭が少し安定する
// 悪い環境の近く: 輪郭が少し曖昧になる
export function applyEnvironmentToIsolation(
  isolation:      IsolationVisual,
  ambientQuality: number,
  rawQuality:     number,
): IsolationVisual {
  const delta = envDelta(ambientQuality, rawQuality);
  if (Math.abs(delta) < 0.07) return isolation;

  // 非対称
  const borderAdj = delta > 0
    ? Math.min(delta * 0.10, 0.08)   // max +0.08
    : Math.max(delta * 0.16, -0.13); // max -0.13

  return {
    ...isolation,
    borderAlpha: Math.max(0.25, Math.min(1, isolation.borderAlpha + borderAdj)),
  };
}

// ─── ghost edge opacity 乗数 ──────────────────────────────────────────────────
// 整った環境では ghost edge が控えめになる
// 放置された環境では ghost edge が少し強くなる
// → 「整った領域近辺では ghost edge が減る」
export function ghostEdgeEnvMultiplier(
  srcAmbient: number,
  tgtAmbient: number,
): number {
  const avg = (srcAmbient + tgtAmbient) / 2;
  // 0.60 (good: 60% opacity) → 1.15 (poor: 115% opacity)
  return parseFloat((1.15 - avg * 0.55).toFixed(3));
}
