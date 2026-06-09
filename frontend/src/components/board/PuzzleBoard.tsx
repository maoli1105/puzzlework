// ============================================================
// Puzzle Board v2 — Project Islands + Cascade Glow
// ─ プロジェクト島：同プロジェクトのピースが色付き背景で囲まれる
// ─ カスケードグロー：locked上流ピースの下流をオレンジ発光
// ─ 位置を localStorage に永続保存
// ─ Left/Right ハンドル（ジグソーのタブ方向）
// ─ ドラッグ接続 → sequential デフォルト
// ─ ノード右クリック：ステータス変更
// ─ エッジ右クリック：タイプ変更 / 削除
// ─ ダブルクリック：ステータスサイクル
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  Connection as RFConnection,
  NodeChange,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  NodeMouseHandler,
  EdgeMouseHandler,
  ConnectionLineType,
  MarkerType,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position,
  useViewport,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Piece, Connection, Project, PieceStatus, User, RemoteCursor } from '../../types';
import { pieces as pieceApi, projects as projectApi, users as usersApi } from '../../services/api';
import { usePieces } from '../../hooks/usePieces';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useToast, ToastContainer } from '../common/Toast';
import { WSEvent } from '../../types';
import PieceNode, { PIECE_NODE_W, PIECE_NODE_H, SharedPieceDefs, piecePath } from './PieceNode';
import PieceNodeV2, { PIECE_NODE_V2_W, PIECE_NODE_V2_H } from './PieceNodeV2';
// v2 jigsaw interlock: ボディ幅/高さでピッチを刻むとタブがピタッと噛み合う
const V2_W_BODY = PIECE_NODE_V2_W - 13;  // 203: 右タブ分を引いたボディ幅
const V2_H_BODY = PIECE_NODE_V2_H - 13;  // 139: 下タブ分を引いたボディ高さ

// ── マグネットグループ検出 ────────────────────────────────────────────────────
// 物理的に密着（インターロック位置に揃っている）ピースをBFSで収集する。
// SNAP_TOL: 「噛み合っている」とみなすピクセル誤差
const MAGNET_SNAP_TOL = 6;
function findMagneticGroup(nodeId: string, nodes: Node[]): Set<string> {
  const posMap: Record<string, {x: number, y: number}> = {};
  for (const n of nodes) {
    if (n.type === 'piece') posMap[n.id] = n.position;
  }
  const group = new Set<string>([nodeId]);
  const queue = [nodeId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const pos = posMap[id];
    if (!pos) continue;
    for (const [otherId, otherPos] of Object.entries(posMap)) {
      if (group.has(otherId)) continue;
      const dx = Math.abs(otherPos.x - pos.x);
      const dy = Math.abs(otherPos.y - pos.y);
      const isH = Math.abs(dx - V2_W_BODY) < MAGNET_SNAP_TOL && dy < MAGNET_SNAP_TOL;
      const isV = dx < MAGNET_SNAP_TOL && Math.abs(dy - V2_H_BODY) < MAGNET_SNAP_TOL;
      if (isH || isV) { group.add(otherId); queue.push(otherId); }
    }
  }
  return group;
}
import PieceCreatePanel from './PieceCreatePanel';
import PieceDetailPanel from './PieceDetailPanel';
import GanttView from './GanttView';
import SprintPlannerPanel from './SprintPlannerPanel';
import WorkloadRingPanel from './WorkloadRingPanel';
import RemoteCursors from './RemoteCursors';
import TemplatePanel from './TemplatePanel';
import DashboardView from './DashboardView';
import { ConnectionType } from '../../types';
import { useAuthStore } from '../../store/authStore';
import CascadePanel from './CascadePanel';
import { AtmosphereLayer } from './AtmosphereLayer';
import { FlowEdge, FlowEdgeDefs } from './FlowEdge';
import { playSnapSound, playCompleteSound, playResonanceSound, initAudio } from '../../lib/soundDesign';
import { computeAtmosphere } from '../../lib/boardAtmosphere';
import { computeEdgeFreshness, computeFreshness } from '../../lib/usagePatina';
import { computeConcentrationMaps } from '../../lib/concentrationScore';
import { computeMissingMaps } from '../../lib/missingLayer';
import { computeBoardPresenceScore } from '../../lib/presenceLayer';
import { computeEnvironmentMaps } from '../../lib/environmentLayer';
import { computeMemoryMaps } from '../../lib/memoryLayer';
import { computePieceVisuals, type PieceVisuals } from '../../lib/compositeVisualState';
import { computeAffinityPairs } from '../../lib/affinityLayer';
import { detectArchetype, getIdentity } from '../../lib/workspaceIdentity';
import { GhostEdge } from './GhostEdge';
import { computeRoleSignatures, type PersonRoleSignature } from '../../lib/roleMorphLayer';
import { RepairDropZone } from './RepairDropZone';
import type { FocusCard } from './FocusStrip';
import type { StalledItem } from './RepairPulse';
import type { SessionMode } from './SessionBar';
// ── Projection Layer (PHASE 16) ───────────────────────────────────────────────
import { useHumanProjection } from '../../projections/human/useHumanProjection';
import { useTemporalProjection } from '../../projections/temporal/useTemporalProjection';
import { PALETTE_CLASSIC, PALETTE_COLOR } from '../../constants/projectColors';

// ─── Global styles ────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  .react-flow__node:hover .piece-handle { opacity: 0.85 !important; }
  .react-flow__node.selected .piece-handle { opacity: 0.85 !important; }
  .react-flow__handle.piece-handle:hover {
    opacity: 1 !important;
    box-shadow: 0 0 0 4px rgba(230,0,18,0.28) !important;
  }
  .react-flow__node[data-id^="island-"]:hover .react-flow__handle { opacity: 0.75 !important; }
  .react-flow__node[data-id^="island-"] .react-flow__handle:hover { opacity: 1 !important; }
  @keyframes bottleneck-flash {
    0%, 100% { opacity: 0.22; }
    50%       { opacity: 0.55; }
  }
  @keyframes magnetic-pulse {
    0%, 100% { opacity: 0.18; }
    50%       { opacity: 0.55; }
  }
  @keyframes cascade-glow {
    0%, 100% { opacity: 0.25; }
    50%       { opacity: 0.70; }
  }
  /* ── 完了時 spring アニメーション ── */
  .piece-spring-complete {
    animation: piece-spring-complete 800ms cubic-bezier(0.34,1.56,0.64,1) forwards !important;
  }
  @keyframes piece-spring-complete {
    0%   { transform: scale(1);    filter: none; }
    30%  { transform: scale(1.08); filter: drop-shadow(0 0 6px rgba(34,197,94,0.28)); }
    60%  { transform: scale(0.98); filter: drop-shadow(0 0 3px rgba(34,197,94,0.14)); }
    80%  { transform: scale(1.02); filter: none; }
    100% { transform: scale(1);    filter: none; }
  }

  /* ── 接続共鳴：周辺ピースが受け取る波紋 ── */
  .piece-resonating {
    animation: piece-resonating 700ms ease-out forwards !important;
  }
  @keyframes piece-resonating {
    0%   { transform: scale(1);    filter: none; }
    20%  { transform: scale(1.03); filter: drop-shadow(0 0 5px rgba(99,102,241,0.20)); }
    60%  { transform: scale(1.01); filter: drop-shadow(0 0 2px rgba(99,102,241,0.10)); }
    100% { transform: scale(1);    filter: none; }
  }

  /* ── ジグソーピース スナップ ── */
  @keyframes jig-snap {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.035); }
    70%  { transform: scale(0.992); }
    100% { transform: scale(1); }
  }
  .jig-snap {
    animation: jig-snap 220ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards !important;
  }

  /* ── in_progress ピースの呼吸 ── */
  @keyframes jig-breath {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.88; }
  }
  .piece-node-v2.in-progress .jig-outline {
    animation: jig-breath-stroke 2.8s ease-in-out infinite;
  }
  @keyframes jig-breath-stroke {
    0%, 100% { stroke-opacity: 0.70; }
    50%       { stroke-opacity: 0.90; }
  }
