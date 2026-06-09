import { useMemo } from 'react';
import { computeCognitivePressure } from './index';
import type { CognitivePressure } from './types';
import type { HeroPiece, RepairShelfItem, GrowthCandidate, NextHandoff, ContextRailItem } from '../workshop/types';

export type { CognitivePressure } from './types';

export function useCognitivePressure(params: {
  heroPiece:            HeroPiece | null;
  repairShelf:          RepairShelfItem[];
  growthCandidates:     GrowthCandidate[];
  nextHandoff:          NextHandoff | null;
  contextRailItems:     ContextRailItem[];
  narrativeLastEvent:   string | null;
  narrativeHasIssues:   boolean;
  narrativeHasPatterns: boolean;
  temporalUrgency:      number;
}): CognitivePressure {
  return useMemo(
    () => computeCognitivePressure({ ...params, now: Date.now() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      params.heroPiece?.piece.id,
      params.heroPiece?.piece.status,
      params.heroPiece?.piece.progress,
      params.repairShelf.length,
      params.growthCandidates.length,
      params.nextHandoff?.downstreamPiece.id,
      params.contextRailItems.length,
      params.narrativeLastEvent,
      params.narrativeHasIssues,
      params.narrativeHasPatterns,
      params.temporalUrgency,
    ],
  );
}
