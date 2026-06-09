/**
 * Workshop Projection — pure function
 *
 * 「今日の工房」を Canonical Data から計算する。
 * ReactFlow を import しない。UI state を持たない。
 *
 * Decisions accelerated:
 *   D-W01 「今、自分が最初に触るべきものは何か」
 *   D-W02 「何が詰まっているか」
 *   D-W03 「次に誰へ渡すか」
 *   D-W04 「この仕事はなぜ存在するか」  ← Narrative hook に委譲
 *   D-W05 「今の仕事で、自分は何が伸びるか」
 */

import type { Piece, Connection } from '../../types/index';
import type {
  WorkshopProjection,
  HeroPiece, HeroPieceReason,
  ContextRailItem,
  RepairShelfItem,
  GrowthCandidate,
  NextHandoff,
} from './types';

export type { WorkshopProjection } from './types';

const DAY_MS = 86_400_000;

// ── Hero Score ────────────────────────────────────────────────────────────

function deadlineGravity(piece: Piece, now: number): number {
  if (!piece.due_date) return 0.15;
  const daysLeft = (new Date(piece.due_date).getTime() - now) / DAY_MS;
  return daysLeft <= 0 ? 1.0 : Math.max(0.15, 1 - daysLeft / 30);
}

function heroScore(
  piece: Piece,
  downstreamCount: number,
  now: number,
): number {
  const urgency          = piece.status === 'in_progress' ? 1.0 : 0.6;
  const downstreamImpact = Math.min(downstreamCount / 5, 1);
  const gravity          = deadlineGravity(piece, now);
  // progress 20–80 = 活発に動いている
  const prog = piece.progress ?? 0;
  const momentum = prog >= 20 && prog <= 80 ? 0.8 : 0.4;

  return (
    urgency          * 0.35 +
    downstreamImpact * 0.30 +
    gravity          * 0.25 +
    momentum         * 0.10
  );
}

function heroReason(piece: Piece, gravity: number): HeroPieceReason {
  if (gravity >= 0.7)                        return 'deadline';
  if (piece.status === 'in_progress')        return 'in_progress';
  return 'ready';
}

// ── BFS downstream count ─────────────────────────────────────────────────

function countDownstream(
  pieceId: string,
  downMap: Map<string, string[]>,
  limit = 10,
): number {
  const visited = new Set<string>();
  const queue   = [pieceId];
  while (queue.length > 0 && visited.size < limit) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);
    for (const next of (downMap.get(cur) ?? [])) queue.push(next);
  }
  return visited.size - 1; // self を除く
}

// ── Main ─────────────────────────────────────────────────────────────────

