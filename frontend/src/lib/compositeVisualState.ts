/**
 * compositeVisualState — 視覚状態の一元合成
 * ──────────────────────────────────────────────────────────────────────
 * 「PieceNode が知るべきものを最小化する」ための圧縮層。
 *
 * 全レイヤー（patina → role → environment → memory → residue）の合成を
 * ここ一箇所に集約し、PieceNode には最終的な描画値のみを渡す。
 *
 * PieceNode は「何故そうなっているか」を知らない。
 * 「どう描けばいいか」だけを知る。
 *
 * 出力 (PieceVisuals):
 *   CSS filter 用: saturation, brightness
 *   opacity 用:   baseOpacity, contentAlpha
 *   border 用:    borderAlpha, shadowAlpha, borderWarm
 *   shadow 用:    dropShadow (CSS string | undefined)
 *   aura 用:      auraRadius, auraOpacity, auraColor
 *   ground 用:    groundRadius, groundOpacity, groundColor
 *                 ──「ピース body の下を滲む定着感」
 *                 単体では知覚不可能。隣接ピースとの積層でのみ空白に差が生まれる。
 *
 * Temporal Settling（時間沈降）:
 *   変化速度の非対称性をスコア計算の中に埋め込む。
 *   毎フレームのアニメーションではなく、state 計算時の「慣性」。
 *
 *   定着クッション: familiarity が高いピースは freshness 低下に対して抵抗力を持つ。
 *     「長く使われた場所は、少し放置されても急には冷えない。」
 *   新生遅延:      newborn が高いピースは ground field への反映が遅い。
 *     「まだ床に定着していない。」
 *   静域蓄積遅延:  scatter が低い間は cool zone が弱い。
 *     「静域は急には生まれない。長期孤立でゆっくり空間が冷える。」
 *   再活性化非対称: brightness は freshness に委ね、saturation のみ過去の痕跡を保持する。
 *     「使われ始めた」より「まだ馴染み切っていない」。
 *
 * 設計原則:
 *   - 新しい視覚要素を生成しない
 *   - アニメーションを定義しない
 *   - レイヤー名・思想は外に漏らさない
 */

import { Piece } from '../types';
import type { PersonRoleSignature } from './roleMorphLayer';
import { computePatinaStyle } from './usagePatina';
import { pressureToShadow } from './concentrationScore';
import { isolationToVisual } from './missingLayer';
import { applyRoleToIsolation, applyRoleToPatina, applyRoleToPressure } from './roleMorphLayer';
import { computePresenceAura } from './presenceLayer';
import { applyEnvironmentToPatina, applyEnvironmentToIsolation } from './environmentLayer';
import { applyMemoryToPatina, applyMemoryToIsolation } from './memoryLayer';

// ─── ピースのレイアウト高さ (presence aura 計算用) ───────────────────────────
// PieceNode: H=132, TAB=20 → SVG_H=152
const PIECE_SVG_H = 152;

// ─── 最終視覚状態 ─────────────────────────────────────────────────────────────
export interface PieceVisuals {
  // CSS filter
  saturation:    number;             // 42–100
  brightness:    number;             // 82–100

  // 全体 opacity (patina base)
  baseOpacity:   number;             // 0.60–1.0

  // border 装飾
  borderWarm:    boolean;            // 最近触られた痕跡: 温かい stroke 色
  borderAlpha:   number;             // 0.25–1.0: 輪郭の定かさ
  shadowAlpha:   number;             // 0.28–1.0: 影の重さ
  contentAlpha:  number;             // 0.70–1.0: 内容の透明度

  // 圧力影
  dropShadow:    string | undefined; // pressureToShadow の出力 CSS

  // 存在感アーラ
  auraRadius:    number;             // px
  auraOpacity:   number;
  auraColor:     string;

  // 地面定着場 (Field Architecture)
  // ピース body の z-index 背面に描画する楕円形の「床の染み」。
  // 空白域でピース間がオーバーラップしたとき初めて密度差が現れる。
  // 単体 max opacity: ~0.028 (肉眼ではほぼ知覚できない)
  groundRadius:  number;             // px (楕円の水平半径)
  groundOpacity: number;             // 0–0.028
  groundColor:   string;             // warm ochre | cool slate | transparent
}

