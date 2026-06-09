/**
 * memoryLayer — 時間の堆積
 * ──────────────────────────────────────────────────────────
 * 「長く使われた場所」「育った場所」「まだ馴染んでいない場所」を
 * 説明なしで感じられるようにする。
 *
 * 重要な区別:
 *   放置 ≠ 熟成
 *   熟成は能動的な関与の積層。放置はただの静止。
 *   「古い」は「馴染んでいる」を意味しない。
 *
 * 3軸:
 *   familiarityScore  — 熟成度。能動的関与×時間の積。接続維持が必要。
 *   scatterScore      — 散乱度。長期停滞の痕跡。「壊れた」ではなく"まだ散らかっている"。
 *   newbornScore      — 新生度。作られたばかり、まだ場に馴染まない。
 *
 * 絶対に出力しないもの:
 *   - ラベル / バッジ / 数値
 *   - タイムライン / 履歴UI
 *   - アニメーション
 *   - 「古い/新しい」の直接表現
 *
 * 出力するもの:
 *   - saturation の微修正 (±4–6%)
 *   - brightness の微修正 (±2–3%)
 *   - borderAlpha の微修正 (±0.05–0.07)
 *   - contentAlpha の微修正 (±0.02–0.03)
 */

import { Piece, Connection } from '../types';
import type { PatinaStyle } from './usagePatina';
import type { IsolationVisual } from './missingLayer';

// ─── スコアマップ ─────────────────────────────────────────────────────────────
export interface MemoryMaps {
  /**
   * pieceId → familiarity (0=新生/放置, 1=熟成)
   * 能動的関与 × 時間 × 接続維持 の積
   */
  familiarityMap: Record<string, number>;

  /**
   * pieceId → scatter (0=安定, 1=散乱)
   * in_progress が長期化し、完了に至らない停滞の痕跡
   */
  scatterMap: Record<string, number>;

  /**
   * pieceId → newborn (0=既存, 1=生まれたばかり)
   * 3週間かけて線形に 0 へ収束
   */
  newbornMap: Record<string, number>;
}

export function computeMemoryMaps(
  pieces:      Piece[],
  _connections: Connection[],   // 将来の接続変化履歴に備えて保持
  isolationMap: Record<string, number>,
): MemoryMaps {
  const NOW = Date.now();
  const DAY = 86_400_000;

  const familiarityMap: Record<string, number> = {};
  const scatterMap:     Record<string, number> = {};
  const newbornMap:     Record<string, number> = {};

  for (const p of pieces) {
    // ── 基本時間軸 ────────────────────────────────────────────────────────
    const pieceAgeDays     = (NOW - new Date(p.created_at).getTime()) / DAY;
    const startedDaysAgo   = p.started_at
      ? (NOW - new Date(p.started_at).getTime()) / DAY : null;
    const completedDaysAgo = p.completed_at
      ? (NOW - new Date(p.completed_at).getTime()) / DAY : null;

    // 実作業期間: started → completed の日数
    const workDuration = (startedDaysAgo !== null && completedDaysAgo !== null)
      ? startedDaysAgo - completedDaysAgo
      : null;

    // 停滞期間: in_progress のまま完了していない日数
    const stalledDays = (p.status === 'in_progress' && startedDaysAgo !== null)
      ? startedDaysAgo : null;

    // 期日超過: 完了していないのに期日を過ぎた状態
    // 「乾き」として scatter に統合する。赤バーは使わない。
    const isOverdue = p.due_date !== null
      && p.status !== 'done'
      && new Date(p.due_date).getTime() < NOW;

    const isoScore = isolationMap[p.id] ?? 0;

    // ── 熟成度 (familiarity) ───────────────────────────────────────────────
    // 実作業があるほど熟成が進む (3週間 = 満熟)
    // 開始はしたが未完了: ごく小さな信用
    const maturation = workDuration !== null
      ? Math.min(workDuration / 21, 1.0)
      : startedDaysAgo !== null ? 0.12 : 0;

    // 時間的な重さ: 2ヶ月で満杯
    const longevity = Math.min(pieceAgeDays / 60, 1.0);

    // 孤立は熟成を阻む (放置 ≠ 熟成)
    // 高孤立度 → 熟成の恩恵を70%カット
    const isolationPenalty = isoScore * 0.70;

    const engaged = maturation * 0.60 + longevity * 0.40;
    familiarityMap[p.id] = Math.max(0, Math.min(1,
      engaged * (1 - isolationPenalty)
    ));

    // ── 散乱度 (scatter) ──────────────────────────────────────────────────
    // 35日間停滞 = 満散乱
    // 期日超過 → 追加で +0.28 (乾き。赤バーの代わりに素材感として表現)
    // done/locked ピースは散乱なし
    const stalledScatter = stalledDays !== null ? Math.min(stalledDays / 35, 1.0) : 0;
    const overdueBoost   = isOverdue ? 0.28 : 0;
    scatterMap[p.id] = Math.min(1, stalledScatter + overdueBoost);

    // ── 新生度 (newborn) ──────────────────────────────────────────────────
    // 21日かけて線形にフェード。生後3週間は「まだ場に馴染まない」
    newbornMap[p.id] = pieceAgeDays < 21
      ? 1 - pieceAgeDays / 21
      : 0;
  }

  return { familiarityMap, scatterMap, newbornMap };
}

