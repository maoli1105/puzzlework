/**
 * Cognitive Pressure Engine — pure function
 *
 * 「何を見せないか」を計算する。
 * ReactFlow を import しない。UI state を持たない。
 *
 * 出力が Workshop UI の密度と構造を決定する。
 */

import type { HeroPiece, RepairShelfItem, GrowthCandidate, NextHandoff, ContextRailItem } from '../workshop/types';
import type {
  CognitivePressure, LayerName, CollapseState, AttentionTier, DominantAction,
} from './types';

export type { CognitivePressure } from './types';

const HOUR_MS = 3_600_000;

// ── Helpers ───────────────────────────────────────────────────────────────

function hoursOld(iso: string | null, now: number): number {
  if (!iso) return Infinity;
  return (now - new Date(iso).getTime()) / HOUR_MS;
}

// ── Main ─────────────────────────────────────────────────────────────────

export function computeCognitivePressure(params: {
  heroPiece:            HeroPiece | null;
  repairShelf:          RepairShelfItem[];
  growthCandidates:     GrowthCandidate[];
  nextHandoff:          NextHandoff | null;
  contextRailItems:     ContextRailItem[];
  narrativeLastEvent:   string | null;   // ISO timestamp of newest event
  narrativeHasIssues:   boolean;
  narrativeHasPatterns: boolean;
  temporalUrgency:      number;           // hero の deadline gravity 0–1
  now:                  number;
}): CognitivePressure {
  const {
    heroPiece, repairShelf, growthCandidates, nextHandoff,
    contextRailItems, narrativeLastEvent, narrativeHasIssues,
    temporalUrgency, now,
  } = params;

  const repairCount  = repairShelf.length;
  const heroStatus   = heroPiece?.piece.status ?? 'none';
  const heroProgress = heroPiece?.piece.progress ?? 0;
  const hasHero      = !!heroPiece;

  // ── Quiet Mode ───────────────────────────────────────────────
  // 高負荷状態：緊急度 高 + 修復量 多、または長期停滞
  const staleHero = heroPiece?.piece.started_at
    ? (now - new Date(heroPiece.piece.started_at).getTime()) / (24 * HOUR_MS) > 21
    : false;
  const quietMode = (temporalUrgency > 0.75 && repairCount > 2) || staleHero;

  // ── Dominant Action ───────────────────────────────────────────
  let dominantAction: DominantAction;
  if (!hasHero) {
    dominantAction = 'rest';
  } else if (heroStatus === 'locked') {
    dominantAction = 'unblock';
  } else if (heroStatus === 'ready') {
    dominantAction = 'start';
  } else if (heroStatus === 'in_progress' && heroProgress >= 80) {
    dominantAction = 'done';
  } else if (heroStatus === 'in_progress') {
    dominantAction = 'progress';
  } else {
    dominantAction = 'rest';
  }

  // ── Narrative freshness ───────────────────────────────────────
  const narrativeAge = hoursOld(narrativeLastEvent, now);
  const narrativeFresh = narrativeAge < 24;

  // ── Collapse State ────────────────────────────────────────────
  function collapseOf(layer: LayerName): CollapseState {
    switch (layer) {
      case 'hero':
        return hasHero ? 'visible' : 'hidden';

      case 'contextRail':
        // upstream か downstream が1件以上あるときだけ表示
        return contextRailItems.filter(i => i.role !== 'self').length > 0
          ? 'visible'
          : 'hidden';

      case 'repair':
        if (repairCount === 0)   return 'hidden';
        if (repairCount >= 4)    return 'collapsed'; // 多すぎる修復は fold
        return 'visible';

      case 'narrative':
        // 24h 以内のイベント も OpenIssue もなければ fold
        if (!narrativeLastEvent) return 'hidden';
        if (!narrativeFresh && !narrativeHasIssues) return 'collapsed';
        return 'visible';

      case 'growth':
        if (!hasHero)                        return 'hidden';
        if (quietMode)                       return 'hidden';
        if (temporalUrgency > 0.5)           return 'collapsed';
        if (growthCandidates.length === 0)   return 'hidden';
        return 'visible';

      case 'handoff':
        if (!nextHandoff) return 'hidden';
        // context 欠損か residue あり → visible、それ以外は collapsed
        return (nextHandoff.isMissingContext || nextHandoff.residueCount > 0)
          ? 'visible'
          : 'collapsed';

      case 'queue':
        return 'visible'; // queue は常に表示（空なら呼び出し側が skip）
    }
  }

  const collapseState = {} as Record<LayerName, CollapseState>;
  const LAYERS: LayerName[] = ['hero','contextRail','repair','narrative','growth','handoff','queue'];
  for (const l of LAYERS) collapseState[l] = collapseOf(l);

  // ── Attention Weight 0–1 ──────────────────────────────────────
  const contextDepth = contextRailItems.filter(i => i.role !== 'self').length;
  const attentionWeightMap: Record<LayerName, number> = {
    hero:        1.0,
    contextRail: Math.min(1.0, contextDepth / 4) * 0.85,
    repair:      Math.min(1.0, repairCount / 3),
    narrative:   Math.min(1.0, Math.max(0.2,
                   (narrativeFresh ? 1.0 : 0.4) * (narrativeHasIssues ? 1.0 : 0.55)
                 )),
    growth:      Math.max(0, (1 - temporalUrgency) * 0.55),
    handoff:     nextHandoff
                   ? (nextHandoff.residueCount > 0 ? 0.88 : 0.45)
                   : 0,
    queue:       0.28,
  };

  // ── Attention Tier ────────────────────────────────────────────
  // primary ≥ 0.75 / secondary 0.40–0.74 / tertiary < 0.40
  function tierOf(layer: LayerName): AttentionTier {
    if (layer === 'hero') return 'primary';
    const w = attentionWeightMap[layer];
    if (w >= 0.75) return 'primary';
    if (w >= 0.40) return 'secondary';
    return 'tertiary';
  }

  const attentionTier = {} as Record<LayerName, AttentionTier>;
  for (const l of LAYERS) attentionTier[l] = tierOf(l);

  // repair が stale を含む場合は primary に引き上げ
  if (repairShelf.some(r => r.issue === 'stale')) {
    attentionTier.repair = 'primary';
  }
  // narrative に openIssue があれば secondary 以上に
  if (narrativeHasIssues && attentionTier.narrative === 'tertiary') {
    attentionTier.narrative = 'secondary';
  }

  return { dominantAction, collapseState, attentionTier, attentionWeightMap, quietMode };
}
