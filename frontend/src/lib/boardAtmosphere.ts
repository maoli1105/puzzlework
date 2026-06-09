/**
 * Board Atmosphere System
 * ──────────────────────
 * ピースの状態からボード全体の「空気感」を計算する。
 * 派手にしない。気づかないけど、生きている。
 */

import { Piece } from '../types';

export interface AtmosphereState {
  warmth:         number;  // 0–100: 低=停滞/冷, 高=活発/暖
  vitality:       number;  // 0–100: 仕事の流れの活発さ
  isStuck:        boolean; // true = 動いているピースが何もない
  breathDuration: number;  // 呼吸周期 (秒)
}

export function computeAtmosphere(pieces: Piece[]): AtmosphereState {
  if (pieces.length === 0) {
    return { warmth: 40, vitality: 0, isStuck: false, breathDuration: 4 };
  }

  const total       = pieces.length;
  const done        = pieces.filter(p => p.status === 'done').length;
  const inProgress  = pieces.filter(p => p.status === 'in_progress').length;
  const locked      = pieces.filter(p => p.status === 'locked').length;

  const now = new Date();
  const overdue = pieces.filter(p => {
    if (p.status === 'done') return false;
    if (!p.due_date) return false;
    return new Date(p.due_date) < now;
  }).length;

  // Warmth: 完成率・進行中の比率でベースを作り、期限超過で冷やす
  const completionScore = (done / total) * 45;
  const activityScore   = (inProgress / total) * 40;
  const overduepenalty  = (overdue / total) * 25;
  const lockedPenalty   = (locked / total) * 10;

  const warmth = Math.round(
    completionScore + activityScore - overduepenalty - lockedPenalty + 15 // baseline 15
  );

  // Vitality: 今動いている仕事の濃さ
  const vitality = Math.round((inProgress / total) * 100);

  const isStuck = inProgress === 0 && done === 0;

  // 呼吸周期: 健康なほど深くゆっくり (3s–5s)。停滞時は浅く早い (2s)
  const breathDuration = isStuck
    ? 2
    : 3 + (Math.max(0, Math.min(100, warmth)) / 100) * 2;

  return {
    warmth:         Math.max(0, Math.min(100, warmth)),
    vitality:       Math.max(0, Math.min(100, vitality)),
    isStuck,
    breathDuration,
  };
}

/**
 * warmth (0–100) をダークモード用の HSL 背景色に変換
 *
 * 修復前後で「空気が変わる」感覚を出すために、
 * 冷域（warmth < 35）と暖域（warmth >= 35）で色相帯を分ける。
 *
 * cold  (warmth≈5):  hsl(216, 6%,  6%) — 鋼青、停滞した組織
 * mid   (warmth≈30): hsl(224, 8%,  7%) — 中性ダーク
 * warm  (warmth≈50): hsl(38,  9%,  8%) — 琥珀ブラウン、流れが戻った
 * hot   (warmth≈85): hsl(30,  13%, 10%)— アンバー、過負荷の熱
 *
 * hueShift: WorkspaceIdentity.atmosphereHueShift を加算する。
 *   SaaS (+8)         → より暖色側にシフト
 *   Manufacturing (-12)→ より寒色側にシフト
 */
export function warmthToDarkColor(warmth: number, hueShift: number = 0): string {
  const w = Math.max(0, Math.min(100, warmth));
  let hue: number, sat: number, lum: number;

  if (w < 35) {
    // 冷域: 鋼青〜中性ダーク
    const t = w / 35;
    hue = 215 + t * 10;       // 215 → 225
    sat =   5 + t *  4;       //   5 →   9%
    lum =   6 + t *  1.5;     //   6 →   7.5%
  } else {
    // 暖域: 緑を避けて一気に琥珀へ
    const t = (w - 35) / 65;
    hue = 42 - t * 14;        //  42 →  28
    sat =  7 + t *  6;        //   7 →  13%
    lum =  7 + t *  3;        //   7 →  10%
  }

  return `hsl(${(hue + hueShift).toFixed(1)}, ${sat.toFixed(1)}%, ${lum.toFixed(1)}%)`;
}

/**
 * warmth をライトモード用の HSL 背景色に変換
 *
 * cold  (warmth≈5):  hsl(216, 4%,  93%) — 冷青みがかった白
 * warm  (warmth≈50): hsl(38,  7%,  95%) — 極薄クリーム
 * hot   (warmth≈85): hsl(30,  12%, 96%) — 温かいベージュ
 */
export function warmthToLightColor(warmth: number, hueShift: number = 0): string {
  const w = Math.max(0, Math.min(100, warmth));
  let hue: number, sat: number, lum: number;

  if (w < 35) {
    const t = w / 35;
    hue = 215 + t * 10;
    sat =   4 + t *  3;       //  4 →  7%
    lum =  93 + t *  1;       // 93 → 94%
  } else {
    const t = (w - 35) / 65;
    hue =  42 - t * 14;
    sat =   6 + t *  6;       //  6 → 12%
    lum =  94 + t *  2;       // 94 → 96%
  }

  return `hsl(${(hue + hueShift).toFixed(1)}, ${sat.toFixed(1)}%, ${lum.toFixed(1)}%)`;
}