`;
function GlobalStyles() { return <style>{GLOBAL_CSS}</style>; }

// ─── Edge colors ──────────────────────────────────────────────────────────────
const EDGE_COLORS: Record<string, string> = {
  sequential:  '#94a3b8',  // slate-400 — 順序（静かな構造線）
  parallel:    '#93c5fd',  // blue-300  — 並列（淡い青）
  conditional: '#d4a574',  // soft amber — 条件分岐
  default:     '#cbd5e1',  // slate-300
};

// ─── Connection type Japanese labels ─────────────────────────────────────────
const CONN_TYPE_LABELS: Record<string, { short: string; desc: string }> = {
  sequential:  { short: '順序',    desc: '前のタスクが完了したら解放' },
  parallel:    { short: '並列',    desc: 'すべて完了したとき解放'     },
  conditional: { short: '条件分岐', desc: '条件を満たした場合に解放'   },
};

// ─── Status ───────────────────────────────────────────────────────────────────
const STATUS_CYCLE: Record<PieceStatus, PieceStatus> = {
  locked: 'ready', ready: 'in_progress', in_progress: 'done', done: 'locked',
};
const STATUS_LABELS: Record<PieceStatus, string> = {
  locked: 'ロック中', ready: '着手可能', in_progress: '進行中', done: '完了',
};

type ViewMode = 'flow' | 'bottleneck' | 'load' | 'archive' | 'journey' | 'temporal';
const VIEW_LABELS: Partial<Record<ViewMode, string>> = {
  flow: 'フロー', bottleneck: 'ボトルネック', load: '負荷',
};

// ─── localStorage ─────────────────────────────────────────────────────────────
const POSITIONS_KEY = 'pz_board_positions_v2';
function loadSavedPositions(): Record<string, { x: number; y: number }> {
  try { return JSON.parse(localStorage.getItem(POSITIONS_KEY) || '{}'); }
  catch { return {}; }
}
function persistPosition(id: string, pos: { x: number; y: number }) {
  try { const all = loadSavedPositions(); all[id] = pos; localStorage.setItem(POSITIONS_KEY, JSON.stringify(all)); }
  catch {}
}
function clearSavedPositions() { localStorage.removeItem(POSITIONS_KEY); }

// ─── BFS: connected pieces ────────────────────────────────────────────────────
function computeConnectedSet(nodeId: string, connections: Connection[]): Set<string> {
  const set = new Set<string>([nodeId]);
  const q   = [nodeId];
  while (q.length) {
    const id = q.shift()!;
    for (const c of connections) {
      if (c.from_piece_id === id && !set.has(c.to_piece_id))   { set.add(c.to_piece_id);   q.push(c.to_piece_id); }
      if (c.to_piece_id   === id && !set.has(c.from_piece_id)) { set.add(c.from_piece_id); q.push(c.from_piece_id); }
    }
  }
  return set;
}

// ─── Cascade blocked: pieces waiting on a locked upstream ────────────────────
function computeBlockedIds(pieces: Piece[], connections: Connection[]): Set<string> {
  const lockedIds = new Set(pieces.filter(p => p.status === 'locked').map(p => p.id));
  const blocked   = new Set<string>();
  for (const conn of connections) {
    if (lockedIds.has(conn.from_piece_id)) {
      const down = pieces.find(p => p.id === conn.to_piece_id);
      if (down && down.status !== 'done' && down.status !== 'in_progress') {
        blocked.add(conn.to_piece_id);
      }
    }
  }
  return blocked;
}

// ─── Auto-layout (topological sort, left→right) ───────────────────────────────
function autoLayout(pieces: Piece[], connections: Connection[]): Record<string, { x: number; y: number }> {
  const COL_GAP = PIECE_NODE_W + 90;
  const ROW_GAP = PIECE_NODE_H + 52;

  const inDegree: Record<string, number>   = {};
  const deps:     Record<string, string[]> = {};
  pieces.forEach(p => { inDegree[p.id] = 0; deps[p.id] = []; });
  connections.forEach(c => {
    inDegree[c.to_piece_id]   = (inDegree[c.to_piece_id]   ?? 0) + 1;
    deps[c.from_piece_id]     = [...(deps[c.from_piece_id] ?? []), c.to_piece_id];
  });

  const level: Record<string, number> = {};
  const queue = pieces.filter(p => inDegree[p.id] === 0).map(p => p.id);
  queue.forEach(id => { level[id] = 0; });
  while (queue.length) {
    const id = queue.shift()!;
    for (const dep of deps[id] ?? []) {
      level[dep] = Math.max(level[dep] ?? 0, (level[id] ?? 0) + 1);
      if (--inDegree[dep] === 0) queue.push(dep);
    }
  }

  const byLevel: Record<number, string[]> = {};
  pieces.forEach(p => { const lv = level[p.id] ?? 0; byLevel[lv] = [...(byLevel[lv] ?? []), p.id]; });

  const positions: Record<string, { x: number; y: number }> = {};
  for (const [lv, ids] of Object.entries(byLevel)) {
    const col    = parseInt(lv);
    const totalH = ids.length * ROW_GAP;
    ids.forEach((id, i) => {
      positions[id] = { x: col * COL_GAP + 60, y: i * ROW_GAP + 300 - totalH / 2 };
    });
  }
  return positions;
}

// ─── Critical Path (longest dependency chain) ────────────────────────────────
function computeCriticalPath(pieces: Piece[], connections: Connection[]): Set<string> {
  if (!connections.length) return new Set();
  const dist: Record<string, number> = {};
  const inDeg: Record<string, number> = {};
  const adj:   Record<string, string[]> = {};
  pieces.forEach(p => { dist[p.id] = 0; inDeg[p.id] = 0; adj[p.id] = []; });
  connections.forEach(c => {
    inDeg[c.to_piece_id] = (inDeg[c.to_piece_id] ?? 0) + 1;
    (adj[c.from_piece_id] = adj[c.from_piece_id] ?? []).push(c.to_piece_id);
  });
  const q = pieces.filter(p => inDeg[p.id] === 0).map(p => p.id);
  while (q.length) {
    const id = q.shift()!;
    for (const nxt of adj[id] ?? []) {
      dist[nxt] = Math.max(dist[nxt] ?? 0, (dist[id] ?? 0) + 1);
      if (--inDeg[nxt] === 0) q.push(nxt);
    }
  }
  const maxD = Math.max(...Object.values(dist), 0);
  if (maxD === 0) return new Set();
  const critical = new Set<string>();
  const back = (id: string) => {
    critical.add(id);
    for (const c of connections) {
      if (c.to_piece_id === id && (dist[c.from_piece_id] ?? 0) === (dist[id] ?? 0) - 1) back(c.from_piece_id);
    }
  };
  pieces.filter(p => (dist[p.id] ?? 0) === maxD).forEach(p => back(p.id));
  return critical;
}

// ─── Force-directed layout (Fruchterman-Reingold) ────────────────────────────
function forceDirectedLayout(
  pieces: Piece[],
  connections: Connection[],
  seed?: Record<string, { x: number; y: number }>,
  affinityPairs?: import('./../../lib/affinityLayer').AffinityPair[],
  assigneeGroups?: Record<string, string[]>,  // assigneeId → pieceIds (同一担当者スタック引力)
  temporalGravity?: Record<string, number>,   // PHASE 15: deadlineGravity per piece
): Record<string, { x: number; y: number }> {
  if (pieces.length === 0) return {};

  const CANVAS_W = 1800;
  const CANVAS_H = 1000;
  const k = Math.sqrt((CANVAS_W * CANVAS_H) / Math.max(pieces.length, 1)) * 1.4;

  // Initial positions: use seed (existing) or arrange in a circle
  const pos: Record<string, { x: number; y: number }> = {};
  pieces.forEach((p, i) => {
    if (seed?.[p.id]) {
      pos[p.id] = { ...seed[p.id] };
    } else {
      const angle = (i / pieces.length) * Math.PI * 2;
      pos[p.id] = {
        x: CANVAS_W / 2 + Math.cos(angle) * CANVAS_W * 0.35,
        y: CANVAS_H / 2 + Math.sin(angle) * CANVAS_H * 0.35,
      };
    }
  });

  const ITERS = 120;
  for (let iter = 0; iter < ITERS; iter++) {
    const disp: Record<string, { x: number; y: number }> = {};
    pieces.forEach(p => { disp[p.id] = { x: 0, y: 0 }; });

    // Repulsion between every pair — status scaling (Piece Stack System)
    // locked: 広く避ける(1.35x) — 停滞ピースは周囲から距離を置く
    // in_progress: 密に集まる(0.72x) — 動いているピースは引き寄せ合う
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const u = pieces[i].id; const v = pieces[j].id;
        const uScale = pieces[i].status === 'locked' ? 1.35
          : pieces[i].status === 'in_progress' ? 0.72 : 1.0;
        const vScale = pieces[j].status === 'locked' ? 1.35
          : pieces[j].status === 'in_progress' ? 0.72 : 1.0;
        const repScale = (uScale + vScale) / 2;
        const dx = pos[u].x - pos[v].x;
        const dy = pos[u].y - pos[v].y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const rep = (k * k) / d * repScale;
        disp[u].x += (dx / d) * rep;  disp[u].y += (dy / d) * rep;
        disp[v].x -= (dx / d) * rep;  disp[v].y -= (dy / d) * rep;
      }
    }

    // Attraction along edges
    // PHASE 15: deadline gravity > 0.7 → edge attraction +25% (dense clustering near deadline)
    for (const c of connections) {
      const u = c.from_piece_id; const v = c.to_piece_id;
      if (!pos[u] || !pos[v]) continue;
      const dx = pos[u].x - pos[v].x;
      const dy = pos[u].y - pos[v].y;
      const d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const gU = temporalGravity?.[u] ?? 0;
      const gV = temporalGravity?.[v] ?? 0;
      const gravBoost = (gU > 0.7 || gV > 0.7) ? 1.25 : 1.0;
      const att = (d * d) / k * gravBoost;
      disp[u].x -= (dx / d) * att;  disp[u].y -= (dy / d) * att;
      disp[v].x += (dx / d) * att;  disp[v].y += (dy / d) * att;
    }

    // 親和性による弱いスプリング引力 (実接続の 35% 強度)
    // 「繋がりやすいピース同士」が自然に近くに配置される
    for (const pair of (affinityPairs ?? [])) {
      const u = pair.pieceIdA; const v = pair.pieceIdB;
      if (!pos[u] || !pos[v]) continue;
      const dx = pos[u].x - pos[v].x;
      const dy = pos[u].y - pos[v].y;
      const d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const att = (d * d) / k * 0.35 * pair.score;
      disp[u].x -= (dx / d) * att;  disp[u].y -= (dy / d) * att;
      disp[v].x += (dx / d) * att;  disp[v].y += (dy / d) * att;
    }

    // 同一担当者スタック引力 (実接続の 15% 強度) — Piece Stack System
    // 「同じ人が持つ仕事は空間的に近く集まる」自然な群形成。
    // 近すぎる場合(d < k*0.4)は引力停止 → 重なり防止。
    if (assigneeGroups) {
      for (const pids of Object.values(assigneeGroups)) {
        for (let i = 0; i < pids.length; i++) {
          for (let j = i + 1; j < pids.length; j++) {
            const u = pids[i]; const v = pids[j];
            if (!pos[u] || !pos[v]) continue;
            const dx = pos[u].x - pos[v].x;
            const dy = pos[u].y - pos[v].y;
            const d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
            if (d < k * 0.4) continue;
            const att = (d * d) / k * 0.15;
            disp[u].x -= (dx / d) * att;  disp[u].y -= (dy / d) * att;
            disp[v].x += (dx / d) * att;  disp[v].y += (dy / d) * att;
          }
        }
      }
    }

    // Apply displacement with simulated annealing cooling
    const temp = 160 * Math.pow(1 - iter / ITERS, 1.5) + 5;
    for (const p of pieces) {
      const d   = disp[p.id];
      const len = Math.sqrt(d.x * d.x + d.y * d.y) || 0.01;
      const clamp = Math.min(len, temp);
      pos[p.id].x += (d.x / len) * clamp;
      pos[p.id].y += (d.y / len) * clamp;
    }
  }

  // Center result in canvas
  const xs = pieces.map(p => pos[p.id].x);
  const ys = pieces.map(p => pos[p.id].y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  pieces.forEach(p => {
    pos[p.id].x = pos[p.id].x - cx + CANVAS_W / 2;
    pos[p.id].y = pos[p.id].y - cy + CANVAS_H / 2;
  });

  return pos;
}

// ─── Journey Layout — 人の流れ中心配置 (PHASE 11) ──────────────────────────────
// worker ごとに横スイムレーン。X = 依存深度 (topological sort)、Y = worker ライン。
// 「ピース一覧」ではなく「誰がどの流れを持っているか」の地形を作る。
function journeyLayout(
  pieces: Piece[],
  connections: Connection[],
  workerMap:   Record<string, { name: string }>,
): Record<string, { x: number; y: number }> {
  if (pieces.length === 0) return {};

  // ── トポロジカルソート (Kahn's algorithm) → X 軸の深度 ──────────────────
  const inDeg: Record<string, number> = {};
  const adj:   Record<string, string[]> = {};
  for (const p of pieces) { inDeg[p.id] = 0; adj[p.id] = []; }
  for (const c of connections) {
    if (!inDeg[c.to_piece_id] !== undefined) continue;
    adj[c.from_piece_id]?.push(c.to_piece_id);
    inDeg[c.to_piece_id] = (inDeg[c.to_piece_id] ?? 0) + 1;
  }
  const depth: Record<string, number> = {};
  const queue = pieces.filter(p => (inDeg[p.id] ?? 0) === 0).map(p => p.id);
  let maxDepth = 0;
  while (queue.length > 0) {
    const id = queue.shift()!;
    const d  = depth[id] ?? 0;
    maxDepth  = Math.max(maxDepth, d);
    for (const nb of adj[id] ?? []) {
      depth[nb] = Math.max(depth[nb] ?? 0, d + 1);
      inDeg[nb]--;
      if (inDeg[nb] <= 0) queue.push(nb);
    }
  }
  // 未到達は末尾
  for (const p of pieces) { if (depth[p.id] === undefined) depth[p.id] = maxDepth + 1; }

  // ── worker ライン (Y 軸) ──────────────────────────────────────────────────
  const workerIds = [
    ...new Set(pieces.map(p => p.assignee_id ?? '__none__')),
  ].sort((a, b) => {
    if (a === '__none__') return 1;
    if (b === '__none__') return -1;
    return (workerMap[a]?.name ?? '').localeCompare(workerMap[b]?.name ?? '');
  });
  const LANE_H    = 280;  // ライン間隔
  const STEP_W    = 300;  // 深度間隔
  const workerY: Record<string, number> = {};
  workerIds.forEach((wid, i) => { workerY[wid] = i * LANE_H + 140; });

  // ── 位置決定 ──────────────────────────────────────────────────────────────
  // 同一 worker × 同一 depth 内での Y 揺らぎを確定的に散らす
  const slotCount: Record<string, number> = {};
  const slotIdx:   Record<string, number> = {};
  for (const p of pieces) {
    const wid = p.assignee_id ?? '__none__';
    const key = `${wid}_${depth[p.id]}`;
    slotIdx[p.id]  = slotCount[key] ?? 0;
    slotCount[key] = (slotCount[key] ?? 0) + 1;
  }

  const pos: Record<string, { x: number; y: number }> = {};
  for (const p of pieces) {
    const wid  = p.assignee_id ?? '__none__';
    const d    = depth[p.id] ?? 0;
    const cnt  = slotCount[`${wid}_${d}`] ?? 1;
    const idx  = slotIdx[p.id] ?? 0;
    const yOff = cnt > 1 ? (idx - (cnt - 1) / 2) * 60 : 0;
    pos[p.id]  = {
      x: 120 + d * STEP_W,
      y: (workerY[wid] ?? 0) + yOff,
    };
  }
  return pos;
}

// ─── Business impact → visual scale (0.85 ~ 1.35) ────────────────────────────
function computeImpactScales(pieces: Piece[]): Record<string, number> {
  // ボードでは全ピース統一サイズ (scale=1) — パズルのタブが正確に噛み合うため
  // ビジネスインパクトによるスケール拡縮はロードビューのみで使用
  const result: Record<string, number> = {};
  for (const p of pieces) { result[p.id] = 1.0; }
  return result;
}

// ─── Project Island Node ──────────────────────────────────────────────────────
const ISLAND_PAD      = 38;
const ISLAND_PAD_TOP  = 50;

interface IslandData {
  width: number; height: number;
  color: string; name: string; count: number;
  projectId: string;
  isCollapsed: boolean;
  onToggle: () => void;
  onCreatePiece?: () => void;  // "+" ボタンでフォルダ内にピース作成
  onTidy?: () => void;          // 整列ボタン: ピースの手動位置をリセットして再レイアウト
  onDeleteConnections?: () => void;  // フォルダ内の全接続を一括削除
  onArchive?: () => void;            // アーカイブボタン: プロジェクトを archived に変更
  isPinned?: boolean;           // ★注目フォルダ
  onTogglePin?: () => void;
  doneZoneY?: number;           // 完了パズル区間のY座標 (undefined = 非表示)
  doneCount?:  number;          // 完了ピース数
  // ── 部屋の温度 (Field Architecture 延長) ────────────────────────────────
  // warmth: 0–100。活発(高) ↔ 停滞(低)。island background tint に使う。
  // isPristine: まだ何も動いていない(最初期)。床の定着感がない。
  warmth?:      number;
  isPristine?:  boolean;
  // ── Room Lifecycle (PHASE 8) ─────────────────────────────────────────────
  // roomState: SEED(着手前) / ACTIVE(稼働中) / STALLED(停滞)
  // overdueRatio: 過期ピースの割合 (0–1)。空間への侵食度合いに使う。
  roomState?:   'seed' | 'active' | 'stalled';
  overdueRatio?: number;
  // ── Knowledge Concentration Score (PHASE 14C) ────────────────────────────
  // 担当者1人に知識が集中 (KCS > 0.7)。乾いた土の感覚。警告ではない。
  isKnowledgeConcentrated?: boolean;
  // ── Temporal Flow (PHASE 15) ─────────────────────────────────────────────
  // temporalCompression: requiredRate / completionRate。1.4超で「時間が詰まっている」
  // throughput: 完了エッジ / 全エッジ。流速を warmth に反映。
  temporalCompression?: number;
  throughput?:          number;
  // ── リサイズコールバック ────────────────────────────────────────────────
  onResize?: (w: number, h: number) => void;
}

function ProjectIslandNode({ data }: { data: IslandData }) {
  const col          = data.color || '#6366f1';
  const warmth       = data.warmth ?? 50;
  const isPristine   = data.isPristine ?? false;
  const roomState    = data.roomState ?? (isPristine ? 'seed' : 'active');
  const overdueRatio = data.overdueRatio ?? 0;

  // border radius: lifecycle で微妙に変化
  // ACTIVE → やや鋭角(16): 整理された部屋 / STALLED → やや丸い(26): 輪郭が曖昧化
  const borderRad = roomState === 'active' ? 16 : roomState === 'stalled' ? 26 : 22;

  // border: 活発な部屋は輪郭がより定かに / 停滞は輪郭が薄れる
  // STALLED → 破線: 境界が曖昧になっていく感覚
  const borderAlpha = isPristine ? '55' : warmth > 65 ? '99' : warmth < 30 ? '66' : '88';
  const borderStyle = roomState === 'stalled' ? 'dashed' : 'solid';
  const pinBorder = data.isPinned
    ? `2.5px ${borderStyle} ${col}CC`
    : `2px ${borderStyle} ${col}${borderAlpha}`;
  const pinGlow   = data.isPinned ? `0 0 0 2px ${col}22, inset 0 0 40px ${col}14` : `inset 0 0 40px ${col}08`;

  // 床の温度: groundField の考え方を island レベルに拡張
  // 活発(warmth>65) → 暖色の床染み / 停滞(warmth<30) → 冷色の床染み
  // STALLED: 過期ピースの割合に応じて冷色を強める (Spatial Repair)
  const floorTint = (() => {
    if (isPristine) return null;
    if (warmth > 65 && roomState !== 'stalled') {
      const t = (warmth - 65) / 35;
      return `rgba(194,154,108,${(t * 0.042).toFixed(3)})`;   // warm ochre
    }
    if (warmth < 30 || roomState === 'stalled') {
      const coolBase = warmth < 30 ? (30 - warmth) / 30 : 0;
      const overdueBoost = overdueRatio * 0.6;
      const t = Math.max(coolBase, overdueBoost);
      return `rgba(148,163,184,${(t * 0.065).toFixed(3)})`;   // cool slate — stronger for stalled
    }
    return null;
  })();

  // grid opacity: 活発な部屋は "床板" がよく見える / STALLED は薄れていく
  const gridOpacity = isPristine ? 0.025
    : roomState === 'stalled' ? Math.max(0.018, 0.04 - overdueRatio * 0.025)
    : warmth > 65 ? 0.07
    : warmth < 30 ? 0.035
    : 0.055;

  return (
    <div style={{
      width:  data.width,
      height: data.height,
      background:   `${col}0D`,
      border:       pinBorder,
      borderRadius: borderRad,
      position:     'relative',
      pointerEvents:'none',
      boxShadow: pinGlow,
      transition: 'border-color 0.4s, background 0.4s',
    }}>
      {/* 床の温度オーバーレイ — 単体では微か。隣接ピースの groundField と積層して差が現れる */}
      {floorTint && (
        <div
          aria-hidden="true"
          style={{
            position:      'absolute',
            inset:         0,
            borderRadius:  borderRad,
            // 楕円形: 床の「染み」は下部に溜まる
            background:    `radial-gradient(ellipse at 50% 80%, ${floorTint} 0%, transparent 72%)`,
            pointerEvents: 'none',
            transition:    'opacity 0.4s',
          }}
        />
      )}
      {/* Source handle — フォルダ島から接続線を引き出す */}
      <Handle
        type="source" id="island-src"
        position={Position.Right}
        style={{
          width: 12, height: 12, borderRadius: '50%',
          background: col, border: '2px solid #fff',
          right: -6, top: '50%',
          opacity: 0, transition: 'opacity 0.15s',
          pointerEvents: 'auto',
          zIndex: 10,
        }}
      />
      {/* Target handle — フォルダ島への接続を受け取る */}
      <Handle
        type="target" id="island-tgt"
        position={Position.Left}
        style={{
          width: 12, height: 12, borderRadius: '50%',
          background: col, border: '2px solid #fff',
          left: -6, top: '50%',
          opacity: 0, transition: 'opacity 0.15s',
          pointerEvents: 'auto',
          zIndex: 10,
        }}
      />

      {/* Project label pill (top-left) — clickable to collapse */}
      <div
        onClick={e => { e.stopPropagation(); data.onToggle(); }}
        style={{
          position:    'absolute',
          top:         -1,
          left:        20,
          height:      24,
          background:  col,
          borderRadius:'0 0 10px 10px',
          padding:     '0 10px 0 12px',
          display:     'flex',
          alignItems:  'center',
          gap:          6,
          boxShadow:   `0 4px 12px ${col}50`,
          cursor:      'pointer',
          pointerEvents:'auto',
          userSelect:  'none',
        }}>
        <span style={{
          fontSize: 9.5, fontWeight: 800,
          color: '#fff', letterSpacing: '0.07em',
          textTransform: 'uppercase',
        }}>
          {data.name}
        </span>
        <span style={{
          background:   'rgba(255,255,255,0.28)',
          borderRadius: 8,
          fontSize: 8.5, fontWeight: 700,
          color: '#fff',
          padding: '1px 6px',
          lineHeight: '14px',
        }}>
          {data.count}
        </span>
        {/* Collapse toggle arrow */}
        <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.80)', marginLeft: 2 }}>
          ▼
        </span>
      </div>

      {/* ★ pin button — 注目フォルダにマーク */}
      {data.onTogglePin && (
        <div
          onClick={e => { e.stopPropagation(); data.onTogglePin?.(); }}
          title={data.isPinned ? '注目を解除' : '注目フォルダに追加'}
          style={{
            position:     'absolute',
            top:          -1,
            right:        data.onCreatePiece ? 44 : 16,
            width:        22,
            height:       22,
            background:   data.isPinned ? '#F59E0B' : col,
            borderRadius: '0 0 8px 8px',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            fontSize:     11,
            color:        '#fff',
            cursor:       'pointer',
            pointerEvents:'auto',
            boxShadow:    `0 3px 8px ${data.isPinned ? '#F59E0B88' : col + '55'}`,
            userSelect:   'none',
            lineHeight:   1,
            opacity:      data.isPinned ? 1 : 0.7,
          }}>
          {data.isPinned ? '★' : '☆'}
        </div>
      )}

      {/* "+" button — フォルダ内にピース新規作成 */}
      {data.onCreatePiece && (
        <div
          onClick={e => { e.stopPropagation(); data.onCreatePiece?.(); }}
          title="このフォルダにピースを追加"
          style={{
            position:     'absolute',
            top:          -1,
            right:        16,
            width:        22,
            height:       22,
            background:   col,
            borderRadius: '0 0 8px 8px',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            fontSize:     14,
            color:        '#fff',
            cursor:       'pointer',
            pointerEvents:'auto',
            boxShadow:    `0 3px 8px ${col}55`,
            userSelect:   'none',
            lineHeight:   1,
          }}>
          +
        </div>
      )}

      {/* Faint grid pattern inside island */}
      {/* opacity は warmth に連動: 活発な部屋は床板が見える / 停滞は薄れる */}
      <svg
        width={data.width} height={data.height}
        style={{ position: 'absolute', top: 0, left: 0, opacity: gridOpacity }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={`grid-${col.replace('#','')}`} width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke={col} strokeWidth="0.8"/>
          </pattern>
        </defs>
        <rect width={data.width} height={data.height} fill={`url(#grid-${col.replace('#','')})`} rx={borderRad}/>
      </svg>

      {/* 完了パズル区間の区切りライン + ラベル */}
      {data.doneZoneY != null && data.doneCount != null && data.doneCount > 0 && (
        <div style={{
          position: 'absolute',
          top: data.doneZoneY - 22,
          left: 20,
          right: 20,
          pointerEvents: 'none',
        }}>
          {/* 区切り線（点線） */}
          <div style={{
            height: 0,
            borderTop: `1.5px dashed ${col}55`,
            marginBottom: 5,
          }} />
          {/* ラベル */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 8.5, fontWeight: 700,
            color: `${col}99`,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            <span style={{ fontSize: 9 }}>🧩</span>
            <span>完成 {data.doneCount}件</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Project Summary Node (collapsed state) ───────────────────────────────────
const SUMMARY_W = 228;
const SUMMARY_H = 122;

interface SummaryData {
  name: string; color: string; projectId: string;
  pieces: Piece[];
  onToggle: () => void;
  workerMap: Record<string, { name: string }>;
  onBulkReady: () => Promise<void>;
  onBulkDone:  () => Promise<void>;
}

function ProjectSummaryNode({ data }: { data: SummaryData }) {
  const { pieces: ps, color: col, name, onToggle, workerMap, onBulkReady, onBulkDone } = data;
  const [hovered,  setHovered]  = useState(false);
  const [bulking,  setBulking]  = useState(false);

  const done   = ps.filter(p => p.status === 'done').length;
  const inprog = ps.filter(p => p.status === 'in_progress').length;
  const ready  = ps.filter(p => p.status === 'ready').length;
  const locked = ps.filter(p => p.status === 'locked').length;
  const total  = ps.length;
  const pct    = total > 0 ? (done / total) * 100 : 0;
  const nextP  = [...ps]
    .filter(p => p.due_date && p.status !== 'done')
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0];

  // Build assignee → pieces map
  const assigneeMap = new Map<string, { name: string; pieces: Piece[] }>();
  for (const p of ps) {
    if (p.assignee_id && workerMap[p.assignee_id]) {
      if (!assigneeMap.has(p.assignee_id)) {
        assigneeMap.set(p.assignee_id, { name: workerMap[p.assignee_id].name, pieces: [] });
      }
      assigneeMap.get(p.assignee_id)!.pieces.push(p);
    }
  }
  const assignees = [...assigneeMap.entries()];
  const unassigned = ps.filter(p => !p.assignee_id);

  const HANDLE_STYLE: React.CSSProperties = {
    width: 10, height: 10, borderRadius: 3,
    background: col, border: '2px solid var(--surface)',
    opacity: 0, transition: 'opacity 0.15s',
  };

  const AVATAR_COLORS = ['#4F46E5','#0891B2','#059669','#D97706','#DC2626','#7C3AED','#0284C7'];
  function avatarColor(id: string) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xfffffff;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  return (
    <div style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Left}  id="tgt" className="piece-handle" style={{ ...HANDLE_STYLE, top: SUMMARY_H / 2, left: -1, transform: 'translate(-50%,-50%)' }} />
      <div
        onClick={onToggle}
        style={{
          width: SUMMARY_W, height: SUMMARY_H,
          background: 'var(--surface)',
          borderRadius: 14,
          border: hovered ? `2px solid ${col}99` : `2px solid ${col}55`,
          boxShadow: hovered
            ? `0 8px 32px ${col}33, 0 2px 8px rgba(0,0,0,0.12)`
            : `0 6px 24px ${col}22, 0 2px 8px rgba(0,0,0,0.10)`,
          overflow: 'hidden',
          cursor: 'pointer',
          fontFamily: '"Inter","Outfit",sans-serif',
          transition: 'box-shadow 0.18s, border-color 0.18s',
          userSelect: 'none',
        }}>
        {/* Color header */}
        <div style={{ background: col, padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            fontSize: 9.5, fontWeight: 800, color: '#fff', flex: 1,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{name}</span>
          <span style={{
            background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.40)',
            borderRadius: 5, padding: '1px 7px', fontSize: 8.5, color: '#fff', fontWeight: 700,
            whiteSpace: 'nowrap',
          }}>▶ 展開</span>
        </div>
        {/* Body */}
        <div style={{ padding: '8px 10px' }}>
          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, borderRadius: 2, background: col, transition: 'width 0.4s' }} />
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
              {done}/{total}
            </span>
          </div>
          {/* Status badges */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
            {([
              { count: done,   label: '完了',   bg: '#A0A096' },
              { count: inprog, label: '進行中', bg: '#2563EB' },
              { count: ready,  label: '着手可', bg: '#059669' },
              { count: locked, label: 'ロック', bg: '#9CA3AF' },
            ] as const).filter(s => s.count > 0).map(s => (
              <span key={s.label} style={{
                background: `${s.bg}18`, border: `1px solid ${s.bg}40`,
                borderRadius: 5, padding: '1px 5px',
                fontSize: 8.5, color: s.bg, fontWeight: 700,
              }}>{s.count} {s.label}</span>
            ))}
          </div>
          {/* Next task */}
          {nextP?.due_date && (
            <div style={{ fontSize: 8.5, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
              <span style={{ width: 5, height: 5, borderRadius: 1, background: col, flexShrink: 0, display: 'inline-block' }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nextP.title.replace(/^【.+?】/, '')}
              </span>
              <span style={{ flexShrink: 0, color: 'var(--text-3)' }}>
                — {new Date(nextP.due_date).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
              </span>
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Right} id="src" className="piece-handle" style={{ ...HANDLE_STYLE, top: SUMMARY_H / 2, right: -1, transform: 'translate(50%,-50%)' }} />

      {/* ── Hover detail popup ── */}
      {hovered && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: SUMMARY_H + 10,
            left: 0,
            width: SUMMARY_W + 60,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
            padding: '12px 14px',
            zIndex: 9999,
            pointerEvents: 'all',
            fontFamily: '"Inter","Outfit",sans-serif',
          }}>
          {/* Assignees */}
          {assignees.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>担当者</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {assignees.map(([id, info]) => {
                  const ac = avatarColor(id);
                  const ip = info.pieces.filter(p => p.status === 'in_progress').length;
                  const rd = info.pieces.filter(p => p.status === 'ready').length;
                  const lk = info.pieces.filter(p => p.status === 'locked').length;
                  const dn = info.pieces.filter(p => p.status === 'done').length;
                  return (
                    <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%',
                        background: ac, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, fontWeight: 800, color: '#fff', flexShrink: 0,
                      }}>{info.name[0]}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {info.name}
                        </div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
                          {dn > 0  && <span style={{ fontSize: 8, color: '#A0A096', background: '#A0A09611', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>{dn}完</span>}
                          {ip > 0  && <span style={{ fontSize: 8, color: '#2563EB', background: '#2563EB11', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>{ip}進</span>}
                          {rd > 0  && <span style={{ fontSize: 8, color: '#059669', background: '#05966911', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>{rd}可</span>}
                          {lk > 0  && <span style={{ fontSize: 8, color: '#9CA3AF', background: '#9CA3AF11', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>{lk}待</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {unassigned.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.6 }}>
                    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>?</div>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>未割り当て {unassigned.length}件</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Divider */}
          {assignees.length > 0 && (
            <div style={{ height: 1, background: 'var(--border)', marginBottom: 10 }} />
          )}

          {/* Bulk actions */}
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>一括変更</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              disabled={bulking || locked === 0}
              onClick={async (e) => {
                e.stopPropagation();
                if (locked === 0) return;
                setBulking(true);
                try { await onBulkReady(); } finally { setBulking(false); }
              }}
              style={{
                flex: 1, padding: '6px 0', fontSize: 10, fontWeight: 700, cursor: locked > 0 ? 'pointer' : 'default',
                background: locked > 0 ? '#ECFDF5' : 'var(--surface-sub)',
                border: `1px solid ${locked > 0 ? '#6EE7B7' : 'var(--border)'}`,
                color: locked > 0 ? '#059669' : 'var(--text-3)',
                borderRadius: 8, transition: 'opacity 0.15s',
                opacity: bulking ? 0.5 : 1,
              }}>
              {locked > 0 ? `→ 着手可 (${locked})` : '着手可なし'}
            </button>
            <button
              disabled={bulking || done === total}
              onClick={async (e) => {
                e.stopPropagation();
                if (done === total) return;
                setBulking(true);
                try { await onBulkDone(); } finally { setBulking(false); }
              }}
              style={{
                flex: 1, padding: '6px 0', fontSize: 10, fontWeight: 700, cursor: done < total ? 'pointer' : 'default',
                background: done < total ? '#F5F3FF' : 'var(--surface-sub)',
                border: `1px solid ${done < total ? '#C4B5FD' : 'var(--border)'}`,
                color: done < total ? '#7C3AED' : 'var(--text-3)',
                borderRadius: 8, transition: 'opacity 0.15s',
                opacity: bulking ? 0.5 : 1,
              }}>
              {done < total ? `✓ 全完了 (${total - done})` : '全完了済み'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Compute island nodes from current piece positions ────────────────────────
function computeIslandNodes(
  pieces: Piece[],
  positions: Record<string, { x: number; y: number }>,
  projectMap: Record<string, Project>,
  onToggle: (projectId: string) => void
): Node[] {
  const groups: Record<string, Piece[]> = {};
  for (const p of pieces) {
    if (!p.project_id) continue;
    if (!groups[p.project_id]) groups[p.project_id] = [];
    groups[p.project_id].push(p);
  }

  const result: Node[] = [];
  for (const [pid, ps] of Object.entries(groups)) {
    const proj = projectMap[pid];
    if (!proj) continue;
    const posArr = ps.map(p => positions[p.id]).filter(Boolean);
    if (!posArr.length) continue;

    const minX = Math.min(...posArr.map(p => p.x)) - ISLAND_PAD;
    const minY = Math.min(...posArr.map(p => p.y)) - ISLAND_PAD_TOP;
    const maxX = Math.max(...posArr.map(p => p.x)) + PIECE_NODE_W + ISLAND_PAD;
    const maxY = Math.max(...posArr.map(p => p.y)) + PIECE_NODE_H + ISLAND_PAD;

    // 部屋の温度計算: ピースの状態分布から warmth を算出
    const total_ps   = Math.max(1, ps.length);
    const done_ps    = ps.filter(p => p.status === 'done').length;
    const inprog_ps  = ps.filter(p => p.status === 'in_progress').length;
    const now        = new Date();
    const overdue_ps = ps.filter(p =>
      p.due_date && new Date(p.due_date) < now && p.status !== 'done'
    ).length;
    const islandWarmth = Math.max(0, Math.min(100,
      (done_ps / total_ps) * 45 + (inprog_ps / total_ps) * 40 - (overdue_ps / total_ps) * 25 + 15
    ));
    const islandPristine = inprog_ps === 0 && done_ps === 0;

    result.push({
      id:         `island-${pid}`,
      type:       'projectIsland',
      position:   { x: minX, y: minY },
      data:       {
        width:  maxX - minX,
        height: maxY - minY,
        color:  proj.color || '#6366f1',
        name:   proj.name,
        count:  ps.length,
        projectId:    pid,
        isCollapsed:  false,
        onToggle:     () => onToggle(pid),
        warmth:       islandWarmth,
        isPristine:   islandPristine,
      } satisfies IslandData,
      draggable:  false,
      selectable: false,
      focusable:  false,
      zIndex:     -1,
      style:      { zIndex: -1, pointerEvents: 'none' },
    });
  }
  return result;
}

// ─── Context menus ────────────────────────────────────────────────────────────
interface ContextMenu      { x: number; y: number; pieceId: string; piece: Piece; }
interface EdgeContextMenu  { x: number; y: number; edgeId: string; connType: ConnectionType; }

// memo で wrap — ReactFlow の nodeTypes は安定した参照が必要
const MemoIslandNode  = React.memo(ProjectIslandNode);
const MemoSummaryNode = React.memo(ProjectSummaryNode);

// ─── Workshop Theme v2: ProjectIslandNodeV2 ("部屋") ─────────────────────────
// 囲み枠 → 部屋へ。
// - border を最小化し "floor tone" で空間を定義
// - ラベルを壁のプレートとして扱う
// - 部屋ごとの温度差を warmth から直接引き継ぐ
function ProjectIslandNodeV2({ data }: { data: IslandData }) {
  const col        = data.color || '#6366f1';
  const isPristine = data.isPristine ?? false;
  // リサイズドラッグ管理
  const resizeStartRef = React.useRef<{ mx: number; my: number; w: number; h: number } | null>(null);
  const handleResizeMouseDown = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeStartRef.current = { mx: e.clientX, my: e.clientY, w: data.width, h: data.height };
    const onMove = (me: MouseEvent) => {
      if (!resizeStartRef.current || !data.onResize) return;
      const { mx, my, w, h } = resizeStartRef.current;
      const newW = Math.max(280, w + (me.clientX - mx));
      const newH = Math.max(180, h + (me.clientY - my));
      data.onResize(newW, newH);
    };
    const onUp = () => {
      resizeStartRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [data]);
  const isKC       = data.isKnowledgeConcentrated ?? false;
  const isAllDone  = data.count > 0 && data.doneCount === data.count;

  // PHASE 15: throughput が低い → warmth を下方修正。高い → 上方修正。
  // 「流れが詰まっている部屋」は温度が下がる。「流れている部屋」は温かく見える。
  const throughput   = data.throughput;
  const compression  = data.temporalCompression;
  const rawWarmth    = data.warmth ?? 50;
  const warmthDelta  = throughput != null
    ? (throughput > 0.6 ? +12 : throughput < 0.3 ? -12 : 0)
    : 0;
  const warmth = Math.max(0, Math.min(100, rawWarmth + warmthDelta));

  // PHASE 15: compression > 1.4 → 枠がわずかに締まる（border opacity 上昇）
  const compressionFactor = compression != null ? Math.min(1, (compression - 1) / 3) : 0;

  const floorBase = isPristine
    ? null
    : warmth > 65
      ? `rgba(194,154,108,${((warmth - 65) / 35 * 0.085).toFixed(3)})`
      : warmth < 30
        ? `rgba(148,163,184,${((30 - warmth) / 30 * 0.055).toFixed(3)})`
        : null;

  const rimColor = isAllDone
    ? `${col}CC`                    // 全完了: 枠を濃く（達成感）
    : isPristine
    ? `${col}55`
    : warmth > 65
      ? `${col}99`
      : warmth < 30
        ? `${col}66`
        : `${col}88`;

  const roomRadius = isPristine ? 24 : warmth > 65 ? 10 : warmth < 30 ? 22 : 16;

  // KCS > 0.7: 「固まった知識」= dashed → solid、opacity を少し下げる（乾いた土の感覚）
  const borderStyle = isKC ? 'solid' : 'dashed';
  const baseBorderColor = isKC ? rimColor.replace(/[0-9a-f]{2}$/, '15') : rimColor;
  // PHASE 15: 圧縮状態 → border alpha を最大+20 引き上げ（密度感）
  // rimColor は #rrggbbAA 形式 (8桁 hex)。末尾2文字が alpha。
  const borderColor = (() => {
    if (compressionFactor <= 0.1) return baseBorderColor;
    const alphaHex = baseBorderColor.slice(-2);
    if (!/^[0-9a-f]{2}$/.test(alphaHex)) return baseBorderColor; // 形式不一致なら元を返す
    const base    = parseInt(alphaHex, 16);
    const boosted = Math.min(255, base + Math.round(compressionFactor * 20));
    return baseBorderColor.slice(0, -2) + boosted.toString(16).padStart(2, '0');
  })();

  return (
    <div style={{
      width:        data.width,
      height:       data.height,
      position:     'relative',
      pointerEvents:'none',
      border:       `2px ${borderStyle} ${borderColor}`,
      borderRadius: roomRadius,
      background:   'transparent',
    }}>

      {/* 床の温度 (radial gradient — 中央から広がる) */}
      {floorBase && !isAllDone && (
        <div
          aria-hidden="true"
          style={{
            position:     'absolute', inset: 0,
            borderRadius: 16,
            background:   `radial-gradient(ellipse at 50% 60%, ${floorBase} 0%, transparent 75%)`,
            pointerEvents:'none',
          }}
        />
      )}

      {/* 完成グロウ: 全ピース完了 → 島全体がプロジェクトカラーで淡く満たされる */}
      {isAllDone && (
        <div
          aria-hidden="true"
          style={{
            position:     'absolute', inset: 0,
            borderRadius: roomRadius,
            background:   `radial-gradient(ellipse at 50% 45%, ${col}12 0%, transparent 72%)`,
            pointerEvents:'none',
          }}
        />
      )}

      {/* Pristine の場合: 薄い点線グリッド (床板がまだ育っていない) */}
      {isPristine && (
        <div
          aria-hidden="true"
          style={{
            position:     'absolute', inset: 0,
            borderRadius: 16,
            backgroundImage: `radial-gradient(circle, ${col}15 1px, transparent 1px)`,
            backgroundSize: '24px 24px',
            backgroundPosition: '12px 12px',
            pointerEvents:'none',
          }}
        />
      )}

      {/* ハンドル */}
      <Handle
        type="source" id="island-src"
        position={Position.Right}
        style={{
          width: 10, height: 10, borderRadius: '50%',
          background: col, border: '1.5px solid var(--surface)',
          right: -5, top: '50%',
          opacity: 0, transition: 'opacity 0.15s',
          pointerEvents: 'auto', zIndex: 10,
        }}
      />
      <Handle
        type="target" id="island-tgt"
        position={Position.Left}
        style={{
          width: 10, height: 10, borderRadius: '50%',
          background: col, border: '1.5px solid var(--surface)',
          left: -5, top: '50%',
          opacity: 0, transition: 'opacity 0.15s',
          pointerEvents: 'auto', zIndex: 10,
        }}
      />

      {/* 部屋名プレート (左側: ドット + プロジェクト名) */}
      <div
        onClick={e => { e.stopPropagation(); data.onToggle(); }}
        style={{
          position:     'absolute',
          top:          8,
          left:         14,
          right:        148,
          display:      'flex',
          alignItems:   'center',
          gap:           7,
          cursor:       'pointer',
          pointerEvents:'auto',
          userSelect:   'none',
        }}
      >
        <div style={{
          width:        7,
          height:       7,
          borderRadius: '1px',
          background:   col,
          opacity:      isPristine ? 0.3 : warmth > 65 ? 0.65 : warmth < 30 ? 0.30 : 0.50,
          flexShrink:   0,
        }} />
        <span style={{
          fontSize:      11,
          fontWeight:    600,
          color:         col,
          opacity:       isPristine ? 0.35 : warmth > 65 ? 0.70 : warmth < 30 ? 0.38 : 0.55,
          letterSpacing: '0.04em',
          overflow:      'hidden',
          textOverflow:  'ellipsis',
          whiteSpace:    'nowrap',
          flex:          1,
        }}>
          {data.name}
        </span>
      </div>

      {/* 右側コントロール: カウント | 接続削除 | 整列 | + */}
      <div
        className="nodrag"
        style={{
          position:     'absolute',
          top:           6,
          right:         8,
          display:       'flex',
          alignItems:    'center',
          gap:           5,
          pointerEvents: 'auto',
          userSelect:    'none',
        }}
      >
        {/* カウント / COMPLETEバッジ */}
        {isAllDone ? (
          <>
            <span style={{
              fontSize:      9,
              fontWeight:    700,
              color:         col,
              opacity:       0.75,
              letterSpacing: '0.06em',
              border:        `1px solid ${col}55`,
              borderRadius:  3,
              padding:       '2px 5px',
            }}>COMPLETE</span>
            {data.onArchive && (
              <div
                onClick={e => { e.stopPropagation(); data.onArchive?.(); }}
                title="アーカイブ（完了済みプロジェクトを保管）"
                style={{
                  width: 26, height: 26,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', opacity: 0.55, borderRadius: 3,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="1" y="1" width="11" height="3.5" rx="1" stroke={col} strokeWidth="1.3"/>
                  <path d="M2 4.5v6.5a1 1 0 001 1h7a1 1 0 001-1V4.5" stroke={col} strokeWidth="1.3"/>
                  <path d="M4.5 7.5h4" stroke={col} strokeWidth="1.3" strokeLinecap="round"/>
                </svg>
              </div>
            )}
          </>
        ) : (
          <span style={{
            fontSize:    14,
            color:       col,
            opacity:     0.7,
            whiteSpace:  'nowrap',
            fontWeight:  700,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {(data.doneCount ?? 0) > 0 ? `${data.doneCount}/${data.count}` : data.count}
          </span>
        )}

        {/* セパレーター */}
        <div style={{ width: 1, height: 14, background: `${col}30`, flexShrink: 0 }} />

        {/* 接続一括削除ボタン */}
        {data.onDeleteConnections && (
          <div
            onClick={e => { e.stopPropagation(); data.onDeleteConnections?.(); }}
            title="フォルダ内の接続を全削除"
            style={{
              width: 26, height: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', opacity: 0.55, borderRadius: 3,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4 Q4 2 6 4 L8 6 Q10 8 12 6" stroke={col} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
              <line x1="1" y1="13" x2="4" y2="10" stroke={col} strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="10" y1="4" x2="13" y2="1" stroke={col} strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="2" y1="11" x2="4" y2="12" stroke="var(--bg)" strokeWidth="2"/>
              <line x1="11" y1="2" x2="12" y2="4" stroke="var(--bg)" strokeWidth="2"/>
            </svg>
          </div>
        )}

        {/* 整列ボタン */}
        {data.onTidy && (
          <div
            onClick={e => { e.stopPropagation(); data.onTidy?.(); }}
            title="ピースを整列し直す"
            style={{
              width: 26, height: 26,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', opacity: 0.55, borderRadius: 3,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="0" y="1"  width="14" height="2.5" rx="1.2" fill={col} />
              <rect x="0" y="6"  width="9"  height="2.5" rx="1.2" fill={col} />
              <rect x="0" y="11" width="11" height="2.5" rx="1.2" fill={col} />
            </svg>
          </div>
        )}

        {/* ＋ ピース追加ボタン */}
        {data.onCreatePiece && (
          <div
            onClick={e => { e.stopPropagation(); data.onCreatePiece?.(); }}
            title="このフォルダにピースを追加"
            style={{
              width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, color: col, opacity: 0.8,
              cursor: 'pointer', lineHeight: 1,
            }}
          >+</div>
        )}
      </div>

      {/* ── 進捗バー ── */}
      {data.count > 0 && (
        <div style={{
          position:     'absolute',
          bottom:        0,
          left:          0,
          right:         0,
          height:        3,
          borderRadius: `0 0 ${roomRadius}px ${roomRadius}px`,
          background:   'rgba(0,0,0,0.04)',
          overflow:     'hidden',
          pointerEvents:'none',
        }}>
          <div style={{
            height:     '100%',
            width:      `${((data.doneCount ?? 0) / data.count) * 100}%`,
            background:  (data.doneCount ?? 0) === data.count ? `${col}` : `${col}99`,
            transition: 'width 0.5s ease',
            borderRadius: 'inherit',
          }} />
        </div>
      )}

      {/* ── リサイズハンドル (右下コーナー) ─────────────────────────────── */}
      {data.onResize && (
        <div
          className="nodrag"
          onMouseDown={handleResizeMouseDown}
          title="ドラッグでフォルダサイズを変更"
          style={{
            position:     'absolute',
            bottom:        2,
            right:         2,
            width:         14,
            height:        14,
            cursor:        'nwse-resize',
            pointerEvents: 'auto',
            zIndex:        20,
            display:       'flex',
            alignItems:    'flex-end',
            justifyContent:'flex-end',
            padding:        2,
          }}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <line x1="8" y1="0" x2="0" y2="8" stroke={col} strokeWidth="1.2" strokeOpacity="0.35" />
            <line x1="8" y1="3" x2="3" y2="8" stroke={col} strokeWidth="1.2" strokeOpacity="0.35" />
          </svg>
        </div>
      )}
    </div>
  );
}

// ─── Worker Territory Node (PHASE 9) ────────────────────────────────────────
// 担当者ごとの「机の領域」— 完全自動整列ではなく、仕事の集積が作る輪郭。
// 活動中の担当者エリア → 暖色の薄いオーラ / 停止中 → 冷色の残影。
// 演出なし。ただ「その人の仕事がここに集まっている」感覚だけを作る。
// PHASE 14A: Assignment Intent — 今回はUI不要。構造だけ用意。
// 次フェーズで Skill OS / Growth OS と接続される。
export type AssignmentIntent = 'throughput' | 'growth' | 'distribution' | 'stabilization';

// ─── PHASE 14C: Territory Color Composition helpers ──────────────────────────
function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
}

// Territory background を project composition から生成する。
// 単色優勢 / 2〜3色均衡 / 5色以上（文脈散乱）の3パターン。
function buildTerritoryGradient(
  composition: Array<{ color: string; ratio: number }>,
  loadState:   'available' | 'busy' | 'deep_focus',
  isActive:    boolean,
): string {
  const base =
    loadState === 'available' ? (isActive ? 0.095 : 0.075) :
    loadState === 'busy'      ? (isActive ? 0.065 : 0.050) :
    /* deep_focus */             (isActive ? 0.038 : 0.028);

  if (composition.length === 0) {
    const c = isActive ? `rgba(194,154,108,${base})` : `rgba(148,163,184,${base})`;
    return `radial-gradient(circle at 50% 50%, ${c} 0%, transparent 68%)`;
  }

  const top     = composition.slice(0, 3);
  const dominant = top[0].ratio > 0.70;
  const many     = composition.length >= 5;
  const sMult    = many ? 0.65 : 1.0;  // 文脈散乱時は彩度を落とす

  if (dominant) {
    // 単色優勢: 1つの文脈を深く保持
    return `radial-gradient(circle at 50% 50%, ${hexToRgba(top[0].color, base * 1.25 * sMult)} 0%, transparent 68%)`;
  }

  // 2〜3色均衡: 越境型ワーカー — ずらした中心で層を重ねる
  const positions = [
    { x: '44%', y: '44%', spread: 65 },
    { x: '62%', y: '58%', spread: 54 },
    { x: '38%', y: '62%', spread: 44 },
  ];
  return top.map((proj, i) => {
    const p = positions[i];
    const a = base * (1.0 - i * 0.22) * sMult;
    return `radial-gradient(circle at ${p.x} ${p.y}, ${hexToRgba(proj.color, a)} 0%, transparent ${p.spread}%)`;
  }).join(', ');
}

interface WorkerTerritoryData {
  radius:             number;
  isActive:           boolean;
  workerName:           string;
  loadState:            'available' | 'busy' | 'deep_focus';
  isIsolated:           boolean;
  workerId:             string;
  isDragAssignActive:   boolean;
  onAssign?:            (pieceId: string) => void;
  projectComposition:   Array<{ color: string; ratio: number; projectId: string }>;
  isProjectHighlighted: boolean;   // PHASE 14D: Piece hover で連動
  isKnowledgeIsolated:  boolean;   // PHASE 14D: 単独保有 territory
}

function WorkerTerritoryNode({ data }: { data: WorkerTerritoryData }) {
  const { radius, isActive, workerName, loadState, isIsolated,
          isDragAssignActive, onAssign, projectComposition,
          isProjectHighlighted, isKnowledgeIsolated } = data;
  const [isDragOver, setIsDragOver] = React.useState(false);
  const size = radius * 2;

  // Knowledge Isolation: 単独保有は saturation を引き上げて「閉じた色」に
  // shared knowledge は外に滲み、isolated は内に濃縮する
  const compositionForGradient = isKnowledgeIsolated
    ? projectComposition.map(c => ({ ...c, ratio: Math.min(1, c.ratio * 1.2) }))
    : projectComposition;

  const baseGradient  = buildTerritoryGradient(compositionForGradient, loadState, isActive);
  // drag-over: 操作フィードバックとして全体を少し明るくする
  const dragOverLayer = isDragOver
    ? ', radial-gradient(circle at 50% 50%, rgba(255,255,255,0.04) 0%, transparent 70%)'
    : '';

  const nameOpacity =
    loadState === 'available' ? 0.45 :
    loadState === 'busy'      ? 0.30 :
    /* deep_focus */             0.18;

  return (
    <div
      onDragOver={isDragAssignActive ? (e) => { e.preventDefault(); setIsDragOver(true); } : undefined}
      onDragLeave={isDragAssignActive ? () => setIsDragOver(false) : undefined}
      onDrop={isDragAssignActive ? (e) => {
        e.preventDefault();
        setIsDragOver(false);
        const pieceId = e.dataTransfer.getData('pz-piece-drag');
        if (pieceId && onAssign) onAssign(pieceId);
      } : undefined}
      style={{
        width:         size,
        height:        size,
        borderRadius:  '50%',
        background:    baseGradient + dragOverLayer,
        pointerEvents: isDragAssignActive ? 'auto' : 'none',
        position:      'relative',
        // Piece hover 連動: 関連プロジェクトを持つ territory が静かに応答する
        opacity:       isIsolated ? 0.55 : 1,
        transform:     isDragOver ? 'scale(1.01)' : isProjectHighlighted ? 'scale(1.025)' : undefined,
        transition:    'transform 0.18s ease, opacity 0.18s',
        cursor:        isDragAssignActive ? 'copy' : undefined,
        // isolated knowledge: blur を削除することで「閉じた色」を表現
        filter:        isKnowledgeIsolated ? undefined : isProjectHighlighted ? 'blur(0px)' : undefined,
      }}
    >
      <span style={{
        position:      'absolute',
        top:           '50%',
        left:          '50%',
        transform:     'translate(-50%, -50%)',
        fontSize:      10,
        fontWeight:    500,
        color:         isActive ? `rgba(140,110,70,${nameOpacity})` : `rgba(90,100,115,${nameOpacity})`,
        letterSpacing: '0.03em',
        whiteSpace:    'nowrap',
        userSelect:    'none',
        pointerEvents: 'none',
        // highlight 時に名前も少し見やすくなる
        opacity:       isProjectHighlighted ? Math.min(1, nameOpacity * 1.5) : 1,
        transition:    'opacity 0.18s',
      }}>
        {workerName}
      </span>
    </div>
  );
}
const MemoTerritoryNode = React.memo(WorkerTerritoryNode);

// ─── PHASE 14D: Knowledge Haze Node ──────────────────────────────────────────
// 同一プロジェクトを共有する Territory 間の「知識の重なり」を ambient field として表現。
// 接続線禁止。これはエッジではなく場（field）。
interface KnowledgeHazeData { color: string; size: number; }

function KnowledgeHazeNode({ data }: { data: KnowledgeHazeData }) {
  const { color, size } = data;
  return (
    <div style={{
      width:         size,
      height:        size,
      borderRadius:  '50%',
      background:    `radial-gradient(ellipse at 50% 50%, ${hexToRgba(color, 0.045)} 0%, transparent 68%)`,
      filter:        'blur(10px)',
      pointerEvents: 'none',
    }} />
  );
}
const MemoHazeNode = React.memo(KnowledgeHazeNode);

// ─── Done Chip Node ───────────────────────────────────────────────────────────
// 完了ピース専用の小型ジグソー形状ノード。フォルダ下部にインターロックして整列。
//
// 寸法: バウンディングボックス 88×52 (= DC_W+DC_TAB × DC_H+DC_TAB)
// インターロック配置: x_step=DC_W=80, y_step=DC_H=44 → タブが8px噛み合う
const DC_W     = 80;  // body width
const DC_H     = 44;  // body height
const DC_TAB   = 8;
const DC_NECK  = 5;
const DC_R     = 4;
const DC_PATH  = piecePath(DC_W, DC_H, DC_TAB, DC_NECK, DC_R);

export const DONE_CHIP_W     = DC_W + DC_TAB;  // = 88 (bounding box)
export const DONE_CHIP_H     = DC_H + DC_TAB;  // = 52 (bounding box)
export const DONE_CHIP_GAP_X = 0;  // インターロックのため隙間ゼロ → step = DC_W を使う
export const DONE_CHIP_GAP_Y = 4;

interface DoneChipData {
  piece:         { id: string; title: string; status: PieceStatus; progress?: number };
  isDimmed?:     boolean;
  projectColor?: string;
}
function DoneChipNode({ data }: { data: DoneChipData }) {
  const [hov, setHov] = React.useState(false);
  const { piece, isDimmed, projectColor } = data;
  const strokeColor = projectColor ?? 'rgba(0,0,0,0.10)';
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={piece.title}
      style={{
        width: DONE_CHIP_W, height: DONE_CHIP_H,
        position: 'relative',
        opacity: isDimmed ? 0.18 : (hov ? 0.88 : 0.68),
        transition: 'opacity 0.15s',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* ジグソー本体 (clip-path) */}
      <div style={{
        position: 'absolute', left: 0, top: 0,
        width: DONE_CHIP_W, height: DONE_CHIP_H,
        clipPath: `path("${DC_PATH}")`,
        background: hov ? '#E2E2E4' : '#EAEAEC',
        display: 'flex', alignItems: 'center',
        padding: '0 10px',
        gap: 5,
        overflow: 'hidden',
        transition: 'background 0.12s',
      }}>
        <div style={{ width: 4, height: 4, borderRadius: '50%',
          background: 'rgba(148,148,152,1)', flexShrink: 0 }} />
        <span style={{
          fontSize: 8.5, color: 'var(--text-1)', opacity: 0.52,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          fontFamily: '-apple-system, sans-serif', letterSpacing: '-0.01em', flex: 1,
        }}>
          {piece.title}
        </span>
      </div>
      {/* アウトライン (プロジェクトカラー, 極細・薄) */}
      <svg width={DONE_CHIP_W} height={DONE_CHIP_H}
        style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <path d={DC_PATH} fill="none" stroke={strokeColor}
          strokeWidth={0.6} strokeOpacity={0.22} />
      </svg>
    </div>
  );
}
const MemoDoneChipNode = React.memo(DoneChipNode);

// ─── Classic nodeTypes ────────────────────────────────────────────────────────
const nodeTypes = { piece: PieceNode, projectIsland: MemoIslandNode, projectSummary: MemoSummaryNode, doneChip: MemoDoneChipNode };

// ─── Workshop v2 nodeTypes ────────────────────────────────────────────────────
// 安定した参照のためモジュールスコープで定義
const MemoIslandNodeV2 = React.memo(ProjectIslandNodeV2);
const nodeTypesV2 = {
  piece:            PieceNodeV2,
  projectIsland:    MemoIslandNodeV2,
  projectSummary:   MemoSummaryNode,
  workerTerritory:  MemoTerritoryNode,
  knowledgeHaze:    MemoHazeNode,       // PHASE 14D: knowledge field
  doneChip:         MemoDoneChipNode,   // 完了ピース小型チップ
};

// カスタムエッジタイプ — FlowEdge が directional flow を担う / GhostEdge が引力場
const edgeTypes = { flow: FlowEdge, ghost: GhostEdge };

// ─── WorkshopWall sub-components ─────────────────────────────────────────────
function WallSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-sub)' }}>
      <div style={{
        fontSize: 8.5, fontWeight: 600, color: 'var(--text-4)',
        letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function WallRow({
  label, value, onClick, arrow, active = false, last = false,
}: {
  label: string; value: string; onClick: () => void;
  arrow: string; active?: boolean; last?: boolean;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '8px 12px',
        borderBottom: last ? 'none' : '1px solid var(--border-sub)',
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
        background: hovered ? 'var(--surface-hover)' : active ? 'var(--accent-sub)' : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{
          fontSize: 8.5, fontWeight: 600, color: 'var(--text-4)',
          letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 2,
        }}>
          {label}
        </div>
        <div style={{
          fontSize: 11, color: active ? 'var(--accent)' : 'var(--text-2)',
          fontWeight: active ? 600 : 400,
        }}>
          {value}
        </div>
      </div>
      <span style={{ fontSize: 9, color: active ? 'var(--accent)' : 'var(--text-4)', flexShrink: 0 }}>
        {arrow}
      </span>
    </div>
  );
}

// ─── WorkshopWall ─────────────────────────────────────────────────────────────
// 工房の壁: ボード左サイドの文脈パネル。管理ツールではない。
// 5秒で「今日の工房の温度」を把握する場所。
interface WorkshopWallProps {
  warmth:          number;
  isStuck:         boolean;
  pieces:          Piece[];
  projectMap:      Record<string, Project>;
  filterAssignee:  string;
  filterProject:   string;
  currentUserId:   string | null;
  workerMap:       Record<string, { name: string }>;
  setFilterAssignee: (id: string) => void;
  setFilterProject:  (id: string) => void;
  navigate:        (path: string) => void;
}

function WorkshopWall({
  warmth, isStuck, pieces, projectMap,
  filterProject,
  setFilterProject,
  navigate,
}: WorkshopWallProps) {
  // 温度
  const tempLabel = warmth > 65 ? '活発' : warmth > 40 ? '稼働中' : isStuck ? '停滞中' : '静か';
  const tempDot   = warmth > 65 ? 'rgba(194,154,108,1)'
    : warmth > 40 ? 'var(--text-3)'
    : 'rgba(148,163,184,1)';

  // 要修復カウント (ボードデータから概算 — APIを叩かない)
  const atRiskCount = pieces.filter(p => {
    if (p.status === 'done' || p.status === 'locked') return false;
    if (!p.assignee_id) return true;   // unassigned
    if (p.due_date && new Date(p.due_date) < new Date()) return true;  // overdue
    // stale: in_progress で14日以上停滞
    const ref = p.started_at ?? p.created_at;
    return p.status === 'in_progress' && (Date.now() - new Date(ref).getTime()) > 14 * 86_400_000;
  }).length;

  // 活発な部屋 (in_progress が多い順、上位4件)
  const activeRooms = Object.values(projectMap)
    .map(proj => ({
      proj,
      count: pieces.filter(p => p.project_id === proj.id && p.status === 'in_progress').length,
    }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  // 完了数
  const doneCount = pieces.filter(p => p.status === 'done').length;

  return (
    <div style={{
      position:     'absolute',
      top:          60,
      left:         12,
      width:        176,
      zIndex:       10,
      background:   'var(--surface)',
      border:       '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      boxShadow:    'var(--shadow-xs)',
      overflow:     'hidden',
    }}>

      {/* 今日の温度 */}
      <WallSection label="今日の温度">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: tempDot, flexShrink: 0,
          }} />
          <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)' }}>
            {tempLabel}
          </span>
        </div>
      </WallSection>

      {/* 修復が必要 */}
      {atRiskCount > 0 && (
        <WallRow
          label="修復が必要"
          value={`${atRiskCount}件 待機中`}
          onClick={() => navigate('/repair')}
          arrow="→"
        />
      )}

      {/* 活発な部屋 */}
      {activeRooms.length > 0 && (
        <WallSection label="活発な部屋">
          {activeRooms.map(({ proj, count }) => (
            <div
              key={proj.id}
              onClick={() => setFilterProject(filterProject === proj.id ? '' : proj.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '3px 0', cursor: 'pointer',
                opacity: filterProject && filterProject !== proj.id ? 0.35 : 1,
                transition: 'opacity 0.12s',
              }}
            >
              <div style={{
                width: 5, height: 5, borderRadius: '50%',
                background: proj.color || 'var(--text-3)',
                flexShrink: 0,
              }} />
              <span style={{
                flex: 1, fontSize: 10, color: 'var(--text-2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {proj.name}
              </span>
              <span style={{
                fontSize: 9, color: 'var(--text-3)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {count}
              </span>
            </div>
          ))}
        </WallSection>
      )}


      {/* 保管庫へ */}
      <WallRow
        label="保管庫"
        value={`完了 ${doneCount}件`}
        onClick={() => navigate('/archive')}
        arrow="↗"
        last
      />
    </div>
  );
}

// ─── プロジェクト新規作成モーダル ────────────────────────────────────────────
function BoardColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [tab, setTab] = useState<'classic' | 'color'>(
    PALETTE_COLOR.includes(value) ? 'color' : 'classic'
  );
  const palette = tab === 'classic' ? PALETTE_CLASSIC : PALETTE_COLOR;
  return (
    <div>
      <div style={{ display: 'flex', gap: 1, marginBottom: 8 }}>
        {(['classic', 'color'] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{
            padding: '3px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', border: 'none',
            borderRadius: t === 'classic' ? '3px 0 0 3px' : '0 3px 3px 0',
            background: tab === t ? 'var(--text-1)' : 'var(--border)',
            color: tab === t ? '#fff' : 'var(--text-3)', letterSpacing: '0.04em',
          }}>{t === 'classic' ? 'クラシック' : 'カラー'}</button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
        {palette.map(c => (
          <button key={c} type="button" onClick={() => onChange(c)} style={{
            width: 22, height: 22, borderRadius: '50%', background: c, padding: 0,
            cursor: 'pointer', outline: 'none', border: value === c ? '2px solid var(--text-1)' : '2px solid transparent',
            boxShadow: value === c ? `0 0 0 1px ${c}` : 'none', transition: 'transform 0.1s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.25)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
          title={c} />
        ))}
      </div>
    </div>
  );
}

function CreateProjectModal({ onCreated, onClose }: { onCreated: (p: Project) => void; onClose: () => void }) {
  const [name,   setName]   = useState('');
  const [color,  setColor]  = useState(PALETTE_CLASSIC[0]);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const project = await projectApi.create({ name: name.trim(), color });
      onCreated(project);
    } finally { setSaving(false); }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.4)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <form onSubmit={handleSubmit} onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', borderRadius: 'var(--r-lg)',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
        padding: '24px 28px', minWidth: 340,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)' }}>新規プロジェクト</div>
        <input
          autoFocus value={name} onChange={e => setName(e.target.value)}
          placeholder="プロジェクト名" required
          style={{ border: '1px solid var(--border)', borderRadius: 3, padding: '8px 12px', fontSize: 13, background: 'var(--bg)', color: 'var(--text-1)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
        />
        <BoardColorPicker value={color} onChange={setColor} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{
            padding: '7px 16px', border: '1px solid var(--border)', borderRadius: 3,
            background: 'none', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer',
          }}>キャンセル</button>
          <button type="submit" disabled={saving || !name.trim()} style={{
            padding: '7px 18px', border: 'none', borderRadius: 3,
            background: 'var(--accent)', color: '#fff', fontSize: 12,
            fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1,
          }}>{saving ? '作成中...' : '作成'}</button>
        </div>
      </form>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function PuzzleBoardInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [viewMode,        setViewMode]        = useState<ViewMode>('flow');
  const [createOpen,      setCreateOpen]      = useState(false);
  const [createIslandProjectId, setCreateIslandProjectId] = useState<string | null>(null);
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [selectedPiece,   setSelectedPiece]   = useState<Piece | null>(null);
  const [isConnecting,    setIsConnecting]    = useState(false);
  const [filterStatus,    setFilterStatus]    = useState('');
  const [filterProject,   setFilterProject]   = useState('');
  const [filterSearch,    setFilterSearch]    = useState('');
  const [filterOpen,      setFilterOpen]      = useState(false);
  const [templateOpen,    setTemplateOpen]    = useState(false);
  const [hoveredNodeId,   setHoveredNodeId]   = useState<string | null>(null);
  const [selectedEdgeId,  setSelectedEdgeId]  = useState<string | null>(null);
  const [contextMenu,     setContextMenu]     = useState<ContextMenu | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<EdgeContextMenu | null>(null);
  const [projectColorMenu, setProjectColorMenu] = useState<{ x: number; y: number; projectId: string; currentColor: string } | null>(null);
  const [pcmTab, setPcmTab] = useState<'classic' | 'color'>('classic');
  const [projectMap,      setProjectMap]      = useState<Record<string, Project>>({});
  const [workerMap,       setWorkerMap]       = useState<Record<string, { name: string }>>({});
  const [workers,         setWorkers]         = useState<User[]>([]);
  const [showIslands,       setShowIslands]       = useState(true);
  const [layoutMode,        setLayoutMode]        = useState<'dag' | 'force'>('force');
  const [showCritical,      setShowCritical]      = useState(false);
  const [sprintOpen,        setSprintOpen]        = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [islandSort, setIslandSort] = useState<'default' | 'name' | 'progress'>('default');
  const [pieceSort,  setPieceSort]  = useState<'default' | 'status' | 'due'>('default');
  const [expandedPieces,    setExpandedPieces]    = useState<Set<string>>(new Set());
  const [filterAssignee,   setFilterAssignee]   = useState('');
  const [viewAs,           _setViewAs]          = useState<'admin' | 'worker'>('admin');
  const [pinnedProjects,   setPinnedProjects]   = useState<Set<string>>(new Set());
  const [showPinnedOnly,   _setShowPinnedOnly]  = useState(false);
  const [groupByAssignee,  _setGroupByAssignee] = useState(false);
  const [arrangeOpen,      setArrangeOpen]      = useState(false);
  const [multiSelectIds,   setMultiSelectIds]   = useState<Set<string>>(new Set());
  const [justCompletedId,  setJustCompletedId]  = useState<string | null>(null);
  const [celebrateText,    setCelebrateText]    = useState<string | null>(null);
  const [resonatingIds,    setResonatingIds]    = useState<Set<string>>(new Set());
  const [connectionFlash,  setConnectionFlash]  = useState(false);
  const [shortcutsOpen,    setShortcutsOpen]    = useState(false);
  const [pendingConn,      setPendingConn]      = useState<{ source: string; target: string; x: number; y: number } | null>(null);
  // ─── Direct Manipulation ───────────────────────────────────────────────────
  const [isDraggingPiece,  setIsDraggingPiece]  = useState(false);
  const [dragHoverId,      setDragHoverId]      = useState<string | null>(null); // workerId | 'repair' | null
  // ドラッグ終了時にインクリメント → buildGraph を再実行してタブ矢印を実際の位置で再計算
  const [positionVersion,  setPositionVersion]  = useState(0);
  // ── マグネット機能用 refs ─────────────────────────────────────────────────
  const magnetGroupRef  = useRef<Set<string>>(new Set()); // ドラッグ中のグループ
  const prevDragPosRef  = useRef<{x: number, y: number} | null>(null);
  // タブ接続ID: buildGraph が更新 → handleTabClick で参照
  const tabConnRightRef  = useRef<Record<string, string>>({}); // pieceId → connectionId
  const tabConnBottomRef = useRef<Record<string, string>>({}); // pieceId → connectionId
  // 島の手動リサイズサイズ: islandId → {w, h}
  const manualIslandSizes = useRef<Record<string, {w: number; h: number}>>(
    (() => { try { return JSON.parse(localStorage.getItem('pz_island_sizes') ?? '{}'); } catch { return {}; } })()
  );
  // 連打防止: 同一ピース/タブへの重複リクエストをブロック
  const statusAdvanceInFlightRef = useRef<Set<string>>(new Set());
  const tabClickInFlightRef      = useRef<Set<string>>(new Set());
  // ─── Behavioral Architecture (PHASE 10) ───────────────────────────────────
  const [flowSessionActive, setFlowSessionActive] = useState(false); // 今の流れだけ残す
  const [repairMode,        setRepairMode]        = useState(false);  // 修復モード
  // ─── Session Architecture (PHASE 11) ────────────────────────────────────
  const [sessionMode] = useState<SessionMode>(() =>
    (localStorage.getItem('pz_session_mode') as SessionMode) ?? 'open'
  );
  // ─── Workshop Theme v2 ─────────────────────────────────────────────────────
  const [workshopTheme, setWorkshopTheme] = useState<boolean>(() => {
    return localStorage.getItem('pz_theme_v2') === 'true';
  });
  const toggleWorkshopTheme = React.useCallback(() => {
    setWorkshopTheme(prev => {
      const next = !prev;
      localStorage.setItem('pz_theme_v2', String(next));
      return next;
    });
  }, []);
  // ジグソー島の横折り返し列数（workshopTheme用）
  const [jigsawWrapCols, setJigsawWrapCols] = useState<number>(() => {
    const v = parseInt(localStorage.getItem('pz_jigsaw_wrap_cols') ?? '5', 10);
    return isNaN(v) ? 5 : Math.min(10, Math.max(2, v));
  });
  const setJigsawWrapColsClamped = React.useCallback((v: number) => {
    const clamped = Math.min(10, Math.max(2, v));
    setJigsawWrapCols(clamped);
    localStorage.setItem('pz_jigsaw_wrap_cols', String(clamped));
  }, []);

  // プロジェクト横断接続の表示 (デフォルト: 非表示)
  const [showCrossProjectConns] = useState(false);

  // WorkshopWall の開閉 (デフォルト: 閉じた状態 — ボードを覆わない)
  const [workshopWallOpen, setWorkshopWallOpen] = useState<boolean>(false);

  // ── PHASE 14A: Drag-to-Assign ────────────────────────────────────────────────
  // Territory center 座標を保持。drag-assign 後にピースを territory 寄りへ再配置する。
  const territoryCentersRef = React.useRef<Record<string, { x: number; y: number }>>({});
  // PHASE 14D: Piece hover → Territory 連動
  // ref で管理 (state だと hover の度に全ノード再描画になるため)
  const hoveredProjectIdRef = React.useRef<string | null>(null);

  const { user: _authUser } = useAuthStore();
  const currentUserId = _authUser?.id ?? null;

  const togglePin = useCallback((projectId: string) => {
    setPinnedProjects(prev => {
      const next = new Set(prev);
      next.has(projectId) ? next.delete(projectId) : next.add(projectId);
      return next;
    });
  }, []);

  // suppress unused lint: these are reserved for future features
  void viewAs; void showPinnedOnly; void groupByAssignee;

  const toggleCollapse = useCallback((projectId: string) => {
    setCollapsedProjects(prev => {
      const next = new Set(prev);
      next.has(projectId) ? next.delete(projectId) : next.add(projectId);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((pieceId: string) => {
    setExpandedPieces(prev => {
      const next = new Set(prev);
      next.has(pieceId) ? next.delete(pieceId) : next.add(pieceId);
      return next;
    });
  }, []);

  // Phase 4-B: ワーカービューに切り替えたら自分の担当でフィルター、管理者に戻したら解除
  useEffect(() => {
    if (viewAs === 'worker' && currentUserId) {
      setFilterAssignee(currentUserId);
      // ワーカービューはフロー表示のみ
      setViewMode('flow');
    } else if (viewAs === 'admin') {
      setFilterAssignee('');
    }
  }, [viewAs, currentUserId]);

  const { fitView, setViewport, getNodes } = useReactFlow();
  const viewport = useViewport();


  // ── ズームレベルの記憶: viewport が変わったら localStorage に保存 ──
  const viewportSavedRef = useRef(false); // 初回の fitView を上書きしないようにフラグ
  useEffect(() => {
    if (!viewportSavedRef.current) return; // データロード直後は保存しない
    if (viewport.zoom === 1 && viewport.x === 0 && viewport.y === 0) return;
    localStorage.setItem('pz_viewport_v1', JSON.stringify(viewport));
  }, [viewport]);


  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { pieces, connections, bottlenecks, refresh } = usePieces();
  const { messages, push, dismiss } = useToast();

  // ── マグネット機能: タブクリック（接続方向反転） ─────────────────────────────────
  // 現在のノード位置から「指定方向にある接続」を直接検索する。
  // in-flight guard により連打 / ダブルクリックの重複リクエストをブロック。
  const handleTabClick = useCallback(async (pieceId: string, side: 'right' | 'bottom' | 'left' | 'top') => {
    const key = `${pieceId}-${side}`;
    if (tabClickInFlightRef.current.has(key)) return;
    tabClickInFlightRef.current.add(key);

    // Ref から connId を直接取得（位置計算に依存しない）
    const connId = side === 'right' || side === 'left'
      ? tabConnRightRef.current[pieceId]
      : tabConnBottomRef.current[pieceId];

    const conn = connId
      ? connectionsRef.current.find(c => c.id === connId)
      : undefined;

    if (!conn) { push('接続が見つかりません', 'info'); tabClickInFlightRef.current.delete(key); return; }
    try {
      await pieceApi.deleteConnection(conn.id);
      await pieceApi.connect(conn.to_piece_id, { to_piece_id: conn.from_piece_id, type: conn.type });
      await refresh();
      push('接続方向を反転しました', 'success');
    } catch { push('反転に失敗しました', 'error'); }
    finally { setTimeout(() => tabClickInFlightRef.current.delete(key), 600); }
  }, [refresh, push]);

  // ── マグネット機能: タブ右クリック（特定方向の接続のみ切り離す） ────────────────
  const handleTabDetach = useCallback(async (pieceId: string, side: 'right' | 'bottom' | 'left' | 'top') => {
    const key = `detach-${pieceId}-${side}`;
    if (tabClickInFlightRef.current.has(key)) return;
    tabClickInFlightRef.current.add(key);

    // Ref から connId を直接取得（位置計算に依存しない）
    const connId = side === 'right' || side === 'left'
      ? tabConnRightRef.current[pieceId]
      : tabConnBottomRef.current[pieceId];

    const conn = connId
      ? connectionsRef.current.find(c => c.id === connId)
      : undefined;

    if (!conn) { push('接続が見つかりません', 'info'); tabClickInFlightRef.current.delete(key); return; }
    try {
      await pieceApi.deleteConnection(conn.id);
      await refresh();

      // 再スナップ防止: 削除後も座標がスナップ位置のままだと次ドラッグで自動再接続される。
      // 離れた側のピースの保存座標を MAGNET_SNAP_TOL を超える分だけずらして磁力範囲外にする。
      const otherPieceId = conn.from_piece_id === pieceId ? conn.to_piece_id : conn.from_piece_id;
      const myKey    = `v2f:${pieceId}`;
      const otherKey = `v2f:${otherPieceId}`;
      const myPos    = manualPositions.current[myKey];
      const otherPos = manualPositions.current[otherKey];
      if (myPos && otherPos) {
        const ddx = otherPos.x - myPos.x;
        const ddy = otherPos.y - myPos.y;
        const GAP = MAGNET_SNAP_TOL + 2; // 8px: スナップ閾値6pxを超える
        const newOtherPos = {
          x: otherPos.x + (ddx > 0 ? GAP : ddx < 0 ? -GAP : 0),
          y: otherPos.y + (ddy > 0 ? GAP : ddy < 0 ? -GAP : 0),
        };
        manualPositions.current[otherKey] = newOtherPos;
        persistPosition(otherKey, newOtherPos);
      }

      setPositionVersion(v => v + 1);
      push('接続を切り離しました', 'success');
    } catch { push('切り離しに失敗しました', 'error'); }
    finally { setTimeout(() => tabClickInFlightRef.current.delete(key), 600); }
  }, [refresh, push, setPositionVersion]);

  // ── マグネット機能: 分離（右クリックメニューから呼び出し） ─────────────────────
  // このピースに関わる接続をすべて削除する。
  const handleDetach = useCallback(async (pieceId: string) => {
    const connsToDelete = connectionsRef.current.filter(c =>
      c.from_piece_id === pieceId || c.to_piece_id === pieceId
    );
    if (connsToDelete.length === 0) { push('接続がありません', 'info'); return; }
    try {
      await Promise.all(connsToDelete.map(c => pieceApi.deleteConnection(c.id)));
      await refresh();

      // 再スナップ防止: 接続相手の位置を MAGNET_SNAP_TOL+2 だけずらす
      const GAP = MAGNET_SNAP_TOL + 2;
      const allNodes = getNodes();
      const thisNode = allNodes.find(n => n.id === pieceId);
      if (thisNode) {
        const neighborIds = new Set(connsToDelete.map(c =>
          c.from_piece_id === pieceId ? c.to_piece_id : c.from_piece_id
        ));
        for (const nid of neighborIds) {
          const nNode = allNodes.find(n => n.id === nid);
          if (!nNode) continue;
          const ddx = nNode.position.x - thisNode.position.x;
          const ddy = nNode.position.y - thisNode.position.y;
          const nKey = `v2f:${nid}`;
          const saved = manualPositions.current[nKey] ?? nNode.position;
          const newPos = {
            x: saved.x + (ddx > 0 ? GAP : ddx < 0 ? -GAP : 0),
            y: saved.y + (ddy > 0 ? GAP : ddy < 0 ? -GAP : 0),
          };
          manualPositions.current[nKey] = newPos;
          persistPosition(nKey, newPos);
        }
        setPositionVersion(v => v + 1);
      }

      push(`分離しました（${connsToDelete.length}件）`, 'success');
    } catch { push('分離に失敗しました', 'error'); }
  }, [refresh, push, getNodes, setPositionVersion]);

  // ── PHASE 14A: Drag-to-Assign ────────────────────────────────────────────────
  // D-05「誰が持つか」: Territory へのドロップで assignee を即時更新する。
  // optimistic update → API call の順。失敗時は refresh() でロールバック。
  const handleDragAssign = useCallback(async (pieceId: string, workerId: string) => {
    setNodes(prev => prev.map(n => {
      if (n.id !== pieceId) return n;
      return { ...n, data: { ...n.data, assigneeName: workerMap[workerId]?.name ?? '' } };
    }));

    // ピースを territory 中心へ寄せる — 「この人の領域へ流れた」感覚
    const center = territoryCentersRef.current[workerId];
    if (center) {
      const angle  = Math.random() * Math.PI * 2;
      const spread = 40 + Math.random() * 50;
      setNodes(prev => prev.map(n => {
        if (n.id !== pieceId) return n;
        return {
          ...n,
          position: {
            x: center.x + Math.cos(angle) * spread - 108,
            y: center.y + Math.sin(angle) * spread - 76,
          },
        };
      }));
    }

    try {
      await pieceApi.assign(pieceId, workerId);
    } catch {
      refresh();
    }
  }, [setNodes, workerMap, refresh]);

  // ── PHASE 14D: Piece hover → Territory 連動 ──────────────────────────────────
  // D-03「誰に聞くか」: ピースをhoverした瞬間、関連プロジェクトのTerritoryが静かに応答する。
  // setNodes は territory ノードのみを対象とし、piece ノードを巻き込まない。
  const handlePieceProjectHover = useCallback((projectId: string | null) => {
    if (hoveredProjectIdRef.current === projectId) return;
    hoveredProjectIdRef.current = projectId;
    setNodes(prev => prev.map(n => {
      if (n.type !== 'workerTerritory') return n;
      const td = n.data as WorkerTerritoryData;
      const shouldHighlight = projectId != null &&
        td.projectComposition.some(c => c.projectId === projectId && c.ratio > 0.08);
      if ((td.isProjectHighlighted ?? false) === shouldHighlight) return n;
      return { ...n, data: { ...n.data, isProjectHighlighted: shouldHighlight } };
    }));
  }, [setNodes]);

  // ── Workspace Identity: アーキタイプから空間人格を決定 ───────────────────
  const identity = useMemo(
    () => getIdentity(detectArchetype(Object.values(projectMap).map(p => p.name))),
    [projectMap]
  );
  const identityRef = useRef(identity);
  identityRef.current = identity;

  // ── FocusStrip データ (PHASE 10) ────────────────────────────────────────────
  // active chain / repair 候補 / 新着 を計算してカードにまとめる。
  // 計算は cheap: pieces + connections のみ。重いライブラリ呼び出しなし。
  const focusCards = useMemo((): FocusCard[] => {
    if (!workshopTheme || pieces.length === 0) return [];
    const now    = Date.now();
    const cards: FocusCard[] = [];

    // 隣接リスト (双方向)
    const adj: Record<string, string[]> = {};
    for (const p of pieces) adj[p.id] = [];
    for (const c of connections) {
      adj[c.from_piece_id]?.push(c.to_piece_id);
      adj[c.to_piece_id]?.push(c.from_piece_id);
    }

    // ── active chains ────────────────────────────────────────────────────
    // in_progress ピースを起点に BFS → 未完了の接続ピースを連鎖収集
    const visited = new Set<string>();
    for (const seed of pieces.filter(p => p.status === 'in_progress')) {
      if (visited.has(seed.id)) continue;
      const chain: Piece[] = [];
      const queue = [seed.id];
      while (queue.length) {
        const id = queue.shift()!;
        if (visited.has(id)) continue;
        visited.add(id);
        const p = pieces.find(pp => pp.id === id);
        if (p && p.status !== 'done') {
          chain.push(p);
          for (const nb of adj[id] ?? []) {
            if (!visited.has(nb)) queue.push(nb);
          }
        }
      }
      if (chain.length === 0) continue;
      const lead       = chain.find(p => p.status === 'in_progress') ?? chain[0];
      const workerSet  = new Set(chain.map(p => p.assignee_id).filter(Boolean));
      const proj       = projectMap[lead.project_id ?? ''];
      cards.push({
        id:           `chain-${lead.id}`,
        type:         'chain',
        title:        lead.title,
        subtitle:     chain.length > 1 ? `${chain.length}ピース · ${workerSet.size}人` : `単独 · ${workerSet.size}人`,
        pieceIds:     chain.map(p => p.id),
        projectColor: proj?.color,
        urgency:      0.70,
      });
    }

    // ── repair 候補 ──────────────────────────────────────────────────────
    // locked / 14日以上 in_progress 停滞
    const repairItems = pieces.filter(p => {
      if (p.status === 'done' || p.status === 'ready') return false;
      if (p.status === 'locked') return true;
      if (p.status === 'in_progress' && p.started_at) {
        const daysSince = (now - new Date(p.started_at).getTime()) / 86_400_000;
        return daysSince > 14;
      }
      return false;
    });
    if (repairItems.length > 0) {
      if (repairItems.length <= 3) {
        for (const p of repairItems) {
          if (cards.some(c => c.pieceIds.includes(p.id))) continue;
          cards.push({
            id:           `repair-${p.id}`,
            type:         'repair',
            title:        p.title,
            subtitle:     p.status === 'locked' ? 'ロック中' : '長期停滞中',
            pieceIds:     [p.id],
            projectColor: projectMap[p.project_id ?? '']?.color,
            urgency:      0.85,
          });
        }
      } else {
        const notInChain = repairItems.filter(p => !cards.some(c => c.pieceIds.includes(p.id)));
        if (notInChain.length > 0) {
          cards.push({
            id:       'repair-group',
            type:     'repair',
            title:    `${notInChain.length}件の停滞`,
            subtitle: '修復で流れが回復する',
            pieceIds: notInChain.map(p => p.id),
            urgency:  0.88,
          });
        }
      }
    }

    // ── 新着 (24h以内に started_at) ─────────────────────────────────────
    for (const p of pieces) {
      if (!p.started_at) continue;
      if ((now - new Date(p.started_at).getTime()) > 86_400_000) continue;
      if (cards.some(c => c.pieceIds.includes(p.id))) continue;
      cards.push({
        id:           `fresh-${p.id}`,
        type:         'freshened',
        title:        p.title,
        subtitle:     '動き始めた',
        pieceIds:     [p.id],
        projectColor: projectMap[p.project_id ?? '']?.color,
        urgency:      0.50,
      });
    }

    return cards.sort((a, b) => b.urgency - a.urgency);
  }, [workshopTheme, pieces, connections, projectMap]);

  // ── RepairPulse データ ─────────────────────────────────────────────────────
  const stalledItems = useMemo((): StalledItem[] => {
    if (!workshopTheme) return [];
    return pieces
      .filter(p => {
        if (p.status === 'done' || p.status === 'ready') return false;
        if (p.status === 'locked') return true;
        if (p.status === 'in_progress' && p.started_at) {
          return (Date.now() - new Date(p.started_at).getTime()) > 14 * 86_400_000;
        }
        return false;
      })
      .map(p => ({
        id:    p.id,
        title: p.title,
        type:  p.status === 'locked' ? 'locked' as const : 'stagnant' as const,
      }));
  }, [workshopTheme, pieces]);

  // ── Session Architecture: セッション別可視ピース集合 (PHASE 11) ─────────────
  // sessionMode に応じて「今このセッションで見るべきピース」を返す。
  // null = 全表示 (open / 制限なし)。
  const sessionVisibleIds = useMemo((): Set<string> | null => {
    if (!workshopTheme || sessionMode === 'open') return null;
    const now = Date.now();

    switch (sessionMode) {
      case 'morning': {
        // 今日動くべき: in_progress + ready + repair候補
        const active = new Set<string>();
        const adj: Record<string, string[]> = {};
        for (const p of pieces) adj[p.id] = [];
        for (const c of connections) {
          adj[c.from_piece_id]?.push(c.to_piece_id);
          adj[c.to_piece_id]?.push(c.from_piece_id);
        }
        // in_progress ピースの接続チェーン全体
        const visited = new Set<string>();
        for (const seed of pieces.filter(p => p.status === 'in_progress')) {
          if (visited.has(seed.id)) continue;
          const q = [seed.id];
          while (q.length) {
            const id = q.shift()!;
            if (visited.has(id)) continue;
            visited.add(id); active.add(id);
            const p = pieces.find(pp => pp.id === id);
            if (p?.status !== 'done') {
              for (const nb of adj[id] ?? []) { if (!visited.has(nb)) q.push(nb); }
            }
          }
        }
        // repair候補も加える
        for (const p of pieces) {
          if (p.status === 'locked') active.add(p.id);
          if (p.status === 'in_progress' && p.started_at) {
            if ((now - new Date(p.started_at).getTime()) > 14 * 86_400_000) active.add(p.id);
          }
        }
        return active;
      }

      case 'repair': {
        // 停滞と孤立: locked + stagnant in_progress + 未接続
        const connectedIds = new Set<string>();
        for (const c of connections) {
          connectedIds.add(c.from_piece_id); connectedIds.add(c.to_piece_id);
        }
        return new Set(pieces.filter(p => {
          if (p.status === 'done' || p.status === 'ready') return false;
          if (p.status === 'locked') return true;
          if (!connectedIds.has(p.id)) return true; // 孤立ピース
          if (p.status === 'in_progress' && p.started_at) {
            return (now - new Date(p.started_at).getTime()) > 14 * 86_400_000;
          }
          return false;
        }).map(p => p.id));
      }

      case 'focus': {
        // 自分のタスク — currentUserId が null なら全表示
        if (!currentUserId) return null;
        return new Set(pieces.filter(p => p.assignee_id === currentUserId).map(p => p.id));
      }

      case 'handoff': {
        // 人から人への接点: 異なる担当者間を跨ぐエッジの両端ピース
        const handoffIds = new Set<string>();
        for (const c of connections) {
          const sp = pieces.find(p => p.id === c.from_piece_id);
          const tp = pieces.find(p => p.id === c.to_piece_id);
          if (sp && tp && sp.assignee_id && tp.assignee_id && sp.assignee_id !== tp.assignee_id) {
            handoffIds.add(sp.id); handoffIds.add(tp.id);
          }
        }
        return handoffIds.size > 0 ? handoffIds : null;
      }

      case 'review': {
        // 完了した流れ: done ピース + 直近の completed_at 順
        return new Set(
          pieces
            .filter(p => p.status === 'done' && !!p.completed_at)
            .sort((a, b) =>
              new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()
            )
            .slice(0, 40)  // 直近 40件まで
            .map(p => p.id)
        );
      }

      default: return null;
    }
  }, [workshopTheme, sessionMode, pieces, connections, currentUserId]);

  // ── Human Projection (PHASE 16) — Board から分離された Projection Layer ─────
  // D-03「誰に聞くか」/ D-05「誰が持つか」
  // 計算は src/projections/human/ に移譲。Board は描画のみ。
  const workerMetrics = useHumanProjection(pieces, connections, workerMap, projectMap);

  // ── ボード空気感：ピース状態から warmth/vitality を計算 ───────────────────
  const atmosphere = useMemo(() => {
    const base = computeAtmosphere(pieces);
    return { ...base, warmth: Math.max(0, Math.min(100, base.warmth + identity.warmthBias)) };
  }, [pieces, identity.warmthBias]);

  // ── freshness マップ：環境計算と presence score で共有 ────────────────────
  const freshnessMap = useMemo(
    () => Object.fromEntries(pieces.map(p => [p.id, computeFreshness(p)])),
    [pieces]
  );

  // ── ボード presence スコア：全体の「場の質感」(AtmosphereLayer Layer 4 用) ─
  const boardPresenceScore = useMemo(
    () => pieces.length === 0 ? 0.3 : computeBoardPresenceScore(Object.values(freshnessMap)),
    [freshnessMap]
  );

  // ── 集中痕マップ：構造偏重を計算（ピース / エッジに触感として渡す） ─────────
  const concentrationMaps = useMemo(
    () => computeConcentrationMaps(pieces, connections),
    [pieces, connections]
  );

  // ── 欠損痕マップ：孤立度を計算（接続不足の「空白感」に変換） ─────────────
  const missingMaps = useMemo(
    () => computeMissingMaps(pieces, connections),
    [pieces, connections]
  );

  // ── 役割シグネチャ：担当者ごとの構造内作用を計算 ─────────────────────────
  // 称号なし。視覚パラメータの微修正にだけ使う。
  const roleSignatures = useMemo(
    () => computeRoleSignatures(pieces, connections, missingMaps.isolationMap),
    [pieces, connections, missingMaps.isolationMap]
  );
  // assigneeId → PersonRoleSignature の高速参照マップ
  const roleMap = useMemo(
    () => Object.fromEntries(roleSignatures.map(r => [r.assigneeId, r])) as Record<string, PersonRoleSignature>,
    [roleSignatures]
  );

  // ── 親和性ペア：構造が自然に「埋まりやすい形」に向かうための引力計算 ───────
  // force layout スプリング修正 + ghost edge 描画に使用
  const affinityPairs = useMemo(() => {
    const pairs = computeAffinityPairs(pieces, connections, missingMaps.isolationMap);
    // 接続役の担当ピースが絡むペアはスコアを底上げ（橋の作用を増幅）
    return pairs.map(pair => {
      const pieceA    = pieces.find(p => p.id === pair.pieceIdA);
      const pieceB    = pieces.find(p => p.id === pair.pieceIdB);
      const roleA     = pieceA?.assignee_id ? roleMap[pieceA.assignee_id] : null;
      const roleB     = pieceB?.assignee_id ? roleMap[pieceB.assignee_id] : null;
      const connBoost =
        (roleA?.role === 'connect' ? roleA.intensity * 0.20 : 0) +
        (roleB?.role === 'connect' ? roleB.intensity * 0.20 : 0);
      return connBoost > 0
        ? { ...pair, score: Math.min(1, pair.score + connBoost) }
        : pair;
    });
  }, [pieces, connections, missingMaps.isolationMap, roleMap]);

  // ── Temporal Projection (PHASE 16) — Board から分離された Projection Layer ──
  // 計算は src/projections/temporal/ に移譲。Board は描画のみ。
  const temporalMetrics = useTemporalProjection(pieces, connections, projectMap);

  // ── 環境伝播マップ：周囲の品質が滲み出す ─────────────────────────────────
  // 1ホップ内の近傍品質を weighted average で混合。
  // ambientMap[pieceId]: 自分 + 近傍の環境品質
  // rawMap[pieceId]:     自分自身の品質（delta 計算用）
  const environmentMaps = useMemo(
    () => computeEnvironmentMaps(
      pieces,
      connections,
      freshnessMap,
      missingMaps.isolationMap,
      concentrationMaps.pressureMap,
    ),
    [pieces, connections, freshnessMap, missingMaps.isolationMap, concentrationMaps.pressureMap]
  );

  // ── 記憶マップ：時間の堆積を表面に滲ませる ──────────────────────────────────
  // 熟成 / 新生 / 散乱 の3軸でピースの「馴染み」を計算。
  // タイムラインUIではない。表面の質感として静的に現れる。
  const memoryMaps = useMemo(
    () => computeMemoryMaps(pieces, connections, missingMaps.isolationMap),
    [pieces, connections, missingMaps.isolationMap]
  );

  // ── 視覚状態マップ：全レイヤーを一元合成 ─────────────────────────────────
  // patina → role → environment → memory → residue の合成を
  // PieceNode の外側で完結させる (Local Truth Principle)。
  // PieceNode は「最終描画値」だけを受け取る。
  const visualStateMap = useMemo(() => {
    const result: Record<string, PieceVisuals> = {};
    for (const piece of pieces) {
      const familiarity = memoryMaps.familiarityMap[piece.id]  ?? 0.3;
      const connCount   = concentrationMaps.connCountMap[piece.id] ?? 0;
      // spatialResidue: 熟成度 × 接続密度 (長期滞在圧)
      const connBonus      = Math.min(connCount, 5) / 5;
      const spatialResidue = familiarity * 0.70 + connBonus * 0.30;

      result[piece.id] = computePieceVisuals(piece, {
        freshness:      freshnessMap[piece.id]               ?? 0.4,
        connCount,
        pressure:       concentrationMaps.pressureMap[piece.id] ?? 0,
        isolation:      missingMaps.isolationMap[piece.id]      ?? 0,
        role:           piece.assignee_id ? (roleMap[piece.assignee_id] ?? null) : null,
        ambient:        environmentMaps.ambientMap[piece.id]    ?? 0.5,
        rawQuality:     environmentMaps.rawMap[piece.id]        ?? 0.5,
        familiarity,
        scatter:        memoryMaps.scatterMap[piece.id]    ?? 0,
        newborn:        memoryMaps.newbornMap[piece.id]    ?? 0,
        reactivated:    piece.completed_at !== null && piece.status !== 'done',
        spatialResidue,
      });
    }
    return result;
  }, [pieces, freshnessMap, concentrationMaps, missingMaps, roleMap, environmentMaps, memoryMaps]);

  // ── Impact Engine (Cascade Simulation) state ─────────────────────────────
  const [cascadeMode,        setCascadeMode]        = useState(false);
  const [cascadePiece,       setCascadePiece]       = useState<Piece | null>(null);
  const [cascadeAffectedIds, setCascadeAffectedIds] = useState<Set<string>>(new Set());
  const [cascadeDeltaDays,   setCascadeDeltaDays]   = useState(0);
  void cascadeAffectedIds; void cascadeDeltaDays; // 将来の一覧表示用

  const handleCascadeAffected = useCallback((ids: Set<string>, delta: number) => {
    setCascadeAffectedIds(ids);
    setCascadeDeltaDays(delta);
    setNodes(prev => prev.map(n => {
      if (n.type !== 'piece') return n;
      const isCascadeAffected = ids.has(n.id);
      if (n.data.isCascadeAffected === isCascadeAffected) return n;
      return { ...n, data: { ...n.data, isCascadeAffected } };
    }));
  }, [setNodes]);

  const handleCascadeApply = useCallback(async (
    rootId: string, deltaDays: number,
    affected: { id: string; new_due_date: string | null; new_start_date: string | null }[]
  ) => {
    const root = pieces.find(p => p.id === rootId);
    if (root?.due_date) {
      const dt = new Date(root.due_date);
      dt.setDate(dt.getDate() + deltaDays);
      await pieceApi.update(rootId, { due_date: dt.toISOString().split('T')[0] });
    }
    await Promise.all(
      affected
        .filter(a => a.new_due_date)
        .map(a => pieceApi.update(a.id, { due_date: a.new_due_date!.split('T')[0] }))
    );
    await refresh();
    push(`期日を${deltaDays > 0 ? '+' : ''}${deltaDays}日シフトし、${affected.length}件を更新しました`, 'success');
    setCascadeMode(false);
    setCascadePiece(null);
    setCascadeAffectedIds(new Set());
  }, [pieces, refresh, push]);

  const viewModeRef       = useRef(viewMode);
  viewModeRef.current     = viewMode;
  const workshopThemeRef  = useRef(workshopTheme);
  workshopThemeRef.current = workshopTheme;

  const manualPositions       = useRef<Record<string, { x: number; y: number }>>(loadSavedPositions());
  const initialCollapseApplied = useRef(false); // 初回ロード時の全折りを1回だけ適用
  // 工房→ボード遷移: コンポーネント初期化時点でURLパラメータを取得（searchParamsクリア前）
  const initialProjectIdRef = useRef<string | null>(
    new URLSearchParams(window.location.search).get('project')
  );
  // keep latest pieces/projectMap/connections accessible inside callbacks without stale closure
  const piecesRef       = useRef(pieces);
  const projectMapRef   = useRef(projectMap);
  const connectionsRef  = useRef(connections);
  piecesRef.current     = pieces;
  projectMapRef.current = projectMap;
  connectionsRef.current = connections;
  // keep latest nodes accessible for drag-to-island detection
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  // Direct Manipulation: zone element refs for drop detection
  const assigneeZoneRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const repairZoneRef    = useRef<HTMLDivElement | null>(null);
  const dragHoverIdRef   = useRef<string | null>(null);  // sync ref for callbacks
  const lastDragCheckRef = useRef(0);
  // Folder mode: track which piece IDs are inside a parentNode island
  const folderPieceIdsRef  = useRef<Set<string>>(new Set());
  // Track collapsed state in ref for use in callbacks
  const collapsedProjectsRef = useRef(collapsedProjects);
  collapsedProjectsRef.current = collapsedProjects;

  // ── Layout cache: skip O(n²) force computation when topology hasn't changed ──
  const layoutCacheRef = useRef<{
    key: string;
    pos: Record<string, { x: number; y: number }>;
  }>({ key: '', pos: {} });

  // ── Data fetch ──
  useEffect(() => {
    refresh();
    projectApi.list()
      .then((ps: Project[]) => {
        setProjectMap(Object.fromEntries(ps.map(p => [p.id, p])));
        // 初回ロード時のみ全プロジェクトを折りたたむ（?project= で指定されたものは除外）
        if (!initialCollapseApplied.current && ps.length > 0) {
          const targetProjectId = initialProjectIdRef.current;
          const collapsed = new Set(ps.map(p => p.id));
          if (targetProjectId) collapsed.delete(targetProjectId);
          setCollapsedProjects(collapsed);
          initialCollapseApplied.current = true;
          if (!targetProjectId) {
            setTimeout(() => fitView({ padding: 0.22, duration: 600 }), 400);
          } else {
            // 対象プロジェクトにカメラをフォーカス
            setTimeout(() => {
              const ids = piecesRef.current.filter(p => p.project_id === targetProjectId).map(p => p.id);
              if (ids.length > 0) fitView({ nodes: ids.map(id => ({ id })), padding: 0.3, duration: 700 });
            }, 700);
          }
        }
      })
      .catch(() => {});
    usersApi.workers()
      .then((ws: User[]) => {
        setWorkerMap(Object.fromEntries(ws.map(w => [w.id, { name: w.name }])));
        setWorkers(ws);
      })
      .catch(() => {});
  }, [refresh, fitView]);

  // ── URL param ?piece=ID ── (ガント等からの遷移)
  // プロジェクトフォルダを開き、ピースを選択してカメラをフォーカスする
  useEffect(() => {
    const pieceId = searchParams.get('piece');
    if (!pieceId || pieces.length === 0) return;
    const found = pieces.find(p => p.id === pieceId);
    if (!found) return;

    // 1) プロジェクトフォルダが折りたたまれていたら開く
    if (found.project_id && collapsedProjectsRef.current.has(found.project_id)) {
      setCollapsedProjects(prev => {
        const next = new Set(prev);
        next.delete(found.project_id!);
        return next;
      });
    }

    // 2) 詳細パネルを開く
    setSelectedPiece(found);
    setSearchParams({}, { replace: true });

    // 3) ノードが描画されてからそのピースにカメラをフォーカス
    setTimeout(() => {
      fitView({ nodes: [{ id: pieceId }], padding: 0.45, duration: 700, maxZoom: 1.4 });
    }, 550);
  }, [pieces, searchParams, setSearchParams, fitView]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── URL param ?project=ID — 工房 Orb からの遷移 ──
  // overview でプロジェクト Orb をクリックすると /board?project=ID で飛んでくる。
  // フォルダを開き、filterProject をセットし、カメラをフォーカスする。
  useEffect(() => {
    const projectId = searchParams.get('project');
    if (!projectId) return;
    setFilterProject(projectId);
    // フォルダが折りたたまれていたら開く
    setCollapsedProjects(prev => {
      if (!prev.has(projectId)) return prev;
      const next = new Set(prev);
      next.delete(projectId);
      return next;
    });
    setSearchParams({}, { replace: true });
    initialProjectIdRef.current = null; // URLクリア後にrefも解放
    // ノード描画後にそのプロジェクトにカメラをフォーカス
    setTimeout(() => {
      const projectPieceIds = piecesRef.current
        .filter(p => p.project_id === projectId)
        .map(p => p.id);
      if (projectPieceIds.length > 0) {
        fitView({ nodes: projectPieceIds.map(id => ({ id })), padding: 0.3, duration: 700 });
      }
    }, 650);
  }, [searchParams, setSearchParams, fitView]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── パネルを開いたままデータ同期 ──
  // pieces リストが更新されたとき、開いているパネルのピースを最新データに同期する
  // （onUpdated が refresh() を呼ぶとここが走り、パネルを閉じずに内容が更新される）
  useEffect(() => {
    if (!selectedPiece) return;
    const updated = pieces.find(p => p.id === selectedPiece.id);
    if (updated) {
      setSelectedPiece(updated);
    } else {
      // ピースが削除された場合のみ閉じる
      setSelectedPiece(null);
    }
  }, [pieces]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── リモートカーソル state ──
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursor>>(new Map());

  // ── WebSocket ──
  const { send: wsSend } = useWebSocket(useCallback((event: WSEvent) => {
    if (event.type === 'piece_ready')          { push('新しいピースが着手可能になりました', 'success'); refresh(); }
    if (event.type === 'piece_status_changed') { refresh(); }
    if (event.type === 'auto_promoted')        { refresh(); }
    if (event.type === 'piece_done') {
      const { title, assignee_name } = event.payload as { title?: string; assignee_name?: string };
      const msg = assignee_name && title
        ? `${assignee_name} が「${title}」を完了しました`
        : title ? `「${title}」が完了しました` : 'ピースが完了しました';
      push(msg, 'success');
      refresh();
    }
    if (event.type === 'bottleneck_alert') { push('ボトルネックを検出しました', 'error'); }

    if (event.type === 'cursor_move') {
      const { userId, name, x, y, timestamp } = event.payload as {
        userId: string; name: string; x: number; y: number; timestamp: number;
      };
      setRemoteCursors(prev => {
        const next = new Map(prev);
        next.set(userId, { userId, name, x, y, updatedAt: timestamp ?? Date.now() });
        return next;
      });
    }

    if (event.type === 'cursor_leave') {
      const { userId } = event.payload as { userId: string };
      setRemoteCursors(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    }
  }, [push, refresh]));

  // カーソル位置を 50ms スロットルで送信
  const lastCursorSendRef = useRef(0);
  const { screenToFlowPosition } = useReactFlow();

  // ── Island rebuild helper ──────────────────────────────────────────────────
  // Folder islands (draggable=true) are fixed-size → skip rebuild.
  // Standalone pieces have no project → no islands.
  // So rebuildIslands is effectively a no-op in folder mode.
  const rebuildIslands = useCallback(() => {
    if (!showIslands) return;
    setNodes(prev => {
      // Keep folder islands (draggable=true) unchanged
      const folderIslands = prev.filter(n => n.type === 'projectIsland' && n.draggable);
      const pieceNodes    = prev.filter(n => n.type !== 'projectIsland');
      // Standalone pieces (no project, no parentNode) — rebuild surrounding island if any
      const standalonePieces = piecesRef.current.filter(p => !p.project_id);
      const posMap = Object.fromEntries(
        pieceNodes.filter(n => !n.parentNode).map(n => [n.id, n.position])
      );
      const standaloneIslands = computeIslandNodes(standalonePieces, posMap, projectMapRef.current, toggleCollapse);
      return [...standaloneIslands, ...folderIslands, ...pieceNodes];
    });
  }, [showIslands, toggleCollapse]);

  // ── 派生値: pieces/connections が変わった時だけ再計算（useMemo でキャッシュ）─
  const blockedIds   = useMemo(() => computeBlockedIds(pieces, connections),   [pieces, connections]);
  const impactScales = useMemo(() => computeImpactScales(pieces),              [pieces]);
  const criticalIds  = useMemo(() =>
    showCritical ? computeCriticalPath(pieces, connections) : new Set<string>(),
    [pieces, connections, showCritical]
  );
  const childMap = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const p of pieces) {
      if (p.parent_id) {
        if (!m[p.parent_id]) m[p.parent_id] = [];
        m[p.parent_id].push(p.id);
      }
    }
    return m;
  }, [pieces]);

  // ── Effect 1: データ変更 → グラフ全再構築 ──────────────────────────────────
  useEffect(() => {
    if (pieces.length === 0) return;

    const staleIds    = new Set(bottlenecks.stale_pieces.map(p => p.id));
    const overloadSet = new Set(bottlenecks.overloaded_users.map(u => u.user.id));
    const overloadIds = new Set(
      pieces.filter(p => p.assignee_id && overloadSet.has(p.assignee_id)).map(p => p.id)
    );
    const isBNMode     = viewModeRef.current === 'bottleneck';
    // childMap / blockedIds / impactScales / criticalIds は useMemo でキャッシュ済み

    // ─────────────────────────────────────────────────────────────────────
    // 分類:
    //   ① collapsed  → summaryNode（折りたたみカード）
    //   ② folder     → island（固定サイズ枠）+ pieceNode（parentNode付き・相対座標）
    //   ③ standalone → force/dag レイアウト（プロジェクトなし）
    // ─────────────────────────────────────────────────────────────────────
    const collapsedByProject: Record<string, Piece[]> = {};
    const folderByProject:    Record<string, Piece[]> = {};
    const standalonePieces:   Piece[]                 = [];

    for (const p of pieces) {
      if (!p.parent_id || expandedPieces.has(p.parent_id)) {
        if (p.project_id && collapsedProjects.has(p.project_id)) {
          if (!collapsedByProject[p.project_id]) collapsedByProject[p.project_id] = [];
          collapsedByProject[p.project_id].push(p);
        } else if (p.project_id) {
          if (!folderByProject[p.project_id]) folderByProject[p.project_id] = [];
          folderByProject[p.project_id].push(p);
        } else {
          standalonePieces.push(p);
        }
      }
    }

    // collapsed piece → summary node のマップ（エッジ再マッピング用）
    const pieceToSummary: Record<string, string> = {};
    for (const [projId, ps2] of Object.entries(collapsedByProject)) {
      for (const p of ps2) pieceToSummary[p.id] = `summary-${projId}`;
    }

    // ══ ① SUMMARY NODES (collapsed) ═════════════════════════════════════
    const collapsedEntries = Object.entries(collapsedByProject);
    const summaryNodes: Node[] = collapsedEntries.map(([projId, ps2], index) => {
      const proj = projectMap[projId];
      if (!proj) return null;
      const savedPos = manualPositions.current[`summary-${projId}`];
      const pos = savedPos ?? (() => {
        const savedPiecePositions = ps2
          .map(p => manualPositions.current[p.id])
          .filter((p): p is { x: number; y: number } => !!p);
        if (savedPiecePositions.length > 0) {
          return {
            x: savedPiecePositions.reduce((s, p) => s + p.x, 0) / savedPiecePositions.length,
            y: savedPiecePositions.reduce((s, p) => s + p.y, 0) / savedPiecePositions.length,
          };
        }
        const COLS = 4;
        const COL_W = SUMMARY_W + 40;
        const ROW_H = SUMMARY_H + 48;
        return { x: 120 + (index % COLS) * COL_W, y: 160 + Math.floor(index / COLS) * ROW_H };
      })();
      return {
        id: `summary-${projId}`, type: 'projectSummary', position: pos,
        data: {
          pieces: ps2, color: proj.color || '#6366f1',
          name: proj.name, projectId: projId,
          onToggle: () => toggleCollapse(projId),
          workerMap,
          onBulkReady: async () => {
            await Promise.all(ps2.filter(p => p.status === 'locked').map(p => pieceApi.updateStatus(p.id, 'ready')));
            refresh();
          },
          onBulkDone: async () => {
            await Promise.all(ps2.filter(p => p.status !== 'done').map(p => pieceApi.updateStatus(p.id, 'done')));
            refresh();
          },
        } satisfies SummaryData,
      };
    }).filter(Boolean) as Node[];

    // ── Workshop v2: ピース格 / 通路密度 (Classic では全スキップ) ─────────────
    const pieceRoleMap:   Record<string, 'hero' | 'support' | 'background'> = {};
    const pieceWeightMap: Record<string, number>  = {};   // -1 (float) → +1 (sink)
    const repairedMap:    Record<string, boolean> = {};   // locked→ready 直後
    const corridorDensity: Record<string, number> = {};
    const pieceToProjectMap: Record<string, string> = {};
    const nowMs = Date.now();

    if (workshopTheme) {
      for (const p of pieces) {
        if (p.project_id) pieceToProjectMap[p.id] = p.project_id;

        const freshness = freshnessMap[p.id] ?? 0.4;
        const conns     = concentrationMaps.connCountMap[p.id] ?? 0;
        const isolation = missingMaps.isolationMap[p.id] ?? 0;

        // ── ピース格 ────────────────────────────────────────────────────────
        // HERO: 動いている / 繋がっている / 最近触られた
        // BACKGROUND: 止まっている / 孤立している / 古い
        if (p.status === 'in_progress' && conns >= 2 && freshness > 0.40) {
          pieceRoleMap[p.id] = 'hero';
        } else if (
          p.status === 'done' ||
          (p.status === 'locked' && isolation > 0.65 && conns === 0) ||
          (freshness < 0.12 && p.status !== 'in_progress')
        ) {
          pieceRoleMap[p.id] = 'background';
        } else {
          pieceRoleMap[p.id] = 'support';
        }

        // ── 重さ (weight) ────────────────────────────────────────────────────
        // -1.0 = 浮く (HERO)  /  0 = 通常  /  +1.0 = 沈む (停滞)
        const role = pieceRoleMap[p.id];
        if (role === 'hero') {
          pieceWeightMap[p.id] = -0.55;
        } else if (p.status === 'locked') {
          // locked: 完全停滞 — freshness が低いほど重い
          pieceWeightMap[p.id] = 0.55 + (1 - freshness) * 0.45;
        } else if (p.status === 'in_progress' && freshness < 0.35) {
          // in_progress だが古い: 重さが出始める
          pieceWeightMap[p.id] = (0.35 - freshness) / 0.35 * 0.65;
        } else if (p.status === 'done') {
          pieceWeightMap[p.id] = 0.25;   // 完了: 静かに沈殿
        } else {
          pieceWeightMap[p.id] = 0;
        }

        // ── 修復直後 (repairedRecently) ─────────────────────────────────────
        // locked→ready/in_progress に変わってから 36h 以内
        // OR: completed_at ありで status !== 'done' (再活性化)
        const isReactivated = !!p.completed_at && p.status !== 'done';
        const recentlyStarted = p.started_at
          && (nowMs - new Date(p.started_at).getTime()) < 36 * 3600 * 1000;
        repairedMap[p.id] = isReactivated ||
          ((p.status === 'ready' || p.status === 'in_progress') && !!recentlyStarted);
      }

      // 部屋間エッジ密度 → 通路（corridor）の判定
      for (const c of connections) {
        const projA = pieceToProjectMap[c.from_piece_id];
        const projB = pieceToProjectMap[c.to_piece_id];
        if (projA && projB && projA !== projB) {
          const key = [projA, projB].sort().join('|');
          corridorDensity[key] = (corridorDensity[key] ?? 0) + 1;
        }
      }
    }

    // ══ ② FOLDER ISLANDS + PIECE NODES (expanded projects) ══════════════
    const FOLD_COLS         = 3;
    const FOLD_GAP          = 32;
    const FOLD_PAD_X        = 32;
    const FOLD_PAD_TOP      = 62;  // header pill の下
    const FOLD_PAD_BOTTOM   = 32;
    const folderIslandNodes: Node[] = [];
    const folderPieceNodes:  Node[] = [];
    const newFolderPieceIds = new Set<string>();

    // 自動配置用カーソル（初回配置のみ使用）
    let autoIslandX = 80, autoIslandY = 80;

    const JIG_LABEL_H = 24; // 「完成ピース 🧩」ラベルの高さ
    const JIG_SECTION_GAP = 16; // アクティブ → パズル区間の余白

    // ── 接続方向セット（タブマーカー用） ──────────────────────────────────────────
    // workshopTheme: エッジを非表示にし、代わりにタブに方向刻印を描く
    const outgoingSet = new Set(connections.map(c => c.from_piece_id));
    const incomingSet = new Set(connections.map(c => c.to_piece_id));
    // 完了チップのスナップ間隔: workshopTheme では隙間ゼロでくっつける
    const chipSnapGapX = workshopTheme ? 1 : DONE_CHIP_GAP_X;
    // タブ接続IDを全プロジェクト分リセット（ループの前に一度だけ）
    tabConnRightRef.current  = {};
    tabConnBottomRef.current = {};

    // フォルダ（島）のソート順
    const folderEntries = Object.entries(folderByProject);
    if (islandSort === 'name') {
      folderEntries.sort(([a], [b]) => (projectMap[a]?.name ?? '').localeCompare(projectMap[b]?.name ?? ''));
    } else if (islandSort === 'progress') {
      folderEntries.sort(([a], [b]) => {
        const pct = (ps: Piece[]) => ps.length === 0 ? 0 : ps.filter(p => p.status === 'done').length / ps.length;
        return pct(folderByProject[b]) - pct(folderByProject[a]);
      });
    }

    for (const [projId, rawPieces] of folderEntries) {
      // ピース内ソート
      const STATUS_RANK: Record<string, number> = { in_progress: 0, ready: 1, locked: 2, done: 3 };
      const projPieces = pieceSort === 'status'
        ? [...rawPieces].sort((a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9))
        : pieceSort === 'due'
        ? [...rawPieces].sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return a.due_date.localeCompare(b.due_date);
          })
        : rawPieces;

      const proj = projectMap[projId];
      if (!proj || projPieces.length === 0) continue;
      // showPinnedOnly が true の場合、非ピンプロジェクトをスキップ
      if (showPinnedOnly && !pinnedProjects.has(projId)) continue;
      // プロジェクトフィルターが設定されている場合、対象外フォルダ全体をスキップ
      if (filterProject && projId !== filterProject) continue;

      // ── ① アクティブ / 完了 に分離 ────────────────────────────────────────
      const activePieces = projPieces.filter(p => p.status !== 'done');
      const donePieces   = projPieces.filter(p => p.status === 'done');

      // ── ② 部屋の温度を先に計算 — 空間設計の基礎値 ────────────────────────
      const fTotal     = Math.max(1, projPieces.length);
      const fNow       = new Date();
      const fInprog    = activePieces.filter(p => p.status === 'in_progress').length;
      const fOverdue   = activePieces.filter(p =>
        p.due_date && new Date(p.due_date) < fNow && p.status !== 'done'
      ).length;
      const folderWarmth = Math.max(0, Math.min(100,
        (donePieces.length / fTotal) * 45
        + (fInprog / fTotal) * 40
        - (fOverdue / fTotal) * 25
        + 15
      ));
      const isPristine   = fInprog === 0 && donePieces.length === 0;
      const overdueRatio = fOverdue / fTotal;
      const lockedRatio  = activePieces.filter(p => p.status === 'locked').length / fTotal;
      const activeRatio  = fInprog / fTotal;
      // roomState: 部屋の生命状態
      // SEED: まだほぼ動いていない → ACTIVE: 稼働中 → STALLED: 停滞
      const roomState: 'seed' | 'active' | 'stalled' = isPristine
        ? 'seed'
        : (activeRatio > 0.25 || folderWarmth > 58)
        ? 'active'
        : (lockedRatio > 0.4 || overdueRatio > 0.3 || folderWarmth < 28)
        ? 'stalled'
        : 'active';

      // ── ③ Workshop v2: 部屋ごとの空間呼吸 ──────────────────────────────────
      // 活発な部屋は密に（ピースが近く、壁が狭い）
      // 静かな部屋は広く（余白が多く、壁が遠い）
      // warmth 0-100 で連続変化。Classic モードでは固定値を維持。
      const roomGap    = workshopTheme ? Math.round(16 + (1 - folderWarmth / 100) * 26) : FOLD_GAP;
      const roomPadX   = workshopTheme ? Math.round(24 + (1 - folderWarmth / 100) * 44) : FOLD_PAD_X;
      const roomPadBot = workshopTheme ? Math.round(20 + (1 - folderWarmth / 100) * 36) : FOLD_PAD_BOTTOM;

      // v2: 在作業→着手可能→ロック の順で配置（視線の重心 = 動いている仕事）
      const orderedActivePieces = workshopTheme
        ? [...activePieces].sort((a, b) => {
            const rank: Record<PieceStatus, number> = { in_progress: 0, ready: 1, locked: 2, done: 3 };
            return rank[a.status] - rank[b.status];
          })
        : activePieces;

      // ── workshopTheme: 連結成分ベースのジグソー配置 ───────────────────────────
      // 接続のあるピース同士だけが密着し、接続なし（孤立）ピースは間隔を空ける。
      // アルゴリズム:
      //   1. 有向グラフから無向連結成分を BFS で抽出
      //   2. 各成分内で BFS: ソース(in_progress 優先) から右へ展開
      //      複数の後継ピースは同列の下段に積む
      //   3. 成分間は COMP_GAP 分の水平余白を挟む
      //   4. 孤立ピース (接続なし) は末尾にまとめる
      //   5. 島サイズ = 全ピース配置後のバウンディングボックス
      let jigPosMap: Record<string, {x: number, y: number}> = {};
      let jigTabArrows: Record<string, {right?: boolean, bottom?: boolean, left?: boolean, top?: boolean}> = {};
      let jigIncoming: Record<string, {left?: boolean, top?: boolean, right?: boolean, bottom?: boolean}> = {};
      let jigTabConnIds: Record<string, {right?: string, bottom?: string, left?: string, top?: string}> = {};
      let jigBboxMaxX = roomPadX;
      let jigBboxMaxY = FOLD_PAD_TOP;

      if (workshopTheme && activePieces.length > 0) {
        const pieceIdSet = new Set(activePieces.map(p => p.id));
        const intraConns = connections.filter(c =>
          pieceIdSet.has(c.from_piece_id) && pieceIdSet.has(c.to_piece_id)
        );

        // ── 有向・無向隣接リストを構築 ────────────────────────────────────────
        const outEdges: Record<string, string[]> = {};
        const inEdges:  Record<string, string[]> = {};
        const undirAdj: Record<string, Set<string>> = {};
        for (const p of activePieces) {
          outEdges[p.id] = [];
          inEdges[p.id]  = [];
          undirAdj[p.id] = new Set();
        }
        for (const c of intraConns) {
          outEdges[c.from_piece_id].push(c.to_piece_id);
          inEdges[c.to_piece_id].push(c.from_piece_id);
          undirAdj[c.from_piece_id].add(c.to_piece_id);
          undirAdj[c.to_piece_id].add(c.from_piece_id);
        }

        // ── BFS で連結成分を抽出 ─────────────────────────────────────────────
        const statusRank: Record<PieceStatus, number> = { in_progress: 0, ready: 1, locked: 2, done: 3 };
        const pieceById: Record<string, Piece> = {};
        for (const p of activePieces) pieceById[p.id] = p;

        const globalVisited = new Set<string>();
        const components: string[][] = [];

        for (const p of orderedActivePieces) {
          if (globalVisited.has(p.id)) continue;
          const comp: string[] = [];
          const queue = [p.id];
          globalVisited.add(p.id);
          while (queue.length > 0) {
            const id = queue.shift()!;
            comp.push(id);
            const neighbors = [...undirAdj[id]].sort((a, b) =>
              statusRank[pieceById[a]?.status ?? 'locked'] - statusRank[pieceById[b]?.status ?? 'locked']
            );
            for (const nb of neighbors) {
              if (!globalVisited.has(nb)) { globalVisited.add(nb); queue.push(nb); }
            }
          }
          components.push(comp);
        }

        // 接続のある成分を先に、孤立を後に
        components.sort((a, b) => {
          const aConn = a.some(id => outEdges[id].length > 0 || inEdges[id].length > 0) ? 1 : 0;
          const bConn = b.some(id => outEdges[id].length > 0 || inEdges[id].length > 0) ? 1 : 0;
          if (bConn !== aConn) return bConn - aConn;
          return b.length - a.length;
        });

        // ── 各成分をBFSで格子配置 ─────────────────────────────────────────────
        const COMP_GAP     = 36;  // 成分間の水平余白 (px)
        // 自動折り返し列数: 「cols ≈ rows」でピクセル的に正方形に近くなるよう sqrt(n) を基準にする。
        // (V2_W_BODY=203 > V2_H_BODY=139 なのでピースは横長。cols=rows でほぼ正方形の島になる)
        // jigsawWrapCols はユーザー手動調整値（UIの +/−）。デフォルト5以外ならそちらを優先。
        const autoWrapCols = Math.max(3, Math.ceil(Math.sqrt(activePieces.length)));
        const effectiveWrapCols = jigsawWrapCols !== 5 ? jigsawWrapCols : autoWrapCols;
        const wrapMaxX     = roomPadX + effectiveWrapCols * V2_W_BODY; // 折り返すX上限
        let cursorX = roomPadX;
        let cursorY = FOLD_PAD_TOP;

        for (const comp of components) {
          if (comp.length === 0) continue;
          const compIdSet = new Set(comp);

          // ソースピース (成分内に入力辺なし) を探す。なければ最上位ステータスから開始
          const sources = comp
            .filter(id => inEdges[id].every(src => !compIdSet.has(src)))
            .sort((a, b) => statusRank[pieceById[a]?.status ?? 'locked'] - statusRank[pieceById[b]?.status ?? 'locked']);
          const startIds = sources.length > 0 ? sources : [comp[0]];

          // BFS: 後継を右 (col+1) に展開、複数後継は同列で縦積み
          const gridPos: Record<string, {col: number, row: number}> = {};
          const nextRowInCol: Record<number, number> = {};
          const getNextRow = (col: number) => nextRowInCol[col] ?? 0;
          const occupy = (col: number, row: number) => {
            nextRowInCol[col] = Math.max(getNextRow(col), row + 1);
          };

          const bfsVisited = new Set<string>();
          const bfsQueue: {id: string, col: number}[] = [];
          for (const sid of startIds) {
            if (!bfsVisited.has(sid)) {
              const row = getNextRow(0);
              occupy(0, row);
              gridPos[sid] = { col: 0, row };
              bfsVisited.add(sid);
              bfsQueue.push({ id: sid, col: 0 });
            }
          }

          while (bfsQueue.length > 0) {
            const { id, col } = bfsQueue.shift()!;
            const nextCol = col + 1;
            const succs = outEdges[id]
              .filter(sid => compIdSet.has(sid) && !bfsVisited.has(sid))
              .sort((a, b) => statusRank[pieceById[a]?.status ?? 'locked'] - statusRank[pieceById[b]?.status ?? 'locked']);
            for (const sid of succs) {
              bfsVisited.add(sid);
              const row = getNextRow(nextCol);
              occupy(nextCol, row);
              gridPos[sid] = { col: nextCol, row };
              bfsQueue.push({ id: sid, col: nextCol });
            }
          }

          // 未到達 (サイクル等) は末尾列に積む
          for (const id of comp) {
            if (!gridPos[id]) {
              const maxCol = Object.keys(nextRowInCol).length > 0
                ? Math.max(...Object.keys(nextRowInCol).map(Number)) + 1
                : 0;
              const row = getNextRow(maxCol);
              occupy(maxCol, row);
              gridPos[id] = { col: maxCol, row };
            }
          }

          const compMaxCol = Math.max(...Object.values(gridPos).map(p => p.col), 0);

          // 折り返し判定: 現成分の幅が wrapMaxX を超える場合は次行へ
          const compWidthPx = (compMaxCol + 1) * V2_W_BODY;
          if (cursorX > roomPadX && cursorX + compWidthPx > wrapMaxX) {
            cursorX = roomPadX;
            cursorY = jigBboxMaxY + V2_H_BODY + 24;
          }

          // ピクセル位置に変換して jigPosMap へ
          for (const id of comp) {
            const gp = gridPos[id] ?? { col: 0, row: 0 };
            const px = cursorX + gp.col * V2_W_BODY;
            const py = cursorY + gp.row * V2_H_BODY;
            jigPosMap[id] = { x: px, y: py };
            jigBboxMaxX = Math.max(jigBboxMaxX, px);
            jigBboxMaxY = Math.max(jigBboxMaxY, py);
          }

          // 次成分のカーソルを右へ進める
          cursorX += compWidthPx + COMP_GAP;
        }

        // ── タブ刻印: 実際の位置差から right/bottom を決定 ─────────────────
        // manualPositions.current (手動移動後) を優先し、なければ計算位置を使う。
        // positionVersion が更新されるたびにこの useEffect が再実行されるため、
        // ドラッグ後も正しい方向が反映される。
        for (const c of intraConns) {
          const spKey = `v2f:${c.from_piece_id}`;
          const tpKey = `v2f:${c.to_piece_id}`;
          const sp = manualPositions.current[spKey] ?? jigPosMap[c.from_piece_id];
          const tp = manualPositions.current[tpKey] ?? jigPosMap[c.to_piece_id];
          if (!sp || !tp) continue;
          const dx = tp.x - sp.x;
          const dy = tp.y - sp.y;
          const incoming = jigIncoming[c.to_piece_id] ?? {};
          if (Math.abs(dx) >= Math.abs(dy)) {
            if (dx >= 0) {
              // 右方向: FROM(左ピース)の右タブに ▶ を表示
              const a = jigTabArrows[c.from_piece_id] ?? {};
              const k = jigTabConnIds[c.from_piece_id] ?? {};
              a.right = true; incoming.left = true; k.right = c.id;
              tabConnRightRef.current[c.from_piece_id] = c.id;
              jigTabArrows[c.from_piece_id]  = a;
              jigTabConnIds[c.from_piece_id] = k;
            } else {
              // 左方向: FROM(右ピース)→TO(左ピース)。左ピース(TO)の右タブに ◀ を表示
              const a = jigTabArrows[c.to_piece_id] ?? {};
              const k = jigTabConnIds[c.to_piece_id] ?? {};
              a.left = true; incoming.right = true; k.left = c.id;
              tabConnRightRef.current[c.to_piece_id] = c.id;
              jigTabArrows[c.to_piece_id]  = a;
              jigTabConnIds[c.to_piece_id] = k;
            }
          } else {
            if (dy >= 0) {
              // 下方向: FROM(上ピース)の下タブに ▼ を表示
              const a = jigTabArrows[c.from_piece_id] ?? {};
              const k = jigTabConnIds[c.from_piece_id] ?? {};
              a.bottom = true; incoming.top = true; k.bottom = c.id;
              tabConnBottomRef.current[c.from_piece_id] = c.id;
              jigTabArrows[c.from_piece_id]  = a;
              jigTabConnIds[c.from_piece_id] = k;
            } else {
              // 上方向: FROM(下ピース)→TO(上ピース)。上ピース(TO)の下タブに ▲ を表示
              const a = jigTabArrows[c.to_piece_id] ?? {};
              const k = jigTabConnIds[c.to_piece_id] ?? {};
              a.top = true; incoming.bottom = true; k.top = c.id;
              tabConnBottomRef.current[c.to_piece_id] = c.id;
              jigTabArrows[c.to_piece_id]  = a;
              jigTabConnIds[c.to_piece_id] = k;
            }
          }
          jigIncoming[c.to_piece_id] = incoming;
        }
      }

      // jigActiveRows: 島サイズ計算用（バウンディングボックスから導出）
      const jigActiveCols = activePieces.length > 0
        ? Math.max(1, Math.round((jigBboxMaxX - roomPadX) / V2_W_BODY) + 1)
        : 1;
      const jigActiveRows = activePieces.length > 0
        ? Math.max(1, Math.round((jigBboxMaxY - FOLD_PAD_TOP) / V2_H_BODY) + 1)
        : 1;

      // ── ④ アクティブ区間のサイズ ──────────────────────────────────────────
      const activeCols = workshopTheme
        ? jigActiveCols
        : Math.min(FOLD_COLS, Math.max(orderedActivePieces.length, 1));
      const activeRows = workshopTheme
        ? jigActiveRows
        : Math.ceil(orderedActivePieces.length / activeCols);
      const activeSectionH = orderedActivePieces.length > 0
        ? workshopTheme
          ? (jigBboxMaxY - FOLD_PAD_TOP) + PIECE_NODE_V2_H
          : activeRows * PIECE_NODE_H + (activeRows - 1) * roomGap
        : 0;

      // ── ⑤ 完了チップ区間のサイズ ─────────────────────────────────────────────
      // workshopTheme: x_step = DC_W でインターロック配置
      const activeOnlyW = workshopTheme
        ? jigBboxMaxX - roomPadX + PIECE_NODE_V2_W
        : activeCols * PIECE_NODE_W + (activeCols - 1) * roomGap;
      const availChipW     = activeOnlyW;
      // インターロック列数: (n-1)*DC_W + DONE_CHIP_W <= availChipW → n
      const doneChipCols   = donePieces.length > 0
        ? workshopTheme
          ? Math.max(1, Math.floor((availChipW - DC_TAB) / DC_W) + 1)
          : Math.max(1, Math.floor((availChipW + chipSnapGapX) / (DONE_CHIP_W + chipSnapGapX)))
        : 0;
      const doneChipRows   = donePieces.length > 0 ? Math.ceil(donePieces.length / doneChipCols) : 0;
      const doneSectionH   = donePieces.length > 0
        ? workshopTheme
          ? (doneChipRows - 1) * DC_H + DONE_CHIP_H + 8
          : doneChipRows * DONE_CHIP_H + Math.max(0, doneChipRows - 1) * DONE_CHIP_GAP_Y + 8
        : 0;
      const doneLabelH   = donePieces.length > 0 && orderedActivePieces.length > 0 ? JIG_LABEL_H : 0;
      const doneSepH     = donePieces.length > 0 && orderedActivePieces.length > 0 ? JIG_SECTION_GAP : 0;

      // ── ⑥ 島全体のサイズ ───────────────────────────────────────────────────
      // workshopTheme: バウンディングボックスから実際のサイズを算出
      const calcIslandW = workshopTheme
        ? jigBboxMaxX + PIECE_NODE_V2_W + roomPadX
        : activeCols * PIECE_NODE_W + (activeCols - 1) * roomGap + roomPadX * 2;
      const calcIslandH = FOLD_PAD_TOP + activeSectionH + doneSepH + doneLabelH + doneSectionH + roomPadBot;
      const doneStartY = FOLD_PAD_TOP + activeSectionH + doneSepH + doneLabelH;
      const islandId = `island-${projId}`;
      // 手動リサイズがあれば優先
      const savedIslandSize = workshopTheme ? manualIslandSizes.current[islandId] : null;
      const islandW = savedIslandSize?.w ?? calcIslandW;
      const islandH = savedIslandSize?.h ?? calcIslandH;

      // Island 位置: 保存済み > サマリーカードの旧位置 > 自動グリッド
      // v2: 活発な島は近く配置（工房中央に集まる）、静かな島は周辺へ
      const roomIslandGap = workshopTheme
        ? (folderWarmth > 60 ? 50 : folderWarmth < 30 ? 130 : 80)
        : 80;
      if (!manualPositions.current[islandId]) {
        const fromSummary = manualPositions.current[`summary-${projId}`];
        manualPositions.current[islandId] = fromSummary ?? { x: autoIslandX, y: autoIslandY };
        autoIslandX += islandW + roomIslandGap;
        if (autoIslandX > 1800) { autoIslandX = 80; autoIslandY += islandH + roomIslandGap; }
      }
      const islandPos = manualPositions.current[islandId];

      folderIslandNodes.push({
        id: islandId, type: 'projectIsland',
        position: islandPos,
        data: {
          width: islandW, height: islandH,
          color: proj.color || '#6366f1',
          name: proj.name, count: projPieces.length,
          projectId: projId, isCollapsed: false,
          onToggle: () => toggleCollapse(projId),
          onCreatePiece: () => {
            setCreateIslandProjectId(projId);
            setCreateOpen(true);
          },
          // 整列: このフォルダのピースの手動位置をすべてクリアして再レイアウト
          onTidy: () => {
            for (const p of projPieces) {
              delete manualPositions.current[`v2f:${p.id}`];
              delete manualPositions.current[`f:${p.id}`];
            }
            try {
              const all = JSON.parse(localStorage.getItem('pz_board_positions_v2') ?? '{}');
              for (const p of projPieces) { delete all[`v2f:${p.id}`]; delete all[`f:${p.id}`]; }
              localStorage.setItem('pz_board_positions_v2', JSON.stringify(all));
            } catch {}
            setPositionVersion(v => v + 1);
          },
          onDeleteConnections: async () => {
            const projPieceIds = new Set(projPieces.map(p => p.id));
            const internalConns = connections.filter(
              c => projPieceIds.has(c.from_piece_id) && projPieceIds.has(c.to_piece_id)
            );
            if (internalConns.length === 0) return;
            if (!window.confirm(`このフォルダ内の接続 ${internalConns.length} 件を削除しますか？`)) return;
            await Promise.all(internalConns.map(c => pieceApi.deleteConnection(c.id)));
            refresh();
          },
          isPinned:    pinnedProjects.has(projId),
          onTogglePin: () => togglePin(projId),
          // 完了パズル区間のラベル位置 (アクティブピースがある場合のみ表示)
          doneZoneY:   donePieces.length > 0 && orderedActivePieces.length > 0 ? doneStartY : undefined,
          doneCount:   donePieces.length,
          warmth:       folderWarmth,
          isPristine:   isPristine,
          roomState:    roomState,
          overdueRatio: overdueRatio,
          isKnowledgeConcentrated: workerMetrics.kcsMap[projId] ?? false,
          // PHASE 15: Temporal Flow
          temporalCompression: viewMode === 'temporal' ? (temporalMetrics.compressionMap[projId] ?? 1) : undefined,
          throughput:          viewMode === 'temporal' ? (temporalMetrics.throughputMap[projId]  ?? 0.5) : undefined,
          // リサイズコールバック (workshopThemeのみ)
          onResize: workshopTheme ? (w: number, h: number) => {
            manualIslandSizes.current[islandId] = { w, h };
            try { localStorage.setItem('pz_island_sizes', JSON.stringify(manualIslandSizes.current)); } catch {}
            setNodes(prev => prev.map(n => {
              if (n.id !== islandId) return n;
              return { ...n, data: { ...n.data, width: w, height: h }, style: { ...n.style, width: w, height: h } };
            }));
          } : undefined,
          onArchive: () => handleArchiveProject(projId),
        } satisfies IslandData,
        draggable: true, selectable: false, focusable: false,
        zIndex: -1,
        style: { width: islandW, height: islandH, zIndex: -1 },
      });

      // ── ⑦ アクティブピースをノード化 ─────────────────────────────────────
      orderedActivePieces.forEach((piece, i) => {
        // workshopTheme: トポロジカル配置 / classic: グリッド配置
        const defaultRel = workshopTheme
          ? (jigPosMap[piece.id] ?? { x: roomPadX, y: FOLD_PAD_TOP + (i % 4) * V2_H_BODY })
          : (() => {
              const col = i % activeCols;
              const row = Math.floor(i / activeCols);
              return { x: roomPadX + col * (PIECE_NODE_W + roomGap), y: FOLD_PAD_TOP + row * (PIECE_NODE_H + roomGap) };
            })();
        // workshopTheme は v2f: キー → 旧クラシックレイアウトのキャッシュを汚染しない
        const posKey = workshopTheme ? `v2f:${piece.id}` : `f:${piece.id}`;
        const relPos = manualPositions.current[posKey] ?? defaultRel;
        newFolderPieceIds.add(piece.id);

        const isBottleneck   = isBNMode && (staleIds.has(piece.id) || overloadIds.has(piece.id));
        const isBlocked      = blockedIds.has(piece.id);
        const thisChildren   = childMap[piece.id] ?? [];
        const matchesStatus  = !filterStatus  || piece.status === filterStatus;
        const matchesProject = !filterProject || piece.project_id === filterProject;
        const matchesSearch  = !filterSearch  || piece.title.toLowerCase().includes(filterSearch.toLowerCase());
        const filterDimmed   = !!(filterStatus || filterProject || filterSearch) && !(matchesStatus && matchesProject && matchesSearch);

        folderPieceNodes.push({
          id: piece.id, type: 'piece',
          parentNode: islandId,
          position: relPos,
          data: {
            piece, isBottleneck, isBlocked, isCritical: criticalIds.has(piece.id), isConnecting: false,
            projectColor: proj.color, projectName: proj.name,
            assigneeName: piece.assignee_id ? workerMap[piece.assignee_id]?.name : undefined,
            impactScale: impactScales[piece.id] ?? 1,
            isDimmed: filterDimmed, isHighlighted: false,
            childCount: thisChildren.length,
            isExpanded: expandedPieces.has(piece.id),
            onToggleExpand: () => toggleExpand(piece.id),
            isChild: !!piece.parent_id,
            visuals: visualStateMap[piece.id],
            pieceRole:        workshopTheme ? (pieceRoleMap[piece.id]  ?? 'support') : undefined,
            weight:           workshopTheme ? (pieceWeightMap[piece.id] ?? 0)        : undefined,
            repairedRecently: workshopTheme ? (repairedMap[piece.id]   ?? false)     : undefined,
            onStatusAdvance:  workshopTheme ? makeStatusAdvance(piece.id)            : undefined,
            tabArrows:        workshopTheme ? (jigTabArrows[piece.id] ?? {})   : undefined,
            tabIncoming:      workshopTheme ? (jigIncoming[piece.id]  ?? {})   : undefined,
            // タブあり = 接続あり: クリックで方向反転、右クリックで個別切り離し
            // ▶ も ◀ も常に右凸タブ上に表示 → onRightTabClick で統一
            // ▼ も ▲ も常に下凸タブ上に表示 → onBottomTabClick で統一
            onRightTabClick:  workshopTheme && (jigTabArrows[piece.id]?.right || jigTabArrows[piece.id]?.left)
              ? () => handleTabClick(piece.id, 'right') : undefined,
            onBottomTabClick: workshopTheme && (jigTabArrows[piece.id]?.bottom || jigTabArrows[piece.id]?.top)
              ? () => handleTabClick(piece.id, 'bottom') : undefined,
            onLeftTabClick:   undefined,
            onTopTabClick:    undefined,
            onRightTabDetach:  workshopTheme && (jigTabArrows[piece.id]?.right || jigTabArrows[piece.id]?.left)
              ? () => handleTabDetach(piece.id, 'right') : undefined,
            onBottomTabDetach: workshopTheme && (jigTabArrows[piece.id]?.bottom || jigTabArrows[piece.id]?.top)
              ? () => handleTabDetach(piece.id, 'bottom') : undefined,
            onLeftTabDetach:  undefined,
            onTopTabDetach:   undefined,
          },
          style: filterDimmed ? { pointerEvents: 'none' as const } : undefined,
        });
      });

      // ── ⑥ 完了ピースを小型チップ (DoneChipNode) で整列配置 ─────────────────
      donePieces.forEach((piece, i) => {
        const col        = i % doneChipCols;
        const row        = Math.floor(i / doneChipCols);
        // workshopTheme: インターロック間隔(DC_W) / classic: バウンディングボックス間隔
        const defaultRel = {
          x: roomPadX + col * (workshopTheme ? DC_W : (DONE_CHIP_W + chipSnapGapX)),
          y: doneStartY + row * (workshopTheme ? DC_H : (DONE_CHIP_H + DONE_CHIP_GAP_Y)),
        };
        const doneKey = workshopTheme ? `v2fd:${piece.id}` : `fd:${piece.id}`;
        const relPos = manualPositions.current[doneKey] ?? defaultRel;
        newFolderPieceIds.add(piece.id);

        const matchesStatus  = !filterStatus  || piece.status === filterStatus;
        const matchesProject = !filterProject || piece.project_id === filterProject;
        const matchesSearch  = !filterSearch  || piece.title.toLowerCase().includes(filterSearch.toLowerCase());
        const filterDimmed   = !!(filterStatus || filterProject || filterSearch) && !(matchesStatus && matchesProject && matchesSearch);

        folderPieceNodes.push({
          id: piece.id, type: 'doneChip',
          parentNode: islandId,
          position: relPos,
          draggable: false,
          data: {
            piece,
            isDimmed: filterDimmed,
            projectColor: proj.color,
          },
          style: filterDimmed ? { opacity: 0.15, pointerEvents: 'none' as const } : undefined,
        });
      });
    }
    folderPieceIdsRef.current = newFolderPieceIds;

    // ══ ② EMPTY PROJECT ISLANDS (ピースのないプロジェクト) ══════════════════
    const EMPTY_ISLAND_W = 280;
    const EMPTY_ISLAND_H = 100;
    for (const [projId, proj] of Object.entries(projectMapRef.current)) {
      // 既にフォルダとして描画済み、または折りたたみ済みならスキップ
      if (folderByProject[projId] || collapsedByProject[projId]) continue;
      if (filterProject && projId !== filterProject) continue;
      if (showPinnedOnly && !pinnedProjects.has(projId)) continue;
      const islandId = `island-${projId}`;
      if (!manualPositions.current[islandId]) {
        manualPositions.current[islandId] = { x: autoIslandX, y: autoIslandY };
        autoIslandX += EMPTY_ISLAND_W + 80;
        if (autoIslandX > 1800) { autoIslandX = 80; autoIslandY += EMPTY_ISLAND_H + 80; }
      }
      folderIslandNodes.push({
        id: islandId, type: 'projectIsland',
        position: manualPositions.current[islandId],
        data: {
          width: EMPTY_ISLAND_W, height: EMPTY_ISLAND_H,
          color: proj.color || '#6366f1',
          name: proj.name, count: 0,
          projectId: projId, isCollapsed: false,
          onToggle: () => toggleCollapse(projId),
          onCreatePiece: () => { setCreateIslandProjectId(projId); setCreateOpen(true); },
          onTidy: () => {},
          onDeleteConnections: async () => {},
          isPinned: pinnedProjects.has(projId),
          onTogglePin: () => togglePin(projId),
          doneZoneY: undefined, doneCount: 0,
          warmth: 15, isPristine: true,
          roomState: 'seed', overdueRatio: 0,
          isKnowledgeConcentrated: false,
        } satisfies IslandData,
        draggable: true, selectable: false, focusable: false,
        zIndex: -1,
        style: { width: EMPTY_ISLAND_W, height: EMPTY_ISLAND_H, zIndex: -1 },
      });
    }

    // ══ ③ STANDALONE NODES (no project) — force / dag / groupByAssignee ════
    const visibleConns = connections.filter(c =>
      !pieceToSummary[c.from_piece_id] && !pieceToSummary[c.to_piece_id] &&
      !newFolderPieceIds.has(c.from_piece_id) && !newFolderPieceIds.has(c.to_piece_id)
    );
    const topoKey = layoutMode + '|' + (groupByAssignee ? 'grp|' : '') +
      standalonePieces.map(p => p.id).sort().join(',') + '|' +
      visibleConns.map(c => `${c.from_piece_id}>${c.to_piece_id}`).sort().join(',');

    let autoPos: Record<string, { x: number; y: number }>;
    if (groupByAssignee) {
      // 担当者別グループレイアウト: 各担当者を行として縦に並べる
      const COL_GAP   = Math.round((PIECE_NODE_W + 52) * identityRef.current.nodeSpacingMult);
      const ROW_GAP   = Math.round((PIECE_NODE_H + 36) * identityRef.current.nodeSpacingMult);
      const GROUP_GAP = Math.round(80 * identityRef.current.islandSpacingMult);
      // グループ分け
      const groups = new Map<string, Piece[]>(); // assigneeId | 'none' → pieces
      for (const p of standalonePieces) {
        const key = p.assignee_id ?? '__none__';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(p);
      }
      // ソート: 担当者名順、未割当は最後
      const sortedGroups = [...groups.entries()].sort(([a], [b]) => {
        if (a === '__none__') return 1;
        if (b === '__none__') return -1;
        return (workerMap[a]?.name ?? '').localeCompare(workerMap[b]?.name ?? '');
      });
      autoPos = {};
      let baseY = 120;
      for (const [, groupPieces] of sortedGroups) {
        groupPieces.forEach((p, i) => {
          autoPos[p.id] = { x: 100 + i * COL_GAP, y: baseY };
        });
        baseY += ROW_GAP + GROUP_GAP;
      }
    } else if (viewMode === 'journey') {
      // Journey Layout: worker × depth スイムレーン (PHASE 11)
      const journeyKey = 'journey|' + topoKey;
      if (layoutCacheRef.current.key === journeyKey) {
        autoPos = layoutCacheRef.current.pos;
      } else {
        autoPos = journeyLayout(standalonePieces, visibleConns, workerMap);
        layoutCacheRef.current = { key: journeyKey, pos: autoPos };
      }
    } else if (layoutMode === 'force') {
      if (layoutCacheRef.current.key === topoKey) {
        autoPos = layoutCacheRef.current.pos;
      } else {
        // 同一担当者グループ (Piece Stack System)
        const assigneeGroups: Record<string, string[]> = {};
        for (const p of standalonePieces) {
          if (!p.assignee_id) continue;
          (assigneeGroups[p.assignee_id] ??= []).push(p.id);
        }
        autoPos = forceDirectedLayout(standalonePieces, visibleConns, manualPositions.current, affinityPairs, assigneeGroups,
          viewMode === 'temporal' ? temporalMetrics.gravityMap : undefined);
        layoutCacheRef.current = { key: topoKey, pos: autoPos };
      }
    } else {
      autoPos = autoLayout(standalonePieces, connections);
    }

    const standaloneNodes: Node[] = standalonePieces.map(piece => {
      const isBottleneck   = isBNMode && (staleIds.has(piece.id) || overloadIds.has(piece.id));
      const isBlocked      = blockedIds.has(piece.id);
      const thisChildren   = childMap[piece.id] ?? [];
      let pos: { x: number; y: number };
      if (piece.parent_id && expandedPieces.has(piece.parent_id)) {
        const parentPos = manualPositions.current[piece.parent_id] ?? autoPos[piece.parent_id] ?? { x: 400, y: 300 };
        const siblings  = childMap[piece.parent_id] ?? [];
        const idx       = siblings.indexOf(piece.id);
        const n         = siblings.length;
        pos = manualPositions.current[piece.id] ?? {
          x: parentPos.x + (idx - (n - 1) / 2) * (PIECE_NODE_W + 60),
          y: parentPos.y + PIECE_NODE_H + 90,
        };
      } else {
        pos = layoutMode === 'force'
          ? autoPos[piece.id] ?? { x: 60, y: 60 }
          : manualPositions.current[piece.id] ?? autoPos[piece.id] ?? { x: 60, y: 60 };
      }
      const matchesStatus  = !filterStatus  || piece.status === filterStatus;
      const matchesProject = !filterProject || piece.project_id === filterProject;
      const matchesSearch  = !filterSearch  || piece.title.toLowerCase().includes(filterSearch.toLowerCase());
      const filterDimmed   = !!(filterStatus || filterProject || filterSearch) && !(matchesStatus && matchesProject && matchesSearch);
      return {
        id: piece.id, type: 'piece', position: pos,
        data: {
          piece, isBottleneck, isBlocked, isCritical: criticalIds.has(piece.id), isConnecting: false,
          projectColor: undefined, projectName: undefined,
          assigneeName: piece.assignee_id ? workerMap[piece.assignee_id]?.name : undefined,
          impactScale: impactScales[piece.id] ?? 1,
          isDimmed: filterDimmed, isHighlighted: false,
          childCount: thisChildren.length,
          isExpanded: expandedPieces.has(piece.id),
          onToggleExpand: () => toggleExpand(piece.id),
          isChild: !!piece.parent_id,
          visuals:          visualStateMap[piece.id],
          pieceRole:        workshopTheme ? (pieceRoleMap[piece.id]   ?? 'support') : undefined,
          weight:           workshopTheme ? (pieceWeightMap[piece.id] ?? 0)         : undefined,
          repairedRecently: workshopTheme ? (repairedMap[piece.id]    ?? false)     : undefined,
          onStatusAdvance:  workshopTheme ? makeStatusAdvance(piece.id)             : undefined,
          tabArrows:        workshopTheme ? (outgoingSet.has(piece.id) ? { right: true } : {}) : undefined,
          tabIncoming:      workshopTheme ? (incomingSet.has(piece.id) ? { left: true }  : {}) : undefined,
          // PHASE 14A: People空間 (force layout) でドラッグアサイン有効化
          isDragAssignMode: workshopTheme && layoutMode === 'force',
          // PHASE 14D: hover で関連 Territory に知識連動を伝える
          onProjectHover: (workshopTheme && layoutMode === 'force')
            ? handlePieceProjectHover
            : undefined,
          // PHASE 15: Temporal Flow — 時間収束の重力・残像・臨界
          deadlineGravity: viewMode === 'temporal' ? (temporalMetrics.gravityMap[piece.id] ?? 0) : 0,
          futureResidue:   viewMode === 'temporal' ? (temporalMetrics.residueMap[piece.id]   ?? 0) : 0,
          criticalPath:    viewMode === 'temporal' ? (temporalMetrics.criticalityMap[piece.id] ?? 0) : 0,
        },
        // force layout では drag-to-assign が主体だが、ReactFlow ドラッグも有効にする
        // （workshopTheme では誤ってフォルダ外に出たピースをドラッグで戻せるようにするため）
        draggable: true,
        style: filterDimmed ? { pointerEvents: 'none' as const } : undefined,
      };
    });

    // 親子エッジ（スタンドアロンピースのみ）
    const parentChildEdges: Edge[] = standalonePieces
      .filter(p => p.parent_id && standalonePieces.some(v => v.id === p.parent_id))
      .map(p => ({
        id: `pc-${p.parent_id}-${p.id}`, source: p.parent_id!, target: p.id,
        hidden: workshopTheme,
        type: 'smoothstep',
        style: { stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '4 3', opacity: 0.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 12, height: 12 },
      }));

    // ══ EDGES (with piece→summary remapping) ════════════════════════════
    // piece id → island id のマップ（フォルダ内ピース用）
    const pieceToIsland: Record<string, string> = {};
    for (const n of folderPieceNodes) {
      if (n.parentNode) pieceToIsland[n.id] = n.parentNode;
    }

    const edgeKeySet = new Set<string>();
    const newEdges: Edge[] = [];
    for (const conn of connections) {
      // プロジェクト横断接続: showCrossProjectConns が false の場合は非表示
      const srcProjId = pieceToProjectMap[conn.from_piece_id];
      const tgtProjId = pieceToProjectMap[conn.to_piece_id];
      if (!showCrossProjectConns && srcProjId && tgtProjId && srcProjId !== tgtProjId) continue;

      const src = pieceToSummary[conn.from_piece_id] ?? conn.from_piece_id;
      const tgt = pieceToSummary[conn.to_piece_id]   ?? conn.to_piece_id;
      if (src === tgt) continue;
      const key = `${src}→${tgt}`;
      if (edgeKeySet.has(key)) continue;
      edgeKeySet.add(key);
      const isMapped = src !== conn.from_piece_id || tgt !== conn.to_piece_id;
      const color = EDGE_COLORS[conn.type] ?? EDGE_COLORS.default;

      const srcPiece = pieces.find(p => p.id === conn.from_piece_id);
      const tgtPiece = pieces.find(p => p.id === conn.to_piece_id);
      const isActive   = (srcPiece?.status === 'in_progress' || tgtPiece?.status === 'in_progress');
      const edgeFresh  = computeEdgeFreshness(srcPiece, tgtPiece);

      // Journey mode: 異担当者間エッジはハンドオフポイント (flowGravity 最大)
      const isHandoffEdge = viewMode === 'journey'
        && !!(srcPiece?.assignee_id && tgtPiece?.assignee_id
          && srcPiece.assignee_id !== tgtPiece.assignee_id);

      // Flow Gravity: この導線がどれだけ「次に触る場所」へ向かう引力を持つか
      // in_progress chain + 高鮮度 + 異担当者間 + done近傍 → 視線を吸う密度
      const nearDone      = tgtPiece?.status === 'done' || (tgtPiece?.status === 'ready' && edgeFresh > 0.6);
      const multiWorker   = !!(srcPiece?.assignee_id && tgtPiece?.assignee_id
        && srcPiece.assignee_id !== tgtPiece.assignee_id);
      const flowGravity   = workshopTheme || viewMode === 'journey' ? Math.min(1,
        (isHandoffEdge    ? 0.95 : 0)   // handoff は最大引力
        + (isActive       ? 0.45 : 0)
        + edgeFresh       * 0.30
        + (nearDone       ? 0.15 : 0)
        + (multiWorker    ? 0.12 : 0)
      ) : 0;

      // v2: 部屋間エッジ密度 ≥ 2 → 通路（corridor）として扱う
      const edgeProjA = pieceToProjectMap[conn.from_piece_id];
      const edgeProjB = pieceToProjectMap[conn.to_piece_id];
      const corridorKey = edgeProjA && edgeProjB && edgeProjA !== edgeProjB
        ? [edgeProjA, edgeProjB].sort().join('|') : null;
      const isCorridorEdge = workshopTheme && corridorKey
        ? (corridorDensity[corridorKey] ?? 0) >= 2 : false;

      newEdges.push({
        id:     isMapped ? key : conn.id,
        source: src, target: tgt,
        hidden: workshopTheme,   // jigsaw mode: タブ刻印で方向を示す。エッジ線は非表示
        sourceHandle: isMapped && src.startsWith('summary-') ? 'src' : undefined,
        targetHandle: isMapped && tgt.startsWith('summary-') ? 'tgt' : undefined,
        type: 'flow',
        data: {
          type:      conn.type,
          color,
          isActive,
          isDimmed:  false,
          freshness: edgeFresh,
          flowSpeed: null,
          srcPressure:   concentrationMaps.pressureMap[conn.from_piece_id] ?? 0,
          tgtPressure:   concentrationMaps.pressureMap[conn.to_piece_id]   ?? 0,
          srcIsolation:  missingMaps.isolationMap[conn.from_piece_id]      ?? 0,
          tgtIsolation:  missingMaps.isolationMap[conn.to_piece_id]        ?? 0,
          srcAmbient:    environmentMaps.ambientMap[conn.from_piece_id]    ?? 0.5,
          tgtAmbient:    environmentMaps.ambientMap[conn.to_piece_id]      ?? 0.5,
          edgeResidue:   ((memoryMaps.familiarityMap[conn.from_piece_id] ?? 0) + (memoryMaps.familiarityMap[conn.to_piece_id] ?? 0)) / 2,
          isCorridorEdge,
          corridorProminence: identity.corridorProminence,
          edgeVitality:       identity.edgeVitality,
          staleFadeMult:      identity.staleFadeMult,
          flowGravity,
          // PHASE 15: Temporal Flow
          srcGravity:         viewMode === 'temporal' ? (temporalMetrics.gravityMap[conn.from_piece_id]    ?? 0) : 0,
          tgtGravity:         viewMode === 'temporal' ? (temporalMetrics.gravityMap[conn.to_piece_id]      ?? 0) : 0,
          srcCriticality:     viewMode === 'temporal' ? (temporalMetrics.criticalityMap[conn.from_piece_id] ?? 0) : 0,
          downstreamResidue:  viewMode === 'temporal' ? (temporalMetrics.residueMap[conn.from_piece_id]    ?? 0) : 0,
        },
        label: !isMapped && conn.type !== 'sequential' ? (CONN_TYPE_LABELS[conn.type]?.short ?? conn.type) : undefined,
        labelStyle: { fontSize: 10, fill: color, fontWeight: 700 },
        labelBgStyle: { fill: '#fff', opacity: 0.9 },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
      });
    }

    // ── 担当者グループラベルノード（groupByAssignee ON時のみ） ──
    const assigneeHeaderNodes: Node[] = [];
    if (groupByAssignee) {
      const groups2 = new Map<string, { name: string; y: number }>();
      for (const p of standalonePieces) {
        const key = p.assignee_id ?? '__none__';
        if (!groups2.has(key)) {
          const name = p.assignee_id ? (workerMap[p.assignee_id]?.name ?? '不明') : '未割り当て';
          const pos = autoPos[p.id];
          groups2.set(key, { name, y: pos?.y ?? 0 });
        }
      }
      let idx = 0;
      for (const [key, { name, y }] of groups2.entries()) {
        assigneeHeaderNodes.push({
          id: `assignee-hdr-${idx++}`,
          type: 'default',
          position: { x: 20, y: y - 32 },
          data: { label: name },
          draggable: false, selectable: false, focusable: false,
          style: {
            background: key === '__none__' ? 'var(--border)' : 'var(--text-1)',
            color: '#fff', border: 'none',
            borderRadius: 6, padding: '3px 10px',
            fontSize: 11, fontWeight: 800,
            letterSpacing: '0.06em',
            pointerEvents: 'none',
            zIndex: 5,
            width: 'auto',
          },
        });
      }
    }

    // ── Journey mode: ワーカーレーンラベルノード (PHASE 11) ─────────────────
    const journeyLaneNodes: Node[] = [];
    if (viewMode === 'journey') {
      const LANE_H = 280;
      const laneWorkers = [
        ...new Set(standalonePieces.map(p => p.assignee_id ?? '__none__')),
      ].sort((a, b) => {
        if (a === '__none__') return 1;
        if (b === '__none__') return -1;
        return (workerMap[a]?.name ?? '').localeCompare(workerMap[b]?.name ?? '');
      });
      laneWorkers.forEach((wid, i) => {
        const name = wid === '__none__' ? '未割り当て' : (workerMap[wid]?.name ?? '?');
        const y    = i * LANE_H + 80;
        journeyLaneNodes.push({
          id:        `journey-lane-${wid}`,
          type:      'default',
          position:  { x: 20, y },
          data:      { label: name },
          draggable: false, selectable: false, focusable: false,
          style: {
            background:   'transparent',
            border:       'none',
            color:        'rgba(90,80,65,0.45)',
            fontSize:     10,
            fontWeight:   700,
            letterSpacing:'0.07em',
            textTransform:'uppercase',
            pointerEvents:'none',
            padding:      0,
          },
        });
      });
    }

    // ── Ghost edges: 親和性の高い未接続ペアを引力場として描く ──────────────
    // スタンドアロンノードのみ対象（フォルダ内は密度が高すぎて視覚ノイズになる）
    const standaloneNodeIds = new Set(standaloneNodes.map(n => n.id));
    const ghostEdges: Edge[] = affinityPairs
      .filter(pair =>
        standaloneNodeIds.has(pair.pieceIdA) &&
        standaloneNodeIds.has(pair.pieceIdB)
      )
      .map(pair => ({
        id:     `ghost-${pair.pieceIdA}-${pair.pieceIdB}`,
        source: pair.pieceIdA,
        target: pair.pieceIdB,
        type:   'ghost',
        data:   { score: pair.score },
        selectable:  false,
        focusable:   false,
        zIndex:      -1,  // 通常エッジの後ろ
      }));

    // ── Worker Territory nodes (PHASE 9 → 14) ────────────────────────────────
    // PHASE 14: load state / isolation / 担当者名 を追加。
    // D-03「誰に聞くか」: 名前 + territory サイズで「今話しかけていい人」が判断できる。
    // D-05「誰が持つか」: available territory = 担当余力あり の空間信号。
    const workerTerritoryNodes: Node[] = [];
    if (workshopTheme && layoutMode === 'force') {
      const wGroups: Record<string, string[]> = {};
      for (const p of standalonePieces) {
        if (!p.assignee_id) continue;
        (wGroups[p.assignee_id] ??= []).push(p.id);
      }
      for (const [wid, pids] of Object.entries(wGroups)) {
        if (pids.length < 2) continue;
        const positions = pids.map(id => autoPos[id]).filter(Boolean);
        if (positions.length < 2) continue;
        const cx = positions.reduce((s, p) => s + p.x, 0) / positions.length;
        const cy = positions.reduce((s, p) => s + p.y, 0) / positions.length;
        const baseR = Math.max(90, ...positions.map(p =>
          Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)
        )) + 90;

        const isActiveWorker = standalonePieces.some(
          p => p.assignee_id === wid && p.status === 'in_progress'
        );
        const wm = workerMetrics.metrics[wid];
        const loadState  = wm?.loadState  ?? 'busy';
        const isIsolated = wm?.isIsolated ?? false;

        // load state でテリトリー半径を変える — available は広く開かれ、deep_focus は縮む
        const radiusScale =
          loadState === 'available' ? 1.12 :
          loadState === 'busy'      ? 0.93 : 0.78;
        const maxR = Math.round(baseR * radiusScale);

        const workerName = workerMap[wid]?.name ?? '';

        // territory center をリポジション用に保存
        territoryCentersRef.current[wid] = { x: cx, y: cy };

        const composition = workerMetrics.metrics[wid]?.projectComposition ?? [];
        const topRatio = composition[0]?.ratio ?? 0;
        const topProjId = composition[0]?.projectId ?? '';
        const isKnowledgeIsolated = topRatio > 0.70 && (workerMetrics.kcsMap[topProjId] === true);

        workerTerritoryNodes.push({
          id:       `territory-${wid}`,
          type:     'workerTerritory',
          position: { x: cx - maxR, y: cy - maxR },
          draggable: false, selectable: false, focusable: false,
          zIndex:   -3,
          data:     {
            radius: maxR, isActive: isActiveWorker,
            workerName, loadState, isIsolated,
            workerId: wid,
            isDragAssignActive: true,
            onAssign: (pieceId: string) => handleDragAssign(pieceId, wid),
            projectComposition: composition.map(({ color, ratio, projectId }) => ({ color, ratio, projectId })),
            isProjectHighlighted: false,
            isKnowledgeIsolated,
          } satisfies WorkerTerritoryData,
          style:    { width: maxR * 2, height: maxR * 2 },
        });
      }

      // Knowledge Haze: 同一プロジェクトをトップに持つ worker ペアの中間点に ambient blob を置く
      // D-03「誰に聞くか」: 同じ色の空間が重なっている → この二人は同じ文脈を持つ
      const workerIds = Object.keys(territoryCentersRef.current);
      for (let i = 0; i < workerIds.length; i++) {
        for (let j = i + 1; j < workerIds.length; j++) {
          const wA = workerIds[i];
          const wB = workerIds[j];
          const topA = workerMetrics.metrics[wA]?.topProjectId;
          const topB = workerMetrics.metrics[wB]?.topProjectId;
          if (!topA || topA !== topB) continue;
          const cA = territoryCentersRef.current[wA];
          const cB = territoryCentersRef.current[wB];
          if (!cA || !cB) continue;
          const dist = Math.sqrt((cA.x - cB.x) ** 2 + (cA.y - cB.y) ** 2);
          if (dist > 600) continue; // 遠すぎる場合は省略
          const mx = (cA.x + cB.x) / 2;
          const my = (cA.y + cB.y) / 2;
          const hazeColor = projectMap[topA]?.color ?? '#888888';
          const hazeSize  = Math.round(dist * 0.55 + 80);
          workerTerritoryNodes.push({
            id:       `haze-${wA}-${wB}`,
            type:     'knowledgeHaze',
            position: { x: mx - hazeSize / 2, y: my - hazeSize / 2 },
            draggable: false, selectable: false, focusable: false,
            zIndex:   -4,
            data:     { color: hazeColor, size: hazeSize } satisfies KnowledgeHazeData,
            style:    { width: hazeSize, height: hazeSize },
          });
        }
      }
    }

    setNodes([...workerTerritoryNodes, ...folderIslandNodes, ...folderPieceNodes, ...standaloneNodes, ...summaryNodes, ...assigneeHeaderNodes, ...journeyLaneNodes]);
    setEdges([...ghostEdges, ...newEdges, ...parentChildEdges]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, connections, viewMode, layoutMode, projectMap,
      showIslands, workshopTheme, positionVersion, jigsawWrapCols, showCrossProjectConns,
      collapsedProjects, toggleCollapse, expandedPieces, toggleExpand, islandSort, pieceSort,
      childMap, concentrationMaps, missingMaps, affinityPairs, roleMap, environmentMaps, memoryMaps, visualStateMap, identity,
      workerMetrics, workerMap, temporalMetrics]);
  // ※ blockedIds / criticalIds / impactScales は Effect 1.8 で差分パッチ

  // ── Effect 1.9: Workshop v2 カメラ構成 ────────────────────────────────────
  // v2テーマ有効時: 活発な島（warmth>40）の重心へカメラを移動。
  // 「全体を均等に見せる」から「作業の中心を最初に見る」へ。
  const v2CameraApplied = useRef(false);
  useEffect(() => {
    if (!workshopTheme) { v2CameraApplied.current = false; return; }
    if (v2CameraApplied.current) return;
    const islandNodes = nodes.filter(n => n.type === 'projectIsland');
    if (islandNodes.length === 0) return;
    // Today Nucleus: focusScore で「今日の核」を算出してカメラを向ける。
    // focusScore = in_progress数×2 + 接続チェーン密度×1.5 + multi-worker×1.2 + warmth/100
    // 最も高いスコアの島が今日の出発点。説明なしで「ここから」と感じさせる。
    type IslandScore = { node: Node; score: number };
    const islandScores: IslandScore[] = islandNodes.map(n => {
      const projId = (n.data as { projectId?: string }).projectId ?? '';
      const projPieces = pieces.filter(p => p.project_id === projId);
      const inprogCount = projPieces.filter(p => p.status === 'in_progress').length;
      const chainDensity = connections.filter(c => {
        const sp = projPieces.find(p => p.id === c.from_piece_id);
        const tp = projPieces.find(p => p.id === c.to_piece_id);
        return sp?.status === 'in_progress' && tp?.status === 'in_progress';
      }).length;
      const mwEdges = connections.filter(c => {
        const sp = projPieces.find(p => p.id === c.from_piece_id);
        const tp = projPieces.find(p => p.id === c.to_piece_id);
        return sp && tp && sp.assignee_id && tp.assignee_id && sp.assignee_id !== tp.assignee_id;
      }).length;
      const warmth = (n.data as { warmth?: number }).warmth ?? 0;
      const score  = inprogCount * 2 + chainDensity * 1.5 + mwEdges * 1.2 + warmth / 100;
      return { node: n, score };
    });
    islandScores.sort((a, b) => b.score - a.score);
    const topScore = islandScores[0]?.score ?? 0;
    const warm = islandNodes.filter(n => ((n.data as { warmth?: number }).warmth ?? 0) > 40);
    const targets = topScore > 0.8
      ? [islandScores[0].node]
      : warm.length > 0 ? warm
      : islandNodes;
    const cx = targets.reduce((s, n) => s + n.position.x + ((n.data as { width?: number }).width ?? 300) / 2, 0) / targets.length;
    const cy = targets.reduce((s, n) => s + n.position.y + ((n.data as { height?: number }).height ?? 200) / 2, 0) / targets.length;
    const zoom = 0.62;
    setTimeout(() => {
      setViewport({ x: window.innerWidth / 2 - cx * zoom, y: window.innerHeight / 2 - cy * zoom, zoom }, { duration: 700 });
      viewportSavedRef.current = true;
    }, 350);
    v2CameraApplied.current = true;
  }, [nodes, workshopTheme, setViewport, pieces, connections]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 1.8: blocked / critical / impact 変更 → 対象フィールドのみパッチ ─
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      if (n.type !== 'piece') return n;
      const isBlocked  = blockedIds.has(n.id);
      const isCritical = criticalIds.has(n.id);
      const impactScale = impactScales[n.id] ?? 1;
      if (n.data.isBlocked === isBlocked && n.data.isCritical === isCritical && n.data.impactScale === impactScale) return n;
      return { ...n, data: { ...n.data, isBlocked, isCritical, impactScale } };
    }));
  }, [blockedIds, criticalIds, impactScales]);
  // ※ bottlenecks は Effect 1.7 で差分パッチ

  // ── Effect 1.7: bottlenecks 変更 → isBottleneck のみパッチ ──────────────
  useEffect(() => {
    const staleIds    = new Set(bottlenecks.stale_pieces.map(p => p.id));
    const overloadSet2 = new Set(bottlenecks.overloaded_users.map(u => u.user.id));
    const overloadIds = new Set(
      (piecesRef.current).filter(p => p.assignee_id && overloadSet2.has(p.assignee_id)).map(p => p.id)
    );
    const isBNMode = viewModeRef.current === 'bottleneck';
    setNodes(prev => prev.map(n => {
      if (n.type !== 'piece') return n;
      const isBottleneck = isBNMode && (staleIds.has(n.id) || overloadIds.has(n.id));
      if (n.data.isBottleneck === isBottleneck) return n;
      return { ...n, data: { ...n.data, isBottleneck } };
    }));
  }, [bottlenecks, viewMode]);
  // ※ workerMap も意図的に除外 → Effect 1.6 で担当者名だけパッチ

  // ── Effect 1.6: workerMap 変更 → assigneeName のみパッチ ─────────────────
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      if (n.type !== 'piece') return n;
      const assigneeId   = (n.data.piece as { assignee_id?: string }).assignee_id;
      const assigneeName = assigneeId ? workerMap[assigneeId]?.name : undefined;
      if (n.data.assigneeName === assigneeName) return n;
      return { ...n, data: { ...n.data, assigneeName } };
    }));
  }, [workerMap]);
  // ※ filterStatus / filterProject / filterSearch は意図的に除外 → Effect 1.5 で差分パッチ

  // ── Effect 1.5: フィルター変更 → isDimmed / hidden をパッチ（ノード位置に触れない）──
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      // projectIsland / projectSummary: filterProject が設定されていたら対象外を非表示
      if (n.type === 'projectIsland' || n.type === 'projectSummary') {
        if (!filterProject) return { ...n, hidden: false };
        const nodeProjectId = (n.data as { projectId?: string }).projectId;
        const hidden = nodeProjectId !== filterProject;
        if (n.hidden === hidden) return n;
        return { ...n, hidden };
      }
      if (n.type !== 'piece') return n;
      const p = n.data.piece as { status: string; project_id?: string; title: string; assignee_id?: string };
      const matchesStatus   = !filterStatus   || p.status === filterStatus;
      const matchesProject  = !filterProject  || p.project_id === filterProject;
      const matchesSearch   = !filterSearch   || p.title.toLowerCase().includes(filterSearch.toLowerCase());
      const matchesAssignee = !filterAssignee || p.assignee_id === filterAssignee;
      const filterDimmed    = !!(filterStatus || filterProject || filterSearch || filterAssignee)
        && !(matchesStatus && matchesProject && matchesSearch && matchesAssignee);
      if (n.data.isDimmed === filterDimmed) return n; // 変化なし → 参照を保持
      return {
        ...n,
        data:  { ...n.data, isDimmed: filterDimmed },
        style: filterDimmed ? { pointerEvents: 'none' as const } : undefined,
      };
    }));
  }, [filterStatus, filterProject, filterSearch, filterAssignee]);

  // ── Effect PHASE10-A: Flow Session Mode / Repair Mode dimming ────────────────
  // flowSession: active chain 以外を opacity 0.18 に。
  // repairMode:  stalled 以外を opacity 0.18 に。
  // 両方 OFF の場合は通常状態に戻す。
  const flowSessionPieceIds = useMemo(() => {
    if (!flowSessionActive) return null;
    const ids = new Set<string>();
    for (const c of focusCards.filter(c => c.type === 'chain')) {
      c.pieceIds.forEach(id => ids.add(id));
    }
    return ids;
  }, [flowSessionActive, focusCards]);

  const repairModePieceIds = useMemo(() => {
    if (!repairMode) return null;
    return new Set(stalledItems.map(s => s.id));
  }, [repairMode, stalledItems]);

  useEffect(() => {
    const activePieceIds = flowSessionPieceIds ?? repairModePieceIds;
    setNodes(prev => prev.map(n => {
      if (n.type !== 'piece') return n;
      const sessionDimmed = activePieceIds ? !activePieceIds.has(n.id) : false;
      if (n.data._sessionDimmed === sessionDimmed) return n;
      return {
        ...n,
        data:  { ...n.data, _sessionDimmed: sessionDimmed, isDimmed: sessionDimmed || !!n.data._filterDimmed },
        style: sessionDimmed ? { pointerEvents: 'none' as const, opacity: 0.18 } : undefined,
      };
    }));
    // エッジも同期
    setEdges(prev => prev.map(e => {
      const shouldDim = activePieceIds
        ? !(activePieceIds.has(e.source) && activePieceIds.has(e.target))
        : false;
      if (e.data?.isDimmed === shouldDim) return e;
      return { ...e, data: { ...e.data, isDimmed: shouldDim } };
    }));
  }, [flowSessionPieceIds, repairModePieceIds]);

  // ── Effect S1: justCompletedId → _justCompleted パッチ ─────────────────────
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      if (n.type !== 'piece') return n;
      const val = n.id === justCompletedId;
      if (n.data._justCompleted === val) return n;
      return { ...n, data: { ...n.data, _justCompleted: val } };
    }));
  }, [justCompletedId]);

  // ── Effect SESSION: sessionVisibleIds → isDimmed パッチ (PHASE 11) ─────────
  // sessionMode が open 以外のとき、対象外ピースを静かに沈める。
  // island ノードは opacity で対応（isDimmed フィールドがないため style でパッチ）。
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      if (n.type === 'piece') {
        const sessionDimmed = sessionVisibleIds !== null && !sessionVisibleIds.has(n.id);
        if (n.data._sessionModeDimmed === sessionDimmed) return n;
        return {
          ...n,
          data:  { ...n.data, _sessionModeDimmed: sessionDimmed, isDimmed: sessionDimmed },
          style: sessionDimmed ? { pointerEvents: 'none' as const, opacity: 0.15 } : undefined,
        };
      }
      if (n.type === 'projectIsland' && sessionVisibleIds !== null) {
        // island 内のピースが 1つでも visible なら island 自体は表示
        const projId      = (n.data as { projectId?: string }).projectId ?? '';
        const hasPiece    = pieces.some(p => p.project_id === projId && sessionVisibleIds.has(p.id));
        const targetOpacity = hasPiece ? undefined : 0.12;
        if (n.style?.opacity === targetOpacity) return n;
        return { ...n, style: { ...n.style, opacity: targetOpacity } };
      }
      return n;
    }));
    setEdges(prev => prev.map(e => {
      const shouldDim = sessionVisibleIds !== null
        && !(sessionVisibleIds.has(e.source) && sessionVisibleIds.has(e.target));
      if (e.data?.isDimmed === shouldDim) return e;
      return { ...e, data: { ...e.data, isDimmed: shouldDim } };
    }));
  }, [sessionVisibleIds, pieces]);

  // ── Effect S2: resonatingIds → _resonating パッチ ───────────────────────────
  useEffect(() => {
    setNodes(prev => prev.map(n => {
      if (n.type !== 'piece') return n;
      const val = resonatingIds.has(n.id);
      if (n.data._resonating === val) return n;
      return { ...n, data: { ...n.data, _resonating: val } };
    }));
  }, [resonatingIds]);

  // ── Effect 2: ホバー/エッジ選択 → data のみ更新（位置に触れない）──────────
  useEffect(() => {
    if (pieces.length === 0) return;
    const connectedSet = hoveredNodeId ? computeConnectedSet(hoveredNodeId, connections) : null;

    setNodes(prev => prev.map(node => {
      if (node.type === 'projectIsland' || node.type === 'projectSummary') return node; // islands/summaries は触らない
      const filterDimmed  = !!(node.style?.pointerEvents);
      const hoverDimmed   = connectedSet !== null && !connectedSet.has(node.id);
      const isDimmed      = filterDimmed || hoverDimmed;
      const isHighlighted = node.id === hoveredNodeId;
      const isConn        = isConnecting;
      if (
        node.data.isDimmed      === isDimmed &&
        node.data.isHighlighted === isHighlighted &&
        node.data.isConnecting  === isConn
      ) return node;
      return { ...node, data: { ...node.data, isDimmed, isHighlighted, isConnecting: isConn } };
    }));

    setEdges(prev => prev.map(edge => {
      const isSelected   = edge.id === selectedEdgeId;
      const isEdgeDimmed = connectedSet !== null
        && !(connectedSet.has(edge.source) && connectedSet.has(edge.target));
      const baseColor = EDGE_COLORS[connections.find(c => c.id === edge.id)?.type ?? ''] ?? EDGE_COLORS.default;
      const color     = isSelected ? '#3B82F6' : baseColor;
      // FlowEdge タイプなら data.isDimmed / data.color を更新
      if (edge.type === 'flow') {
        const newData = {
          ...edge.data,
          isDimmed: isEdgeDimmed,
          color,
        };
        if (
          edge.selected === isSelected &&
          edge.data?.isDimmed === isEdgeDimmed &&
          edge.data?.color === color
        ) return edge; // 変化なし → 参照維持
        return { ...edge, selected: isSelected, data: newData };
      }
      // 旧 smoothstep エッジ（親子エッジ等）
      const opacity = isEdgeDimmed ? 0.04 : isSelected ? 1 : 0.85;
      return {
        ...edge,
        selected: isSelected,
        style: {
          ...edge.style,
          stroke: color, strokeWidth: isSelected ? 3.5 : 2.5,
          opacity,
          filter: isSelected ? `drop-shadow(0 0 5px ${color}99)` : undefined,
        },
      };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredNodeId, selectedEdgeId, isConnecting]);

  // ── Effect 3: LOD — ズーム閾値を越えたときだけ isLOD フラグを更新 ────────────
  const LOD_THRESHOLD = 0.38;
  const { zoom } = useViewport();
  const isLODMode   = zoom < LOD_THRESHOLD;
  const prevLODRef  = useRef<boolean | null>(null);

  useEffect(() => {
    if (prevLODRef.current === isLODMode) return; // 閾値をまたいでいなければスキップ
    prevLODRef.current = isLODMode;
    setNodes(prev => prev.map(n =>
      n.type === 'piece' ? { ...n, data: { ...n.data, isLOD: isLODMode } } : n
    ));
  }, [isLODMode]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ')                         { e.preventDefault(); fitView({ padding: 0.2, duration: 400 }); }
      if (e.key === 'f' || e.key === 'F')        { setFilterOpen(v => !v); }
      if (e.key === 'i' || e.key === 'I')        { setShowIslands(v => !v); }
      if (e.key === 'Escape')                    { setSelectedEdgeId(null); setContextMenu(null); setEdgeContextMenu(null); setFlowSessionActive(false); setRepairMode(false); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        try {
          await pieceApi.deleteConnection(selectedEdgeId);
          await refresh();
          push('接続を削除しました', 'success');
          setSelectedEdgeId(null);
        } catch { push('削除に失敗しました', 'error'); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fitView, selectedEdgeId, refresh, push]);

  // ── Arrange dropdown close on outside click ─────────────────────────────
  useEffect(() => {
    if (!arrangeOpen) return;
    function close() { setArrangeOpen(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [arrangeOpen]);

  // ── Context menu close on outside click ──────────────────────────────────
  useEffect(() => {
    if (!contextMenu && !edgeContextMenu && !projectColorMenu) return;
    function close(e: MouseEvent) {
      const n   = document.getElementById('piece-context-menu');
      const ed  = document.getElementById('edge-context-menu');
      const pcm = document.getElementById('project-color-menu');
      if (n   && !n.contains(e.target as HTMLElement))   setContextMenu(null);
      if (ed  && !ed.contains(e.target as HTMLElement))  setEdgeContextMenu(null);
      if (pcm && !pcm.contains(e.target as HTMLElement)) setProjectColorMenu(null);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu, edgeContextMenu, projectColorMenu]);

  // ── Node handlers ─────────────────────────────────────────────────────────
  const onNodeClick: NodeMouseHandler = useCallback((e, node) => {
    if (node.type === 'projectIsland' || node.type === 'projectSummary') return;
    setSelectedEdgeId(null); setContextMenu(null); setEdgeContextMenu(null);

    // Impact Engine モード中はクリックでカスケードパネルを開く
    if (cascadeMode) {
      const piece = pieces.find(p => p.id === node.id);
      if (piece) { setCascadePiece(piece); return; }
    }

    // Shift+クリック → 複数選択
    if (e.shiftKey) {
      setMultiSelectIds(prev => {
        const next = new Set(prev);
        next.has(node.id) ? next.delete(node.id) : next.add(node.id);
        return next;
      });
      return;
    }
    setMultiSelectIds(new Set());
    const piece = pieces.find(p => p.id === node.id);
    if (piece) setSelectedPiece(piece);
  }, [pieces]);

  // ── ステータス dot クリック: 次ステータスへ直接進む ───────────────────────
  // PieceNodeV2 に渡す callback を生成する。useCallback の deps に pieceId が入ると
  // 全ノードが再生成されるため、ref 経由でピースを参照する。
  const makeStatusAdvance = React.useCallback((pieceId: string) => async () => {
    // 連打防止: 同一ピースへの重複リクエストをブロック
    if (statusAdvanceInFlightRef.current.has(pieceId)) return;
    statusAdvanceInFlightRef.current.add(pieceId);
    const piece = piecesRef.current.find(p => p.id === pieceId);
    if (!piece) { statusAdvanceInFlightRef.current.delete(pieceId); return; }
    const next = STATUS_CYCLE[piece.status];
    try {
      await pieceApi.updateStatus(piece.id, next);
      await refresh();
      push(`${piece.title} → ${STATUS_LABELS[next]}`, 'success');
      if (next === 'done') {
        playCompleteSound();
        if (navigator.vibrate) navigator.vibrate([10, 50, 20]);
        setJustCompletedId(piece.id);
        setTimeout(() => setJustCompletedId(null), 1000);
        setCelebrateText(`🧩 ${piece.title} が完了！`);
        setTimeout(() => setCelebrateText(null), 2200);
      }
    } catch { push('ステータス更新に失敗', 'error'); }
    finally { setTimeout(() => statusAdvanceInFlightRef.current.delete(pieceId), 800); }
  }, [refresh, push]);

  // ── Workshop: タブゾーン検出（位置ベース）───────────────────────────────────
  // ReactFlow の各ノードラッパーに transform:translate が付き独立したスタッキングコンテキストを
  // 持つため、隣接ピースのラッパーがタブ SVG ポリゴン上を覆うと通常のポインタイベントが阻まれる。
  // ここではクリック座標をキャンバス座標に変換し、全ピースのタブゾーンと照合する。
  const findTabAtPointer = useCallback((e: React.MouseEvent): {
    pieceId: string; side: 'right' | 'bottom' | 'left' | 'top'
  } | null => {
    if (!workshopTheme) return null;
    const flowPos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const allNodes = getNodes();
    // ジグソー本体サイズ (PieceNodeV2 の定数と一致させる)
    const BW = PIECE_NODE_V2_W - 13; // 203
    const BH = PIECE_NODE_V2_H - 13; // 139
    const T  = 13;   // TAB size
    const P  = 6;    // hit pad
    for (const n of allNodes) {
      if (n.type !== 'piece') continue;
      const arrows = n.data?.tabArrows as Record<string, boolean> | undefined;
      if (!arrows) continue;
      // 絶対キャンバス座標を算出（島ノードの子の場合は親座標を加算）
      let ax = n.position.x, ay = n.position.y;
      if (n.parentNode) {
        const par = allNodes.find(p => p.id === n.parentNode);
        if (!par) continue;
        ax += par.position.x;
        ay += par.position.y;
      }
      const lx = flowPos.x - ax;
      const ly = flowPos.y - ay;
      // 右凸タブゾーン: ▶ も ◀ も A(左ピース)の右タブに表示されるため、常に 'right' を返す
      if (lx >= BW - P && lx <= BW + T + P && ly >= BH/2 - P - 2 && ly <= BH/2 + P + 2) {
        if (arrows.right || arrows.left) return { pieceId: n.id, side: 'right' };
      }
      // 下凸タブゾーン: ▼ も ▲ も 上ピースの下タブに表示されるため、常に 'bottom' を返す
      if (lx >= BW/2 - P - 2 && lx <= BW/2 + P + 2 && ly >= BH - P && ly <= BH + T + P) {
        if (arrows.bottom || arrows.top) return { pieceId: n.id, side: 'bottom' };
      }
    }
    return null;
  }, [workshopTheme, screenToFlowPosition, getNodes]);

  const onNodeDoubleClick: NodeMouseHandler = useCallback(async (e, node) => {
    if (node.type === 'projectIsland' || node.type === 'projectSummary') return;

    // Workshop: タブゾーンへのダブルクリック → 方向反転
    // 位置ベース検出により隣接ピースのラッパーに阻まれても確実に動作する
    if (workshopTheme) {
      const tab = findTabAtPointer(e as React.MouseEvent);
      if (tab) { handleTabClick(tab.pieceId, tab.side); return; }
    }

    // 連打防止: status advance と同じ guard を共有
    if (statusAdvanceInFlightRef.current.has(node.id)) return;
    statusAdvanceInFlightRef.current.add(node.id);
    const piece = pieces.find(p => p.id === node.id);
    if (!piece) { statusAdvanceInFlightRef.current.delete(node.id); return; }
    const next = STATUS_CYCLE[piece.status];
    try {
      await pieceApi.updateStatus(piece.id, next);
      await refresh();
      push(`${piece.title} → ${STATUS_LABELS[next]}`, 'success');
      if (next === 'done') {
        playCompleteSound();
        if (navigator.vibrate) navigator.vibrate([10, 50, 20]);
        setJustCompletedId(piece.id);
        setTimeout(() => setJustCompletedId(null), 1000);
        setCelebrateText(`🧩 ${piece.title} が完了！`);
        setTimeout(() => setCelebrateText(null), 2200);
      }
    } catch { push('ステータス更新に失敗', 'error'); }
    finally { setTimeout(() => statusAdvanceInFlightRef.current.delete(node.id), 800); }
  }, [pieces, refresh, push, workshopTheme, handleTabClick, findTabAtPointer]);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: { id: string; type?: string }) => {
    e.preventDefault();
    if (node.type === 'projectIsland' || node.type === 'projectSummary') return;

    // Workshop: タブゾーンへの右クリック → 接続を個別切り離し
    // 位置ベース検出により隣接ピースのラッパーに阻まれても確実に動作する
    if (workshopTheme) {
      const tab = findTabAtPointer(e);
      if (tab) { handleTabDetach(tab.pieceId, tab.side); return; }
    }

    const piece = pieces.find(p => p.id === node.id);
    if (!piece) return;
    setContextMenu({ x: e.clientX, y: e.clientY, pieceId: node.id, piece });
  }, [pieces, workshopTheme, handleTabDetach, findTabAtPointer]);

  const onNodeMouseEnter: NodeMouseHandler = useCallback((_e, node) => {
    if (node.type !== 'projectIsland' && node.type !== 'projectSummary') setHoveredNodeId(node.id);
  }, []);
  const onNodeMouseLeave: NodeMouseHandler = useCallback(() => setHoveredNodeId(null), []);

  // ── Edge handlers ─────────────────────────────────────────────────────────
  const onEdgeClick: EdgeMouseHandler = useCallback((_e, edge) => {
    setSelectedEdgeId(prev => prev === edge.id ? null : edge.id);
    setEdgeContextMenu(null);
  }, []);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: { id: string }) => {
    e.preventDefault();
    const conn = connections.find(c => c.id === edge.id);
    if (!conn) return;
    setEdgeContextMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id, connType: conn.type });
    setSelectedEdgeId(edge.id);
  }, [connections]);

  // ── Connection handlers ───────────────────────────────────────────────────
  // 接続先が確定 → タイプ選択ポップアップを出す（座標は onConnectEnd で取得）
  const pendingConnRef = useRef<{ source: string; target: string } | null>(null);
  const onConnect = useCallback((conn: RFConnection) => {
    if (!conn.source || !conn.target) return;
    pendingConnRef.current = { source: conn.source, target: conn.target };
    // 座標は onConnectEnd(MouseEvent) で取得するため、ここでは仮保存のみ
  }, []);

  const onConnectStart = useCallback(() => setIsConnecting(true), []);
  const onConnectEnd   = useCallback((e: MouseEvent | TouchEvent) => {
    setIsConnecting(false);
    const p = pendingConnRef.current;
    if (!p) return;
    pendingConnRef.current = null;
    const x = e instanceof MouseEvent ? e.clientX : (e as TouchEvent).touches[0]?.clientX ?? 0;
    const y = e instanceof MouseEvent ? e.clientY : (e as TouchEvent).touches[0]?.clientY ?? 0;
    setPendingConn({ source: p.source, target: p.target, x, y });
  }, []);

  const handleConnectConfirm = useCallback(async (type: ConnectionType) => {
    if (!pendingConn) return;
    const { source, target } = pendingConn;
    setPendingConn(null);

    // プロジェクト横断接続をブロック
    const srcPiece = pieces.find(p => p.id === source);
    const tgtPiece = pieces.find(p => p.id === target);
    if (srcPiece && tgtPiece && srcPiece.project_id && tgtPiece.project_id
        && srcPiece.project_id !== tgtPiece.project_id) {
      push('プロジェクトをまたいだ接続はできません。同じプロジェクト内のピース同士を接続してください。', 'error');
      return;
    }

    try {
      // ① 接続音
      playSnapSound();

      // ② ボード全体の微発光フラッシュ (150ms)
      setConnectionFlash(true);
      setTimeout(() => setConnectionFlash(false), 150);

      await pieceApi.connect(source, { to_piece_id: target, type });
      await refresh();
      push(`「${CONN_TYPE_LABELS[type]?.short ?? type}」で接続しました`, 'success');

      // ② 接続共鳴：source/target の近傍ピースに波を伝播（距離 ≤ 400px）
      const allNodes = getNodes();
      const srcNode  = allNodes.find(n => n.id === source);
      const tgtNode  = allNodes.find(n => n.id === target);
      if (srcNode && tgtNode) {
        const center = {
          x: (srcNode.position.x + tgtNode.position.x) / 2,
          y: (srcNode.position.y + tgtNode.position.y) / 2,
        };
        const RESONANCE_RADIUS = 400;
        const near = allNodes.filter(n => {
          if (n.type !== 'piece' || n.id === source || n.id === target) return false;
          const dx = n.position.x - center.x;
          const dy = n.position.y - center.y;
          return Math.hypot(dx, dy) <= RESONANCE_RADIUS;
        });

        if (near.length > 0) {
          const nearIds = new Set(near.map(n => n.id));
          setResonatingIds(nearIds);

          // 距離に応じて遅延した音を鳴らす（最大 3 つまで）
          near.slice(0, 3).forEach((n, i) => {
            const dx = n.position.x - center.x;
            const dy = n.position.y - center.y;
            const dist = Math.hypot(dx, dy);
            const delayMs = (dist / RESONANCE_RADIUS) * 200 + i * 40;
            playResonanceSound(delayMs);
          });

          setTimeout(() => setResonatingIds(new Set()), 700);
        }
      }
    } catch { push('接続に失敗しました', 'error'); }
  }, [pendingConn, refresh, push, getNodes]);

  // ── onNodesChange: 位置保存 + ドラッグ後に island 再計算 ─────────────────
  const layoutModeRef   = useRef(layoutMode);
  layoutModeRef.current = layoutMode;

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    let needRebuild = false;
    // 島がドラッグ中かチェック — ReactFlow は親ドラッグ時に子の絶対座標を発火するため
    // そのときフォルダ内ピースの相対位置を上書きしないようにする
    const islandDragging = changes.some(
      c => c.type === 'position' && c.id.startsWith('island-') && (c as any).dragging === true
    );
    for (const c of changes) {
      if (c.type === 'position' && c.position) {
        if (c.id.startsWith('island-')) {
          // フォルダ島ドラッグ → 絶対位置を保存
          manualPositions.current[c.id] = c.position;
          if (!c.dragging) persistPosition(c.id, c.position);
        } else if (c.id.startsWith('summary-')) {
          // 折りたたみサマリー → 絶対位置を保存
          manualPositions.current[c.id] = c.position;
          if (!c.dragging) persistPosition(c.id, c.position);
        } else if (folderPieceIdsRef.current.has(c.id)) {
          // フォルダ内ピース → 島ドラッグ中は絶対座標が来るのでスキップ
          if (!islandDragging) {
            // done ピースは fd: プレフィクスで保存（通常ピースの f: と分離）
            const pStatus = piecesRef.current.find(p => p.id === c.id)?.status;
            const isV2    = workshopThemeRef.current;
            const posKey  = isV2
              ? (pStatus === 'done' ? `v2fd:${c.id}` : `v2f:${c.id}`)
              : (pStatus === 'done' ? `fd:${c.id}`   : `f:${c.id}`);
            manualPositions.current[posKey] = c.position;
            if (!c.dragging) persistPosition(posKey, c.position);
          }
        } else {
          // スタンドアロンピース → 絶対位置（force モード以外のみ保存）
          if (layoutModeRef.current !== 'force') {
            manualPositions.current[c.id] = c.position;
            if (!c.dragging) {
              persistPosition(c.id, c.position);
              needRebuild = true;
            }
          }
        }
      }
    }
    onNodesChange(changes);
    if (needRebuild) rebuildIslands();
  }, [onNodesChange, rebuildIslands]);

  // ── Drag-to-island / Cross-island drag ────────────────────────────────────
  // ── Direct Manipulation: drag start/move handlers ─────────────────────────
  const onNodeDragStart = useCallback((_e: React.MouseEvent, node: Node) => {
    if (node.type !== 'piece') return;
    setIsDraggingPiece(true);
    dragHoverIdRef.current = null;
    setDragHoverId(null);
    // マグネットグループを特定し、ドラッグ開始位置を記録
    if (workshopThemeRef.current && node.parentNode) {
      const allNodes = getNodes();
      magnetGroupRef.current = findMagneticGroup(node.id, allNodes);
      prevDragPosRef.current = { x: node.position.x, y: node.position.y };
    } else {
      magnetGroupRef.current = new Set();
      prevDragPosRef.current = null;
    }
  }, [getNodes]);

  const onNodeDragMove = useCallback((e: React.MouseEvent, node: Node) => {
    if (node.type !== 'piece') return;

    // マグネットグループ移動: ドラッグ中のデルタを全グループメンバーに適用
    if (workshopThemeRef.current && magnetGroupRef.current.size > 1 && node.parentNode) {
      const prev = prevDragPosRef.current;
      if (prev) {
        const dx = node.position.x - prev.x;
        const dy = node.position.y - prev.y;
        if (dx !== 0 || dy !== 0) {
          setNodes(prevNodes => prevNodes.map(n => {
            if (magnetGroupRef.current.has(n.id) && n.id !== node.id) {
              return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
            }
            return n;
          }));
        }
      }
      prevDragPosRef.current = { x: node.position.x, y: node.position.y };
    }

    const now = Date.now();
    if (now - lastDragCheckRef.current < 40) return;
    lastDragCheckRef.current = now;

    const { clientX: cx, clientY: cy } = e;
    let hit: string | null = null;

    // repair zone 判定
    const rr = repairZoneRef.current?.getBoundingClientRect();
    if (rr && cx >= rr.left && cx <= rr.right && cy >= rr.top && cy <= rr.bottom) {
      hit = 'repair';
    } else {
      // assignee zone 判定
      for (const [wid, el] of assigneeZoneRefs.current) {
        const rect = el.getBoundingClientRect();
        if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
          hit = wid;
          break;
        }
      }
    }

    if (hit !== dragHoverIdRef.current) {
      dragHoverIdRef.current = hit;
      setDragHoverId(hit);
    }
  }, []);

  // スタンドアロン → フォルダ島にドロップ: プロジェクトに追加
  // フォルダ内ピース → 別のフォルダ島にドロップ: プロジェクト変更
  // フォルダ内ピース → 空白にドロップ: プロジェクトから外す
  const onNodeDragStop = useCallback(async (e: React.MouseEvent, node: Node) => {
    setIsDraggingPiece(false);
    dragHoverIdRef.current = null;
    setDragHoverId(null);

    // workshopTheme: マグネットスナップ + 自動接続 + jig-snap アニメーション
    if (workshopThemeRef.current && node.type === 'piece' && node.parentNode) {
      const SNAP_THRESHOLD = 28;
      const allNodes = getNodes();
      const siblings = allNodes.filter(n =>
        n.type === 'piece' && n.id !== node.id && n.parentNode === node.parentNode
      );

      const pos = node.position;
      let bestSnap: { x: number; y: number } | null = null;
      let bestDist = SNAP_THRESHOLD;
      let bestSibId: string | null = null;
      // dir: ドラッグされたピースの位置関係 (siblingから見て)
      type SnapDir = 'right-of-sib' | 'left-of-sib' | 'below-sib' | 'above-sib';
      let bestDir: SnapDir | null = null;

      for (const sib of siblings) {
        const sp = sib.position;
        const cands: Array<{cand: {x:number,y:number}, dir: SnapDir}> = [
          { cand: { x: sp.x + V2_W_BODY, y: sp.y }, dir: 'right-of-sib' },
          { cand: { x: sp.x - V2_W_BODY, y: sp.y }, dir: 'left-of-sib'  },
          { cand: { x: sp.x, y: sp.y + V2_H_BODY }, dir: 'below-sib'    },
          { cand: { x: sp.x, y: sp.y - V2_H_BODY }, dir: 'above-sib'    },
        ];
        for (const { cand, dir } of cands) {
          const dist = Math.hypot(pos.x - cand.x, pos.y - cand.y);
          if (dist < bestDist) { bestDist = dist; bestSnap = cand; bestSibId = sib.id; bestDir = dir; }
        }
      }

      if (bestSnap) {
        // 位置保存
        const posKey = `v2f:${node.id}`;
        manualPositions.current[posKey] = bestSnap;
        persistPosition(posKey, bestSnap);
        setNodes(prev => prev.map(n =>
          n.id === node.id ? { ...n, position: bestSnap!, className: 'jig-snap' } : n
        ));
        setTimeout(() => setNodes(prev => prev.map(n =>
          n.id === node.id ? { ...n, className: '' } : n
        )), 220);

        // 自動接続: スナップ方向から from/to を決定
        // right-of-sib = sib→dragged (sib が上流)
        // left-of-sib  = dragged→sib (dragged が上流)
        // below-sib    = sib→dragged (sib が上流)
        // above-sib    = dragged→sib (dragged が上流)
        if (bestSibId && bestDir) {
          const [from, to] = (bestDir === 'right-of-sib' || bestDir === 'below-sib')
            ? [bestSibId, node.id]
            : [node.id, bestSibId];
          const alreadyLinked = connectionsRef.current.some(c =>
            (c.from_piece_id === from && c.to_piece_id === to) ||
            (c.from_piece_id === to   && c.to_piece_id === from)
          );
          if (!alreadyLinked) {
            pieceApi.connect(from, { to_piece_id: to, type: 'sequential' })
              .then(() => refresh())
              .then(() => setPositionVersion(v => v + 1))
              .catch(() => {/* silent */});
          }
        }
      } else {
        // スナップ先なし: 現在のドロップ位置をそのまま保存（フォルダ内の自由移動）
        const posKey = `v2f:${node.id}`;
        manualPositions.current[posKey] = node.position;
        persistPosition(posKey, node.position);
        setNodes(prev => prev.map(n =>
          n.id === node.id ? { ...n, className: 'jig-snap' } : n
        ));
        setTimeout(() => setNodes(prev => prev.map(n =>
          n.id === node.id ? { ...n, className: '' } : n
        )), 220);
      }

      // グループメンバーの最終位置を保存
      const finalNodes = getNodes();
      for (const gid of magnetGroupRef.current) {
        if (gid === node.id) continue;
        const gn = finalNodes.find(n => n.id === gid);
        if (gn) {
          const gKey = `v2f:${gid}`;
          manualPositions.current[gKey] = gn.position;
          persistPosition(gKey, gn.position);
        }
      }
      magnetGroupRef.current = new Set();
      prevDragPosRef.current = null;

      // 位置変更のみの場合（新接続なし）もタブ矢印を更新
      setPositionVersion(v => v + 1);
    }

    if (node.type !== 'piece') return;

    const piece = piecesRef.current.find(p => p.id === node.id);
    if (!piece) return;

    const { clientX: cx, clientY: cy } = e;

    for (const [wid, el] of assigneeZoneRefs.current) {
      const rect = el.getBoundingClientRect();
      if (cx >= rect.left && cx <= rect.right && cy >= rect.top && cy <= rect.bottom) {
        try {
          await pieceApi.assign(piece.id, wid);
          await refresh();
          const name = workerMap[wid]?.name ?? wid;
          push(`「${piece.title}」を ${name} に割り当てました`, 'success');
          playSnapSound();
        } catch { push('割り当てに失敗しました', 'error'); }
        return;
      }
    }

    // ── RepairDropZone ドロップ判定 ──
    const rr = repairZoneRef.current?.getBoundingClientRect();
    if (rr && cx >= rr.left && cx <= rr.right && cy >= rr.top && cy <= rr.bottom) {
      if (piece.status === 'locked') {
        try {
          await pieceApi.updateStatus(piece.id, 'ready');
          await refresh();
          push(`「${piece.title}」のブロックを解除しました`, 'success');
        } catch { push('修復に失敗しました', 'error'); }
      } else {
        navigate('/repair');
      }
      return;
    }

    const isFolderPiece = folderPieceIdsRef.current.has(node.id);

    // ── ピースの「絶対座標」を計算 ──
    let absCX: number, absCY: number;
    if (isFolderPiece && node.parentNode) {
      // フォルダ内ピース: position は親島からの相対値
      const parentIsland = nodesRef.current.find(n => n.id === node.parentNode);
      if (!parentIsland) return;
      absCX = parentIsland.position.x + node.position.x + PIECE_NODE_W / 2;
      absCY = parentIsland.position.y + node.position.y + PIECE_NODE_H / 2;
    } else {
      // スタンドアロン: position は絶対値
      absCX = node.position.x + PIECE_NODE_W / 2;
      absCY = node.position.y + PIECE_NODE_H / 2;
    }

    // ── ドロップ先の島を特定 ──
    let targetProjectId: string | null = null;
    let targetName = '';
    for (const n of nodesRef.current) {
      if (n.type !== 'projectIsland') continue;
      const d = n.data as IslandData;
      const { x: ix, y: iy } = n.position;
      const iw = d.width, ih = d.height;
      if (absCX >= ix && absCX <= ix + iw && absCY >= iy && absCY <= iy + ih) {
        targetProjectId = d.projectId;
        targetName = d.name;
        break;
      }
    }

    // ── プロジェクト変更判定 ──
    const currentProjectId = piece.project_id ?? null;
    if (targetProjectId === currentProjectId) return; // 変化なし

    try {
      if (targetProjectId) {
        // 別フォルダへ移動 or 新規追加
        await pieceApi.update(piece.id, { project_id: targetProjectId });
        await refresh();
        push(`「${piece.title}」を『${targetName}』に移動しました`, 'success');
      } else if (isFolderPiece && !workshopThemeRef.current) {
        // フォルダ外の空白へドロップ → プロジェクトから外す（非workshopThemeのみ）
        // workshopTheme では誤ってフォルダ外にドロップしてもプロジェクトを保持する
        manualPositions.current[piece.id] = { x: absCX - PIECE_NODE_W / 2, y: absCY - PIECE_NODE_H / 2 };
        persistPosition(piece.id, manualPositions.current[piece.id]);
        await pieceApi.update(piece.id, { project_id: null });
        await refresh();
        push(`「${piece.title}」をプロジェクトから外しました`, 'success');
      }
    } catch {
      push('プロジェクトの変更に失敗しました', 'error');
    }
  }, [refresh, push, navigate, workerMap, getNodes, setPositionVersion]);

  // ── Piece delete ─────────────────────────────────────────────────────────
  async function handleArchiveProject(projectId: string) {
    if (!window.confirm('このプロジェクトをアーカイブしますか？\nボードから非表示になります。')) return;
    try {
      await projectApi.update(projectId, { status: 'archived' });
      setProjectMap(prev => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      push('プロジェクトをアーカイブしました', 'success');
    } catch { push('アーカイブに失敗しました', 'error'); }
  }

  async function handleDeletePiece(pieceId: string) {
    setContextMenu(null);
    setSelectedPiece(null);
    try {
      await pieceApi.delete(pieceId);
      await refresh();
      push('ピースを削除しました', 'success');
    } catch { push('削除に失敗しました', 'error'); }
  }

  // ── Context menu actions ──────────────────────────────────────────────────
  async function handleContextStatus(piece: Piece, status: PieceStatus) {
    setContextMenu(null);
    try {
      await pieceApi.updateStatus(piece.id, status);
      await refresh();
      push(`${piece.title} → ${STATUS_LABELS[status]}`, 'success');
      if (status === 'done') {
        playCompleteSound();
        if (navigator.vibrate) navigator.vibrate([10, 50, 20]);
        setJustCompletedId(piece.id);
        setTimeout(() => setJustCompletedId(null), 1000);
        setCelebrateText(`🧩 ${piece.title} が完了！`);
        setTimeout(() => setCelebrateText(null), 2200);
      }
    } catch { push('更新に失敗しました', 'error'); }
  }

  async function handleEdgeTypeChange(edgeId: string, type: ConnectionType) {
    setEdgeContextMenu(null);
    try {
      await pieceApi.updateConnection(edgeId, { type });
      await refresh();
      push(`接続タイプを「${CONN_TYPE_LABELS[type]?.short ?? type}」に変更しました`, 'success');
    } catch { push('変更に失敗しました', 'error'); }
  }

  async function handleEdgeDelete(edgeId: string) {
    setEdgeContextMenu(null);
    setSelectedEdgeId(null);
    try {
      await pieceApi.deleteConnection(edgeId);
      await refresh();
      push('接続を削除しました', 'success');
    } catch { push('削除に失敗しました', 'error'); }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const bottleneckCount  = bottlenecks.stale_pieces.length + bottlenecks.overloaded_users.length;
  const stagnantCount    = pieces.filter(p =>
    p.status === 'locked' ||
    (p.status === 'in_progress' && (freshnessMap[p.id] ?? 1) < 0.35)
  ).length;
  const blockedCount    = pieces.filter(p =>
    computeBlockedIds(pieces, connections).has(p.id)
  ).length;
  const visibleCount    = nodes.filter(n => n.type === 'piece' && !(n.style as { pointerEvents?: string } | undefined)?.pointerEvents).length;
  const hasFilter       = !!(filterStatus || filterProject || filterSearch || filterAssignee);

  return (
    <div
      style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: 'transparent',
        // Workshop v2: ボードの背景変数をオーバーライド
        ...(workshopTheme ? {
          '--bg': '#F5F3EF',   // 暖かい亜麻色 — 工房の床
        } as React.CSSProperties : {}),
      }}
      onClick={() => { initAudio(); setContextMenu(null); setEdgeContextMenu(null); }}
    >
      {/* ── 標準ツールバー ── */}
      <div className="page-toolbar" style={{
        height: 52, flexShrink: 0, zIndex: 15,
        display: 'flex', alignItems: 'center',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
      }}>
        {/* Left: breadcrumb */}
        <div style={{
          padding: '0 16px', display: 'flex', alignItems: 'center',
          gap: 6, flexShrink: 0, borderRight: '1px solid var(--border-sub)',
          height: '100%',
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
            ボード
          </span>
          {workshopTheme && (
            <span style={{
              fontSize: 8.5, fontWeight: 600,
              color: 'rgba(194,154,108,0.8)',
              background: 'rgba(194,154,108,0.10)',
              borderRadius: '2px',
              padding: '1px 5px',
              letterSpacing: '0.06em',
            }}>v2</span>
          )}
          {filterProject && projectMap[filterProject] && (
            <>
              <span style={{ fontSize: 10, color: 'var(--text-4)' }}>/</span>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-1)' }}>
                {projectMap[filterProject].name}
              </span>
              <button onClick={() => setFilterProject('')} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: 9, color: 'var(--text-4)', padding: '0 2px', lineHeight: 1,
              }}>×</button>
            </>
          )}
        </div>

        {/* Center: view mode pills */}
        <div style={{ display: 'flex', gap: 2, padding: '0 12px', flex: 1, justifyContent: 'center', overflow: 'hidden' }}>
          {(Object.keys(VIEW_LABELS) as ViewMode[]).filter(mode => VIEW_LABELS[mode]).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              padding: '4px 11px', borderRadius: 'var(--r-sm)', border: 'none',
              background: viewMode === mode ? 'var(--accent-sub)' : 'transparent',
              color:      viewMode === mode ? 'var(--accent)' : 'var(--text-3)',
              cursor: 'pointer', fontWeight: viewMode === mode ? 600 : 400,
              fontSize: 11, position: 'relative', transition: 'background 0.15s',
              flexShrink: 0,
            }}>
              {VIEW_LABELS[mode] ?? mode}
              {mode === 'bottleneck' && bottleneckCount > 0 && (
                <span style={{
                  position: 'absolute', top: -3, right: -3,
                  background: '#D97706', color: '#fff',
                  borderRadius: '50%', width: 13, height: 13,
                  fontSize: 8, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{bottleneckCount}</span>
              )}
            </button>
          ))}
        </div>

        {/* Right: secondary controls */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '0 12px', flexShrink: 0,
          borderLeft: '1px solid var(--border-sub)', height: '100%',
        }}>
          {/* ── ステータス件数チップ ── */}
          {(() => {
            const STATUS_CHIP: Record<string, { color: string; label: string }> = {
              locked:      { color: '#A8A8A4', label: 'ロック' },
              ready:       { color: '#4A9B6F', label: '待機'   },
              in_progress: { color: '#1A56DB', label: '進行中' },
              done:        { color: '#9CA3AF', label: '完了'   },
            };
            const counts = (['locked','ready','in_progress','done'] as const).map(s => ({
              s, count: pieces.filter(p => p.status === s).length,
            })).filter(x => x.count > 0);
            return counts.length > 0 ? (
              <div style={{ display: 'flex', gap: 5, alignItems: 'center', marginRight: 4, paddingRight: 8, borderRight: '1px solid var(--border-sub)' }}>
                {counts.map(({ s, count }) => (
                  <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                    <span style={{ fontSize: 8, color: STATUS_CHIP[s].color, letterSpacing: '0.02em', opacity: 0.8, lineHeight: 1.2 }}>
                      {STATUS_CHIP[s].label}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_CHIP[s].color, letterSpacing: '-0.01em', lineHeight: 1.1 }}>
                      {count}
                    </span>
                  </div>
                ))}
                {blockedCount > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: '#D97706',
                    background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)',
                    borderRadius: 3, padding: '1px 5px', whiteSpace: 'nowrap',
                  }} title="ブロック中">⚠ {blockedCount}</span>
                )}
              </div>
            ) : null;
          })()}

          {/* ── フォルダ並び替え ── */}
          <select
            value={islandSort}
            onChange={e => setIslandSort(e.target.value as typeof islandSort)}
            title="フォルダ（島）の並び順"
            style={{
              fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)', background: islandSort !== 'default' ? 'var(--accent-sub)' : 'var(--surface-sub)',
              color: islandSort !== 'default' ? 'var(--accent)' : 'var(--text-2)',
              cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="default">フォルダ：並び替え</option>
            <option value="name">フォルダ：名前順</option>
            <option value="progress">フォルダ：進捗順</option>
          </select>

          {/* ── ピースソート ── */}
          <select
            value={pieceSort}
            onChange={e => setPieceSort(e.target.value as typeof pieceSort)}
            title="フォルダ内のピースの並び順"
            style={{
              fontSize: 11, padding: '3px 6px', border: '1px solid var(--border)',
              borderRadius: 'var(--r-sm)', background: pieceSort !== 'default' ? 'var(--accent-sub)' : 'var(--surface-sub)',
              color: pieceSort !== 'default' ? 'var(--accent)' : 'var(--text-2)',
              cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="default">ピース：並び替え</option>
            <option value="due">ピース：期限順</option>
          </select>

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />

          {/* ── 全閉じ ── */}
          <button
            onClick={() => { setCollapsedProjects(new Set(Object.keys(projectMap))); setTimeout(() => fitView({ padding: 0.22, duration: 500 }), 120); }}
            title="全フォルダを折りたたむ"
            style={{ padding: '4px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-sub)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 11 }}
          >全閉</button>

          {/* ── 全展開 ── */}
          <button
            onClick={() => { setCollapsedProjects(new Set()); setTimeout(() => fitView({ padding: 0.22, duration: 500 }), 120); }}
            title="全フォルダを展開する"
            style={{ padding: '4px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', background: 'var(--surface-sub)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 11 }}
          >全展</button>

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />

          {/* Filter */}
          <button onClick={() => setFilterOpen(v => !v)} style={{
            padding: '4px 9px', borderRadius: 'var(--r-sm)', border: 'none',
            background: hasFilter ? 'var(--accent-sub)' : 'transparent',
            color:      hasFilter ? 'var(--accent)' : 'var(--text-3)',
            cursor: 'pointer', fontSize: 11,
          }} title="フィルター (F)">⊟{hasFilter ? '●' : ''}</button>

          {/* Fit view */}
          <button onClick={() => fitView({ padding: 0.2, duration: 400 })} style={{
            padding: '4px 9px', borderRadius: 'var(--r-sm)', border: 'none',
            background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12,
          }} title="全体表示 (Space)">⊞</button>

          {/* More menu */}
          <button onClick={e => { e.stopPropagation(); setArrangeOpen(v => !v); }} style={{
            padding: '4px 9px', borderRadius: 'var(--r-sm)', border: 'none',
            background: arrangeOpen ? 'var(--accent-sub)' : 'transparent',
            color:      arrangeOpen ? 'var(--accent)' : 'var(--text-3)',
            cursor: 'pointer', fontSize: 16, lineHeight: 1,
          }} title="その他の操作">⋯</button>

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px' }} />

          {/* Add project */}
          <button onClick={() => setCreateProjectOpen(true)} style={{
            padding: '5px 14px', borderRadius: 'var(--r-sm)', border: 'none',
            background: 'var(--accent)', color: '#fff',
            cursor: 'pointer', fontWeight: 600, fontSize: 11,
          }}>＋ 追加</button>
        </div>
      </div>

      {/* ── キャンバスエリア ── */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

      {/* ── Flow矢印マーカー定義 ── */}
      <FlowEdgeDefs />

      {/* ── 空気レイヤー (ReactFlowの外、z-index 0–2) ── */}
      <AtmosphereLayer
        warmth={atmosphere.warmth}
        isStuck={atmosphere.isStuck}
        connectionFlash={connectionFlash}
        presenceScore={boardPresenceScore}
        hueShift={identity.atmosphereHueShift}
      />

      {/* ── Direct Manipulation: RepairDropZone ── */}
      <RepairDropZone
        visible={isDraggingPiece}
        receiving={dragHoverId === 'repair'}
        stagnantCount={stagnantCount}
        isDark={document.documentElement.classList.contains('dark')}
        onRef={el => { repairZoneRef.current = el; }}
      />
      <GlobalStyles />
      {/* 共有グラデーション定義 — PieceNode は per-piece gradients を廃止してこれを参照する */}
      <SharedPieceDefs />
      <ToastContainer messages={messages} onDismiss={dismiss} />

      {/* ─ WorkshopWall (v2テーマON かつ 明示的に開いた時のみ表示) ─ */}
      {workshopTheme && workshopWallOpen && (
        <WorkshopWall
          warmth={atmosphere.warmth}
          isStuck={atmosphere.isStuck}
          pieces={pieces}
          projectMap={projectMap}
          filterAssignee={filterAssignee}
          filterProject={filterProject}
          currentUserId={currentUserId}
          workerMap={workerMap}
          setFilterAssignee={setFilterAssignee}
          setFilterProject={setFilterProject}
          navigate={navigate}
        />
      )}


      {/* ─ More dropdown ─ */}
      {arrangeOpen && (
        <div onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()} style={{
          position: 'absolute', top: 10, right: 12,
          zIndex: 20, background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)',
          boxShadow: 'var(--shadow-md)',
          padding: '4px 0', minWidth: 200, fontSize: 11,
        }}>
          <button onClick={() => {
            const next = layoutMode === 'dag' ? 'force' : 'dag';
            setLayoutMode(next);
            setTimeout(() => fitView({ padding: 0.22, duration: 500 }), 150);
          }} style={{
            width: '100%', padding: '7px 14px', border: 'none',
            background: 'transparent', color: 'var(--text-1)',
            textAlign: 'left', cursor: 'pointer', fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>レイアウト</span>
            <span style={{ color: 'var(--text-3)', fontSize: 10 }}>{layoutMode === 'dag' ? 'DAG' : '重力'}</span>
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          <button onClick={() => setShowCritical(v => !v)} style={{
            width: '100%', padding: '7px 14px', border: 'none',
            background: 'transparent', color: 'var(--text-1)',
            textAlign: 'left', cursor: 'pointer', fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>クリティカルパス</span>
            <span style={{ color: showCritical ? '#D97706' : 'var(--text-3)', fontSize: 10 }}>{showCritical ? 'ON' : 'OFF'}</span>
          </button>
          <button onClick={() => { setCascadeMode(v => !v); setCascadePiece(null); setCascadeAffectedIds(new Set()); }} style={{
            width: '100%', padding: '7px 14px', border: 'none',
            background: 'transparent', color: 'var(--text-1)',
            textAlign: 'left', cursor: 'pointer', fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>⚡ Impact Engine</span>
            <span style={{ color: cascadeMode ? '#D97706' : 'var(--text-3)', fontSize: 10 }}>{cascadeMode ? 'ON' : 'OFF'}</span>
          </button>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          <button onClick={() => { setSprintOpen(true); setArrangeOpen(false); }} style={{
            width: '100%', padding: '7px 14px', border: 'none',
            background: 'transparent', color: 'var(--text-1)',
            textAlign: 'left', cursor: 'pointer', fontSize: 11,
          }}>スプリント</button>
          <button onClick={() => { setTemplateOpen(true); setArrangeOpen(false); }} style={{
            width: '100%', padding: '7px 14px', border: 'none',
            background: 'transparent', color: 'var(--text-1)',
            textAlign: 'left', cursor: 'pointer', fontSize: 11,
          }}>テンプレート</button>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          <button onClick={() => {
            clearSavedPositions(); manualPositions.current = {};
            localStorage.removeItem('pz_viewport_v1');
            refresh();
            setTimeout(() => fitView({ padding: 0.25, duration: 500 }), 200);
            setArrangeOpen(false);
          }} style={{
            width: '100%', padding: '7px 14px', border: 'none',
            background: 'transparent', color: 'var(--text-3)',
            textAlign: 'left', cursor: 'pointer', fontSize: 11,
          }}>レイアウトをリセット</button>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          {/* ─ Workshop Theme v2 toggle ─ */}
          <button onClick={() => { toggleWorkshopTheme(); setArrangeOpen(false); }} style={{
            width: '100%', padding: '7px 14px', border: 'none',
            background: workshopTheme ? 'var(--accent-sub)' : 'transparent',
            color: workshopTheme ? 'var(--accent)' : 'var(--text-2)',
            textAlign: 'left', cursor: 'pointer', fontSize: 11,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>工房 v2 テーマ</span>
            <span style={{
              fontSize: 9, color: workshopTheme ? 'var(--accent)' : 'var(--text-4)',
              fontWeight: workshopTheme ? 600 : 400,
            }}>{workshopTheme ? 'ON' : 'OFF'}</span>
          </button>
          {/* ─ Flow Session Mode toggle ─ */}
          {workshopTheme && (
            <button onClick={() => { setFlowSessionActive(v => !v); setRepairMode(false); setArrangeOpen(false); }} style={{
              width: '100%', padding: '7px 14px', border: 'none',
              background: flowSessionActive ? 'rgba(194,154,108,0.10)' : 'transparent',
              color: flowSessionActive ? 'rgba(160,110,40,1)' : 'var(--text-2)',
              textAlign: 'left', cursor: 'pointer', fontSize: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>今の流れだけ残す</span>
              <span style={{
                fontSize: 9,
                color: flowSessionActive ? 'rgba(160,110,40,0.8)' : 'var(--text-4)',
                fontWeight: flowSessionActive ? 600 : 400,
              }}>{flowSessionActive ? 'ON' : 'OFF'}</span>
            </button>
          )}
          {/* ─ Workshop Wall toggle (v2テーマON時のみ) ─ */}
          {workshopTheme && (
            <button onClick={() => { setWorkshopWallOpen(v => !v); setArrangeOpen(false); }} style={{
              width: '100%', padding: '7px 14px', border: 'none',
              background: workshopWallOpen ? 'rgba(148,163,184,0.08)' : 'transparent',
              color: 'var(--text-2)',
              textAlign: 'left', cursor: 'pointer', fontSize: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span>工房の壁パネル</span>
              <span style={{
                fontSize: 9, color: 'var(--text-4)',
                fontWeight: workshopWallOpen ? 600 : 400,
              }}>{workshopWallOpen ? '表示中' : '非表示'}</span>
            </button>
          )}
        </div>
      )}

      {/* ─ Filter panel ─ */}
      {filterOpen && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-md)', padding: '12px 16px', boxShadow: 'var(--shadow-lg)',
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', minWidth: 460,
        }}>
          <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
            placeholder="タイトルで絞り込み..." autoFocus
            style={{ padding: '5px 10px', borderRadius: 3, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg)', color: 'var(--text-1)', width: 160, outline: 'none' }} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 3, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg)', color: 'var(--text-1)', outline: 'none' }}>
            <option value="">すべてのステータス</option>
            <option value="locked">ロック中</option>
            <option value="ready">着手可能</option>
            <option value="in_progress">進行中</option>
            <option value="done">完了</option>
          </select>
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 3, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg)', color: 'var(--text-1)', outline: 'none' }}>
            <option value="">すべてのプロジェクト</option>
            {Object.values(projectMap).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 3, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg)', color: 'var(--text-1)', outline: 'none' }}>
            <option value="">すべての担当者</option>
            {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          {hasFilter && (
            <button onClick={() => { setFilterStatus(''); setFilterProject(''); setFilterSearch(''); setFilterAssignee(''); }}
              style={{ padding: '5px 10px', borderRadius: 3, border: '1px solid var(--border)', fontSize: 11, background: 'var(--bg)', color: 'var(--text-2)', cursor: 'pointer' }}>
              クリア
            </button>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>
            {visibleCount} / {nodes.filter(n => n.type === 'piece').length} 件
          </span>
        </div>
      )}

      {/* エッジ選択ヒント */}
      {selectedEdgeId && (
        <div style={{
          position: 'absolute', bottom: 48, left: '50%', transform: 'translateX(-50%)',
          zIndex: 15, background: 'rgba(239,68,68,0.90)', color: '#fff',
          borderRadius: 4, padding: '5px 14px',
          fontSize: 11, fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap',
        }}>
          接続を選択中 — <b>Del</b> または右クリックで削除
        </div>
      )}

      {/* ─ Connecting hint ─ */}
      {isConnecting && (
        <div style={{
          position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, background: 'var(--accent)', color: '#fff',
          borderRadius: 3, padding: '9px 20px',
          fontSize: 12, fontWeight: 600, pointerEvents: 'none',
        }}>
          接続先のピースにドロップ — sequential で即時接続
        </div>
      )}

      {/* ─ Bottom hint ─ */}
      {!hoveredNodeId && pieces.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 5, fontSize: 10, color: 'var(--text-3)', pointerEvents: 'none',
          letterSpacing: '0.04em', whiteSpace: 'nowrap',
        }}>
          ダブルクリック: ステータス変更　右クリック: メニュー　●ドラッグ: 接続
        </div>
      )}

      {/* ═══ Gantt mode overlay ═══════════════════════════════════════════════ */}
      {(viewMode as string) === 'gantt' && (
        <div style={{
          position: 'absolute', inset: 0,
          top: 0, zIndex: 8,
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg)',
        }}>
          {/* Toolbar spacer */}
          <div style={{ height: 60, flexShrink: 0 }} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <GanttView
              pieces={pieces}
              connections={connections}
              projectMap={projectMap}
              workerMap={workerMap}
              onPieceClick={setSelectedPiece}
            />
          </div>
        </div>
      )}

      {/* ═══ Workload Ring Panel (load mode) ════════════════════════════════ */}
      {viewMode === 'load' && (
        <WorkloadRingPanel pieces={pieces} workers={workers} />
      )}

      {/* ═══ Bottleneck Panel ══════════════════════════════════════════════════ */}
      {viewMode === 'bottleneck' && (
        <div style={{
          position: 'absolute', top: 60, right: 12, zIndex: 15,
          width: 280, maxHeight: 'calc(100% - 80px)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>ボトルネック</div>
          </div>
          <div style={{ overflowY: 'auto', padding: '8px 0', flex: 1 }}>
            {bottlenecks.stale_pieces.length === 0 && bottlenecks.overloaded_users.length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                現在ボトルネックなし ✓
              </div>
            ) : (
              <>
                {bottlenecks.stale_pieces.length > 0 && (
                  <div>
                    <div style={{ padding: '4px 16px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
                      停滞ピース ({bottlenecks.stale_pieces.length})
                    </div>
                    {bottlenecks.stale_pieces.map(p => (
                      <div key={p.id} onClick={() => setSelectedPiece(p as Piece)}
                        style={{ padding: '7px 16px', cursor: 'pointer', borderBottom: '1px solid var(--border-sub)', display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#D97706', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                {bottlenecks.overloaded_users.length > 0 && (
                  <div>
                    <div style={{ padding: '8px 16px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
                      過負荷ワーカー ({bottlenecks.overloaded_users.length})
                    </div>
                    {bottlenecks.overloaded_users.map(({ user, piece_count }) => (
                      <div key={user.id} style={{ padding: '7px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-1)' }}>{user.name}</span>
                        <span style={{ fontSize: 11, color: '#E60012', fontWeight: 700 }}>{piece_count}件</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ Dashboard overlay ═══════════════════════════════════════════════ */}
      {(viewMode as string) === 'dashboard' && (
        <div style={{
          position: 'absolute', inset: 0,
          top: 0, zIndex: 8,
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg)',
        }}>
          <div style={{ height: 60, flexShrink: 0 }} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <DashboardView />
          </div>
        </div>
      )}

      {/* ─ Empty State ─ */}
      {Object.keys(projectMap).length === 0 && pieces.length === 0 && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 16, pointerEvents: 'none',
        }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" opacity={0.18}>
            <rect x="4" y="4" width="18" height="18" rx="3" fill="var(--accent)"/>
            <rect x="26" y="4" width="18" height="18" rx="3" fill="var(--accent)"/>
            <rect x="4" y="26" width="18" height="18" rx="3" fill="var(--accent)"/>
            <rect x="26" y="26" width="18" height="18" rx="3" fill="var(--accent)" opacity="0.4"/>
          </svg>
          <div style={{ textAlign: 'center', color: 'var(--text-3)', pointerEvents: 'none' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>プロジェクトがまだありません</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>
              右上の「＋ 追加」からプロジェクトを作成してください。<br />
              プロジェクトの中にピース（タスク）を追加していきます。
            </div>
          </div>
          <div style={{
            marginTop: 4, display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 'var(--r-sm)',
            background: 'var(--accent)', color: '#fff',
            fontSize: 12, fontWeight: 600, pointerEvents: 'all', cursor: 'pointer',
          }} onClick={() => setCreateProjectOpen(true)}>
            ＋ 最初のプロジェクトを作成
          </div>
        </div>
      )}

      {/* ═══ ReactFlow (背景透明 → AtmosphereLayer が透けて見える) ══════════ */}
      <ReactFlow
        style={{ background: 'transparent' }}
        edgeTypes={edgeTypes}
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        onNodeContextMenu={onNodeContextMenu}
        onNodeMouseEnter={onNodeMouseEnter}
        onNodeMouseLeave={onNodeMouseLeave}
        onEdgeClick={onEdgeClick}
        onEdgeContextMenu={onEdgeContextMenu}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDragMove}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => { setSelectedEdgeId(null); setContextMenu(null); setEdgeContextMenu(null); }}
        onMouseMove={(e: React.MouseEvent) => {
          const now = Date.now();
          if (now - lastCursorSendRef.current < 50) return;
          lastCursorSendRef.current = now;
          const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          wsSend({ type: 'cursor_move', x: pos.x, y: pos.y });
        }}
        nodeTypes={workshopTheme ? nodeTypesV2 : nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: '#E60012', strokeWidth: 2, strokeDasharray: '6 3' }}
        snapToGrid
        snapGrid={[20, 20]}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.15}
        maxZoom={2.5}
        elevateNodesOnSelect={false}
        onlyRenderVisibleElements
      >
        <Background
          variant={workshopTheme ? BackgroundVariant.Dots : BackgroundVariant.Dots}
          gap={workshopTheme ? 44 : 28}
          size={workshopTheme ? 0.8 : 1.2}
          color={workshopTheme ? 'rgba(180,170,155,0.18)' : 'var(--border)'}
        />
        <Controls style={{ background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }} />
        {workshopTheme && (
          <div
            style={{
              position: 'absolute', bottom: 138, right: 10, zIndex: 5,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)', padding: '6px 10px',
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 11, color: 'var(--text-2)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              userSelect: 'none',
            }}
          >
            {/* 全島一括整列 */}
            <button
              title="全フォルダの位置・ピース配置をリセットして整列し直す"
              onClick={() => {
                // v2f:（ピース位置）と island-（フォルダ位置）をすべてクリア
                for (const key of Object.keys(manualPositions.current)) {
                  if (key.startsWith('v2f:') || key.startsWith('island-') || key.startsWith('summary-')) {
                    delete manualPositions.current[key];
                  }
                }
                try {
                  const all = JSON.parse(localStorage.getItem('pz_board_positions_v2') ?? '{}');
                  for (const key of Object.keys(all)) {
                    if (key.startsWith('v2f:') || key.startsWith('island-') || key.startsWith('summary-')) {
                      delete all[key];
                    }
                  }
                  localStorage.setItem('pz_board_positions_v2', JSON.stringify(all));
                } catch {}
                setPositionVersion(v => v + 1);
                setTimeout(() => fitView({ padding: 0.22, duration: 600 }), 400);
              }}
              style={{
                width: 22, height: 22, border: '1px solid var(--border)',
                borderRadius: 4, background: 'var(--surface)', color: 'var(--text-2)',
                cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <rect x="0" y="0.5" width="11" height="2" rx="1" fill="currentColor" />
                <rect x="0" y="4.5" width="7"  height="2" rx="1" fill="currentColor" />
                <rect x="0" y="8.5" width="9"  height="2" rx="1" fill="currentColor" />
              </svg>
            </button>
            <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
            <span style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.04em' }}>幅</span>
            <button
              onClick={() => setJigsawWrapColsClamped(jigsawWrapCols - 1)}
              style={{
                width: 22, height: 22, border: '1px solid var(--border)',
                borderRadius: 4, background: 'var(--surface)', color: 'var(--text-2)',
                cursor: jigsawWrapCols <= 2 ? 'not-allowed' : 'pointer',
                opacity: jigsawWrapCols <= 2 ? 0.4 : 1,
                fontSize: 14, lineHeight: 1, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              disabled={jigsawWrapCols <= 2}
            >−</button>
            <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 600, fontSize: 12 }}>
              {jigsawWrapCols}
            </span>
            <button
              onClick={() => setJigsawWrapColsClamped(jigsawWrapCols + 1)}
              style={{
                width: 22, height: 22, border: '1px solid var(--border)',
                borderRadius: 4, background: 'var(--surface)', color: 'var(--text-2)',
                cursor: jigsawWrapCols >= 10 ? 'not-allowed' : 'pointer',
                opacity: jigsawWrapCols >= 10 ? 0.4 : 1,
                fontSize: 14, lineHeight: 1, padding: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              disabled={jigsawWrapCols >= 10}
            >+</button>
          </div>
        )}
        <MiniMap
          nodeColor={n => {
            if (n.type === 'projectIsland') return 'rgba(0,0,0,0.06)';
            if (n.type === 'projectSummary') return (n.data as SummaryData)?.color ?? '#888';
            const piece = n.data?.piece as Piece | undefined;
            return ({
              locked:      '#BBBBBB',
              ready:       '#2EAA4E',
              in_progress: '#0070CC',
              done:        '#CCCCCC',
            } as Record<string, string>)[piece?.status ?? ''] ?? '#CCCCCC';
          }}
          nodeStrokeWidth={0}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            bottom: 10,
            right: 10,
            width: 160,
            height: 100,
          }}
          maskColor="rgba(0,0,0,0.05)"
          pannable
          zoomable
        />
      </ReactFlow>

      {/* ═══ Remote Cursors overlay ══════════════════════════════════════════ */}
      <RemoteCursors cursors={remoteCursors} />

      {/* ═══ Node context menu ════════════════════════════════════════════════ */}
      {contextMenu && (
        <div
          id="piece-context-menu"
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            padding: '6px 0', minWidth: 170, fontSize: 12,
          }}
        >
          <div style={{ padding: '6px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {contextMenu.piece.title.slice(0, 22)}{contextMenu.piece.title.length > 22 ? '…' : ''}
          </div>
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          {(Object.entries(STATUS_LABELS) as [PieceStatus, string][]).map(([s, label]) => (
            <button key={s} onClick={() => handleContextStatus(contextMenu.piece, s)}
              style={{
                width: '100%', padding: '7px 14px', border: 'none',
                background: contextMenu.piece.status === s ? 'var(--accent-sub)' : 'transparent',
                color:      contextMenu.piece.status === s ? 'var(--accent)' : 'var(--text-1)',
                textAlign: 'left', cursor: 'pointer', fontSize: 12,
                fontWeight: contextMenu.piece.status === s ? 700 : 400,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, flexShrink: 0, background: {
                locked: '#9CA3AF', ready: '#059669', in_progress: '#2563EB', done: '#8B5CF6',
              }[s] }} />
              {label}
              {contextMenu.piece.status === s && ' ✓'}
            </button>
          ))}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button
            onClick={() => { setContextMenu(null); const p = pieces.find(x => x.id === contextMenu.pieceId); if (p) setSelectedPiece(p); }}
            style={{ width: '100%', padding: '7px 14px', border: 'none', background: 'transparent', color: 'var(--text-2)', textAlign: 'left', cursor: 'pointer', fontSize: 12 }}>
            詳細を開く
          </button>
          {contextMenu.piece.project_id && (() => {
            const proj = projectMap[contextMenu.piece.project_id!];
            return (
              <button
                onClick={() => {
                  const proj = projectMap[contextMenu.piece.project_id!];
                  const currentColor = proj?.color ?? PALETTE_CLASSIC[0];
                  setPcmTab(PALETTE_COLOR.includes(currentColor) ? 'color' : 'classic');
                  setProjectColorMenu({ x: contextMenu.x, y: contextMenu.y, projectId: contextMenu.piece.project_id!, currentColor });
                  setContextMenu(null);
                }}
                style={{ width: '100%', padding: '7px 14px', border: 'none', background: 'transparent', color: 'var(--text-2)', textAlign: 'left', cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: proj?.color ?? '#888', flexShrink: 0, display: 'inline-block' }} />
                プロジェクトカラー変更
              </button>
            );
          })()}
          {workshopTheme && (() => {
            // このピースの接続を列挙して個別解除ボタンを表示
            const myConns = connectionsRef.current.filter(c =>
              c.from_piece_id === contextMenu.pieceId || c.to_piece_id === contextMenu.pieceId
            );
            if (myConns.length === 0) return null;
            const allNodes = nodesRef.current;
            const thisNode = allNodes.find(n => n.id === contextMenu.pieceId);
            return (
              <>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <div style={{ padding: '4px 14px 2px', fontSize: 9.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                  接続を解除
                </div>
                {myConns.map(c => {
                  const otherId = c.from_piece_id === contextMenu.pieceId ? c.to_piece_id : c.from_piece_id;
                  const otherPiece = pieces.find(p => p.id === otherId);
                  const otherNode  = allNodes.find(n => n.id === otherId);
                  // 方向矢印
                  let dirLabel = '—';
                  if (thisNode && otherNode) {
                    const dx = otherNode.position.x - thisNode.position.x;
                    const dy = otherNode.position.y - thisNode.position.y;
                    if (Math.abs(dx) >= Math.abs(dy)) dirLabel = dx > 0 ? '→' : '←';
                    else dirLabel = dy > 0 ? '↓' : '↑';
                  }
                  const label = otherPiece?.title?.slice(0, 18) ?? otherId.slice(0, 8);
                  return (
                    <button
                      key={c.id}
                      onClick={async () => {
                        setContextMenu(null);
                        try {
                          await pieceApi.deleteConnection(c.id);
                          // 再スナップ防止ナッジ
                          const GAP = MAGNET_SNAP_TOL + 2;
                          const myPos    = manualPositions.current[`v2f:${contextMenu.pieceId}`];
                          const otherPos = manualPositions.current[`v2f:${otherId}`];
                          if (myPos && otherPos) {
                            const ddx = otherPos.x - myPos.x;
                            const ddy = otherPos.y - myPos.y;
                            const newOtherPos = {
                              x: otherPos.x + (ddx > 0 ? GAP : ddx < 0 ? -GAP : 0),
                              y: otherPos.y + (ddy > 0 ? GAP : ddy < 0 ? -GAP : 0),
                            };
                            manualPositions.current[`v2f:${otherId}`] = newOtherPos;
                            persistPosition(`v2f:${otherId}`, newOtherPos);
                          }
                          await refresh();
                          setPositionVersion(v => v + 1);
                          push('接続を解除しました', 'success');
                        } catch { push('解除に失敗しました', 'error'); }
                      }}
                      style={{
                        width: '100%', padding: '6px 14px', border: 'none',
                        background: 'transparent', color: 'var(--text-2)',
                        textAlign: 'left', cursor: 'pointer', fontSize: 11.5,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <span style={{ fontSize: 12, minWidth: 14, textAlign: 'center', opacity: 0.7 }}>{dirLabel}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {label}{otherPiece?.title && otherPiece.title.length > 18 ? '…' : ''}
                      </span>
                    </button>
                  );
                })}
                {myConns.length > 1 && (
                  <button
                    onClick={() => { setContextMenu(null); handleDetach(contextMenu.pieceId); }}
                    style={{ width: '100%', padding: '6px 14px', border: 'none', background: 'transparent', color: 'var(--text-3)', textAlign: 'left', cursor: 'pointer', fontSize: 11, fontStyle: 'italic' }}>
                    すべて解除
                  </button>
                )}
              </>
            );
          })()}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          <button
            onClick={() => {
              if (window.confirm(`「${contextMenu.piece.title}」を削除しますか？\n依存関係も一緒に削除されます。`)) {
                handleDeletePiece(contextMenu.pieceId);
              } else {
                setContextMenu(null);
              }
            }}
            style={{ width: '100%', padding: '7px 14px', border: 'none', background: 'transparent', color: '#EF4444', textAlign: 'left', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
            削除
          </button>
        </div>
      )}

      {/* ═══ Edge context menu ════════════════════════════════════════════════ */}
      {edgeContextMenu && (
        <div
          id="edge-context-menu"
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: edgeContextMenu.x, top: edgeContextMenu.y,
            zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            padding: '6px 0', minWidth: 200, fontSize: 12,
          }}
        >
          <div style={{ padding: '5px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            接続タイプを変更
          </div>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          {(['sequential', 'parallel', 'conditional'] as ConnectionType[]).map(type => {
            const lbl = CONN_TYPE_LABELS[type];
            return (
              <button key={type} onClick={() => handleEdgeTypeChange(edgeContextMenu.edgeId, type)}
                style={{
                  width: '100%', padding: '8px 14px', border: 'none',
                  background: edgeContextMenu.connType === type ? 'var(--accent-sub)' : 'transparent',
                  color:      edgeContextMenu.connType === type ? 'var(--accent)' : 'var(--text-1)',
                  textAlign: 'left', cursor: 'pointer', fontSize: 12,
                  fontWeight: edgeContextMenu.connType === type ? 700 : 400,
                  display: 'flex', alignItems: 'center', gap: 10,
                  borderLeft: edgeContextMenu.connType === type ? `3px solid ${EDGE_COLORS[type]}` : '3px solid transparent',
                }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: EDGE_COLORS[type] }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{lbl?.short ?? type}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{lbl?.desc}</div>
                </div>
                {edgeContextMenu.connType === type && <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 11 }}>✓</span>}
              </button>
            );
          })}
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          <button
            onClick={() => handleEdgeDelete(edgeContextMenu.edgeId)}
            style={{ width: '100%', padding: '7px 14px', border: 'none', background: 'transparent', color: '#EF4444', textAlign: 'left', cursor: 'pointer', fontSize: 12 }}>
            🗑 接続を削除
          </button>
        </div>
      )}

      {/* ═══ Project color picker ════════════════════════════════════════════ */}
      {projectColorMenu && (
        <div
          id="project-color-menu"
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            left: Math.min(projectColorMenu.x, window.innerWidth - 180),
            top: Math.min(projectColorMenu.y, window.innerHeight - 200),
            zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            padding: '12px 14px', minWidth: 160,
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 8 }}>
            プロジェクトカラー
          </div>
          {/* タブ */}
          <div style={{ display: 'flex', gap: 1, marginBottom: 8 }}>
            {(['classic', 'color'] as const).map(t => (
              <button
                key={t} type="button" onClick={() => setPcmTab(t)}
                style={{
                  padding: '3px 8px', fontSize: 10, fontWeight: 700, cursor: 'pointer', border: 'none',
                  borderRadius: t === 'classic' ? '3px 0 0 3px' : '0 3px 3px 0',
                  background: pcmTab === t ? 'var(--text-1)' : 'var(--border)',
                  color: pcmTab === t ? '#fff' : 'var(--text-3)',
                  letterSpacing: '0.04em',
                }}
              >
                {t === 'classic' ? 'クラシック' : 'カラー'}
              </button>
            ))}
          </div>
          {/* スウォッチ */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
            {(pcmTab === 'classic' ? PALETTE_CLASSIC : PALETTE_COLOR).map(c => (
              <button
                key={c}
                type="button"
                onClick={async () => {
                  const { projectId } = projectColorMenu;
                  setProjectColorMenu(null);
                  try {
                    await projectApi.update(projectId, { color: c });
                    setProjectMap(prev => ({
                      ...prev,
                      [projectId]: { ...prev[projectId], color: c },
                    }));
                    push('カラーを変更しました', 'success');
                    // ノード再描画
                    setPositionVersion(v => v + 1);
                  } catch {
                    push('カラーの変更に失敗しました', 'error');
                  }
                }}
                style={{
                  width: 20, height: 20, borderRadius: '50%', background: c, padding: 0, cursor: 'pointer', outline: 'none',
                  border: projectColorMenu.currentColor === c ? '2px solid var(--text-1)' : '2px solid transparent',
                  boxShadow: projectColorMenu.currentColor === c ? `0 0 0 1px ${c}` : 'none',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.25)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
                title={c}
              />
            ))}
          </div>
        </div>
      )}

      {/* ═══ Sprint Planner ═══════════════════════════════════════════════════ */}
      <SprintPlannerPanel
        open={sprintOpen}
        onClose={() => setSprintOpen(false)}
        pieces={pieces}
        connections={connections}
        workers={Object.entries(workerMap).map(([id, v]) => ({ id, name: v.name }))}
        onUpdated={() => { refresh(); push('スプリントを更新しました', 'success'); setSprintOpen(false); }}
      />

      {/* ─ プロジェクト新規作成モーダル ─ */}
      {createProjectOpen && (
        <CreateProjectModal
          onCreated={(p: Project) => {
            setProjectMap(prev => ({ ...prev, [p.id]: p }));
            push('プロジェクトを作成しました', 'success');
            setCreateProjectOpen(false);
          }}
          onClose={() => setCreateProjectOpen(false)}
        />
      )}

      {/* ─ Panels ─ */}
      <PieceCreatePanel
        open={createOpen}
        onClose={() => { setCreateOpen(false); setCreateIslandProjectId(null); }}
        onCreated={() => { refresh(); push('ピースを追加しました', 'success'); }}
        defaultProjectId={createIslandProjectId}
        allPieces={pieces}
      />
      <PieceDetailPanel
        piece={selectedPiece}
        onClose={() => setSelectedPiece(null)}
        onUpdated={() => { refresh(); push('更新しました', 'success'); }}
        allPieces={pieces}
        onDelete={handleDeletePiece}
      />
      <TemplatePanel
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        onCreated={() => { refresh(); push('テンプレートからプロジェクトを作成しました', 'success'); setTemplateOpen(false); }}
        projects={Object.values(projectMap)}
      />

      {/* ═══ 接続タイプ選択ポップアップ ══════════════════════════════════════ */}
      {pendingConn && (
        <div
          style={{
            position: 'fixed',
            left: pendingConn.x, top: pendingConn.y,
            transform: 'translate(-50%, 8px)',
            zIndex: 9999,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            padding: 6,
            display: 'flex', gap: 4,
          }}
          onMouseLeave={() => setPendingConn(null)}
        >
          {(['sequential', 'parallel', 'conditional'] as ConnectionType[]).map(type => {
            const colors: Record<string, string> = { sequential: '#E60012', parallel: '#0070CC', conditional: '#D97706' };
            const labels: Record<string, { short: string; desc: string }> = {
              sequential:  { short: '順序',    desc: '前が完了したら解放' },
              parallel:    { short: '並列',    desc: 'すべて完了で解放' },
              conditional: { short: '条件',    desc: '条件を満たしたら解放' },
            };
            return (
              <button
                key={type}
                onClick={() => handleConnectConfirm(type)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                  padding: '7px 14px', borderRadius: 8, border: `1.5px solid ${colors[type]}22`,
                  background: `${colors[type]}0d`, cursor: 'pointer',
                  transition: 'background 0.12s, border-color 0.12s',
                  minWidth: 64,
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = `${colors[type]}22`;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = colors[type];
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.background = `${colors[type]}0d`;
                  (e.currentTarget as HTMLButtonElement).style.borderColor = `${colors[type]}22`;
                }}
              >
                <svg width="22" height="10" style={{ overflow: 'visible' }}>
                  <line x1="0" y1="5" x2="16" y2="5" stroke={colors[type]} strokeWidth="2"
                    strokeDasharray={type === 'sequential' ? '5 2.5' : undefined}
                    strokeLinecap="round" />
                  <polygon points="14,2 20,5 14,8" fill={colors[type]} />
                </svg>
                <span style={{ fontSize: 10, fontWeight: 700, color: colors[type] }}>{labels[type].short}</span>
                <span style={{ fontSize: 9, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{labels[type].desc}</span>
              </button>
            );
          })}
          <button
            onClick={() => setPendingConn(null)}
            style={{
              alignSelf: 'flex-start', padding: '2px 5px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-3)', fontSize: 14, lineHeight: 1,
            }}
          >×</button>
        </div>
      )}

      {/* ═══ Impact Engine (Cascade Panel) ═══════════════════════════════════ */}
      {cascadeMode && cascadePiece && (
        <CascadePanel
          piece={cascadePiece}
          onClose={() => { setCascadeMode(false); setCascadePiece(null); setCascadeAffectedIds(new Set()); }}
          onAffectedChange={handleCascadeAffected}
          onApply={handleCascadeApply}
        />
      )}
      {cascadeMode && !cascadePiece && (
        <div style={{
          position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 30, pointerEvents: 'none',
          background: 'rgba(245,158,11,0.9)',
          color: '#fff', borderRadius: 10,
          padding: '8px 20px', fontSize: 12, fontWeight: 700,
          boxShadow: '0 4px 20px rgba(245,158,11,0.3)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          ⚡ 期日を変更したいピースをクリックしてください
        </div>
      )}

      {/* ═══ Puzzle completion celebration ══════════════════════════════════ */}
      {celebrateText && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%',
          zIndex: 9999, pointerEvents: 'none',
          animation: 'puzzle-celebrate 2.2s ease forwards',
          background: 'var(--surface)',
          border: '1.5px solid #22C55E',
          borderRadius: 12,
          padding: '10px 20px',
          boxShadow: '0 8px 32px rgba(34,197,94,0.25)',
          fontSize: 13, fontWeight: 700, color: '#16A34A',
          whiteSpace: 'nowrap',
          letterSpacing: '-0.01em',
        }}>
          {celebrateText}
        </div>
      )}

      {/* ═══ Multi-select bulk action bar ════════════════════════════════════ */}
      {multiSelectIds.size > 0 && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9998,
          background: 'var(--surface)',
          border: '1.5px solid var(--accent)',
          borderRadius: 10,
          padding: '8px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 32px rgba(230,0,18,0.18)',
          fontSize: 12, whiteSpace: 'nowrap',
        }}>
          <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
            {multiSelectIds.size} 件選択中
          </span>
          <div style={{ width: 1, height: 18, background: 'var(--border)' }} />
          {(['ready', 'in_progress', 'done'] as PieceStatus[]).map(s => (
            <button key={s}
              onClick={async () => {
                const ids = [...multiSelectIds];
                for (const id of ids) {
                  try { await pieceApi.updateStatus(id, s); } catch {}
                }
                await refresh();
                push(`${ids.length} 件を「${STATUS_LABELS[s]}」に変更しました`, 'success');
                if (s === 'done') {
                  ids.forEach((id, i) => setTimeout(() => {
                    setJustCompletedId(id);
                    setTimeout(() => setJustCompletedId(null), 900);
                  }, i * 120));
                  setCelebrateText(`🧩 ${ids.length} 件まとめて完了！`);
                  setTimeout(() => setCelebrateText(null), 2200);
                }
                setMultiSelectIds(new Set());
              }}
              style={{
                padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: ({ ready: '#F0FDF4', in_progress: '#EFF6FF', done: '#F9FAFB', locked: 'var(--surface-sub)' } as Record<PieceStatus, string>)[s],
                color:      ({ ready: '#16A34A', in_progress: '#1D4ED8', done: '#6B7280', locked: 'var(--text-3)' } as Record<PieceStatus, string>)[s],
                cursor: 'pointer', fontWeight: 700, fontSize: 11,
              }}>
              → {STATUS_LABELS[s]}
            </button>
          ))}
          <button
            onClick={() => setMultiSelectIds(new Set())}
            style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-3)',
              cursor: 'pointer', fontSize: 11,
            }}>
            ✕ 解除
          </button>
        </div>
      )}

      {/* ═══ Shortcut modal ══════════════════════════════════════════════════ */}
      {shortcutsOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShortcutsOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-lg)',
              boxShadow: 'var(--shadow-lg)',
              padding: '24px 28px',
              minWidth: 320, maxWidth: 400,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', marginBottom: 16, letterSpacing: '-0.01em' }}>
              ⌨️ キーボードショートカット
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {([
                ['ダブルクリック', 'ステータスをサイクル変更'],
                ['右クリック',     'コンテキストメニュー（ステータス変更・削除）'],
                ['Shift + クリック', '複数ピースを選択（一括変更）'],
                ['ハンドルドラッグ', 'ピース間の接続を作成'],
                ['フォルダへドラッグ', 'ピースをプロジェクトに追加・移動'],
                ['空白へドラッグ',  'プロジェクトからピースを外す'],
                ['?',             'このショートカット一覧を表示'],
                ['Escape',        '選択解除 / モーダルを閉じる'],
              ] as [string, string][]).map(([key, desc]) => (
                <div key={key} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                    background: 'var(--surface-sub)', border: '1px solid var(--border)',
                    color: 'var(--text-2)', whiteSpace: 'nowrap', flexShrink: 0, minWidth: 100, textAlign: 'center',
                  }}>{key}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.4, paddingTop: 2 }}>{desc}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShortcutsOpen(false)}
              style={{
                marginTop: 18, width: '100%', padding: '8px 0',
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 6, cursor: 'pointer', fontSize: 12, color: 'var(--text-3)',
              }}>
              閉じる
            </button>
          </div>
        </div>
      )}
      </div>{/* end canvas area */}
    </div>
  );
}

export default function PuzzleBoard() {
  return (
    <ReactFlowProvider>
      <PuzzleBoardInner />
    </ReactFlowProvider>
  );
}
