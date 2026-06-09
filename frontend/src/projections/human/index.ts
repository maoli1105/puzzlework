/**
 * Human Projection — pure function
 *
 * 「誰が何を持ち、誰に聞くか」を Canonical Data から計算する。
 * ReactFlow を import しない。UI state を持たない。
 *
 * Decisions accelerated:
 *   D-03 「誰に聞くか」 → 5 秒
 *   D-05 「誰が持つか」 → 5 秒
 */

import type { Piece, Connection, Project } from '../../types';
import type { HumanProjection, WorkerMetric } from './types';

export type { HumanProjection, WorkerMetric };
export type { LoadState } from './types';

export function computeHumanProjection(
  pieces:     Piece[],
  connections: Connection[],
  workerMap:  Record<string, { name: string }>,
  projectMap: Record<string, Project>,
): HumanProjection {
  const now = Date.now();
  const metrics: Record<string, WorkerMetric> = {};

  for (const wid of Object.keys(workerMap)) {
    const wp         = pieces.filter(p => p.assignee_id === wid);
    const inProgress = wp.filter(p => p.status === 'in_progress');
    const locked     = wp.filter(p => p.status === 'locked');
    const stale      = inProgress.filter(p =>
      p.started_at && (now - new Date(p.started_at).getTime()) > 7 * 86_400_000
    );
    const recentDone = wp.filter(p =>
      p.completed_at && (now - new Date(p.completed_at).getTime()) < 48 * 3600_000
    );

    const loadScore = Math.min(1,
      inProgress.length  * 0.25
      + locked.length    * 0.10
      + stale.length     * 0.15
      - recentDone.length * 0.12
    );
    const loadState: WorkerMetric['loadState'] =
      loadScore < 0.30 ? 'available' :
      loadScore < 0.65 ? 'busy' : 'deep_focus';

    // 孤立判定: 他担当者との cross-worker edge が存在しない
    const hasCross = connections.some(c => {
      const sp = pieces.find(p => p.id === c.from_piece_id);
      const tp = pieces.find(p => p.id === c.to_piece_id);
      return sp && tp && (
        (sp.assignee_id === wid && tp.assignee_id && tp.assignee_id !== wid) ||
        (tp.assignee_id === wid && sp.assignee_id && sp.assignee_id !== wid)
      );
    });

    // Project Composition
    const projWeight: Record<string, number> = {};
    let totalW = 0;
    for (const p of wp) {
      if (!p.project_id || p.status === 'done') continue;
      const w = p.status === 'locked' ? 1.2 : p.status === 'in_progress' ? 1.0 : 0.5;
      projWeight[p.project_id] = (projWeight[p.project_id] ?? 0) + w;
      totalW += w;
    }
    const projectComposition: WorkerMetric['projectComposition'] =
      totalW > 0
        ? Object.entries(projWeight)
            .map(([pid, w]) => ({
              projectId: pid,
              color:     projectMap[pid]?.color ?? '#94a3b8',
              ratio:     w / totalW,
            }))
            .sort((a, b) => b.ratio - a.ratio)
        : [];

    metrics[wid] = {
      loadScore,
      loadState,
      isIsolated:         !hasCross,
      topProjectId:       projectComposition[0]?.projectId ?? null,
      projectComposition,
    };
  }

  // KCS per project
  const kcsMap: Record<string, boolean> = {};
  for (const pid of Object.keys(projectMap)) {
    const projPieces = pieces.filter(p => p.project_id === pid && p.status !== 'done');
    if (projPieces.length === 0) continue;
    const assigneeCounts: Record<string, number> = {};
    for (const p of projPieces) {
      if (p.assignee_id) assigneeCounts[p.assignee_id] = (assigneeCounts[p.assignee_id] ?? 0) + 1;
    }
    const topCount = Math.max(0, ...Object.values(assigneeCounts));
    kcsMap[pid] = topCount / projPieces.length > 0.70;
  }

  return { metrics, kcsMap };
}