// ─── patina への記憶影響 ──────────────────────────────────────────────────────
//
// 熟成した空間: 少し彩度が増す (使い込まれた革の豊かさ)
// 新生の空間:   少し淡い、まだ染まっていない感
// 散乱した空間: 少し褪せる (整理されていない埃っぽさ)
//
export function applyMemoryToPatina(
  patina:      PatinaStyle,
  familiarity: number,
  scatter:     number,
  newborn:     number,
): PatinaStyle {
  // 熟成 (familiarity 0.5 以上から効果が乗り始める)
  const famEffect = Math.max(0, (familiarity - 0.5) * 2);  // 0–1
  const famSatAdj = famEffect * 6;   // max +6%
  const famBriAdj = -famEffect * 2;  // max −2%

  // 新生 (まだ染まっていない、少し浮いている)
  const newSatAdj = -newborn * 4;    // max −4%
  const newBriAdj = newborn * 2;     // max +2%

  // 散乱 (まだ散らかっている感 — 「壊れた」ではない)
  const scatSatAdj = -scatter * 5;   // max −5%
  const scatBriAdj = scatter * 1.5;  // max +1.5%

  const totalSat = famSatAdj + newSatAdj + scatSatAdj;
  const totalBri = famBriAdj + newBriAdj + scatBriAdj;

  // 変化が微小ならスキップ
  if (Math.abs(totalSat) < 0.8 && Math.abs(totalBri) < 0.8) return patina;

  return {
    ...patina,
    saturation: Math.round(Math.max(25, Math.min(100, patina.saturation + totalSat))),
    brightness: Math.round(Math.max(72, Math.min(100, patina.brightness + totalBri))),
  };
}

// ─── isolation visual への記憶影響 ───────────────────────────────────────────
//
// 熟成した空間: 輪郭が落ち着く (確信のある線)
// 新生の空間:   輪郭が少し頼りない (まだ定まっていない)
// 散乱した空間: 輪郭がわずかに不安定
//
export function applyMemoryToIsolation(
  isolation:   IsolationVisual,
  familiarity: number,
  scatter:     number,
  newborn:     number,
): IsolationVisual {
  // 熟成: border が少し安定し、content が少し存在感を増す
  const famEffect     = Math.max(0, (familiarity - 0.5) * 2);
  const famBorderAdj  = famEffect * 0.07;   // max +0.07
  const famContentAdj = famEffect * 0.03;   // max +0.03

  // 新生: border が少し頼りない
  const newBorderAdj  = -newborn * 0.06;   // max −0.06
  const newContentAdj = -newborn * 0.03;   // max −0.03

  // 散乱: border がわずかに揺らぐ
  const scatBorderAdj = -scatter * 0.05;   // max −0.05

  const totalBorder  = famBorderAdj + newBorderAdj + scatBorderAdj;
  const totalContent = famContentAdj + newContentAdj;

  if (Math.abs(totalBorder) < 0.012 && Math.abs(totalContent) < 0.012) return isolation;

  return {
    ...isolation,
    borderAlpha:  Math.max(0.25, Math.min(1, isolation.borderAlpha  + totalBorder)),
    contentAlpha: Math.max(0.70, Math.min(1, isolation.contentAlpha + totalContent)),
  };
}
