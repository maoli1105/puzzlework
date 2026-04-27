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

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Piece, Connection, Project, PieceStatus } from '../../types';
import { pieces as pieceApi, projects as projectApi, users as usersApi } from '../../services/api';
import { usePieces } from '../../hooks/usePieces';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useToast, ToastContainer } from '../common/Toast';
import { WSEvent } from '../../types';
import PieceNode, { PIECE_NODE_W, PIECE_NODE_H } from './PieceNode';
import PieceCreatePanel from './PieceCreatePanel';
import PieceDetailPanel from './PieceDetailPanel';
import GanttView from './GanttView';
import SprintPlannerPanel from './SprintPlannerPanel';
import { ConnectionType } from '../../types';

// ─── Global styles ────────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  .react-flow__node:hover .piece-handle { opacity: 0.85 !important; }
  .react-flow__node.selected .piece-handle { opacity: 0.85 !important; }
  .react-flow__handle.piece-handle:hover {
    opacity: 1 !important;
    box-shadow: 0 0 0 4px rgba(99,102,241,0.35) !important;
  }
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
  @keyframes island-breathe {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.80; }
  }
`;
function GlobalStyles() { return <style>{GLOBAL_CSS}</style>; }

// ─── Edge colors ──────────────────────────────────────────────────────────────
const EDGE_COLORS: Record<string, string> = {
  sequential:  '#6366f1',
  parallel:    '#0ea5e9',
  conditional: '#f59e0b',
  default:     '#94a3b8',
};

// ─── Status ───────────────────────────────────────────────────────────────────
const STATUS_CYCLE: Record<PieceStatus, PieceStatus> = {
  locked: 'ready', ready: 'in_progress', in_progress: 'done', done: 'locked',
};
const STATUS_LABELS: Record<PieceStatus, string> = {
  locked: 'ロック中', ready: '着手可能', in_progress: '進行中', done: '完了',
};

type ViewMode = 'flow' | 'bottleneck' | 'load' | 'gantt';
const VIEW_LABELS: Record<ViewMode, string> = {
  flow: 'フロー', bottleneck: 'ボトルネック', load: '負荷', gantt: 'ガント',
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
  seed?: Record<string, { x: number; y: number }>
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

    // Repulsion between every pair
    for (let i = 0; i < pieces.length; i++) {
      for (let j = i + 1; j < pieces.length; j++) {
        const u = pieces[i].id; const v = pieces[j].id;
        const dx = pos[u].x - pos[v].x;
        const dy = pos[u].y - pos[v].y;
        const d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const rep = (k * k) / d;
        disp[u].x += (dx / d) * rep;  disp[u].y += (dy / d) * rep;
        disp[v].x -= (dx / d) * rep;  disp[v].y -= (dy / d) * rep;
      }
    }

    // Attraction along edges
    for (const c of connections) {
      const u = c.from_piece_id; const v = c.to_piece_id;
      if (!pos[u] || !pos[v]) continue;
      const dx = pos[u].x - pos[v].x;
      const dy = pos[u].y - pos[v].y;
      const d  = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const att = (d * d) / k;
      disp[u].x -= (dx / d) * att;  disp[u].y -= (dy / d) * att;
      disp[v].x += (dx / d) * att;  disp[v].y += (dy / d) * att;
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

// ─── Business impact → visual scale (0.85 ~ 1.35) ────────────────────────────
function computeImpactScales(pieces: Piece[]): Record<string, number> {
  const values = pieces.map(p => p.business_impact ?? 0);
  const max    = Math.max(...values, 1);
  const result: Record<string, number> = {};
  for (const p of pieces) {
    const v = p.business_impact ?? 0;
    result[p.id] = v > 0 ? 0.85 + (v / max) * 0.50 : 1.0;
  }
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
}

function ProjectIslandNode({ data }: { data: IslandData }) {
  const col = data.color || '#6366f1';
  return (
    <div style={{
      width:  data.width,
      height: data.height,
      background:   `${col}0D`,
      border:       `1.5px solid ${col}40`,
      borderRadius: 22,
      position:     'relative',
      pointerEvents:'none',
      boxShadow: `inset 0 0 40px ${col}08`,
    }}>
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

      {/* Faint grid pattern inside island */}
      <svg
        width={data.width} height={data.height}
        style={{ position: 'absolute', top: 0, left: 0, opacity: 0.06 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id={`grid-${col.replace('#','')}`} width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M 28 0 L 0 0 0 28" fill="none" stroke={col} strokeWidth="0.8"/>
          </pattern>
        </defs>
        <rect width={data.width} height={data.height} fill={`url(#grid-${col.replace('#','')})`} rx="22"/>
      </svg>
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
}

