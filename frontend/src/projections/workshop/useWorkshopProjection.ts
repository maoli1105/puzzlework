import { useMemo } from 'react';
import type { Piece, Connection } from '../../types/index';
import { computeWorkshopProjection } from './index';
import type { WorkshopProjection } from './types';

export type { WorkshopProjection } from './types';

export function useWorkshopProjection(
  myPieces:     Piece[],
  allPieces:    Piece[],
  connections:  Connection[],
  userId:       string,
  userSkillTags: string[],
): WorkshopProjection {
  return useMemo(
    () => computeWorkshopProjection(myPieces, allPieces, connections, userId, userSkillTags),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myPieces, allPieces, connections, userId, userSkillTags.join(',')],
  );
}
