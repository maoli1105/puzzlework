import { useMemo } from 'react';
import type { Piece, Connection } from '../../types';
import { computeRepairProjection } from './index';
import type { RepairProjection } from './types';

export function useRepairProjection(
  pieces:      Piece[],
  connections: Connection[],
): RepairProjection {
  return useMemo(
    () => computeRepairProjection(pieces, connections),
    [pieces, connections],
  );
}
