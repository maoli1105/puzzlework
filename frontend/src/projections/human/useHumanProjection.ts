/**
 * useHumanProjection — React hook
 *
 * Board / Workshop / People Space など、任意の UI から
 * 同じ Human Projection を再利用できる。
 */

import { useMemo } from 'react';
import type { Piece, Connection, Project } from '../../types';
import { computeHumanProjection } from './index';
import type { HumanProjection } from './types';

export function useHumanProjection(
  pieces:     Piece[],
  connections: Connection[],
  workerMap:  Record<string, { name: string }>,
  projectMap: Record<string, Project>,
): HumanProjection {
  return useMemo(
    () => computeHumanProjection(pieces, connections, workerMap, projectMap),
    [pieces, connections, workerMap, projectMap],
  );
}