function ProjectSummaryNode({ data }: { data: SummaryData }) {
  const { pieces: ps, color: col, name, onToggle } = data;
  const done   = ps.filter(p => p.status === 'done').length;
  const inprog = ps.filter(p => p.status === 'in_progress').length;
  const ready  = ps.filter(p => p.status === 'ready').length;
  const locked = ps.filter(p => p.status === 'locked').length;
  const total  = ps.length;
  const pct    = total > 0 ? (done / total) * 100 : 0;
  const nextP  = [...ps]
    .filter(p => p.due_date && p.status !== 'done')
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0];

  const HANDLE_STYLE: React.CSSProperties = {
    width: 10, height: 10, borderRadius: 3,
    background: col, border: '2px solid var(--surface)',
    opacity: 0, transition: 'opacity 0.15s',
  };

  return (
    <>
      <Handle type="target" position={Position.Left}  id="tgt" className="piece-handle" style={{ ...HANDLE_STYLE, top: SUMMARY_H / 2, left: -1, transform: 'translate(-50%,-50%)' }} />
      <div
        onClick={onToggle}
        style={{
          width: SUMMARY_W, height: SUMMARY_H,
          background: 'var(--surface)',
          borderRadius: 14,
          border: `2px solid ${col}55`,
          boxShadow: `0 6px 24px ${col}22, 0 2px 8px rgba(0,0,0,0.10)`,
          overflow: 'hidden',
          cursor: 'pointer',
          fontFamily: '"Inter","Outfit",sans-serif',
          transition: 'box-shadow 0.2s, transform 0.12s',
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
    </>
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
        projectId:   pid,
        isCollapsed: false,
        onToggle:    () => onToggle(pid),
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

const nodeTypes = { piece: PieceNode, projectIsland: ProjectIslandNode, projectSummary: ProjectSummaryNode };

// ─────────────────────────────────────────────────────────────────────────────
function PuzzleBoardInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [viewMode,        setViewMode]        = useState<ViewMode>('flow');
  const [createOpen,      setCreateOpen]      = useState(false);
  const [selectedPiece,   setSelectedPiece]   = useState<Piece | null>(null);
  const [isConnecting,    setIsConnecting]    = useState(false);
  const [filterStatus,    setFilterStatus]    = useState('');
  const [filterProject,   setFilterProject]   = useState('');
  const [filterSearch,    setFilterSearch]    = useState('');
  const [filterOpen,      setFilterOpen]      = useState(false);
  const [hoveredNodeId,   setHoveredNodeId]   = useState<string | null>(null);
  const [selectedEdgeId,  setSelectedEdgeId]  = useState<string | null>(null);
  const [contextMenu,     setContextMenu]     = useState<ContextMenu | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<EdgeContextMenu | null>(null);
  const [projectMap,      setProjectMap]      = useState<Record<string, Project>>({});
  const [workerMap,       setWorkerMap]       = useState<Record<string, { name: string }>>({});
  const [showIslands,       setShowIslands]       = useState(true);
  const [layoutMode,        setLayoutMode]        = useState<'dag' | 'force'>('dag');
  const [showCritical,      setShowCritical]      = useState(false);
  const [sprintOpen,        setSprintOpen]        = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [expandedPieces,    setExpandedPieces]    = useState<Set<string>>(new Set());

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

  const { fitView }       = useReactFlow();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pieces, connections, bottlenecks, refresh } = usePieces();
  const { messages, push, dismiss } = useToast();
  const viewModeRef   = useRef(viewMode);
  viewModeRef.current = viewMode;

  const manualPositions = useRef<Record<string, { x: number; y: number }>>(loadSavedPositions());
  // keep latest pieces/projectMap accessible inside callbacks without stale closure
  const piecesRef      = useRef(pieces);
  const projectMapRef  = useRef(projectMap);
  piecesRef.current    = pieces;
  projectMapRef.current = projectMap;

  // ── Data fetch ──
  useEffect(() => {
    refresh();
    projectApi.list()
      .then((ps: Project[]) => setProjectMap(Object.fromEntries(ps.map(p => [p.id, p]))))
      .catch(() => {});
    usersApi.workers()
      .then((ws: { id: string; name: string }[]) =>
        setWorkerMap(Object.fromEntries(ws.map(w => [w.id, { name: w.name }])))
      )
      .catch(() => {});
  }, [refresh]);

  // ── URL param ?piece=ID ──
  useEffect(() => {
    const pieceId = searchParams.get('piece');
    if (!pieceId || pieces.length === 0) return;
    const found = pieces.find(p => p.id === pieceId);
    if (found) { setSelectedPiece(found); setSearchParams({}, { replace: true }); }
  }, [pieces, searchParams, setSearchParams]);

  // ── WebSocket ──
  useWebSocket(useCallback((event: WSEvent) => {
    if (event.type === 'piece_ready')      { push('新しいピースが着手可能になりました', 'success'); refresh(); }
    if (event.type === 'bottleneck_alert') { push('ボトルネックを検出しました', 'warn'); }
  }, [push, refresh]));

  // ── Island rebuild helper ──────────────────────────────────────────────────
  const rebuildIslands = useCallback(() => {
    const ps = piecesRef.current;
    const pm = projectMapRef.current;
    if (!ps.length || !showIslands) return;

    setNodes(prev => {
      const pieceNodes  = prev.filter(n => n.type !== 'projectIsland');
      const posMap      = Object.fromEntries(pieceNodes.map(n => [n.id, n.position]));
      const islandNodes = computeIslandNodes(ps, posMap, pm, toggleCollapse);
      return [...islandNodes, ...pieceNodes];
    });
  }, [showIslands, toggleCollapse]);

  // ── Effect 1: データ変更 → グラフ全再構築 ──────────────────────────────────
  useEffect(() => {
    if (pieces.length === 0) return;

    const staleIds    = new Set(bottlenecks.stale_pieces.map(p => p.id));
    const overloadIds = new Set(
      bottlenecks.overloaded_users.flatMap(ou =>
        pieces.filter(p => p.assignee_id === ou.user.id).map(p => p.id)
      )
    );
    const blockedIds   = computeBlockedIds(pieces, connections);
    const criticalIds  = showCritical ? computeCriticalPath(pieces, connections) : new Set<string>();
    const isBNMode     = viewModeRef.current === 'bottleneck';
    const impactScales = computeImpactScales(pieces);

    // ── 階層: parent_id ベースの child マップ構築 ────────────────────────
    const childMap: Record<string, string[]> = {};
    for (const p of pieces) {
      if (p.parent_id) {
        if (!childMap[p.parent_id]) childMap[p.parent_id] = [];
        childMap[p.parent_id].push(p.id);
      }
    }

    // ── 折りたたみ分離: collapsed vs visible ──────────────────────────────
    const collapsedByProject: Record<string, Piece[]> = {};
    for (const p of pieces) {
      if (p.project_id && collapsedProjects.has(p.project_id)) {
        if (!collapsedByProject[p.project_id]) collapsedByProject[p.project_id] = [];
        collapsedByProject[p.project_id].push(p);
      }
    }
    // 子ピースは親が展開されているときのみ表示
    const visiblePieces = pieces.filter(p =>
      (!p.project_id || !collapsedProjects.has(p.project_id)) &&
      (!p.parent_id  || expandedPieces.has(p.parent_id))
    );
    // collapsed piece ID → summary node ID のマップ
    const pieceToSummary: Record<string, string> = {};
    for (const [projId, ps2] of Object.entries(collapsedByProject)) {
      for (const p of ps2) pieceToSummary[p.id] = `summary-${projId}`;
    }

    // Choose layout strategy (visible pieces only)
    const autoPos = layoutMode === 'force'
      ? forceDirectedLayout(visiblePieces, connections.filter(c =>
          !pieceToSummary[c.from_piece_id] && !pieceToSummary[c.to_piece_id]
        ), manualPositions.current)
      : autoLayout(visiblePieces, connections);

    // ── Visible piece nodes ───────────────────────────────────────────────
    const newNodes: Node[] = visiblePieces.map(piece => {
      const isBottleneck = isBNMode && (staleIds.has(piece.id) || overloadIds.has(piece.id));
      const isBlocked    = blockedIds.has(piece.id);

      // 子ピースは親の下に整列、手動ドラッグも尊重
      let pos: { x: number; y: number };
      if (piece.parent_id && expandedPieces.has(piece.parent_id)) {
        const parentPos = manualPositions.current[piece.parent_id]
          ?? autoPos[piece.parent_id]
          ?? { x: 400, y: 300 };
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

      const project      = piece.project_id ? projectMap[piece.project_id] : undefined;
      const assigneeName = piece.assignee_id ? workerMap[piece.assignee_id]?.name : undefined;
      const thisChildren = childMap[piece.id] ?? [];

      const matchesStatus  = !filterStatus  || piece.status === filterStatus;
      const matchesProject = !filterProject || piece.project_id === filterProject;
      const matchesSearch  = !filterSearch  || piece.title.toLowerCase().includes(filterSearch.toLowerCase());
      const filterDimmed   = !!(filterStatus || filterProject || filterSearch) && !(matchesStatus && matchesProject && matchesSearch);

      return {
        id: piece.id, type: 'piece', position: pos,
        data: {
          piece, isBottleneck, isBlocked, isCritical: criticalIds.has(piece.id), isConnecting: false,
          projectColor: project?.color, projectName: project?.name,
          assigneeName,
          impactScale: impactScales[piece.id] ?? 1,
          isDimmed: filterDimmed, isHighlighted: false,
          // 階層
          childCount:      thisChildren.length,
          isExpanded:      expandedPieces.has(piece.id),
          onToggleExpand:  () => toggleExpand(piece.id),
          isChild:         !!piece.parent_id,
        },
        style: filterDimmed ? { pointerEvents: 'none' as const } : undefined,
      };
    });

    // ── 親子リンクエッジ（ツリー構造の視覚的接続）──────────────────────────
    const parentChildEdges: Edge[] = visiblePieces
      .filter(p => p.parent_id && visiblePieces.some(v => v.id === p.parent_id))
      .map(p => ({
        id:     `pc-${p.parent_id}-${p.id}`,
        source: p.parent_id!,
        target: p.id,
        type:   'smoothstep',
        style:  { stroke: '#94a3b8', strokeWidth: 1.5, strokeDasharray: '4 3', opacity: 0.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8', width: 12, height: 12 },
      }));

    // ── Summary nodes (collapsed projects) ───────────────────────────────
    const summaryNodes: Node[] = Object.entries(collapsedByProject).map(([projId, ps2]) => {
      const proj = projectMap[projId];
      if (!proj) return null;
      // Position: use saved or compute centroid of piece positions
      const savedPos = manualPositions.current[`summary-${projId}`];
      const pos = savedPos ?? (() => {
        const arr = ps2.map(p => manualPositions.current[p.id] ?? autoPos[p.id] ?? { x: 400, y: 400 });
        return {
          x: arr.reduce((s, p) => s + p.x, 0) / arr.length,
          y: arr.reduce((s, p) => s + p.y, 0) / arr.length,
        };
      })();
      return {
        id: `summary-${projId}`,
        type: 'projectSummary',
        position: pos,
        data: {
          pieces: ps2, color: proj.color || '#6366f1',
          name: proj.name, projectId: projId,
          onToggle: () => toggleCollapse(projId),
        } satisfies SummaryData,
      };
    }).filter(Boolean) as Node[];

    // ── Island nodes (only for expanded projects, behind visible pieces) ──
    const posMap      = Object.fromEntries(newNodes.map(n => [n.id, n.position]));
    const islandNodes = showIslands ? computeIslandNodes(visiblePieces, posMap, projectMap, toggleCollapse) : [];

    // ── Edges with piece→summary remapping ───────────────────────────────
    const edgeKeySet = new Set<string>();
    const newEdges: Edge[] = [];
    for (const conn of connections) {
      const src = pieceToSummary[conn.from_piece_id] ?? conn.from_piece_id;
      const tgt = pieceToSummary[conn.to_piece_id]   ?? conn.to_piece_id;
      if (src === tgt) continue; // 同じサマリーノード内→非表示
      const key = `${src}→${tgt}`;
      if (edgeKeySet.has(key)) continue; // 重複除去
      edgeKeySet.add(key);
      const isMapped = src !== conn.from_piece_id || tgt !== conn.to_piece_id;
      const color = EDGE_COLORS[conn.type] ?? EDGE_COLORS.default;
      newEdges.push({
        id:      isMapped ? key : conn.id,
        source:  src, target: tgt,
        sourceHandle: isMapped && src.startsWith('summary-') ? 'src' : undefined,
        targetHandle: isMapped && tgt.startsWith('summary-') ? 'tgt' : undefined,
        type: 'smoothstep', animated: !isMapped && conn.type === 'sequential',
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
        style: { stroke: color, strokeWidth: isMapped ? 2 : 2.5, opacity: isMapped ? 0.55 : 0.85, strokeDasharray: isMapped ? '5 3' : undefined, transition: 'opacity 0.2s' },
        label: !isMapped && conn.type !== 'sequential' ? conn.type : undefined,
        labelStyle: { fontSize: 10, fill: color, fontWeight: 700 },
        labelBgStyle: { fill: '#fff', opacity: 0.9 },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
      });
    }

    setNodes([...islandNodes, ...newNodes, ...summaryNodes]);
    setEdges([...newEdges, ...parentChildEdges]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces, connections, viewMode, layoutMode, bottlenecks, projectMap, workerMap,
      filterStatus, filterProject, filterSearch, showIslands, showCritical,
      collapsedProjects, toggleCollapse, expandedPieces, toggleExpand]);

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
      const opacity   = isEdgeDimmed ? 0.04 : isSelected ? 1 : 0.85;
      return {
        ...edge,
        animated: !isEdgeDimmed && connections.find(c => c.id === edge.id)?.type === 'sequential',
        selected: isSelected,
        style: {
          ...edge.style,
          stroke: color, strokeWidth: isSelected ? 3.5 : 2.5,
          opacity,
          filter: isSelected ? `drop-shadow(0 0 5px ${color}99)` : undefined,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
      };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoveredNodeId, selectedEdgeId, isConnecting]);

  // ── Keyboard ──────────────────────────────────────────────────────────────
  useEffect(() => {
    async function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === ' ')                         { e.preventDefault(); fitView({ padding: 0.2, duration: 400 }); }
      if (e.key === 'f' || e.key === 'F')        { setFilterOpen(v => !v); }
      if (e.key === 'i' || e.key === 'I')        { setShowIslands(v => !v); }
      if (e.key === 'Escape')                    { setSelectedEdgeId(null); setContextMenu(null); setEdgeContextMenu(null); }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        try {
          await pieceApi.deleteConnection(selectedEdgeId);
          await refresh();
          push('接続を削除しました', 'success');
          setSelectedEdgeId(null);
        } catch { push('削除に失敗しました', 'warn'); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fitView, selectedEdgeId, refresh, push]);

  // ── Context menu close on outside click ──────────────────────────────────
  useEffect(() => {
    if (!contextMenu && !edgeContextMenu) return;
    function close(e: MouseEvent) {
      const n  = document.getElementById('piece-context-menu');
      const ed = document.getElementById('edge-context-menu');
      if (n  && !n.contains(e.target as Node))  setContextMenu(null);
      if (ed && !ed.contains(e.target as Node)) setEdgeContextMenu(null);
    }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [contextMenu, edgeContextMenu]);

  // ── Node handlers ─────────────────────────────────────────────────────────
  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    if (node.type === 'projectIsland' || node.type === 'projectSummary') return;
    setSelectedEdgeId(null); setContextMenu(null); setEdgeContextMenu(null);
    const piece = pieces.find(p => p.id === node.id);
    if (piece) setSelectedPiece(piece);
  }, [pieces]);

  const onNodeDoubleClick: NodeMouseHandler = useCallback(async (_e, node) => {
    if (node.type === 'projectIsland' || node.type === 'projectSummary') return;
    const piece = pieces.find(p => p.id === node.id);
    if (!piece) return;
    const next = STATUS_CYCLE[piece.status];
    try {
      await pieceApi.updateStatus(piece.id, next);
      await refresh();
      push(`${piece.title} → ${STATUS_LABELS[next]}`, 'success');
    } catch { push('ステータス更新に失敗', 'warn'); }
  }, [pieces, refresh, push]);

  const onNodeContextMenu = useCallback((e: React.MouseEvent, node: { id: string; type?: string }) => {
    e.preventDefault();
    if (node.type === 'projectIsland' || node.type === 'projectSummary') return;
    const piece = pieces.find(p => p.id === node.id);
    if (!piece) return;
    setContextMenu({ x: e.clientX, y: e.clientY, pieceId: node.id, piece });
  }, [pieces]);

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
  const onConnect = useCallback(async (conn: RFConnection) => {
    if (!conn.source || !conn.target) return;
    try {
      await pieceApi.connect(conn.source, { to_piece_id: conn.target, type: 'sequential' });
      await refresh();
      push('接続しました', 'success');
    } catch { push('接続に失敗しました', 'warn'); }
  }, [refresh, push]);

  const onConnectStart = useCallback(() => setIsConnecting(true),  []);
  const onConnectEnd   = useCallback(() => setIsConnecting(false), []);

  // ── onNodesChange: 位置保存 + ドラッグ後に island 再計算 ─────────────────
  const layoutModeRef   = useRef(layoutMode);
  layoutModeRef.current = layoutMode;

  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    let needRebuild = false;
    for (const c of changes) {
      if (c.type === 'position' && c.position && !c.id.startsWith('island-')) {
        // forceモードは手動位置を保存しない
        if (layoutModeRef.current !== 'force') {
          manualPositions.current[c.id] = c.position;
          if (!c.dragging) {
            persistPosition(c.id, c.position);
            // サマリーノードを動かしてもisland再計算は不要
            if (!c.id.startsWith('summary-')) needRebuild = true;
          }
        }
      }
    }
    onNodesChange(changes);
    if (needRebuild) rebuildIslands();
  }, [onNodesChange, rebuildIslands]);

  // ── Context menu actions ──────────────────────────────────────────────────
  async function handleContextStatus(piece: Piece, status: PieceStatus) {
    setContextMenu(null);
    try {
      await pieceApi.updateStatus(piece.id, status);
      await refresh();
      push(`${piece.title} → ${STATUS_LABELS[status]}`, 'success');
    } catch { push('更新に失敗しました', 'warn'); }
  }

  async function handleEdgeTypeChange(edgeId: string, type: ConnectionType) {
    setEdgeContextMenu(null);
    try {
      await pieceApi.updateConnection(edgeId, { type });
      await refresh();
      push(`接続タイプを ${type} に変更しました`, 'success');
    } catch { push('変更に失敗しました', 'warn'); }
  }

  async function handleEdgeDelete(edgeId: string) {
    setEdgeContextMenu(null);
    setSelectedEdgeId(null);
    try {
      await pieceApi.deleteConnection(edgeId);
      await refresh();
      push('接続を削除しました', 'success');
    } catch { push('削除に失敗しました', 'warn'); }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const bottleneckCount = bottlenecks.stale_pieces.length + bottlenecks.overloaded_users.length;
  const statusCount     = (s: string) => pieces.filter(p => p.status === s).length;
  const blockedCount    = pieces.filter(p =>
    computeBlockedIds(pieces, connections).has(p.id)
  ).length;
  const visibleCount    = nodes.filter(n => n.type === 'piece' && !(n.style as { pointerEvents?: string } | undefined)?.pointerEvents).length;
  const hasFilter       = !!(filterStatus || filterProject || filterSearch);

  return (
    <div
      style={{ width: '100vw', height: '100vh', position: 'relative', background: 'var(--bg)' }}
      onClick={() => { setContextMenu(null); setEdgeContextMenu(null); }}
    >
      <GlobalStyles />
      <ToastContainer messages={messages} onDismiss={dismiss} />

      {/* ═══ TOOLBAR ══════════════════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 10, display: 'flex', gap: 5, alignItems: 'center',
        background: 'var(--surface)', backdropFilter: 'blur(10px)',
        borderRadius: 'var(--r-lg)', padding: '7px 12px',
        boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)',
      }}>
        {(Object.keys(VIEW_LABELS) as ViewMode[]).map(mode => (
          <button key={mode} onClick={() => setViewMode(mode)} style={{
            padding: '6px 14px', borderRadius: 8, border: 'none',
            background: viewMode === mode ? 'var(--accent)' : 'transparent',
            color:      viewMode === mode ? '#fff' : 'var(--text-3)',
            cursor: 'pointer', fontWeight: viewMode === mode ? 700 : 500,
            fontSize: 12.5, position: 'relative', transition: 'background 0.15s',
          }}>
            {VIEW_LABELS[mode]}
            {mode === 'bottleneck' && bottleneckCount > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -5,
                background: '#f97316', color: '#fff',
                borderRadius: '50%', width: 16, height: 16,
                fontSize: 9, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'bottleneck-flash 1.5s ease-in-out infinite',
              }}>{bottleneckCount}</span>
            )}
          </button>
        ))}

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 3px' }} />

        {/* Layout mode toggle */}
        <button
          onClick={() => {
            const next = layoutMode === 'dag' ? 'force' : 'dag';
            setLayoutMode(next);
            setTimeout(() => fitView({ padding: 0.22, duration: 500 }), 150);
          }}
          title={layoutMode === 'dag' ? '重力レイアウトに切り替え' : 'DAGレイアウトに切り替え'}
          style={{
            padding: '6px 11px', borderRadius: 8, border: 'none',
            background: layoutMode === 'force' ? 'var(--accent-sub)' : 'transparent',
            color:      layoutMode === 'force' ? 'var(--accent)' : 'var(--text-3)',
            cursor: 'pointer', fontSize: 12, fontWeight: layoutMode === 'force' ? 700 : 500,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
          {layoutMode === 'force' ? '⚛ 重力' : '⋯ DAG'}
        </button>

        {/* Islands toggle */}
        <button
          onClick={() => setShowIslands(v => !v)}
          title={`プロジェクト島 ${showIslands ? 'ON' : 'OFF'} (I)`}
          style={{
            padding: '6px 10px', borderRadius: 8, border: 'none',
            background: showIslands ? 'var(--accent-sub)' : 'transparent',
            color:      showIslands ? 'var(--accent)' : 'var(--text-3)',
            cursor: 'pointer', fontSize: 13,
          }}>
          🏝
        </button>

        {/* Collapse all / Expand all */}
        {Object.keys(projectMap).length > 0 && (
          <>
            <button
              onClick={() => {
                setCollapsedProjects(new Set(Object.keys(projectMap)));
                setTimeout(() => fitView({ padding: 0.22, duration: 500 }), 120);
              }}
              title="全プロジェクトを折りたたむ"
              style={{
                padding: '6px 10px', borderRadius: 8, border: 'none',
                background: collapsedProjects.size > 0 ? 'var(--accent-sub)' : 'transparent',
                color:      collapsedProjects.size > 0 ? 'var(--accent)' : 'var(--text-3)',
                cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
              }}>
              ▣ 全折
            </button>
            <button
              onClick={() => {
                setCollapsedProjects(new Set());
                setTimeout(() => fitView({ padding: 0.22, duration: 500 }), 120);
              }}
              title="全プロジェクトを展開"
              style={{
                padding: '6px 10px', borderRadius: 8, border: 'none',
                background: 'transparent', color: 'var(--text-3)',
                cursor: 'pointer', fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
                display: collapsedProjects.size > 0 ? 'block' : 'none',
              }}>
              □ 全展
            </button>
          </>
        )}

        <button onClick={() => setFilterOpen(v => !v)} style={{
          padding: '6px 12px', borderRadius: 8, border: 'none',
          background: hasFilter ? 'var(--accent-sub)' : 'transparent',
          color:      hasFilter ? 'var(--accent)' : 'var(--text-3)',
          cursor: 'pointer', fontSize: 12,
        }} title="フィルター (F)">⊟{hasFilter ? ' ●' : ''}</button>

        <button onClick={() => fitView({ padding: 0.2, duration: 400 })}
          style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 13 }}
          title="全体表示 (Space)">⊞</button>

        <button onClick={() => {
          clearSavedPositions(); manualPositions.current = {}; refresh();
          setTimeout(() => fitView({ padding: 0.25, duration: 500 }), 200);
        }}
          style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}
          title="レイアウトをリセット">↺</button>

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 3px' }} />

        {/* Critical path toggle */}
        <button
          onClick={() => setShowCritical(v => !v)}
          title="クリティカルパス表示"
          style={{
            padding: '6px 10px', borderRadius: 8, border: 'none',
            background: showCritical ? '#FEF3C7' : 'transparent',
            color:      showCritical ? '#D97706' : 'var(--text-3)',
            cursor: 'pointer', fontSize: 12,
            fontWeight: showCritical ? 700 : 400,
          }}>
          {showCritical ? '⚡CP' : '⚡'}
        </button>

        {/* Sprint planner */}
        <button
          onClick={() => setSprintOpen(true)}
          title="スプリントプランナー"
          style={{
            padding: '6px 12px', borderRadius: 8, border: 'none',
            background: 'transparent', color: 'var(--text-3)',
            cursor: 'pointer', fontSize: 12,
          }}>
          📋 Sprint
        </button>

        <button onClick={() => setCreateOpen(true)} style={{
          padding: '6px 18px', borderRadius: 8, border: 'none',
          background: 'var(--accent)', color: '#fff',
          cursor: 'pointer', fontWeight: 600, fontSize: 12,
          boxShadow: '0 1px 4px rgba(26,86,219,0.28)',
          transition: 'transform 0.1s',
        }}
          onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.96)')}
          onMouseUp={e   => (e.currentTarget.style.transform = 'scale(1)')}>
          ＋ ピース追加
        </button>
      </div>

      {/* ─ Filter panel ─ */}
      {filterOpen && (
        <div style={{
          position: 'absolute', top: 66, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)', padding: '12px 16px', boxShadow: 'var(--shadow-lg)',
          display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', minWidth: 460,
        }}>
          <input value={filterSearch} onChange={e => setFilterSearch(e.target.value)}
            placeholder="タイトルで絞り込み..." autoFocus
            style={{ padding: '5px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg)', color: 'var(--text-1)', width: 160, outline: 'none' }} />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg)', color: 'var(--text-1)', outline: 'none' }}>
            <option value="">すべてのステータス</option>
            <option value="locked">ロック中</option>
            <option value="ready">着手可能</option>
            <option value="in_progress">進行中</option>
            <option value="done">完了</option>
          </select>
          <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
            style={{ padding: '5px 8px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg)', color: 'var(--text-1)', outline: 'none' }}>
            <option value="">すべてのプロジェクト</option>
            {Object.values(projectMap).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          {hasFilter && (
            <button onClick={() => { setFilterStatus(''); setFilterProject(''); setFilterSearch(''); }}
              style={{ padding: '5px 10px', borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', fontSize: 11, background: 'var(--bg)', color: 'var(--text-2)', cursor: 'pointer' }}>
              クリア
            </button>
          )}
          <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>
            {visibleCount} / {nodes.filter(n => n.type === 'piece').length} 件
          </span>
        </div>
      )}

      {/* ═══ RIGHT PANEL ═══════════════════════════════════════════════════════ */}
      <div style={{
        position: 'absolute', top: 16, right: 16, zIndex: 10,
        background: 'var(--surface)', backdropFilter: 'blur(8px)',
        borderRadius: 'var(--r-lg)', padding: '10px 14px',
        boxShadow: 'var(--shadow-md)', border: '1px solid var(--border)',
        fontSize: 12, minWidth: 148,
      }}>
        <div style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase' }}>ステータス</div>
        {([
          { s: 'ready',       label: '着手可能', color: '#4A9B6F' },
          { s: 'in_progress', label: '進行中',   color: 'var(--accent)' },
          { s: 'locked',      label: 'ロック',   color: 'var(--text-3)' },
          { s: 'done',        label: '完了',     color: '#A0A096' },
        ] as const).map(({ s, label, color }) => (
          <div key={s} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, marginBottom: 4, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: color, display: 'inline-block' }} />
              <span style={{ color: 'var(--text-2)', fontSize: 11.5 }}>{label}</span>
            </div>
            <span style={{ fontWeight: 800, color, fontSize: 12 }}>{statusCount(s)}</span>
          </div>
        ))}

        {/* Cascade blocked indicator */}
        {blockedCount > 0 && (
          <div style={{
            marginTop: 8, padding: '5px 8px',
            background: 'rgba(245,158,11,0.10)',
            borderRadius: 6, border: '1px solid rgba(245,158,11,0.30)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 11 }}>⛓</span>
            <span style={{ fontSize: 10, color: '#D97706', fontWeight: 700 }}>
              {blockedCount}件 ブロック中
            </span>
          </div>
        )}

        <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
        <div style={{ color: 'var(--text-3)', fontWeight: 600, fontSize: 10, letterSpacing: '0.06em', marginBottom: 6, textTransform: 'uppercase' }}>接続タイプ</div>
        {(['sequential','parallel','conditional'] as ConnectionType[]).map(type => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <svg width="18" height="8">
              <line x1="0" y1="4" x2="14" y2="4" stroke={EDGE_COLORS[type]} strokeWidth="2"
                strokeDasharray={type === 'sequential' ? '5 3' : undefined} />
              <polygon points="12,1 18,4 12,7" fill={EDGE_COLORS[type]} />
            </svg>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{type}</span>
          </div>
        ))}

        {selectedEdgeId && (
          <div style={{
            marginTop: 8, padding: '5px 8px',
            background: 'rgba(239,68,68,0.08)',
            borderRadius: 6, border: '1px solid rgba(239,68,68,0.25)',
            fontSize: 10, color: '#EF4444',
          }}>
            選択中 — <b>Del</b> or 右クリック
          </div>
        )}
      </div>

      {/* ─ Connecting hint ─ */}
      {isConnecting && (
        <div style={{
          position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)',
          zIndex: 20, background: 'var(--accent)', color: '#fff',
          borderRadius: 'var(--r-md)', padding: '9px 20px',
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
          ダブルクリック：ステータス変更　右クリック：メニュー　接続：●ドラッグ　島ラベルクリック：折りたたみ　<b>▣全折</b>で15枚→サマリーカード　<b>I</b>：島トグル
        </div>
      )}

      {/* ═══ Gantt mode overlay ═══════════════════════════════════════════════ */}
      {viewMode === 'gantt' && (
        <div style={{
          position: 'absolute', inset: 0,
          top: 0, zIndex: 8,
          display: 'flex', flexDirection: 'column',
          background: 'var(--bg)',
        }}>
          {/* Toolbar spacer */}
          <div style={{ height: 62, flexShrink: 0 }} />
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

      {/* ═══ ReactFlow ════════════════════════════════════════════════════════ */}
      <ReactFlow
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
        onPaneClick={() => { setSelectedEdgeId(null); setContextMenu(null); setEdgeContextMenu(null); }}
        nodeTypes={nodeTypes}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{ stroke: '#6366f1', strokeWidth: 2, strokeDasharray: '6 3' }}
        snapToGrid
        snapGrid={[20, 20]}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.15}
        maxZoom={2.5}
        elevateNodesOnSelect={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1.2} color="var(--border)" />
        <Controls style={{ background: 'var(--surface)', borderRadius: 'var(--r-md)', border: '1px solid var(--border)' }} />
        <MiniMap
          nodeColor={n => {
            if (n.type === 'projectIsland') return 'transparent';
            if (n.type === 'projectSummary') return (n.data as SummaryData)?.color ?? '#6366f1';
            const piece = n.data?.piece as Piece | undefined;
            return { locked: '#ddd8cc', ready: '#bbf7d0', in_progress: '#bfdbfe', done: '#e5e7eb' }[piece?.status ?? ''] ?? '#e2e8f0';
          }}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', bottom: 60 }}
          maskColor="rgba(0,0,0,0.04)"
        />
      </ReactFlow>

      {/* ═══ Node context menu ════════════════════════════════════════════════ */}
      {contextMenu && (
        <div
          id="piece-context-menu"
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', left: contextMenu.x, top: contextMenu.y,
            zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
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
            📋 詳細を開く
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
            borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            padding: '6px 0', minWidth: 180, fontSize: 12,
          }}
        >
          <div style={{ padding: '5px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            接続タイプを変更
          </div>
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          {(['sequential', 'parallel', 'conditional'] as ConnectionType[]).map(type => (
            <button key={type} onClick={() => handleEdgeTypeChange(edgeContextMenu.edgeId, type)}
              style={{
                width: '100%', padding: '7px 14px', border: 'none',
                background: edgeContextMenu.connType === type ? 'var(--accent-sub)' : 'transparent',
                color:      edgeContextMenu.connType === type ? 'var(--accent)' : 'var(--text-1)',
                textAlign: 'left', cursor: 'pointer', fontSize: 12,
                fontWeight: edgeContextMenu.connType === type ? 700 : 400,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: EDGE_COLORS[type] }} />
              {type}
              {edgeContextMenu.connType === type && ' ✓'}
            </button>
          ))}
          <div style={{ height: 1, background: 'var(--border)', margin: '3px 0' }} />
          <button
            onClick={() => handleEdgeDelete(edgeContextMenu.edgeId)}
            style={{ width: '100%', padding: '7px 14px', border: 'none', background: 'transparent', color: '#EF4444', textAlign: 'left', cursor: 'pointer', fontSize: 12 }}>
            🗑 接続を削除
          </button>
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

      {/* ─ Panels ─ */}
      <PieceCreatePanel
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { refresh(); push('ピースを追加しました', 'success'); }}
        allPieces={pieces}
      />
      <PieceDetailPanel
        piece={selectedPiece}
        onClose={() => setSelectedPiece(null)}
        onUpdated={() => { refresh(); setSelectedPiece(null); push('更新しました', 'success'); }}
      />
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
