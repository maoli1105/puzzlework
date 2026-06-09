/**
 * Repair Projection — pure function
 *
 * 「何を捨てるか・何を修復するか」を Canonical Data から計算する。
 * ReactFlow を import しない。UI state を持たない。
 *
 * Decisions accelerated:
 *   D-09 「何を捨てるか」
 *   D-11 「どのリスクを許容するか」
 */

import type { Piece, Connection } from '../../types';
import type { RepairProjection, StopCandidate, RepairLoop } from './types';

export type { RepairProjection, StopCandidate, RepairLoop } from './types';

const DAY_MS = 86_400_000;

export function computeRepairProjection(
  pieces:      Piece[],
  connections: Connection[],
  now = Date.now(),
): RepairProjection {
  const downstreamSet: Record<string, Set<string>> = {};
  for (const p of pieces) downstreamSet[p.id] = new Set();
  for (const c of connections) downstreamSet[c.from_piece_id]?.add(c.to_piece_id);

  const upstreamLocked = new Set<string>();
  for (const c of connections) {
    const src = pieces.find(p => p.id === c.from_piece_id);
    if (src?.status === 'locked') upstreamLocked.add(c.to_piece_id);
  }

  // ── Stop Candidates ────────────────────────────────────────────────────────
  const stopCandidates: StopCandidate[] = [];

  for (const p of pieces) {
    if (p.status === 'done') continue;

    const ageMs = now - new Date(p.created_at).getTime();

    // no_progress: 14日+ in_progress で完了しない
    if (p.status === 'in_progress' && p.started_at) {
      const inProgressMs = now - new Date(p.started_at).getTime();
      if (inProgressMs > 14 * DAY_MS) {
        stopCandidates.push({
          pieceId: p.id, pieceTitle: p.title,
          reason: 'no_progress',
          severity: Math.min(1, (inProgressMs - 14 * DAY_MS) / (30 * DAY_MS) * 0.8 + 0.2),
        });
        continue;
      }
    }

    // no_downstream: 孤立 in_progress / ready (接続がない)
    if ((p.status === 'in_progress' || p.status === 'ready') &&
        downstreamSet[p.id]?.size === 0 &&
        !connections.some(c => c.to_piece_id === p.id)) {
      stopCandidates.push({
        pieceId: p.id, pieceTitle: p.title,
        reason: 'no_downstream',
        severity: 0.35,
      });
      continue;
    }

    // blocked_chain: 自分自身は locked だが下流も詰まっている
    if (p.status === 'locked' && downstreamSet[p.id]?.size > 0) {
      const blockedDown = [...downstreamSet[p.id]].filter(id =>
        pieces.find(pp => pp.id === id)?.status === 'locked'
      ).length;
      if (blockedDown > 0) {
        stopCandidates.push({
          pieceId: p.id, pieceTitle: p.title,
          reason: 'blocked_chain',
          severity: Math.min(1, blockedDown * 0.25 + 0.25),
        });
        continue;
      }
    }

    // unassigned_long: 14日+ unassigned で ready 以上
    if (!p.assignee_id && p.status !== 'locked' && ageMs > 14 * DAY_MS) {
      stopCandidates.push({
        pieceId: p.id, pieceTitle: p.title,
        reason: 'unassigned_long',
        severity: Math.min(1, (ageMs - 14 * DAY_MS) / (60 * DAY_MS) * 0.5 + 0.15),
      });
    }
  }

  stopCandidates.sort((a, b) => b.severity - a.severity);

  // ── Repair Loops ──────────────────────────────────────────────────────────
  // piece_logs なしでは近似不能。空配列を返す。
  // Narrative Projection が piece_logs を読んだとき、ここに移譲する。
  const repairLoops: RepairLoop[] = [];

  // ── Collapse Risk ─────────────────────────────────────────────────────────
  // isolated + deep_focus な worker = 崩壊リスク
  // ※ この判定は Human Projection が既に行うが、Repair Projection でも独立して保持する
  const assigneeLoad: Record<string, { locked: number; total: number }> = {};
  for (const p of pieces) {
    if (!p.assignee_id) continue;
    const entry = (assigneeLoad[p.assignee_id] ??= { locked: 0, total: 0 });
    entry.total++;
    if (p.status === 'locked') entry.locked++;
  }
  const collapseRisk = Object.entries(assigneeLoad)
    .filter(([, v]) => v.total > 0 && v.locked / v.total > 0.6)
    .map(([id]) => id);

  return { stopCandidates, repairLoops, collapseRisk };
}