export function computeWorkshopProjection(
  myPieces:     Piece[],    // このワーカーに割り当て済み
  allPieces:    Piece[],    // 会社全体
  connections:  Connection[],
  userId:       string,
  userSkillTags: string[],
  now = Date.now(),
): WorkshopProjection {

  // ── グラフ構築 ─────────────────────────────────────────────────
  const downMap = new Map<string, string[]>();
  const upMap   = new Map<string, string[]>();
  for (const p of allPieces) {
    if (!downMap.has(p.id)) downMap.set(p.id, []);
    if (!upMap.has(p.id))   upMap.set(p.id, []);
  }
  for (const c of connections) {
    downMap.get(c.from_piece_id)?.push(c.to_piece_id);
    upMap.get(c.to_piece_id)?.push(c.from_piece_id);
  }

  const allPieceMap = new Map(allPieces.map(p => [p.id, p]));

  // ── Layer 1: Hero Piece ───────────────────────────────────────
  const candidates = myPieces.filter(
    p => p.status === 'in_progress' || p.status === 'ready'
  );

  let heroPiece: HeroPiece | null = null;
  let bestScore = -1;

  for (const p of candidates) {
    const dc    = countDownstream(p.id, downMap);
    const score = heroScore(p, dc, now);
    if (score > bestScore) {
      bestScore = score;
      const gravity = deadlineGravity(p, now);
      heroPiece = { piece: p, score, reason: heroReason(p, gravity) };
    }
  }

  // ── Layer 2: Context Rail ──────────────────────────────────────
  const contextRail: ContextRailItem[] = [];

  if (heroPiece) {
    const hid = heroPiece.piece.id;

    // upstream チェーン（最大3ホップ）
    const upChain: Piece[] = [];
    let cur: string | undefined = (upMap.get(hid) ?? [])[0];
    while (cur && upChain.length < 3) {
      const p = allPieceMap.get(cur);
      if (!p) break;
      upChain.unshift(p);
      cur = (upMap.get(cur) ?? [])[0];
    }
    upChain.forEach((p, i) =>
      contextRail.push({ piece: p, role: 'upstream', depth: -(upChain.length - i) })
    );

    // self
    contextRail.push({ piece: heroPiece.piece, role: 'self', depth: 0 });

    // downstream チェーン（最大5ホップ）
    let downCur: string | undefined = (downMap.get(hid) ?? [])[0];
    let depth = 1;
    while (downCur && depth <= 5) {
      const p = allPieceMap.get(downCur);
      if (!p) break;
      contextRail.push({ piece: p, role: 'downstream', depth });
      downCur = (downMap.get(downCur) ?? [])[0];
      depth++;
    }
  }

  // ── Layer 3: Repair Shelf ─────────────────────────────────────
  const repairShelf: RepairShelfItem[] = [];

  for (const p of myPieces) {
    if (p.status === 'done') continue;

    if (p.status === 'in_progress' && p.started_at) {
      const staleDays = Math.floor((now - new Date(p.started_at).getTime()) / DAY_MS);
      if (staleDays > 14) {
        repairShelf.push({ piece: p, issue: 'stale', staleDays });
        continue;
      }
    }

    if (p.status === 'locked') {
      // 上流が locked → upstream_blocked、それ以外は locked
      const upstreams = (upMap.get(p.id) ?? [])
        .map(id => allPieceMap.get(id))
        .filter(Boolean) as Piece[];
      const blockedByUpstream = upstreams.some(u => u.status === 'locked');
      repairShelf.push({
        piece: p,
        issue: blockedByUpstream ? 'upstream_blocked' : 'locked',
        staleDays: 0,
      });
    }
  }

  repairShelf.sort((a, b) => {
    const order: Record<string, number> = { stale: 0, locked: 1, upstream_blocked: 2 };
    return (order[a.issue] ?? 9) - (order[b.issue] ?? 9);
  });

  // ── Layer 5: Growth Candidates ────────────────────────────────
  const growthCandidates: GrowthCandidate[] = [];
  const myProjectIds = new Set(myPieces.map(p => p.project_id).filter(Boolean));
  const userSkillSet = new Set(userSkillTags);

  const eligible = allPieces.filter(p =>
    p.assignee_id !== userId &&
    (p.status === 'ready' || p.status === 'locked') &&
    p.id !== heroPiece?.piece.id
  );

  for (const p of eligible) {
    if (growthCandidates.length >= 4) break;

    const skillOverlap = p.skill_tags.filter(t => userSkillSet.has(t)).length;
    const isNewProject = p.project_id !== null && !myProjectIds.has(p.project_id);

    let reason: GrowthCandidate['reason'] | null = null;
    let matchScore = 0;

    if (skillOverlap > 0) {
      reason     = 'skill_match';
      matchScore = Math.min(skillOverlap / Math.max(p.skill_tags.length, 1), 1);
    } else if (isNewProject) {
      reason     = 'new_project';
      matchScore = 0.4;
    }

    if (reason) growthCandidates.push({ piece: p, reason, matchScore });
  }

  growthCandidates.sort((a, b) => b.matchScore - a.matchScore);

  // ── Layer 6: Next Handoff ──────────────────────────────────────
  let nextHandoff: NextHandoff | null = null;

  if (heroPiece) {
    const hid = heroPiece.piece.id;
    const downstreamIds = downMap.get(hid) ?? [];
    const downPiece     = allPieceMap.get(downstreamIds[0] ?? '');

    if (downPiece) {
      // 下流への上流のうち、自分以外がまだ locked の数
      const otherUpstreams = (upMap.get(downPiece.id) ?? []).filter(id => id !== hid);
      const residueCount   = otherUpstreams.filter(id => {
        const p = allPieceMap.get(id);
        return p && p.status !== 'done';
      }).length;

      const isMissingContext =
        !downPiece.objective?.trim() ||
        downPiece.objective.trim().length < 10;

      nextHandoff = {
        downstreamPiece:  downPiece,
        assigneeId:       downPiece.assignee_id,
        isMissingContext,
        residueCount,
      };
    }
  }

  return { heroPiece, contextRail, repairShelf, growthCandidates, nextHandoff };
}