// ─── 中間スコアを受け取るシンプルな型 ────────────────────────────────────────
export interface PieceScores {
  freshness:   number;                     // 0–1
  connCount:   number;                     // 接続数
  pressure:    number;                     // 0–1: 使用圧
  isolation:   number;                     // 0–1: 構造的孤立度
  role:        PersonRoleSignature | null; // 担当者の構造作用
  ambient:     number;                     // 0–1: 近傍環境品質
  rawQuality:  number;                     // 0–1: 自分自身の品質
  familiarity: number;                     // 0–1: 熟成度
  scatter:     number;                     // 0–1: 散乱度
  newborn:     number;                     // 0–1: 新生度
  reactivated: boolean;                    // 完了後に再活性化
  spatialResidue: number;                  // 0–1: 長期滞在圧
}

// ─── 地面定着場 ───────────────────────────────────────────────────────────────
// 「場の建築」: ピース間の空白の質を既存パラメータだけで変える。
//
// 暖域 (warm ochre): familiarity × spatialResidue → 定着した空間が床を染める
//   Temporal Settling: newborn が高いほど暖域の表出が遅い。
//   「床に定着するには時間がかかる。新しいピースはまだ場に馴染んでいない。」
//
// 静域 (cool slate): isolation が蓄積した場所 → 静かに冷えた空白
//   Temporal Settling: scatter が低い間は cool zone を抑制する。
//   「静域は急には生まれない。長期孤立がゆっくり空間を冷やす。」
//
// 設計制約:
//   - アニメーションなし
//   - max opacity 0.028 (単体では知覚不可)
//   - 積層効果のみで場の差を作る
function computeGroundField(
  familiarity:    number,  // 0–1: 能動的関与×時間
  spatialResidue: number,  // 0–1: 長期滞在圧
  isolation:      number,  // 0–1: 構造的孤立度
  scatter:        number,  // 0–1: 停滞期間 → 静域の蓄積速度をゲート
  newborn:        number,  // 0–1: 新生度 → 暖域の定着速度をゲート
): { groundRadius: number; groundOpacity: number; groundColor: string } {

  // ── 暖域: 新生ピースは地面に馴染むまで時間がかかる ──────────────────────
  // newbornGate: 0.16 (day 0) → 1.0 (day 21+)
  // 「まだ床に定着していない」状態を、暖域の弱さで表現する。
  const newbornGate = Math.max(0.16, 1 - newborn * 0.84);

  // 定着感 = 熟成度 + 空間残留、孤立で減衰、新生ゲート適用
  const warmth = (familiarity * 0.65 + spatialResidue * 0.35)
    * Math.max(0, 1 - isolation * 0.60)
    * newbornGate;

  // ── 静域: scatter が低い間は cool zone を抑制する ──────────────────────
  // quietGate: 0.14 (scatter=0, 放置直後) → 1.0 (scatter=1, 35日停滞)
  // 「放置したばかりの場所はまだ静まっていない。長期孤立でゆっくり冷える。」
  const quietGate = 0.14 + scatter * 0.86;

  // 静けさ = 孤立が 0.35 を超えた部分 × 蓄積速度ゲート
  const quiet = Math.max(0, (isolation - 0.35) / 0.65) * quietGate;

  // 暖域が支配的な場合
  if (warmth > 0.09 && warmth >= quiet * 1.25) {
    const r = Math.round(72 + warmth * 132);   // 72–204 px
    const a = parseFloat((warmth * 0.028).toFixed(4));
    return { groundRadius: r, groundOpacity: a, groundColor: 'rgba(194,154,108,1)' };
  }

  // 静域が支配的な場合
  if (quiet > 0.06) {
    const r = Math.round(55 + quiet * 72);     // 55–127 px
    const a = parseFloat((quiet * 0.018).toFixed(4));
    return { groundRadius: r, groundOpacity: a, groundColor: 'rgba(148,163,184,1)' };
  }

  return { groundRadius: 0, groundOpacity: 0, groundColor: 'transparent' };
}

