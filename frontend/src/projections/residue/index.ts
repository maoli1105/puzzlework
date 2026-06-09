/**
 * Residue Projection Engine — pure function
 *
 * ResidueNote[] → ResidueProjection
 * React を import しない。UI state を持たない。
 */

import type { ResidueNote, ResidueProjection } from './types';

export type { ResidueNote, ResidueType, ResidueProjection } from './types';

export function computeResidueProjection(residues: ResidueNote[]): ResidueProjection {
  if (residues.length === 0) {
    return {
      compressedContext:  [],
      unresolvedResidue:  [],
      cautionLevel:       'none',
      handoffClarity:     'none',
      all:                [],
    };
  }

  // 新しい順に並べ直す
  const sorted = [...residues].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // ── compressedContext: handoff > decision > insight の優先度で最大3件 ──
  const priority: ResidueNote['type'][] = ['handoff', 'decision', 'insight'];
  const compressedContext: ResidueNote[] = [];
  for (const t of priority) {
    const found = sorted.find(r => r.type === t && !compressedContext.includes(r));
    if (found) compressedContext.push(found);
    if (compressedContext.length >= 3) break;
  }
  // 3件に満たなければ新しい順で補完
  for (const r of sorted) {
    if (compressedContext.length >= 3) break;
    if (!compressedContext.includes(r)) compressedContext.push(r);
  }

  // ── unresolvedResidue: blocker / uncertainty / caution ──
  const unresolvedTypes: ResidueNote['type'][] = ['blocker', 'uncertainty', 'caution'];
  const unresolvedResidue = sorted.filter(r => unresolvedTypes.includes(r.type));

  // ── cautionLevel ──
  const blockerCount   = sorted.filter(r => r.type === 'blocker').length;
  const cautionCount   = sorted.filter(r => r.type === 'caution' || r.type === 'uncertainty').length;
  let cautionLevel: ResidueProjection['cautionLevel'];
  if (blockerCount >= 1 || cautionCount >= 3) {
    cautionLevel = 'high';
  } else if (cautionCount >= 1) {
    cautionLevel = 'low';
  } else {
    cautionLevel = 'none';
  }

  // ── handoffClarity ──
  const handoffNotes  = sorted.filter(r => r.type === 'handoff');
  const decisionNotes = sorted.filter(r => r.type === 'decision');
  let handoffClarity: ResidueProjection['handoffClarity'];
  if (handoffNotes.length >= 1 && decisionNotes.length >= 1) {
    handoffClarity = 'clear';
  } else if (handoffNotes.length >= 1 || decisionNotes.length >= 1) {
    handoffClarity = 'partial';
  } else {
    handoffClarity = 'none';
  }

  return { compressedContext, unresolvedResidue, cautionLevel, handoffClarity, all: sorted };
}
