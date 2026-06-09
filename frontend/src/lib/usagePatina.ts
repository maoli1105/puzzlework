/**
 * usagePatina — 使用痕の計算
 * ────────────────────────────
 * 仕事が「実際に存在していた痕跡」をデータから計算する。
 * アニメーションではない。時間が蓄積された物体の状態。
 *
 * Piece が持つデータ:
 *   created_at    — 作られた日
 *   started_at    — 着手された日
 *   completed_at  — 完了した日
 *   progress      — 進捗 0–100
 *   status        — locked / ready / in_progress / done
 *
 * これだけで「いつ最後に触れられたか」「どれくらい使われたか」が分かる。
 */

import { Piece, PieceStatus } from '../types';

type FreshnessInput = Pick<Piece,
  'status' | 'progress' | 'created_at' | 'started_at' | 'completed_at'
>;

// ─── Freshness (0.0 = 冷たい・放置, 1.0 = 今日触られた) ────────────────────
export function computeFreshness(piece: FreshnessInput): number {
  const now  = Date.now();
  const days = (ms: number) => (now - ms) / 86_400_000;

  switch (piece.status as PieceStatus) {
    case 'done': {
      if (!piece.completed_at) return 0.25;
      const d = days(new Date(piece.completed_at).getTime());
      // 完了後: 3週間かけてゆっくり褪色
      return Math.max(0.18, 1 - d / 21);
    }

    case 'in_progress': {
      if (!piece.started_at) return 0.55;
      const d = days(new Date(piece.started_at).getTime());
      // 着手日から日数経過 + progress で補正
      // 「30日経過で progress 5%」 → 明らかに停滞 → low freshness
      // 「30日経過で progress 90%」 → 継続活動中 → medium freshness
      const progressFactor = (piece.progress ?? 0) / 100;
      const ageFactor      = Math.max(0, 1 - d / 18);
      return Math.max(0.25, ageFactor * 0.55 + progressFactor * 0.45);
    }

    case 'ready': {
      const d = days(new Date(piece.created_at).getTime());
      // ready は「準備ができているが未着手」- 長く放置されるほど褪色
      return Math.max(0.20, 0.75 - d / 16);
    }

    case 'locked': {
      const d = days(new Date(piece.created_at).getTime());
      // locked = 待機状態。時間経過で「埃をかぶる」
      return Math.max(0.10, 0.50 - d / 25);
    }

    default:
      return 0.40;
  }
}

// ─── Patina ビジュアルパラメータ ─────────────────────────────────────────────
export interface PatinaStyle {
  saturation:  number;  // % (100=normal, 40=faded)
  brightness:  number;  // % (100=normal, 80=dim)
  warmShift:   number;  // 0–1: 温もりシフト (高=最近使われた暖かさ)
  opacity:     number;  // 0–1
  borderWarm:  boolean; // true: ほぼ今日触られた
}

export function computePatinaStyle(freshness: number): PatinaStyle {
  // 0.0 = 完全に放置, 1.0 = 今日

  const saturation = freshness >= 0.85
    ? 100                             // very fresh: フル彩度
    : freshness >= 0.6
    ? 100 - (0.85 - freshness) * 80   // 0.6–0.85: 徐々に落ちる
    : 32 + freshness * 100;           // 0–0.6: かなり褪色

  const brightness = freshness >= 0.7
    ? 100
    : 78 + freshness * 31;            // 0–0.7: 暗くなる

  const warmShift = Math.max(0, freshness - 0.75) * 4;  // 0.75以上で温もりが出始める

  const opacity = freshness >= 0.5
    ? 1
    : 0.65 + freshness * 0.7;         // 0.5未満: 少し透ける

  const borderWarm = freshness >= 0.88;

  return {
    saturation:  Math.round(Math.max(25, Math.min(100, saturation))),
    brightness:  Math.round(Math.max(72, Math.min(100, brightness))),
    warmShift,
    opacity:     parseFloat(Math.max(0.5, Math.min(1, opacity)).toFixed(2)),
    borderWarm,
  };
}

// ─── 接続線 freshness: source ピースの状態から推定 ──────────────────────────
// Connection には timestamp がないため、接続先のピース状態で代替
export function computeEdgeFreshness(
  srcPiece: Piece | undefined,
  tgtPiece: Piece | undefined,
): number {
  const srcF = srcPiece ? computeFreshness(srcPiece) : 0.35;
  const tgtF = tgtPiece ? computeFreshness(tgtPiece) : 0.35;
  // 接続線は「より新鮮な方」を採用（活発な側に引っ張られる）
  return Math.max(srcF, tgtF);
}

// ─── Orb の使用痕レイヤー計算 ───────────────────────────────────────────────
export interface OrbPatina {
  activityArcPct:  number;  // 0–1: 最近活動した割合（アニメーションなしの静的弧）
  avgFreshness:    number;  // 0–1: Orb全体の鮮度
  stalePct:        number;  // 0–1: 長期放置ピースの割合
}

export function computeOrbPatina(pieces: Piece[]): OrbPatina {
  if (pieces.length === 0) return { activityArcPct: 0, avgFreshness: 0.3, stalePct: 1 };

  const freshnesses = pieces.map(computeFreshness);
  const avgFreshness = freshnesses.reduce((a, b) => a + b, 0) / freshnesses.length;

  // 「最近活動した」= in_progress or 14日以内の done
  const now = Date.now();
  const recentlyActive = pieces.filter(p => {
    if (p.status === 'in_progress') return true;
    if (p.status === 'done' && p.completed_at) {
      const days = (now - new Date(p.completed_at).getTime()) / 86_400_000;
      return days <= 14;
    }
    return false;
  }).length;

  const stale = pieces.filter(p => computeFreshness(p) < 0.35).length;

  return {
    activityArcPct: recentlyActive / pieces.length,
    avgFreshness,
    stalePct:       stale / pieces.length,
  };
}