// ─── 一元合成関数 ─────────────────────────────────────────────────────────────
export function computePieceVisuals(
  piece:  Piece,
  scores: PieceScores,
): PieceVisuals {
  const {
    freshness, connCount, pressure, isolation,
    role, ambient, rawQuality,
    familiarity, scatter, newborn,
    reactivated, spatialResidue,
  } = scores;

  const roleSignature = role?.role    ?? 'neutral';
  const roleIntensity = role?.intensity ?? 0;

  // ── Temporal Settling: 定着クッション ───────────────────────────────────────
  // 現実では「傷はすぐつくが、馴染みは時間がかかる」。
  // 高 familiarity のピースは freshness が落ちても急には見た目が劣化しない。
  // この「慣性」を state 計算段階で吸収する（毎フレームのアニメーションではない）。
  //
  // floor  = 熟成度が高いほど freshness の"底"が上がる
  //          familiarity=0 → floor=0 (慣性なし)
  //          familiarity=0.8 → floor=0.48 (freshness が 0.48 以下には急降下しない)
  //
  // inertia = floor への引き戻し係数
  //          familiarity=0.8 → inertia=0.44 → 実際の低下を44%緩和
  //
  // 結果: 長期定着ピースは「放置されてもしばらく質感を保つ」
  //       新規ピース(familiarity=0)は即座に freshness の変化を反映する
  const freshnessFloor  = familiarity * 0.60;
  const freshnessInertia = familiarity * 0.44;
  const visualFreshness = freshness < freshnessFloor
    ? freshness + (freshnessFloor - freshness) * freshnessInertia
    : freshness;

  // ── patina パイプライン (visualFreshness を使用) ─────────────────────────
  const base     = computePatinaStyle(visualFreshness);   // ← was: freshness
  const withRole = applyRoleToPatina(base, roleSignature, roleIntensity);
  const withEnv  = applyEnvironmentToPatina(withRole, ambient, rawQuality);
  const withMem  = applyMemoryToPatina(withEnv, familiarity, scatter, newborn);

  // ── 再活性化: brightness / saturation の非対称回復 ─────────────────────────
  // brightness は freshness に委ねる（高鮮度なら自然に明るくなる）。
  // saturation のみ過去の痕跡を保持する。
  // 「使われ始めた」より「まだ馴染み切っていない」という感触。
  const saturation = reactivated
    ? Math.max(42, withMem.saturation - 5)   // sat: 過去の痕跡として持続
    : Math.max(42, withMem.saturation);
  const brightness = Math.max(82, withMem.brightness);    // bri: reactivated の影響なし

  // ── isolation パイプライン ────────────────────────────────────────────────
  const isoBase  = isolationToVisual(isolation);
  const isoRole  = applyRoleToIsolation(isoBase, roleSignature, roleIntensity);
  const isoEnv   = applyEnvironmentToIsolation(isoRole, ambient, rawQuality);
  const isoMem   = applyMemoryToIsolation(isoEnv, familiarity, scatter, newborn);

  // 再活性化: border がまだ再定着していない
  const borderAlpha  = reactivated
    ? Math.max(0.25, isoMem.borderAlpha - 0.04)
    : isoMem.borderAlpha;
  const shadowAlpha  = isoMem.shadowAlpha;
  const contentAlpha = isoMem.contentAlpha;

  // ── 使用圧 shadow ────────────────────────────────────────────────────────
  const effectivePressure = applyRoleToPressure(pressure, roleSignature, roleIntensity);
  const dropShadow = pressureToShadow(effectivePressure);

  // ── presence aura ────────────────────────────────────────────────────────
  // 時間慣性: spatialWeight も visualFreshness を使用する。
  // 定着した場所は実際の freshness が下がっても presence を維持しやすい。
  const spatialWeight = Math.max(visualFreshness, spatialResidue * 0.55);  // ← was: freshness
  const aura = computePresenceAura(piece.status, spatialWeight, isolation, connCount, PIECE_SVG_H);

  // ── ground field (場の建築 + 時間沈降) ───────────────────────────────────
  // scatter → 静域蓄積速度ゲート (急には冷えない)
  // newborn → 暖域定着速度ゲート (急には馴染まない)
  const ground = computeGroundField(familiarity, spatialResidue, isolation, scatter, newborn);

  return {
    saturation,
    brightness,
    baseOpacity:   withMem.opacity,
    borderWarm:    withMem.borderWarm,
    borderAlpha,
    shadowAlpha,
    contentAlpha,
    dropShadow,
    auraRadius:    aura.radius,
    auraOpacity:   aura.opacity,
    auraColor:     aura.color,
    groundRadius:  ground.groundRadius,
    groundOpacity: ground.groundOpacity,
    groundColor:   ground.groundColor,
  };
}
