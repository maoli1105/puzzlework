/**
 * presenceLayer — 場の存在感を計算
 * ──────────────────────────────────
 * 「人が関わっている場所」の空気を作る。
 *
 * 仕組み:
 *   各ピースが背後に「存在痕」の aura を放つ。
 *   単体では見えない opacity (0.02–0.04)。
 *   密集すると重なって初めて「ここに何かある」になる。
 *
 *   これは演出ではない。
 *   机に手の油が積もるのと同じ物理現象。
 *
 * 入力: piece の状態 + freshness + isolation
 * 出力: aura の半径・opacity・色相
 *
 * 設計原則:
 *   - アニメーションなし
 *   - GPU ゼロ (radial-gradient div のみ)
 *   - 単体では知覚不可能
 *   - 重なりが密度を生む
 */

import type { PieceStatus } from '../types';

export interface PresenceAura {
  /** aura の半径 (px) — ピース中心からの距離 */
  radius:    number;
  /** opacity (0–0.05): 単体では知覚できないレベルに抑える */
  opacity:   number;
  /**
   * CSS color (aura の色相)
   * 暖/冷を使わない。neutral (slightly lighter than background) のみ。
   * 「場の質感」は色ではなく密度で表現する。
   */
  color:     string;
}

const AURA_COLOR = 'rgba(175, 182, 205, 1)';  // neutral-light, dark mode 前提

export function computePresenceAura(
  status:         PieceStatus,
  freshness:      number,
  isolationScore: number,
  connCount:      number,    // 接続数 (0以上)
  pieceH:         number,    // ピース高さ (px)
): PresenceAura {
  // done / locked は静かな存在感（仕事が終わった場所は「落ち着いた」感)
  if (status === 'done' || status === 'locked') {
    return {
      radius:  pieceH * 0.90,
      opacity: freshness > 0.4 ? 0.010 : 0.005,
      color:   AURA_COLOR,
    };
  }

  // 孤立しているピース: 存在感が薄い (空間に定着していない)
  if (isolationScore > 0.55) {
    return {
      radius:  pieceH * 0.70,
      opacity: Math.max(0.003, 0.012 * (1 - isolationScore)),
      color:   AURA_COLOR,
    };
  }

  // アクティブ + 新鮮: 最も存在感が強い
  // 接続数が多いほど aura が広がる (多くの人と繋がる場所は密度が高い)
  const connBoost  = Math.min(0.25, connCount * 0.06);
  const baseRadius = pieceH * (0.95 + connBoost + freshness * 0.30);

  // 高鮮度(最近触られた): 存在感が強い
  // 低鮮度(放置): 存在感が薄い
  const baseOpacity = freshness >= 0.75
    ? 0.032 + connBoost * 0.04
    : freshness >= 0.50
    ? 0.020 + connBoost * 0.03
    : 0.010 + connBoost * 0.02;

  return {
    radius:  Math.round(baseRadius),
    opacity: parseFloat(Math.min(0.048, baseOpacity).toFixed(4)),
    color:   AURA_COLOR,
  };
}

/**
 * board 全体の presence 質感スコア (0–1)
 * AtmosphereLayer への入力用。
 * 「この空間は生きているか」の単一指標。
 */
export function computeBoardPresenceScore(freshnesses: number[]): number {
  if (freshnesses.length === 0) return 0.3;
  const avg   = freshnesses.reduce((a, b) => a + b, 0) / freshnesses.length;
  const high  = freshnesses.filter(f => f > 0.65).length / freshnesses.length;
  // 平均鮮度 × 活発ピース割合で board-level presence を算出
  return Math.min(1, avg * 0.6 + high * 0.4);
}
