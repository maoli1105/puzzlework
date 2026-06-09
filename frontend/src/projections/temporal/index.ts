/**
 * Temporal Projection — pure function
 *
 * 「時間収束」を Canonical Data から計算する。
 * ReactFlow を import しない。UI state を持たない。
 *
 * Decisions accelerated:
 *   D-08 「今やるべきか後でやるべきか」
 *   D-09 「何を捨てるか」
 *   D-11 「どのリスクを許容するか」
 *   D-13 「この構造は時間的に成立しているか」
 */

import type { Piece, Connection, Project } from '../../types';
import type { TemporalProjection } from './types';

export type { TemporalProjection };

const MS_PER_DAY = 86_400_000;

export function computeTemporalProjection(
  pieces:      Piece[],
  connections: Connection[],
  projectMap:  Record<string, Project>,
  now = Date.now(),
): TemporalProjection {
  // ── 1. Deadline Gravity per piece ──────────────────────────────────────────
  const gravityMap: Record<string, number> = {};
  for (const p of pieces) {
    if (!p.due_date || p.status === 'done') { gravityMap[p.id] = 0; continue; }
    const daysLeft = (new Date(p.due_date).getTime() - now) / MS_PER_DAY;
    gravityMap[p.id] = daysLeft <= 0 ? 1.0 : Math.max(0.15, 1 - daysLeft / 30);
  }

  // ── 2. Critical Path: downstream size × depth (BFS per piece) ─────────────
  const adjForward: Record<string, string[]> = {};
  for (const c of connections) {
    (adjForward[c.from_piece_id] ??= []).push(c.to_piece_id);
  }

  const criticalityMap: Record<string, number> = {};
  for (const p of pieces) {
    const visited = new Set<string>([p.id]);
    const queue: string[] = [p.id];
    let depth = 0;
    while (queue.length > 0) {
      const next: string[] = [];
      for (const id of queue) {
        for (const child of (adjForward[id] ?? [])) {
          if (!visited.has(child)) {
            visited.add(child);
            next.push(child);
          }
        }
      }
      if (next.length > 0) depth++;
      queue.length = 0;
      for (const x of next) queue.push(x);
    }
    criticalityMap[p.id] = (visited.size - 1) * depth;
  }

  // ── 3. Future Residue per piece ────────────────────────────────────────────
  const residueMap: Record<string, number> = {};
  for (const p of pieces) {
    const blockedDeps = (adjForward[p.id] ?? [])
      .map(id => pieces.find(pp => pp.id === id))
      .filter(pp => pp?.status === 'locked').length;
    const staleDays   = p.status === 'locked' ? 3 : p.status === 'in_progress' ? 1 : 0;
    const repairCount = p.status === 'locked' ? 1 : 0;
    residueMap[p.id] = blockedDeps * 0.15 + staleDays * 0.02 + repairCount * 0.10;
  }

  // ── 4. Temporal Compression + Throughput per project ──────────────────────
  const pieceIdToStatus: Record<string, string> = {};
  for (const p of pieces) pieceIdToStatus[p.id] = p.status;

  const compressionMap: Record<string, number> = {};
  const throughputMap:  Record<string, number> = {};

  for (const pid of Object.keys(projectMap)) {
    const pp     = pieces.filter(p => p.project_id === pid);
    const pidSet = new Set(pp.map(p => p.id));
    const done   = pp.filter(p => p.status === 'done').length;

    const dueDays = pp
      .filter(p => p.due_date && p.status !== 'done')
      .map(p => (new Date(p.due_date!).getTime() - now) / MS_PER_DAY);
    const minDays        = dueDays.length > 0 ? Math.max(1, Math.min(...dueDays)) : 30;
    const completionRate = (done / Math.max(1, pp.length)) * 0.15;
    compressionMap[pid]  = (pp.length - done) / Math.max(1, minDays) / Math.max(0.05, completionRate);

    let projConnTotal = 0, completedEdges = 0;
    for (const c of connections) {
      if (!pidSet.has(c.from_piece_id) || !pidSet.has(c.to_piece_id)) continue;
      projConnTotal++;
      if (pieceIdToStatus[c.from_piece_id] === 'done' && pieceIdToStatus[c.to_piece_id] === 'done') {
        completedEdges++;
      }
    }
    throughputMap[pid] = completedEdges / Math.max(1, projConnTotal);
  }

  return { gravityMap, criticalityMap, residueMap, compressionMap, throughputMap };
}
