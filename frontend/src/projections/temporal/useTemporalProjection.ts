import { useMemo } from 'react';
import type { Piece, Connection, Project } from '../../types';
import { computeTemporalProjection } from './index';
import type { TemporalProjection } from './types';

export function useTemporalProjection(
  pieces:      Piece[],
  connections: Connection[],
  projectMap:  Record<string, Project>,
): TemporalProjection {
  return useMemo(
    () => computeTemporalProjection(pieces, connections, projectMap),
    [pieces, connections, projectMap],
  );
}
