// ============================================================
// GanttPage.tsx — Chain River v3
// 追加: ズームレベル(日/週/月) / 全開閉ボタン /
//       チェーン全体移動 / ノードクリックで詳細遷移
// ============================================================
import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { pieces as pieceApi, projects as projectApi } from '../../services/api';
import { Piece, Project, Connection } from '../../types';
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';

// ── ズーム設定 ───────────────────────────────────────────────
type ZoomLevel = 'day' | 'week' | 'month';
const ZOOM = {
  day:   { dayW: 30, viewDays:  35, nodeR: 9, showDayNum: true,  navDays:  7, label: '日' },
  week:  { dayW: 10, viewDays:  91, nodeR: 7, showDayNum: false, navDays: 28, label: '週' },
  month: { dayW:  4, viewDays: 180, nodeR: 5, showDayNum: false, navDays: 60, label: '月' },
} as const;

// ── レイアウト定数 ───────────────────────────────────────────
const LABEL_W        = 220;
const BAR_H          = 3;
const WEEK_H         = 22;
const DAY_H          = 30;
const HEADER_H       = WEEK_H + DAY_H;
const V_PAD          = 18;
const ROW_H          = 76;
const COLLAPSED_ROW_H = 34;
const CRYSTAL_ROW_H  = 44;

// ── カラー ──────────────────────────────────────────────────
const NODE_FILL: Record<string, string> = {
  locked: 'none', ready: 'transparent', in_progress: '#1A1A1A', done: '#D4D4D4',
};
const NODE_STROKE: Record<string, string> = {
  locked: '#CCCCCC', ready: '#666666', in_progress: '#1A1A1A', done: '#C0C0C0',
};

// ── 型 ──────────────────────────────────────────────────────
interface PieceRow extends Piece { project_name?: string; project_color?: string; }
interface NodePos { x: number; y: number; barStartX: number; barEndX: number; }
type RowKind = 'normal' | 'collapsed' | 'crystal';
type RowDef  = {
  label: string; pieces: PieceRow[];
  chainId: string | null;
  extraChainIds: string[];  // 同名マージ時の追加チェーンID群
  y: number; height: number; kind: RowKind;
};

interface PieceDragState {
  pieceId: string; startClientX: number;
  origDueDays: number; origStartDays: number | null;
}
interface BarEdgeDragState {
  pieceId: string; startClientX: number;
  kind: 'start' | 'end' | 'move';
  origStartDays: number | null;
  origDueDays: number | null;
  /** start_date が null の場合の視覚上のバー開始位置（日数）。start ハンドルドラッグ時に使用 */
  visualBarStartDays: number | null;
}
interface ChainDragState {
  chainId: string; startClientX: number; moved: boolean;
  extraChainIds: string[];
  pieces: { id: string; dueDays: number | null; startDays: number | null }[];
}

// ── バービュー: ステータス別カラー（ニュートラル基調・亜鉛合金）──
// Nintendo整理感: 状態は形・濃淡で区別。BALMUDA温度感: 赤のみ感情色。
function getBarColors(status: string, isOverdue: boolean): {
  track: string; trackOp: number; fill: string; fillOp: number;
} {
  if (isOverdue)        return { track: '#E60012', trackOp: 0.10, fill: '#E60012', fillOp: 0.40 };
  switch (status) {
    case 'in_progress': return { track: '#1A1A1A', trackOp: 0.12, fill: '#1A1A1A', fillOp: 0.52 };
    case 'done':        return { track: '#8C8C96', trackOp: 0.14, fill: '#8C8C96', fillOp: 0.22 };
    case 'locked':      return { track: '#B4B4BC', trackOp: 0.12, fill: '#B4B4BC', fillOp: 0.08 };
    default:            return { track: '#3C3C44', trackOp: 0.10, fill: '#3C3C44', fillOp: 0.32 };
  }
}

// ── ヘルパー ────────────────────────────────────────────────
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate()+n); return r; }
function dayOffset(date: Date, base: Date): number {
  return Math.round((date.getTime()-base.getTime())/86400000);
}

// ── プロジェクト別グループ構築 ──────────────────────────────
function buildProjectGroups(pieces: PieceRow[]): {
  key: string; label: string; color: string | null; pieces: PieceRow[];
}[] {
  const map = new Map<string, { label: string; color: string | null; pieces: PieceRow[] }>();
  for (const p of pieces) {
    const key = p.project_id ?? '__none__';
    if (!map.has(key)) {
      map.set(key, {
        label: p.project_name ?? '未割り当て',
        color: p.project_color ?? null,
        pieces: [],
      });
    }
    map.get(key)!.pieces.push(p);
  }
  return [...map.entries()]
    .sort(([a, ga], [b, gb]) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      return ga.label.localeCompare(gb.label, 'ja');
    })
    .map(([key, g]) => ({ key, ...g }));
}

// ── 張力計算 ────────────────────────────────────────────────
function calcBuffer(from: PieceRow, to: PieceRow): number | null {
  if (!from.due_date) return null;
  const ref = to.start_date ?? to.due_date;
  if (!ref) return null;
  return dayOffset(new Date(ref), new Date(from.due_date));
}
interface EdgeStyle { stroke: string; width: number; dash: string; }
function getEdgeStyle(buf: number | null, fromStatus: string): EdgeStyle {
  if (fromStatus === 'done') return { stroke: '#E2E2E2', width: 1,   dash: '' };
  if (buf === null)          return { stroke: '#CCCCCC', width: 1.5, dash: '' };
  if (buf >= 5)              return { stroke: '#CCCCCC', width: 1.5, dash: '' };
  if (buf >= 2)              return { stroke: '#C88A00', width: 2,   dash: '' };
  if (buf >= 0)              return { stroke: '#D45A00', width: 2.5, dash: '' };
  return                            { stroke: '#E60012', width: 2.5, dash: '5 3' };
}

// ── レイアウト計算（プロジェクト単位）─────────────────────
function computeLayout(
  allPieces: PieceRow[],
  viewStart: Date, dayW: number,
  collapsedRows: Set<string>, crystallizedRowIds: Set<string>,
): { rows: RowDef[]; nodeMap: Map<string, NodePos>; totalH: number; projectKeys: string[]; } {
  const groups = buildProjectGroups(allPieces);
  const rows: RowDef[] = [];
  let curY = HEADER_H + V_PAD;

  for (const group of groups) {
    const isCollapsed = collapsedRows.has(group.key);
    const isCrystal   = !isCollapsed && crystallizedRowIds.has(group.key);
    const kind: RowKind = isCollapsed ? 'collapsed' : isCrystal ? 'crystal' : 'normal';
    const h = isCollapsed ? COLLAPSED_ROW_H : isCrystal ? CRYSTAL_ROW_H : ROW_H;
    rows.push({
      label: group.label, pieces: group.pieces,
      chainId: group.key, extraChainIds: [],
      y: curY, height: h, kind,
    });
    curY += h;
  }

  const nodeMap = new Map<string, NodePos>();
  for (const row of rows) {
    if (row.kind === 'collapsed') continue;
    const cy = row.y + row.height / 2;
    for (const piece of row.pieces) {
      let x = LABEL_W + 50, barStartX = LABEL_W + 50 - 36, barEndX = LABEL_W + 50;
      if (piece.due_date) {
        const off = dayOffset(new Date(piece.due_date), viewStart);
        x = Math.max(LABEL_W + ZOOM.day.nodeR + 4, LABEL_W + off * dayW + dayW / 2);
        barStartX = piece.start_date
          ? LABEL_W + dayOffset(new Date(piece.start_date), viewStart) * dayW + dayW / 2
          : x - ZOOM.day.nodeR * 5;
        barEndX = x;
        if (barEndX - barStartX < ZOOM.day.nodeR) barStartX = barEndX - ZOOM.day.nodeR;
        barStartX = Math.max(LABEL_W + 2, barStartX);
      }
      nodeMap.set(piece.id, { x, y: cy, barStartX, barEndX });
    }
  }
  return { rows, nodeMap, totalH: curY + V_PAD, projectKeys: groups.map(g => g.key) };
}

// ── メインコンポーネント ─────────────────────────────────────
export default function GanttPage() {
  const navigate = useNavigate();

  const [pieces,      setPieces]      = useState<PieceRow[]>([]);
  const [projects,    setProjects]    = useState<Project[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [zoomLevel,   setZoomLevel]   = useState<ZoomLevel>('day');
  const [viewStart,   setViewStart]   = useState<Date>(() => {
    const d = new Date(); d.setDate(d.getDate()-7); d.setHours(0,0,0,0); return d;
  });

  const [collapsedChains,   setCollapsedChains]   = useState<Set<string>>(new Set());
  const [filterAssignee,    setFilterAssignee]    = useState<string | null>(null);
  const [pieceDragDelta,   setPieceDragDelta]   = useState(0);
  const [draggingPieceId,  setDraggingPieceId]  = useState<string | null>(null);
  const [chainDragId,      setChainDragId]      = useState<string | null>(null);
  const [chainDragDelta,   setChainDragDelta]   = useState(0);
  const [hoveredEdge,      setHoveredEdge]      = useState<string | null>(null);
  const [snappingIds,      setSnappingIds]      = useState<Set<string>>(new Set());
  const [saving,           setSaving]           = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<{ piece: PieceRow; x: number; y: number } | null>(null);
  // 日付未設定ピース: ホバー時の日付プレビュー
  const [nodateHover, setNodateHover] = useState<{ pieceId: string; day: number } | null>(null);

  const pieceDragRef     = useRef<PieceDragState | null>(null);
  const chainDragRef     = useRef<ChainDragState | null>(null);
  const barEdgeDragRef   = useRef<BarEdgeDragState | null>(null);
  const [barEdgeDragDelta, setBarEdgeDragDelta] = useState(0);
  const [barEdgeDragId,    setBarEdgeDragId]    = useState<string | null>(null);
  const nodeDragMoved  = useRef(false);
  const prevStatusRef  = useRef<Map<string, string>>(new Map());
  const scrollAreaRef  = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);
  const [containerW,   setContainerW]   = useState(0);
  const [filterStatus,  setFilterStatus]  = useState<string | null>(null);
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [showCrossProjectConns, setShowCrossProjectConns] = useState(false);
  const [ganttViewMode, setGanttViewMode] = useState<'chain' | 'bar'>('bar');
  const [barCollapsed, setBarCollapsed] = useState<Set<string>>(new Set());
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [createModal, setCreateModal]   = useState<{ startDate?: string; dueDate?: string; projectId?: string } | null>(null);
  // 接続モード: 右クリックで開始 → 別の◯クリックで完成
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; piece: PieceRow } | null>(null);

  // ESC でパネル / モーダル / 接続モードを閉じる
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedPieceId(null);
        setCreateModal(null);
        setConnectingFromId(null);
        setContextMenu(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setContainerW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ヘッダーと本体の横スクロールを同期
  useEffect(() => {
    const body   = scrollAreaRef.current;
    const header = headerScrollRef.current;
    if (!body || !header) return;
    const onBodyScroll = () => {
      header.scrollLeft = body.scrollLeft;
      // バースティッキーヘッダー用（RAF でスロットル）
      cancelAnimationFrame(barScrollRafRef.current);
      barScrollRafRef.current = requestAnimationFrame(() => setBarScrollY(body.scrollTop));
    };
    body.addEventListener('scroll', onBodyScroll, { passive: true });
    return () => body.removeEventListener('scroll', onBodyScroll);
  }, []);

  const today    = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const zoomCfg  = ZOOM[zoomLevel];

  // ── データ読み込み ─────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ps, pjs, conns] = await Promise.all([
        pieceApi.list(), projectApi.list(), pieceApi.getConnections(),
      ]);
      const pm = Object.fromEntries(pjs.map((p: Project) => [p.id, p]));
      setPieces(ps.map((p: Piece) => ({
        ...p,
        project_name:  p.project_id ? pm[p.project_id]?.name  : undefined,
        project_color: p.project_id ? pm[p.project_id]?.color : undefined,
      })));
      setProjects(pjs);
      setConnections(conns);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // ── スナップ検知 ───────────────────────────────────────────
  useEffect(() => {
    const prev = prevStatusRef.current;
    const newlyDone: string[] = [];
    for (const p of pieces) {
      if (prev.has(p.id) && prev.get(p.id) !== 'done' && p.status === 'done') newlyDone.push(p.id);
      prev.set(p.id, p.status);
    }
    if (newlyDone.length > 0) {
      setSnappingIds(s => new Set([...s, ...newlyDone]));
      setTimeout(() => setSnappingIds(s => { const n = new Set(s); newlyDone.forEach(id => n.delete(id)); return n; }), 900);
    }
  }, [pieces]);

  // ── グローバルドラッグイベント ────────────────────────────
  useEffect(() => {
    const { dayW } = zoomCfg;

    const onMove = (e: MouseEvent) => {
      // ピースドラッグ
      if (pieceDragRef.current) {
        const dd = Math.round((e.clientX - pieceDragRef.current.startClientX) / dayW);
        if (dd !== 0) nodeDragMoved.current = true;
        setPieceDragDelta(dd);
      }
      // バーエッジドラッグ
      if (barEdgeDragRef.current) {
        const dd = Math.round((e.clientX - barEdgeDragRef.current.startClientX) / dayW);
        setBarEdgeDragDelta(dd);
      }
      // チェーンドラッグ
      if (chainDragRef.current) {
        if (Math.abs(e.clientX - chainDragRef.current.startClientX) > 5) chainDragRef.current.moved = true;
        const dd = Math.round((e.clientX - chainDragRef.current.startClientX) / dayW);
        setChainDragDelta(dd);
      }
    };

    const onUp = async (e: MouseEvent) => {
      // ── ピースドラッグ終了 ──
      if (pieceDragRef.current) {
        const { pieceId, startClientX, origDueDays, origStartDays } = pieceDragRef.current;
        const deltaDays = Math.round((e.clientX - startClientX) / dayW);
        pieceDragRef.current = null;
        setDraggingPieceId(null);
        setPieceDragDelta(0);

        if (deltaDays !== 0) {
          const newDueDate   = toDateStr(addDays(viewStart, origDueDays + deltaDays));
          const newStartDate = origStartDays !== null
            ? toDateStr(addDays(viewStart, origStartDays + deltaDays)) : null;
          setPieces(prev => prev.map(p => p.id !== pieceId ? p : {
            ...p, due_date: newDueDate,
            start_date: newStartDate ?? p.start_date,
          }));
          setSaving(s => new Set([...s, pieceId]));
          const body: Record<string, string | null> = { due_date: newDueDate };
          if (newStartDate) body.start_date = newStartDate;
          await pieceApi.update(pieceId, body).catch(() => load());
          setSaving(s => { const n = new Set(s); n.delete(pieceId); return n; });
        }
        return;
      }

      // ── バーエッジドラッグ終了 ──
      if (barEdgeDragRef.current) {
        const { pieceId, startClientX, kind, origStartDays, origDueDays, visualBarStartDays } = barEdgeDragRef.current;
        const delta = Math.round((e.clientX - startClientX) / dayW);
        barEdgeDragRef.current = null;
        setBarEdgeDragId(null);
        setBarEdgeDragDelta(0);

        if (delta !== 0) {
          let newDueDate: string | undefined;
          let newStartDate: string | undefined;

          if (kind === 'end') {
            // 右端ドラッグ: due_date を移動
            newDueDate = origDueDays !== null
              ? toDateStr(addDays(viewStart, origDueDays + delta)) : undefined;
          } else if (kind === 'start') {
            // 左端ドラッグ: start_date を設定・移動（start_date がなくても新規作成）
            const baseDays = origStartDays ?? visualBarStartDays;
            if (baseDays !== null) {
              newStartDate = toDateStr(addDays(viewStart, baseDays + delta));
            }
            // due_date は変えない（endより手前になってしまう場合のみ補正）
            if (origDueDays !== null && newStartDate) {
              const newStartDays = baseDays! + delta;
              if (newStartDays >= origDueDays) {
                // スタートが期限を超えた → 期限をスタート+1日に合わせる
                newDueDate = toDateStr(addDays(viewStart, newStartDays + 1));
              }
            }
          } else {
            // move: バー全体を移動
            newDueDate = origDueDays !== null
              ? toDateStr(addDays(viewStart, origDueDays + delta)) : undefined;
            if (origStartDays !== null) {
              newStartDate = toDateStr(addDays(viewStart, origStartDays + delta));
            }
          }

          setPieces(prev => prev.map(p => {
            if (p.id !== pieceId) return p;
            return {
              ...p,
              due_date:   newDueDate   ?? p.due_date,
              start_date: newStartDate ?? p.start_date,
            };
          }));
          setSaving(s => new Set([...s, pieceId]));
          const body: Record<string, string | null> = {};
          if (newDueDate)   body.due_date   = newDueDate;
          if (newStartDate) body.start_date = newStartDate;
          await pieceApi.update(pieceId, body).catch(() => load());
          setSaving(s => { const n = new Set(s); n.delete(pieceId); return n; });
        }
        return;
      }

      // ── チェーンドラッグ終了 ──
      if (chainDragRef.current) {
        const { chainId, startClientX, moved, pieces: cPieces, extraChainIds } = chainDragRef.current;
        const deltaDays = Math.round((e.clientX - startClientX) / dayW);
        chainDragRef.current = null;
        setChainDragId(null);
        setChainDragDelta(0);

        if (!moved) {
          // 移動なし → アコーディオントグル（マージ行は全チェーンをまとめてトグル）
          setCollapsedChains(s => {
            const n = new Set(s);
            const allIds = [chainId, ...extraChainIds];
            if (n.has(chainId)) { allIds.forEach(id => n.delete(id)); }
            else                { allIds.forEach(id => n.add(id)); }
            return n;
          });
          return;
        }

        if (deltaDays === 0) return;

        const updates = cPieces
          .filter(p => p.dueDays !== null)
          .map(p => ({
            id:         p.id,
            due_date:   p.dueDays !== null ? toDateStr(addDays(viewStart, p.dueDays + deltaDays)) : undefined,
            start_date: p.startDays !== null ? toDateStr(addDays(viewStart, p.startDays + deltaDays)) : undefined,
          }));

        setPieces(prev => prev.map(p => {
          const u = updates.find(u => u.id === p.id);
          return u ? { ...p, due_date: u.due_date ?? p.due_date, start_date: u.start_date ?? p.start_date } : p;
        }));

        const ids = updates.map(u => u.id);
        setSaving(s => new Set([...s, ...ids]));
        await Promise.all(updates.map(u => {
          const body: Record<string, string | null> = {};
          if (u.due_date) body.due_date = u.due_date;
          if (u.start_date) body.start_date = u.start_date;
          return pieceApi.update(u.id, body);
        })).catch(() => load());
        setSaving(s => { const n = new Set(s); ids.forEach(id => n.delete(id)); return n; });
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [viewStart, zoomCfg, load]);

  // ── 派生データ ─────────────────────────────────────────────
  const { dayW, viewDays, nodeR, navDays } = zoomCfg;

  const days = useMemo(() =>
    Array.from({ length: viewDays }, (_, i) => addDays(viewStart, i)), [viewStart, viewDays]);

  const weeks = useMemo(() => {
    const ws: { label: string; startI: number }[] = [];
    let i = 0;
    while (i < days.length) {
      ws.push({ label: `${days[i].getMonth()+1}/${days[i].getDate()}`, startI: i });
      i++;
      while (i < days.length && days[i].getDay() !== 0) i++;
    }
    return ws;
  }, [days]);

  const months = useMemo(() => {
    const ms: { label: string; startI: number; count: number }[] = [];
    let i = 0;
    while (i < days.length) {
      const m = days[i].getMonth(); const startI = i; let count = 0;
      while (i < days.length && days[i].getMonth() === m) { count++; i++; }
      ms.push({ label: `${days[startI].getMonth()+1}月`, startI, count });
    }
    return ms;
  }, [days]);

  // 担当者一覧（フィルター選択肢）
  const allAssignees = useMemo(() => {
    const names = new Set(pieces.map(p => p.assignee_name).filter(Boolean) as string[]);
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'ja'));
  }, [pieces]);

  // プロジェクト一覧（フィルター選択肢）
  const allProjects = useMemo(() => {
    const map = new Map<string, string>(); // id → name
    for (const p of pieces) {
      if (p.project_id && p.project_name) map.set(p.project_id, p.project_name);
    }
    return Array.from(map.entries())
      .sort(([, a], [, b]) => a.localeCompare(b, 'ja'))
      .map(([id, name]) => ({ id, name }));
  }, [pieces]);

  // 日付が設定されたピースを対象に絞り込み
  const piecesWithDates = useMemo(() => pieces.filter(p => p.start_date || p.due_date), [pieces]);

  // フィルター適用
  const filteredPieces = useMemo(() => {
    let r = piecesWithDates;
    if (filterAssignee) r = r.filter(p => p.assignee_name === filterAssignee);
    if (filterProject)  r = r.filter(p => p.project_id === filterProject);
    if (filterStatus === 'active') r = r.filter(p => p.status === 'in_progress' || p.status === 'ready');
    else if (filterStatus === 'overdue') r = r.filter(p => p.due_date && new Date(p.due_date) < today && p.status !== 'done');
    else if (filterStatus) r = r.filter(p => p.status === filterStatus);
    return r;
  }, [piecesWithDates, filterAssignee, filterProject, filterStatus, today]);

  // バー表示用: プロジェクト別集計
  const barGroups = useMemo(() => {
    const groups = buildProjectGroups(filteredPieces);
    return groups.map(g => {
      const allDates: Date[] = [];
      for (const p of g.pieces) {
        if (p.start_date) allDates.push(new Date(p.start_date));
        if (p.due_date)   allDates.push(new Date(p.due_date));
      }
      const minDate = allDates.length ? allDates.reduce((mn, d) => d < mn ? d : mn) : null;
      const maxDate = allDates.length ? allDates.reduce((mx, d) => d > mx ? d : mx) : null;
      const doneCount = g.pieces.filter(p => p.status === 'done').length;
      return { ...g, minDate, maxDate, doneCount };
    });
  }, [filteredPieces]);

  const barAllCollapsed = useMemo(
    () => barGroups.length > 0 && barGroups.every(g => barCollapsed.has(g.key)),
    [barGroups, barCollapsed],
  );

  // バー表示用: 日付未設定ピースをプロジェクトキー別にまとめる
  const barNoDatesMap = useMemo(() => {
    const m = new Map<string, PieceRow[]>();
    for (const p of pieces) {
      if (p.start_date || p.due_date) continue;
      if (filterAssignee && p.assignee_name !== filterAssignee) continue;
      if (filterProject  && p.project_id   !== filterProject)  continue;
      if (filterStatus === 'overdue') continue;
      if (filterStatus === 'active'  && p.status !== 'in_progress' && p.status !== 'ready') continue;
      if (filterStatus && filterStatus !== 'active' && filterStatus !== 'overdue' && p.status !== filterStatus) continue;
      const key = p.project_id ?? '__none__';
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(p);
    }
    return m;
  }, [pieces, filterAssignee, filterProject, filterStatus]);

  // ── バービュー: ズーム別レイアウト定数 ──────────────────────
  const barProjH   = zoomLevel === 'day' ? 34 : zoomLevel === 'week' ? 28 : 22;
  const barPieceH  = zoomLevel === 'day' ? 44 : zoomLevel === 'week' ? 34 : 26;
  const barNodateH = zoomLevel === 'day' ? 28 : 22;
  const barBarH    = zoomLevel === 'day' ? 8  : zoomLevel === 'week' ? 6  : 4;

  // バー行レイアウト（y 座標を含む）
  type BarRowData = {
    key: string; label: string; color: string | null;
    projY: number; pieceYs: number[];
    nodateYs: number[]; nodatePieces: PieceRow[];
  };
  const barRowData = useMemo<BarRowData[]>(() => {
    const rows: BarRowData[] = [];
    let curY = HEADER_H + V_PAD;
    for (const g of barGroups) {
      const projY = curY;
      curY += barProjH;
      const pieceYs: number[] = [];
      const nodatePieces = barNoDatesMap.get(g.key) ?? [];
      const nodateYs: number[] = [];
      if (!barCollapsed.has(g.key)) {
        g.pieces.forEach(() => { pieceYs.push(curY); curY += barPieceH; });
        nodatePieces.forEach(() => { nodateYs.push(curY); curY += barNodateH; });
      }
      rows.push({ key: g.key, label: g.label, color: g.color, projY, pieceYs, nodatePieces, nodateYs });
    }
    return rows;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barGroups, barCollapsed, barNoDatesMap, barProjH, barPieceH, barNodateH]);

  const barSvgH = useMemo(() => {
    if (!barRowData.length) return 440;
    const last = barRowData[barRowData.length - 1];
    const bot = barCollapsed.has(last.key)
      ? last.projY + barProjH
      : last.nodateYs.length
        ? last.nodateYs[last.nodateYs.length - 1] + barNodateH
        : last.pieceYs.length
          ? last.pieceYs[last.pieceYs.length - 1] + barPieceH
          : last.projY + barProjH;
    return Math.max(bot + V_PAD, 440);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barRowData, barCollapsed, barProjH, barPieceH, barNodateH]);

  // バーノードマップ（pieceId → SVG座標）
  const barNodeMap = useMemo(() => {
    const m = new Map<string, NodePos>();
    barGroups.forEach((g, gi) => {
      if (barCollapsed.has(g.key)) return;
      const row = barRowData[gi];
      if (!row) return;
      g.pieces.forEach((piece, pi) => {
        const cy = row.pieceYs[pi] + barPieceH / 2;
        let x = LABEL_W + 50, bsx = LABEL_W + 50 - 36, bex = LABEL_W + 50;
        if (piece.due_date) {
          const off = dayOffset(new Date(piece.due_date), viewStart);
          x = Math.max(LABEL_W + nodeR + 4, LABEL_W + off * dayW + dayW / 2);
          bsx = piece.start_date
            ? LABEL_W + dayOffset(new Date(piece.start_date), viewStart) * dayW + dayW / 2
            : x - nodeR * 5;
          bex = x;
          if (bex - bsx < nodeR) bsx = bex - nodeR;
          bsx = Math.max(LABEL_W + 2, bsx);
        }
        m.set(piece.id, { x, y: cy, barStartX: bsx, barEndX: bex });
      });
    });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barGroups, barRowData, barCollapsed, barPieceH, viewStart, dayW, nodeR]);

  // ④ スティッキープロジェクトヘッダー用スクロール追跡
  const [barScrollY, setBarScrollY]   = useState(0);
  const barScrollRafRef               = useRef<number>(0);

  const stickyProj = useMemo(() => {
    if (ganttViewMode !== 'bar') return null;
    for (let i = barRowData.length - 1; i >= 0; i--) {
      if (barRowData[i].projY < barScrollY + HEADER_H + 2) return barRowData[i];
    }
    return null;
  }, [ganttViewMode, barRowData, barScrollY]);

  // 全ピース完了のプロジェクトを crystal 表示
  const crystallizedProjectIds = useMemo(() => {
    if (filterAssignee || filterStatus) return new Set<string>();
    const groups = buildProjectGroups(piecesWithDates);
    const s = new Set<string>();
    for (const g of groups) {
      if (g.pieces.length > 0 && g.pieces.every(p => p.status === 'done')) s.add(g.key);
    }
    return s;
  }, [piecesWithDates, filterAssignee, filterStatus]);

  const { rows, nodeMap, totalH, projectKeys } = useMemo(
    () => computeLayout(filteredPieces, viewStart, dayW, collapsedChains, crystallizedProjectIds),
    [filteredPieces, viewStart, dayW, collapsedChains, crystallizedProjectIds]
  );

  const contentW = LABEL_W + viewDays * dayW;
  const svgW     = Math.max(contentW, containerW || contentW);
  const svgH     = Math.max(totalH, 440);
  const todayOff = dayOffset(today, viewStart);

  const pieceProjectMap = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    for (const p of pieces) m[p.id] = p.project_id ?? undefined;
    return m;
  }, [pieces]);

  // ── チェーンコンフリクト検出 ─────────────────────────────────────
  // 前ピースの due_date > 後ピースの start_date のとき「競合」
  const conflictedPieceIds = useMemo(() => {
    const ids = new Set<string>();
    const pieceById = new Map(pieces.map(p => [p.id, p]));
    for (const c of connections) {
      const from = pieceById.get(c.from_piece_id);
      const to   = pieceById.get(c.to_piece_id);
      if (!from?.due_date || !to?.start_date) continue;
      if (from.status === 'done' || to.status === 'done') continue;
      if (new Date(from.due_date) >= new Date(to.start_date)) {
        ids.add(to.id);
      }
    }
    return ids;
  }, [pieces, connections]);

  // バーエッジ（pieceProjectMap の後に配置）
  const barDrawEdges = useMemo(() =>
    connections.filter(c => {
      if (c.type !== 'sequential') return false;
      if (!barNodeMap.has(c.from_piece_id) || !barNodeMap.has(c.to_piece_id)) return false;
      const sp = pieceProjectMap[c.from_piece_id];
      const tp = pieceProjectMap[c.to_piece_id];
      if (!showCrossProjectConns && sp && tp && sp !== tp) return false;
      return true;
    }),
    [connections, barNodeMap, pieceProjectMap, showCrossProjectConns],
  );

  const drawEdges = useMemo(() =>
    connections.filter(c => {
      if (c.type !== 'sequential') return false;
      if (!nodeMap.has(c.from_piece_id) || !nodeMap.has(c.to_piece_id)) return false;
      // 横断接続: showCrossProjectConns が false の場合は非表示
      const srcProj = pieceProjectMap[c.from_piece_id];
      const tgtProj = pieceProjectMap[c.to_piece_id];
      if (!showCrossProjectConns && srcProj && tgtProj && srcProj !== tgtProj) return false;
      return true;
    }),
    [connections, nodeMap, pieceProjectMap, showCrossProjectConns]);

  const pieceById = useMemo(() => new Map(pieces.map(p => [p.id, p])), [pieces]);

  const cascadeIds = useMemo(() => {
    if (!draggingPieceId) return new Set<string>();
    const result = new Set<string>();
    function walk(id: string) {
      connections
        .filter(c => c.type === 'sequential' && c.from_piece_id === id)
        .forEach(c => {
          if (!result.has(c.to_piece_id)) {
            result.add(c.to_piece_id);
            walk(c.to_piece_id);
          }
        });
    }
    walk(draggingPieceId);
    return result;
  }, [draggingPieceId, connections]);

  const allCollapsed = projectKeys.length > 0 && projectKeys.every(k => collapsedChains.has(k));

  // ── ハンドラー ────────────────────────────────────────────
  function handleBarEdgeMouseDown(
    e: React.MouseEvent, piece: PieceRow, kind: 'start' | 'end' | 'move',
  ) {
    e.preventDefault(); e.stopPropagation();
    setTooltip(null);
    // start_date がない場合、視覚上のバー開始位置を日数に換算して保存
    const pos = barNodeMap.get(piece.id);
    const visualBarStartDays = piece.start_date
      ? dayOffset(new Date(piece.start_date), viewStart)
      : pos ? Math.round((pos.barStartX - LABEL_W) / dayW) : null;
    barEdgeDragRef.current = {
      pieceId: piece.id,
      startClientX: e.clientX,
      kind,
      origStartDays: piece.start_date ? dayOffset(new Date(piece.start_date), viewStart) : null,
      origDueDays:   piece.due_date   ? dayOffset(new Date(piece.due_date),   viewStart) : null,
      visualBarStartDays,
    };
    setBarEdgeDragId(piece.id);
    setBarEdgeDragDelta(0);
  }

  async function handleStatusCycle(e: React.MouseEvent, piece: PieceRow) {
    e.stopPropagation();
    const cycle = ['locked', 'ready', 'in_progress', 'done'] as const;
    const idx = cycle.indexOf(piece.status as typeof cycle[number]);
    const newStatus = cycle[(idx + 1) % cycle.length];
    setPieces(prev => prev.map(p => p.id === piece.id ? { ...p, status: newStatus } : p));
    await pieceApi.updateStatus(piece.id, newStatus).catch(() => load());
  }

  // 接続モード: 右クリック → コンテキストメニュー
  const handleNodeContextMenu = useCallback((e: React.MouseEvent, piece: PieceRow) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, piece });
  }, []);

  // 接続モード中に別の◯をクリックで接続完成
  const handleNodeClickForConnect = useCallback(async (piece: PieceRow) => {
    if (!connectingFromId || connectingFromId === piece.id) {
      setConnectingFromId(null);
      setContextMenu(null);
      return;
    }
    try {
      await pieceApi.connect(connectingFromId, { to_piece_id: piece.id, type: 'sequential' });
      const conns = await pieceApi.getConnections();
      setConnections(conns);
    } catch { /* ignore */ }
    setConnectingFromId(null);
    setContextMenu(null);
  }, [connectingFromId]);

  function handleNodeMouseDown(e: React.MouseEvent, piece: PieceRow) {
    if (!piece.due_date) return;
    e.preventDefault(); e.stopPropagation();
    nodeDragMoved.current = false;
    setTooltip(null); // ドラッグ中はツールチップ非表示
    setDraggingPieceId(piece.id);
    pieceDragRef.current = {
      pieceId: piece.id, startClientX: e.clientX,
      origDueDays:  dayOffset(new Date(piece.due_date), viewStart),
      origStartDays: piece.start_date ? dayOffset(new Date(piece.start_date), viewStart) : null,
    };
    setPieceDragDelta(0);
  }

  function handleNodeClick(piece: PieceRow) {
    if (nodeDragMoved.current) return;
    setSelectedPieceId(piece.id);
  }

  function handleChainLabelMouseDown(e: React.MouseEvent, row: RowDef) {
    if (!row.chainId) return;
    e.stopPropagation();
    // マージ行はドラッグ不可（クリックのみ → アコーディオントグル）
    const isMerged = row.extraChainIds.length > 0;
    chainDragRef.current = {
      chainId: row.chainId, startClientX: e.clientX, moved: false,
      extraChainIds: row.extraChainIds,
      pieces: isMerged ? [] : row.pieces.map(p => ({
        id:        p.id,
        dueDays:   p.due_date   ? dayOffset(new Date(p.due_date),   viewStart) : null,
        startDays: p.start_date ? dayOffset(new Date(p.start_date), viewStart) : null,
      })),
    };
    setChainDragId(row.chainId);
    setChainDragDelta(0);
  }

  const isDraggingAny = pieceDragRef.current !== null || chainDragRef.current !== null || barEdgeDragRef.current !== null;

  // ── レンダー ───────────────────────────────────────────────
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      <style>{`
        @keyframes cr-snap { 0%{opacity:1;transform:scale(1)} 35%{opacity:.7;transform:scale(1.5)} 100%{opacity:.3;transform:scale(1)} }
        @keyframes cr-crystal { 0%{opacity:0;transform:scaleX(.6)} 100%{opacity:1;transform:scaleX(1)} }
      `}</style>

      {/* ── ページヘッダー ── */}
      <div style={{
        height: 52, padding: '0 0 0 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center',
        background: 'var(--surface)', flexShrink: 0, gap: 0,
      }}>
        {/* 左: フィルター群（スクロール可能） */}
        <div className="page-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, height: '100%', overflowX: 'auto' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em', flexShrink: 0 }}>タイムライン</span>
          <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--surface-sub)', color: 'var(--text-3)',
            padding: '2px 7px', borderRadius: 99, border: '1px solid var(--border)', letterSpacing: '0.07em', flexShrink: 0 }}>
            CHAIN RIVER
          </span>

          {/* ズームレベル */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginLeft: 10, flexShrink: 0 }}>
            {(['day', 'week', 'month'] as ZoomLevel[]).map(z => (
              <button key={z} onClick={() => setZoomLevel(z)} style={{
                ...navBtnSt,
                background: zoomLevel === z ? 'var(--text-1)' : 'none',
                color:      zoomLevel === z ? '#FAFAF8'        : 'var(--text-3)',
                border:     `1px solid ${zoomLevel === z ? 'var(--text-1)' : 'var(--border)'}`,
                fontSize: 10, padding: '3px 9px',
              }}>
                {ZOOM[z].label}
              </button>
            ))}
          </div>

          {/* 全開閉 */}
          <div style={{ width: 1, height: 14, background: 'var(--border)', marginLeft: 6, flexShrink: 0 }} />
          <button
            onClick={() => {
              if (ganttViewMode === 'chain') {
                setCollapsedChains(allCollapsed ? new Set() : new Set(projectKeys));
              } else {
                setBarCollapsed(barAllCollapsed ? new Set() : new Set(barGroups.map(g => g.key)));
              }
            }}
            style={{ ...navBtnSt, fontSize: 10, padding: '3px 9px', flexShrink: 0 }}
          >
            {(ganttViewMode === 'chain' ? allCollapsed : barAllCollapsed) ? '▼ 全開' : '▲ 全閉'}
          </button>

          {/* 表示モード切り替え */}
          <div style={{ width: 1, height: 14, background: 'var(--border)', marginLeft: 6, flexShrink: 0 }} />
          {(['chain', 'bar'] as const).map(m => (
            <button key={m} onClick={() => setGanttViewMode(m)} style={{
              ...navBtnSt,
              background: ganttViewMode === m ? 'var(--text-1)' : 'none',
              color:      ganttViewMode === m ? '#FAFAF8'        : 'var(--text-3)',
              border:     `1px solid ${ganttViewMode === m ? 'var(--text-1)' : 'var(--border)'}`,
              fontSize: 10, padding: '3px 9px',
            }}>
              {m === 'chain' ? 'チェーン' : 'バー'}
            </button>
          ))}

          {/* フィルター */}
          <div style={{ width: 1, height: 14, background: 'var(--border)', marginLeft: 6, flexShrink: 0 }} />

          {/* ステータスクイックフィルター */}
          {([
            { key: 'active',      label: '進行中+待機' },
            { key: 'in_progress', label: '進行中のみ' },
            { key: 'overdue',     label: '⚠ 期限超過' },
          ] as const).map(f => (
            <button key={f.key} onClick={() => setFilterStatus(s => s === f.key ? null : f.key)}
              style={{
                fontSize: 9.5, padding: '3px 8px', flexShrink: 0,
                border: `1px solid ${filterStatus === f.key ? 'var(--text-1)' : 'var(--border)'}`,
                borderRadius: 'var(--r-sm)',
                background: filterStatus === f.key ? 'var(--text-1)' : 'var(--surface)',
                color: filterStatus === f.key ? '#FAFAF8' : 'var(--text-3)',
                cursor: 'pointer',
              }}>
              {f.label}
            </button>
          ))}

          <div style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />

          {/* 担当者フィルター */}
          <select
            value={filterAssignee ?? ''}
            onChange={e => setFilterAssignee(e.target.value || null)}
            style={{
              fontSize: 10, padding: '3px 8px', flexShrink: 0,
              border: `1px solid ${filterAssignee ? 'var(--text-1)' : 'var(--border)'}`,
              borderRadius: 'var(--r-sm)',
              background: filterAssignee ? 'var(--text-1)' : 'var(--surface)',
              color: filterAssignee ? '#FAFAF8' : 'var(--text-3)',
              cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">担当者▾</option>
            {allAssignees.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          {/* プロジェクトフィルター */}
          <select
            value={filterProject ?? ''}
            onChange={e => setFilterProject(e.target.value || null)}
            style={{
              fontSize: 10, padding: '3px 8px', flexShrink: 0,
              border: `1px solid ${filterProject ? 'var(--text-1)' : 'var(--border)'}`,
              borderRadius: 'var(--r-sm)',
              background: filterProject ? 'var(--text-1)' : 'var(--surface)',
              color: filterProject ? '#FAFAF8' : 'var(--text-3)',
              cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="">プロジェクト▾</option>
            {allProjects.map(({ id, name }) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>

          <div style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} />

          {/* 横断接続トグル */}
          <button
            onClick={() => setShowCrossProjectConns(v => !v)}
            title={showCrossProjectConns ? 'プロジェクト間の接続を非表示にする' : 'プロジェクト間の接続を表示する'}
            style={{
              fontSize: 9.5, padding: '3px 8px', flexShrink: 0,
              border: `1px solid ${showCrossProjectConns ? 'var(--text-1)' : 'var(--border)'}`,
              borderRadius: 'var(--r-sm)',
              background: showCrossProjectConns ? 'var(--text-1)' : 'var(--surface)',
              color: showCrossProjectConns ? '#FAFAF8' : 'var(--text-3)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <circle cx="2" cy="5" r="1.5" fill="currentColor" opacity="0.7"/>
              <circle cx="8" cy="2" r="1.5" fill="currentColor" opacity="0.7"/>
              <circle cx="8" cy="8" r="1.5" fill="currentColor" opacity="0.7"/>
              <line x1="3.5" y1="4.5" x2="6.5" y2="2.5" stroke="currentColor" strokeWidth="1" opacity="0.6"/>
              <line x1="3.5" y1="5.5" x2="6.5" y2="7.5" stroke="currentColor" strokeWidth="1" opacity="0.6"/>
            </svg>
            横断接続
          </button>
        </div>

        {/* 右: 日付ナビ（常に表示） */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, padding: '0 12px', borderLeft: '1px solid var(--border)' }}>
          <button onClick={() => setViewStart(d => addDays(d, -navDays))} style={navBtnSt}><ChevronLeft size={13} /></button>
          <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 84, textAlign: 'center', letterSpacing: '-0.01em' }}>
            {viewStart.getMonth()+1}/{viewStart.getDate()} – {addDays(viewStart, viewDays-1).getMonth()+1}/{addDays(viewStart, viewDays-1).getDate()}
          </span>
          <button onClick={() => setViewStart(d => addDays(d, navDays))} style={navBtnSt}><ChevronRight size={13} /></button>
          <button onClick={() => { const d = new Date(); d.setDate(d.getDate()-7); d.setHours(0,0,0,0); setViewStart(d); }}
            style={{ ...navBtnSt, fontSize: 10, padding: '3px 9px' }}>今週</button>
          <button onClick={load} disabled={loading} style={navBtnSt}>
            <RefreshCw size={12} style={{ opacity: loading ? 0.4 : 1 }} />
          </button>
          <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
          <button
            onClick={() => setCreateModal({})}
            style={{ ...navBtnSt, fontSize: 10, padding: '3px 10px', fontWeight: 600,
              background: 'var(--text-1)', color: '#FAFAF8', border: '1px solid var(--text-1)' }}>
            ＋ 新規
          </button>
        </div>
      </div>

      {/* ── ボディ ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* タイムライン列（stickyヘッダー + スクロール本体を重ねる） */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>

          {/* ── Stickyヘッダー（日付ラベル固定） ── */}
          <div
            ref={headerScrollRef}
            style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              height: HEADER_H, zIndex: 6,
              overflow: 'hidden', pointerEvents: 'none',
              boxShadow: '0 1px 0 var(--border)',
            }}
          >
            <svg width={svgW} height={HEADER_H}
              style={{ display: 'block', fontFamily: 'system-ui,-apple-system,sans-serif', userSelect: 'none' }}>
              {/* 背景 */}
              <rect x={0} y={0} width={svgW} height={HEADER_H} fill="var(--surface)" />
              <rect x={LABEL_W-1} y={0} width={1} height={HEADER_H} fill="var(--border)" opacity={0.6} />

              {/* 週/月ラベル */}
              {zoomLevel === 'day' && weeks.map((w, wi) => (
                <g key={wi}>
                  {wi > 0 && <line x1={LABEL_W + w.startI*dayW} y1={0} x2={LABEL_W + w.startI*dayW} y2={HEADER_H}
                    stroke="var(--border)" strokeWidth={0.5} opacity={0.4} />}
                  <text x={LABEL_W + w.startI*dayW + 5} y={WEEK_H - 5} fontSize={8.5} fontWeight={600}
                    fill="var(--text-3)" letterSpacing="0.05em">{w.label}</text>
                </g>
              ))}
              {zoomLevel !== 'day' && months.map((m, mi) => (
                <g key={mi}>
                  {mi > 0 && <line x1={LABEL_W + m.startI*dayW} y1={0} x2={LABEL_W + m.startI*dayW} y2={HEADER_H}
                    stroke="var(--border)" strokeWidth={0.5} opacity={0.5} />}
                  <text x={LABEL_W + m.startI*dayW + 4} y={WEEK_H - 5} fontSize={9} fontWeight={600}
                    fill="var(--text-3)">{m.label}</text>
                </g>
              ))}

              {/* 日付サブラベル */}
              {zoomLevel === 'day' && days.map((day, di) => {
                const x = LABEL_W + di * dayW;
                const isToday   = di === todayOff;
                const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                return (
                  <g key={di}>
                    {isWeekend && <rect x={x} y={WEEK_H} width={dayW} height={DAY_H} fill="#00000005" />}
                    <text x={x + dayW/2} y={HEADER_H - 7} textAnchor="middle"
                      fontSize={isToday ? 9.5 : 8.5} fontWeight={isToday ? 700 : 400}
                      fill={isToday ? '#E60012' : 'var(--text-3)'} opacity={isWeekend && !isToday ? 0.5 : 1}>
                      {day.getDate()}
                    </text>
                  </g>
                );
              })}
              {zoomLevel === 'week' && weeks.map((w, wi) => (
                <g key={wi}>
                  <text x={LABEL_W + w.startI*dayW + 3} y={HEADER_H - 7} fontSize={7.5}
                    fill="var(--text-3)" opacity={0.7}>{w.label.split('/')[1]}</text>
                </g>
              ))}

              {/* 今日マーカー */}
              {todayOff >= 0 && todayOff < viewDays && (
                <rect x={LABEL_W + todayOff*dayW} y={WEEK_H} width={dayW} height={DAY_H}
                  fill="#E60012" opacity={0.06} />
              )}

              {/* ラベル列タイトル / バーモードではスティッキープロジェクト名 */}
              {ganttViewMode === 'bar' && stickyProj && barScrollY > 4 ? (
                <g>
                  {/* 区切り線 */}
                  <rect x={0} y={0} width={LABEL_W - 1} height={HEADER_H}
                    fill="var(--surface)" />
                  <rect x={0} y={HEADER_H - 1} width={LABEL_W} height={1}
                    fill="var(--border)" opacity={0.7} />
                  {/* カラードット */}
                  {stickyProj.color && (
                    <circle cx={14} cy={HEADER_H / 2} r={3.5} fill={stickyProj.color} />
                  )}
                  <text
                    x={stickyProj.color ? 24 : 12} y={HEADER_H / 2 + 4}
                    fontSize={9.5} fontWeight={600} fill="var(--text-2)"
                    letterSpacing="-0.01em">
                    {stickyProj.label.length > 20
                      ? stickyProj.label.slice(0, 20) + '…'
                      : stickyProj.label}
                  </text>
                </g>
              ) : (
                <text x={12} y={HEADER_H / 2 + 4} fontSize={9} fontWeight={600}
                  fill="var(--text-3)" letterSpacing="0.04em">
                  {ganttViewMode === 'bar' ? 'プロジェクト / タスク' : 'プロジェクト'}
                </text>
              )}
            </svg>
          </div>

        <div ref={scrollAreaRef} style={{ position: 'absolute', inset: 0, overflowX: 'auto', overflowY: 'auto',
          cursor: isDraggingAny ? 'ew-resize' : 'default' }}>
          {loading && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(250,250,248,0.7)' }}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>読み込み中...</span>
            </div>
          )}

          {/* ── バー表示 ── */}
          {ganttViewMode === 'bar' && (() => {
            // コンポーネントレベルで計算済みのメモを使用
            const PROJ_H      = barProjH;
            const PIECE_H     = barPieceH;
            const NODATE_H    = barNodateH;
            const BAR_P_THICK = 14;
            const BAR_PC_THICK = barBarH;

            return (
              <svg width={svgW} height={barSvgH}
                style={{ display: 'block', fontFamily: 'system-ui,-apple-system,sans-serif', userSelect: 'none' }}>

                {/* Background */}
                <rect x={0} y={0} width={LABEL_W} height={barSvgH} fill="var(--surface)" />
                <rect x={LABEL_W-1} y={0} width={1} height={barSvgH} fill="var(--border)" opacity={0.6} />
                <rect x={0} y={0} width={svgW} height={HEADER_H} fill="var(--surface)" />
                <rect x={0} y={HEADER_H-1} width={svgW} height={1} fill="var(--border)" opacity={0.6} />

                {/* Time axis header */}
                {zoomLevel === 'day' && weeks.map((w, wi) => (
                  <g key={wi}>
                    {wi > 0 && <line x1={LABEL_W + w.startI*dayW} y1={0} x2={LABEL_W + w.startI*dayW} y2={barSvgH}
                      stroke="var(--border)" strokeWidth={0.5} opacity={0.4} />}
                    <text x={LABEL_W + w.startI*dayW + 5} y={WEEK_H - 5} fontSize={8.5} fontWeight={600}
                      fill="var(--text-3)" letterSpacing="0.05em">{w.label}</text>
                  </g>
                ))}
                {zoomLevel !== 'day' && months.map((m, mi) => (
                  <g key={mi}>
                    {mi > 0 && <line x1={LABEL_W + m.startI*dayW} y1={0} x2={LABEL_W + m.startI*dayW} y2={barSvgH}
                      stroke="var(--border)" strokeWidth={0.5} opacity={0.5} />}
                    <text x={LABEL_W + m.startI*dayW + 4} y={WEEK_H - 5} fontSize={9} fontWeight={600}
                      fill="var(--text-3)">{m.label}</text>
                  </g>
                ))}
                {zoomLevel === 'day' && days.map((day, di) => {
                  const x = LABEL_W + di * dayW;
                  const isToday   = di === todayOff;
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <g key={di}>
                      {isWeekend && <rect x={x} y={WEEK_H} width={dayW} height={DAY_H} fill="#00000005" />}
                      <text x={x + dayW/2} y={HEADER_H - 7} textAnchor="middle"
                        fontSize={isToday ? 9.5 : 8.5} fontWeight={isToday ? 700 : 400}
                        fill={isToday ? '#E60012' : 'var(--text-3)'} opacity={isWeekend && !isToday ? 0.5 : 1}>
                        {day.getDate()}
                      </text>
                    </g>
                  );
                })}
                {zoomLevel === 'week' && weeks.map((w, wi) => (
                  <g key={wi}>
                    <line x1={LABEL_W + w.startI*dayW} y1={WEEK_H} x2={LABEL_W + w.startI*dayW} y2={barSvgH}
                      stroke="var(--border)" strokeWidth={0.5} opacity={0.25} />
                    <text x={LABEL_W + w.startI*dayW + 3} y={HEADER_H - 7} fontSize={7.5}
                      fill="var(--text-3)" opacity={0.7}>{w.label.split('/')[1]}</text>
                  </g>
                ))}

                {/* ラベル列タイトル */}
                <text x={12} y={HEADER_H / 2 + 4} fontSize={9} fontWeight={600}
                  fill="var(--text-3)" letterSpacing="0.04em">プロジェクト / タスク</text>

                {/* 今日線 */}
                {todayOff >= 0 && todayOff < viewDays && (
                  <line x1={LABEL_W + todayOff*dayW + dayW/2} y1={HEADER_H}
                        x2={LABEL_W + todayOff*dayW + dayW/2} y2={barSvgH}
                        stroke="#E60012" strokeWidth={1} strokeDasharray="4 3" opacity={0.28} />
                )}

                {/* Project groups */}
                {barGroups.map((g, gi) => {
                  const { projY, pieceYs } = barRowData[gi];
                  const isCollapsed = barCollapsed.has(g.key);
                  const cy = projY + PROJ_H / 2;
                  const pct = g.pieces.length > 0 ? g.doneCount / g.pieces.length : 0;

                  const bx1raw = g.minDate ? LABEL_W + dayOffset(g.minDate, viewStart) * dayW + dayW / 2 : null;
                  const bx2raw = g.maxDate ? LABEL_W + dayOffset(g.maxDate, viewStart) * dayW + dayW / 2 : null;
                  const bx1 = bx1raw !== null ? Math.max(LABEL_W + 2, bx1raw) : null;
                  const bx2 = bx2raw !== null ? Math.max((bx1 ?? LABEL_W + 2) + 20, bx2raw) : null;

                  return (
                    <g key={g.key}>
                      {/* Project row background */}
                      <rect x={0} y={projY} width={svgW} height={PROJ_H}
                        fill={gi % 2 === 0 ? 'none' : '#00000004'} />
                      <line x1={0} y1={projY + PROJ_H} x2={svgW} y2={projY + PROJ_H}
                        stroke="var(--border)" strokeWidth={0.5} opacity={0.4} />

                      {/* Piece row backgrounds + labels */}
                      {!isCollapsed && g.pieces.map((piece, pi) => {
                        const py  = pieceYs[pi];
                        const pcy = py + PIECE_H / 2;
                        const isDone    = piece.status === 'done';
                        const isActive  = piece.status === 'in_progress';
                        const isOverdue = !!piece.due_date && new Date(piece.due_date) < today && !isDone;
                        const dotFill      = isDone ? '#CCCCCC' : isActive ? '#1A1A1A' : 'none';
                        const dotStroke    = isDone ? '#AAAAAA' : isOverdue ? '#E60012' : isActive ? '#1A1A1A' : '#888888';
                        const isSelected   = selectedPieceId === piece.id;
                        return (
                          <React.Fragment key={piece.id}>
                            <rect x={0} y={py} width={svgW} height={PIECE_H}
                              fill={isSelected ? 'rgba(180,100,0,0.07)' : pi % 2 === 0 ? '#00000002' : '#00000006'} />
                            {isSelected && (
                              <rect x={0} y={py} width={3} height={PIECE_H} fill="#B46400" opacity={0.7} />
                            )}
                            <line x1={0} y1={py + PIECE_H} x2={svgW} y2={py + PIECE_H}
                              stroke="var(--border)" strokeWidth={0.4} opacity={0.2} />
                            {/* Status dot */}
                            <circle cx={26} cy={pcy} r={3.5}
                              fill={dotFill} stroke={dotStroke} strokeWidth={1.5}
                              style={{ pointerEvents: 'none' }} />
                            {isDone && (
                              <path d={`M ${22.5} ${pcy+0.5} L ${25} ${pcy+3} L ${29.5} ${pcy-2.5}`}
                                stroke="#999999" strokeWidth={1.2} fill="none"
                                strokeLinecap="round" strokeLinejoin="round"
                                style={{ pointerEvents: 'none' }} />
                            )}
                            {/* Status dot hit area (click to cycle) */}
                            <rect x={18} y={pcy - 8} width={16} height={16}
                              fill="transparent" style={{ cursor: 'pointer' }}
                              onClick={e => handleStatusCycle(e, piece)} />
                            {/* Piece title + assignee: 縦積みレイアウト */}
                            {piece.assignee_name ? (
                              <>
                                <text x={38} y={pcy - 1} fontSize={9}
                                  fill={isDone ? 'var(--text-3)' : isOverdue ? '#C0392B' : 'var(--text-2)'}
                                  style={{ cursor: 'pointer' }}
                                  onClick={e => { e.stopPropagation(); setSelectedPieceId(piece.id); }}>
                                  {piece.title.length > 22 ? piece.title.slice(0, 22) + '…' : piece.title}
                                </text>
                                <text x={38} y={pcy + 9} fontSize={7.5}
                                  fill="var(--text-4)" style={{ pointerEvents: 'none' }}>
                                  {piece.assignee_name.length > 14
                                    ? piece.assignee_name.slice(0, 14) + '…'
                                    : piece.assignee_name}
                                </text>
                              </>
                            ) : (
                              <text x={38} y={pcy + 4} fontSize={9}
                                fill={isDone ? 'var(--text-3)' : isOverdue ? '#C0392B' : 'var(--text-2)'}
                                style={{ cursor: 'pointer' }}
                                onClick={e => { e.stopPropagation(); setSelectedPieceId(piece.id); }}>
                                {piece.title.length > 22 ? piece.title.slice(0, 22) + '…' : piece.title}
                              </text>
                            )}
                          </React.Fragment>
                        );
                      })}

                      {/* Accordion click area */}
                      <rect x={0} y={projY} width={LABEL_W} height={PROJ_H}
                        fill="transparent" style={{ cursor: 'pointer' }}
                        onClick={() => setBarCollapsed(s => {
                          const n = new Set(s);
                          if (n.has(g.key)) n.delete(g.key); else n.add(g.key);
                          return n;
                        })} />
                      {/* タイムライン側クリック → 日付プリセット済み新規作成 */}
                      <rect x={LABEL_W} y={projY} width={svgW - LABEL_W} height={PROJ_H}
                        fill="transparent" style={{ cursor: 'crosshair' }}
                        onClick={e => {
                          const svg = (e.target as SVGElement).closest('svg')!;
                          const rect = svg.getBoundingClientRect();
                          const relX = e.clientX - rect.left - LABEL_W + (scrollAreaRef.current?.scrollLeft ?? 0);
                          const clickedDay = Math.floor(relX / dayW);
                          const clickedDate = toDateStr(addDays(viewStart, clickedDay));
                          setCreateModal({
                            startDate: clickedDate,
                            dueDate: toDateStr(addDays(viewStart, clickedDay + 6)),
                            projectId: g.key !== '__none__' ? g.key : undefined,
                          });
                        }} />

                      {/* Arrow */}
                      <text x={8} y={cy + 4} fontSize={8} fill="var(--text-3)" opacity={0.5}
                        style={{ pointerEvents: 'none' }}>
                        {isCollapsed ? '▶' : '▼'}
                      </text>

                      {/* Color dot */}
                      {g.color && (
                        <circle cx={23} cy={cy} r={4} fill={g.color}
                          style={{ pointerEvents: 'none' }} />
                      )}

                      {/* Project name */}
                      <text x={33} y={cy + 4} fontSize={10} fontWeight={700}
                        fill="var(--text-1)" style={{ pointerEvents: 'none' }}>
                        {g.label.length > 17 ? g.label.slice(0, 17) + '…' : g.label}
                      </text>

                      {/* Done count */}
                      <text x={LABEL_W - 8} y={cy + 4} textAnchor="end"
                        fontSize={8} fill="var(--text-3)" opacity={0.55}
                        style={{ pointerEvents: 'none' }}>
                        {g.doneCount}/{g.pieces.length}
                      </text>

                      {/* Summary bar */}
                      {bx1 !== null && bx2 !== null && bx2 > bx1 && (() => {
                        const hasOverdue = g.pieces.some(
                          p => p.due_date && new Date(p.due_date) < today && p.status !== 'done');
                        const hasActive  = g.pieces.some(p => p.status === 'in_progress');
                        const projFill   = hasOverdue ? '#E60012' : hasActive ? '#B46400' : (g.color ?? '#888888');
                        const projOp     = hasOverdue ? 0.55 : 0.5;
                        const bw = bx2 - bx1;
                        return (
                          <g style={{ pointerEvents: 'none' }}>
                            <rect x={bx1} y={cy - BAR_P_THICK / 2}
                              width={bw} height={BAR_P_THICK}
                              rx={BAR_P_THICK / 2} fill={projFill} opacity={0.10} />
                            {pct > 0 && (
                              <rect x={bx1} y={cy - BAR_P_THICK / 2}
                                width={bw * pct} height={BAR_P_THICK}
                                rx={BAR_P_THICK / 2}
                                fill={projFill} opacity={projOp} />
                            )}
                          </g>
                        );
                      })()}

                    </g>
                  );
                })}

                {/* ── 日付未設定ピース行 ── */}
                {barGroups.map((g, gi) => {
                  const { nodateYs, nodatePieces } = barRowData[gi];
                  if (barCollapsed.has(g.key) || nodatePieces.length === 0) return null;
                  return (
                    <g key={`nodate-${g.key}`}>
                      {nodatePieces.map((piece, ni) => {
                        const py   = nodateYs[ni];
                        const pcy  = py + NODATE_H / 2;
                        const isHov = nodateHover?.pieceId === piece.id;
                        const hovX = isHov ? LABEL_W + nodateHover!.day * dayW : null;
                        const hovDate = isHov ? toDateStr(addDays(viewStart, nodateHover!.day)) : null;
                        return (
                          <g key={piece.id}>
                            {/* ラベル側: クリックでサイドバー */}
                            <rect x={0} y={py} width={LABEL_W} height={NODATE_H}
                              fill={isHov ? 'rgba(200,140,0,0.05)' : 'rgba(200,140,0,0.03)'}
                              style={{ cursor: 'pointer' }}
                              onClick={() => setSelectedPieceId(piece.id)} />
                            <line x1={0} y1={py + NODATE_H} x2={svgW} y2={py + NODATE_H}
                              stroke="var(--border)" strokeWidth={0.4} opacity={0.15} />
                            {/* ステータスドット */}
                            <circle cx={26} cy={pcy} r={3}
                              fill="none" stroke="var(--text-4)" strokeWidth={1.2}
                              strokeDasharray="2 2" style={{ pointerEvents: 'none' }} />
                            {/* ピース名 */}
                            <text x={38} y={pcy + 3.5} fontSize={8.5} fill="var(--text-4)"
                              style={{ pointerEvents: 'none' }}>
                              {piece.title.length > 22 ? piece.title.slice(0, 22) + '…' : piece.title}
                            </text>
                            {/* 未設定バッジ */}
                            <text x={LABEL_W - 8} y={pcy + 3.5} textAnchor="end"
                              fontSize={7.5} fill="#C28A00" opacity={0.65}
                              style={{ pointerEvents: 'none' }}>
                              未設定
                            </text>

                            {/* タイムライン側: クリックで期限設定 */}
                            <rect x={LABEL_W} y={py} width={svgW - LABEL_W} height={NODATE_H}
                              fill={isHov ? 'rgba(180,100,0,0.07)' : 'transparent'}
                              style={{ cursor: 'crosshair' }}
                              onMouseMove={e => {
                                const svg = (e.target as SVGElement).closest('svg')!;
                                const rect = svg.getBoundingClientRect();
                                const relX = e.clientX - rect.left - LABEL_W + (scrollAreaRef.current?.scrollLeft ?? 0);
                                const day = Math.max(0, Math.floor(relX / dayW));
                                setNodateHover({ pieceId: piece.id, day });
                              }}
                              onMouseLeave={() => setNodateHover(null)}
                              onClick={async e => {
                                e.stopPropagation();
                                const svg = (e.target as SVGElement).closest('svg')!;
                                const rect = svg.getBoundingClientRect();
                                const relX = e.clientX - rect.left - LABEL_W + (scrollAreaRef.current?.scrollLeft ?? 0);
                                const day = Math.max(0, Math.floor(relX / dayW));
                                const newDueDate = toDateStr(addDays(viewStart, day));
                                setPieces(prev => prev.map(p => p.id === piece.id ? { ...p, due_date: newDueDate } : p));
                                setSaving(s => new Set([...s, piece.id]));
                                setNodateHover(null);
                                await pieceApi.update(piece.id, { due_date: newDueDate }).catch(() => load());
                                setSaving(s => { const n = new Set(s); n.delete(piece.id); return n; });
                              }}
                            />

                            {/* ホバー: 縦線 + 日付ラベル */}
                            {isHov && hovX !== null && (
                              <>
                                <line x1={hovX} y1={py + 2} x2={hovX} y2={py + NODATE_H - 2}
                                  stroke="#B46400" strokeWidth={1.2} strokeDasharray="3 2" opacity={0.8}
                                  style={{ pointerEvents: 'none' }} />
                                <rect x={hovX + 4} y={pcy - 8} width={52} height={14} rx={3}
                                  fill="#B46400" opacity={0.9} style={{ pointerEvents: 'none' }} />
                                <text x={hovX + 30} y={pcy + 3} textAnchor="middle"
                                  fontSize={8} fill="#fff" fontWeight="700"
                                  style={{ pointerEvents: 'none' }}>
                                  {hovDate}
                                </text>
                              </>
                            )}

                            {/* ホバーなし時のガイドテキスト */}
                            {!isHov && (
                              <text x={LABEL_W + 12} y={pcy + 3.5} fontSize={7.5}
                                fill="#C28A00" opacity={0.40}
                                style={{ pointerEvents: 'none' }}>
                                ← クリックして期限を設定
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </g>
                  );
                })}

                {/* ── エッジ（バー表示用、ラベル列右側のみ）── */}
                <g clipPath="url(#bar-timeline-clip)">
                  <defs>
                    <clipPath id="bar-timeline-clip">
                      <rect x={LABEL_W} y={0} width={svgW - LABEL_W} height={barSvgH} />
                    </clipPath>
                  </defs>
                  {barDrawEdges.map(conn => {
                    const from = barNodeMap.get(conn.from_piece_id);
                    const to   = barNodeMap.get(conn.to_piece_id);
                    if (!from || !to) return null;
                    const fromP = pieceById.get(conn.from_piece_id);
                    const toP   = pieceById.get(conn.to_piece_id);
                    if (!fromP || !toP) return null;

                    const fromDragX = pieceDragRef.current?.pieceId === conn.from_piece_id ? pieceDragDelta * dayW : 0;
                    const toDragX   = pieceDragRef.current?.pieceId === conn.to_piece_id   ? pieceDragDelta * dayW : 0;

                    const buf     = calcBuffer(fromP, toP);
                    const es      = getEdgeStyle(buf, fromP.status);
                    const edgeKey = `bar-${conn.from_piece_id}-${conn.to_piece_id}`;
                    const isHov   = hoveredEdge === edgeKey;

                    const x1 = from.x + nodeR + fromDragX;
                    const y1 = from.y;
                    const x2 = to.x - nodeR + toDragX;
                    const y2 = to.y;
                    const cpx = Math.max(Math.abs(x2 - x1) * 0.42, 28);
                    const mx  = (x1 + x2) / 2;
                    const my  = (y1 + y2) / 2;

                    return (
                      <g key={edgeKey}>
                        <path d={`M ${x1} ${y1} C ${x1+cpx} ${y1} ${x2-cpx} ${y2} ${x2} ${y2}`}
                          stroke="transparent" strokeWidth={12} fill="none"
                          onMouseEnter={() => setHoveredEdge(edgeKey)}
                          onMouseLeave={() => setHoveredEdge(null)} />
                        <path d={`M ${x1} ${y1} C ${x1+cpx} ${y1} ${x2-cpx} ${y2} ${x2} ${y2}`}
                          stroke={es.stroke} strokeWidth={isHov ? es.width + 1 : es.width}
                          fill="none" strokeDasharray={es.dash || undefined}
                          opacity={fromP.status === 'done' ? 0.45 : 0.8} strokeLinecap="round"
                          style={{ transition: 'stroke 0.3s ease' }}
                          onMouseEnter={() => setHoveredEdge(edgeKey)}
                          onMouseLeave={() => setHoveredEdge(null)} />
                        {isHov && buf !== null && (
                          <g>
                            <rect x={mx - 18} y={my - 11} width={36} height={16} rx={8}
                              fill="var(--surface)" stroke={es.stroke} strokeWidth={1} />
                            <text x={mx} y={my + 1} textAnchor="middle" fontSize={9.5} fontWeight={600}
                              fill={buf < 0 ? '#E60012' : buf < 2 ? '#C88A00' : 'var(--text-2)'}>
                              {buf >= 0 ? `+${buf}d` : `${buf}d`}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* ── ノード（バー表示用、チェーンと同じ描画）── */}
                {[...barNodeMap.entries()].map(([pieceId, pos]) => {
                  const piece = pieceById.get(pieceId);
                  if (!piece) return null;

                  const isPieceDrag  = pieceDragRef.current?.pieceId === pieceId;
                  const isBarDrag    = barEdgeDragId === pieceId;
                  const dragOffX     = isPieceDrag ? pieceDragDelta * dayW : 0;
                  const isSaving     = saving.has(pieceId);
                  const isSnapping   = snappingIds.has(pieceId);
                  const isDone       = piece.status === 'done';
                  const isActive     = piece.status === 'in_progress';
                  const isLocked     = piece.status === 'locked';
                  const isOverdue    = !!piece.due_date && new Date(piece.due_date) < today && !isDone;
                  const isConflict   = conflictedPieceIds.has(pieceId) && !isDone;

                  const fill   = isConflict ? '#FFF0E0' : isOverdue ? '#FFE8E8' : NODE_FILL[piece.status]   ?? 'transparent';
                  const stroke = isConflict ? '#E67000' : isOverdue ? '#E60012' : NODE_STROKE[piece.status] ?? '#888888';
                  const r      = isActive ? nodeR + 1.5 : nodeR;

                  // バーエッジドラッグ中のプレビュー位置
                  const barDragKind   = barEdgeDragRef.current?.kind;
                  const bDelta        = isBarDrag ? barEdgeDragDelta : 0;
                  const previewBarX1  = isBarDrag && barDragKind !== 'end'
                    ? pos.barStartX + bDelta * dayW : pos.barStartX;
                  const previewBarX2  = isBarDrag && barDragKind !== 'start'
                    ? pos.barEndX + bDelta * dayW : pos.barEndX;
                  const previewX      = isBarDrag && barDragKind !== 'start'
                    ? pos.x + bDelta * dayW : pos.x;

                  const HANDLE_W = 8; // ドラッグハンドル幅
                  const barLen   = pos.barEndX - pos.barStartX;

                  const isConnFrom2 = connectingFromId === pieceId;
                  return (
                    <g key={pieceId}
                      transform={`translate(${dragOffX}, 0)`}
                      style={{ cursor: connectingFromId ? (isConnFrom2 ? 'not-allowed' : 'crosshair') : (piece.due_date ? 'pointer' : 'default') }}
                      onContextMenu={e => handleNodeContextMenu(e, piece)}
                      onMouseEnter={e => {
                        if (pieceDragRef.current || barEdgeDragRef.current) return;
                        setTooltip({ piece, x: e.clientX, y: e.clientY });
                      }}
                      onMouseMove={e => {
                        if (pieceDragRef.current || barEdgeDragRef.current) return;
                        setTooltip(prev => prev?.piece.id === pieceId ? { piece, x: e.clientX, y: e.clientY } : prev);
                      }}
                      onMouseLeave={() => setTooltip(null)}
                    >
                      {/* Duration bar (ステータス色分け + プレビュー反映) */}
                      {previewBarX2 - previewBarX1 > 0 && (() => {
                        const bc = getBarColors(piece.status, isConflict ? false : isOverdue);
                        const bh = BAR_PC_THICK;
                        const bw = previewBarX2 - previewBarX1;
                        return (
                          <g pointerEvents="none">
                            {/* トラック */}
                            <rect x={previewBarX1} y={pos.y - bh/2} width={bw} height={bh} rx={bh/2}
                              fill={isBarDrag ? '#B46400' : bc.track}
                              opacity={isBarDrag ? 0.22 : bc.trackOp} />
                            {/* フィル（done は全幅、in_progress は進捗） */}
                            {isDone && (
                              <rect x={previewBarX1} y={pos.y - bh/2} width={bw} height={bh} rx={bh/2}
                                fill={bc.fill} opacity={isBarDrag ? 0.4 : bc.fillOp} />
                            )}
                            {isActive && !isBarDrag && (
                              <rect x={previewBarX1} y={pos.y - bh/2}
                                width={bw * ((piece.progress ?? 0) / 100)} height={bh} rx={bh/2}
                                fill={bc.fill} opacity={bc.fillOp} />
                            )}
                            {isBarDrag && (
                              <rect x={previewBarX1} y={pos.y - bh/2} width={bw} height={bh} rx={bh/2}
                                fill="#B46400" opacity={0.42} />
                            )}
                            {/* ── エッジグリップ（ドラッグ可能を示す縦線） ── */}
                            {!isBarDrag && bw > 16 && (
                              <>
                                {/* 左端グリップ */}
                                <rect x={previewBarX1 + 3} y={pos.y - bh/2 + 1}
                                  width={2} height={bh - 2} rx={1}
                                  fill={bc.fill} opacity={Math.min(bc.fillOp + 0.2, 0.55)} />
                                {/* 右端グリップ */}
                                <rect x={previewBarX2 - 5} y={pos.y - bh/2 + 1}
                                  width={2} height={bh - 2} rx={1}
                                  fill={bc.fill} opacity={Math.min(bc.fillOp + 0.2, 0.55)} />
                              </>
                            )}
                            {/* locked: ダッシュ装飾 */}
                            {isLocked && (
                              <rect x={previewBarX1} y={pos.y - bh/2} width={bw} height={bh} rx={bh/2}
                                fill="none" stroke={bc.fill} strokeWidth={1}
                                strokeDasharray="4 3" opacity={0.3} />
                            )}
                            {/* ⚠ チェーン競合バッジ（前ピースと期日が重なっている） */}
                            {isConflict && !isBarDrag && (
                              <>
                                {/* バー左端のパルスライン */}
                                <rect x={previewBarX1 - 1} y={pos.y - bh/2 - 1}
                                  width={3} height={bh + 2} rx={1.5}
                                  fill="#E67000" opacity={0.9} />
                                {/* 三角バッジ */}
                                <g transform={`translate(${previewBarX1 + 5}, ${pos.y - 6})`}>
                                  <rect x={0} y={0} width={28} height={12} rx={2}
                                    fill="#E67000" opacity={0.92} />
                                  <text x={14} y={9} textAnchor="middle"
                                    fontSize={7.5} fontWeight="700" fill="#fff">
                                    競合
                                  </text>
                                </g>
                              </>
                            )}
                            {/* バー内タイトル（バーが十分広い場合） */}
                            {bw > 40 && !isBarDrag && (() => {
                              const maxChars = Math.floor((bw - 12) / 5.2);
                              if (maxChars < 3) return null;
                              const label = piece.title.length > maxChars
                                ? piece.title.slice(0, maxChars - 1) + '…'
                                : piece.title;
                              return (
                                <text
                                  x={previewBarX1 + 6} y={pos.y + 3.5}
                                  fontSize={8} fontWeight={500}
                                  fill={isDone ? '#888888' : isOverdue ? '#C0392B' : bc.fill}
                                  opacity={0.85}
                                  style={{ pointerEvents: 'none' }}>
                                  {label}
                                </text>
                              );
                            })()}
                          </g>
                        );
                      })()}

                      {/* Node circle */}
                      {isConnFrom2 && (
                        <circle cx={previewX} cy={pos.y} r={r + 5}
                          fill="none" stroke="#B46400" strokeWidth={2} strokeDasharray="4 2" opacity={0.8}
                          style={{ pointerEvents: 'none' }} />
                      )}
                      <circle cx={previewX} cy={pos.y} r={r}
                        fill={fill} stroke={isBarDrag ? '#B46400' : stroke}
                        strokeWidth={isLocked ? 1.5 : isActive ? 0 : 1.5}
                        strokeDasharray={isLocked ? '3 2' : undefined}
                        opacity={isSaving ? 0.5 : 1}
                        style={{
                          transition: isBarDrag ? 'none' : 'fill 0.3s ease, opacity 0.25s ease',
                          animation: isSnapping ? 'cr-snap 0.75s ease forwards' : undefined,
                        }}
                        onClick={() => {
                          if (connectingFromId) { handleNodeClickForConnect(piece); return; }
                          if (!barEdgeDragRef.current && !nodeDragMoved.current) setSelectedPieceId(piece.id);
                        }}
                        onMouseDown={e => { if (!connectingFromId) handleNodeMouseDown(e, piece); }}
                      />

                      {isActive && !isOverdue && <circle cx={previewX} cy={pos.y} r={3.5} fill="#FFFFFF" opacity={0.85} />}
                      {isDone && (
                        <path d={`M ${previewX-3.5} ${pos.y+0.5} L ${previewX-0.5} ${pos.y+3.5} L ${previewX+4} ${pos.y-3}`}
                          stroke="#999999" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      )}

                      {/* バーエッジドラッグ ヒットエリア — 接続モード中は無効 */}
                      {!connectingFromId && piece.due_date && barLen > 0 && (
                        <>
                          {/* 左端ハンドル（start_date） */}
                          <rect x={pos.barStartX - HANDLE_W/2} y={pos.y - 12} width={HANDLE_W + 4} height={24}
                            fill="transparent" style={{ cursor: 'col-resize' }}
                            onMouseDown={e => handleBarEdgeMouseDown(e, piece, 'start')} />
                          {/* 右端ハンドル（due_date） */}
                          <rect x={pos.barEndX - HANDLE_W/2} y={pos.y - 12} width={HANDLE_W + 4} height={24}
                            fill="transparent" style={{ cursor: 'col-resize' }}
                            onMouseDown={e => handleBarEdgeMouseDown(e, piece, 'end')} />
                          {/* 中央ハンドル（全体移動） */}
                          {barLen > HANDLE_W * 3 && (
                            <rect x={pos.barStartX + HANDLE_W} y={pos.y - 8}
                              width={barLen - HANDLE_W * 2} height={16}
                              fill="transparent" style={{ cursor: 'ew-resize' }}
                              onMouseDown={e => handleBarEdgeMouseDown(e, piece, 'move')} />
                          )}
                        </>
                      )}

                      {/* 接続モード — ターゲット用ヒットエリア（最前面に配置してクリックを確実に捕捉） */}
                      {connectingFromId && connectingFromId !== pieceId && (
                        <circle cx={previewX} cy={pos.y} r={r + 8}
                          fill="rgba(180,100,0,0.06)"
                          stroke="#B46400" strokeWidth={1} strokeDasharray="3 2" opacity={0.6}
                          style={{ cursor: 'crosshair', pointerEvents: 'all' }}
                          onClick={e => { e.stopPropagation(); handleNodeClickForConnect(piece); }}
                        />
                      )}

                      {/* ドラッグ中の日付プレビューチップ */}
                      {isBarDrag && bDelta !== 0 && (() => {
                        const kind = barEdgeDragRef.current?.kind;
                        const origStart = barEdgeDragRef.current?.origStartDays;
                        const origDue   = barEdgeDragRef.current?.origDueDays;
                        const newStart = origStart !== null && origStart !== undefined && kind !== 'end'
                          ? toDateStr(addDays(viewStart, origStart + bDelta)) : null;
                        const newDue   = origDue !== null && origDue !== undefined && kind !== 'start'
                          ? toDateStr(addDays(viewStart, origDue + bDelta)) : null;
                        const chipY = pos.y - r - 22;
                        const label = kind === 'start' && newStart
                          ? `↦ ${newStart.slice(5).replace('-','/')}`
                          : kind === 'end' && newDue
                          ? `${newDue.slice(5).replace('-','/')} ↤`
                          : newStart && newDue
                          ? `${newStart.slice(5).replace('-','/')}→${newDue.slice(5).replace('-','/')}`
                          : '';
                        const chipW = label.length * 5.5 + 12;
                        const chipX = (kind === 'start' ? previewBarX1 : previewX) - chipW / 2;
                        return (
                          <g pointerEvents="none">
                            <rect x={chipX} y={chipY} width={chipW} height={16} rx={4} fill="#B46400" />
                            <text x={chipX + chipW/2} y={chipY + 11} textAnchor="middle"
                              fontSize={9} fill="#FFFFFF" fontWeight={600}>{label}</text>
                          </g>
                        );
                      })()}

                      {/* 通常の期限ラベル */}
                      {piece.due_date && !isDone && !isPieceDrag && !isBarDrag && zoomLevel === 'day' && (
                        <text x={pos.x} y={pos.y - r - 5} textAnchor="middle" fontSize={8}
                          fill={isOverdue ? '#E60012' : 'var(--text-3)'} opacity={0.65}>
                          {piece.due_date.slice(5).replace('-', '/')}
                        </text>
                      )}

                      {isSnapping && (
                        <circle cx={pos.x} cy={pos.y} r={nodeR + 7} fill="none" stroke="#1A1A1A" strokeWidth={1}
                          style={{ animation: 'cr-snap 0.75s ease forwards' }} opacity={0.25} />
                      )}
                    </g>
                  );
                })}

                {!loading && barGroups.length === 0 && (
                  <text x={svgW / 2} y={barSvgH / 2} textAnchor="middle"
                    fontSize={12} fill="var(--text-3)" opacity={0.5}>
                    ピースがありません
                  </text>
                )}
              </svg>
            );
          })()}

          {/* ── チェーン表示 ── */}
          {ganttViewMode === 'chain' && <svg width={svgW} height={svgH}
            style={{ display: 'block', fontFamily: 'system-ui,-apple-system,sans-serif', userSelect: 'none' }}>

            <defs>
              {/* エッジをラベル列より右側のみ表示するクリップ */}
              <clipPath id="timeline-clip">
                <rect x={LABEL_W} y={0} width={svgW - LABEL_W} height={svgH} />
              </clipPath>
            </defs>

            {/* ── 背景 ── */}
            <rect x={0} y={0} width={LABEL_W} height={svgH} fill="var(--surface)" />
            <rect x={LABEL_W-1} y={0} width={1} height={svgH} fill="var(--border)" opacity={0.6} />
            <rect x={0} y={0} width={svgW} height={HEADER_H} fill="var(--surface)" />
            <rect x={0} y={HEADER_H-1} width={svgW} height={1} fill="var(--border)" opacity={0.6} />

            {/* ── 時間軸ヘッダー（ズーム別） ── */}
            {zoomLevel === 'day' && weeks.map((w, wi) => (
              <g key={wi}>
                {wi > 0 && <line x1={LABEL_W + w.startI*dayW} y1={0} x2={LABEL_W + w.startI*dayW} y2={svgH}
                  stroke="var(--border)" strokeWidth={0.5} opacity={0.4} />}
                <text x={LABEL_W + w.startI*dayW + 5} y={WEEK_H - 5} fontSize={8.5} fontWeight={600}
                  fill="var(--text-3)" letterSpacing="0.05em">{w.label}</text>
              </g>
            ))}

            {zoomLevel !== 'day' && months.map((m, mi) => (
              <g key={mi}>
                {mi > 0 && <line x1={LABEL_W + m.startI*dayW} y1={0} x2={LABEL_W + m.startI*dayW} y2={svgH}
                  stroke="var(--border)" strokeWidth={0.5} opacity={0.5} />}
                <text x={LABEL_W + m.startI*dayW + 4} y={WEEK_H - 5} fontSize={9} fontWeight={600}
                  fill="var(--text-3)">{m.label}</text>
              </g>
            ))}

            {/* 日/週サブラベル */}
            {zoomLevel === 'day' && days.map((day, di) => {
              const x = LABEL_W + di * dayW;
              const isToday   = di === todayOff;
              const isWeekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <g key={di}>
                  {isWeekend && <rect x={x} y={WEEK_H} width={dayW} height={svgH - WEEK_H} fill="#00000005" />}
                  <text x={x + dayW/2} y={HEADER_H - 7} textAnchor="middle"
                    fontSize={isToday ? 9.5 : 8.5} fontWeight={isToday ? 700 : 400}
                    fill={isToday ? '#E60012' : 'var(--text-3)'} opacity={isWeekend && !isToday ? 0.5 : 1}>
                    {day.getDate()}
                  </text>
                </g>
              );
            })}

            {zoomLevel === 'week' && weeks.map((w, wi) => (
              <g key={wi}>
                <line x1={LABEL_W + w.startI*dayW} y1={WEEK_H} x2={LABEL_W + w.startI*dayW} y2={svgH}
                  stroke="var(--border)" strokeWidth={0.5} opacity={0.25} />
                <text x={LABEL_W + w.startI*dayW + 3} y={HEADER_H - 7} fontSize={7.5}
                  fill="var(--text-3)" opacity={0.7}>{w.label.split('/')[1]}</text>
              </g>
            ))}

            {/* 今日線 */}
            {todayOff >= 0 && todayOff < viewDays && (
              <line x1={LABEL_W + todayOff*dayW + dayW/2} y1={HEADER_H}
                    x2={LABEL_W + todayOff*dayW + dayW/2} y2={svgH}
                    stroke="#E60012" strokeWidth={1} strokeDasharray="4 3" opacity={0.28} />
            )}

            {/* ── 行背景 + チェーンラベル ── */}
            {rows.map((row, ri) => {
              const isCollapsed = row.kind === 'collapsed';
              const isCrystal   = row.kind === 'crystal';
              const canDrag     = row.chainId !== null;
              const doneCnt     = row.pieces.filter(p => p.status === 'done').length;
              const isBeingDragged = chainDragId === row.chainId;
              const dOff = isBeingDragged ? chainDragDelta * dayW : 0;

              return (
                <g key={`row-${ri}`}>
                  <rect x={0} y={row.y} width={svgW} height={row.height}
                    fill={ri % 2 === 1 ? '#00000004' : 'none'} />
                  <line x1={0} y1={row.y + row.height} x2={svgW} y2={row.y + row.height}
                    stroke="var(--border)" strokeWidth={0.5} opacity={0.3} />

                  {/* ラベル列ドラッグ可能エリア */}
                  {canDrag && (
                    <rect x={0} y={row.y} width={LABEL_W} height={row.height}
                      fill={isBeingDragged ? '#00000008' : 'transparent'}
                      style={{ cursor: 'ew-resize' }}
                      onMouseDown={e => handleChainLabelMouseDown(e, row)} />
                  )}

                  {/* アコーディオン矢印 */}
                  <text x={8} y={row.y + row.height/2 + 4} fontSize={8} fill="var(--text-3)" opacity={0.5}
                    style={{ pointerEvents: 'none' }}>
                    {canDrag ? (isCollapsed ? '▶' : '▼') : ''}
                  </text>

                  {/* プロジェクトカラードット */}
                  {(() => {
                    const color = row.pieces[0]?.project_color;
                    if (!color) return null;
                    return (
                      <circle cx={23} cy={row.y + row.height/2} r={4}
                        fill={color} style={{ pointerEvents: 'none' }} />
                    );
                  })()}

                  {/* プロジェクトラベル */}
                  <text x={32} y={row.y + row.height/2 + 4} fontSize={9.5}
                    fontWeight={isCrystal ? 600 : 600}
                    fill={isCrystal ? 'var(--text-2)' : isBeingDragged ? 'var(--text-1)' : 'var(--text-2)'}
                    style={{ pointerEvents: 'none' }}>
                    {row.label.length > 18 ? row.label.slice(0, 18) + '…' : row.label}
                  </text>

                  {/* ピース数バッジ */}
                  {!isCollapsed && (
                    <text x={LABEL_W - 8} y={row.y + row.height/2 + 4} textAnchor="end"
                      fontSize={8} fill="var(--text-3)" opacity={0.5}
                      style={{ pointerEvents: 'none' }}>
                      {row.pieces.length}件
                    </text>
                  )}

                  {/* チェーン全体移動中のガイド線 */}
                  {isBeingDragged && chainDragDelta !== 0 && (
                    <line x1={LABEL_W} y1={row.y} x2={LABEL_W} y2={row.y + row.height}
                      stroke="var(--text-3)" strokeWidth={2} opacity={0.2} />
                  )}

                  {/* 折りたたみサマリーバー */}
                  {isCollapsed && (() => {
                    const withDue = row.pieces.filter(p => p.due_date);
                    if (!withDue.length) return null;
                    const xs = withDue.map(p => LABEL_W + dayOffset(new Date(p.due_date!), viewStart) * dayW + dayW/2);
                    const x1 = Math.max(LABEL_W + 4, Math.min(...xs) - nodeR + dOff);
                    const x2 = Math.max(x1 + 24, Math.max(...xs) + nodeR + dOff);
                    const pct = doneCnt / row.pieces.length;
                    const cy  = row.y + row.height / 2;
                    return (
                      <g style={{ pointerEvents: 'none' }}>
                        <rect x={x1} y={cy - 4} width={x2 - x1} height={8} rx={4} fill="var(--border)" />
                        <rect x={x1} y={cy - 4} width={(x2 - x1) * pct} height={8} rx={4} fill="#888888" />
                        <text x={x2 + 8} y={cy + 4} fontSize={9} fill="var(--text-3)">{doneCnt}/{row.pieces.length}</text>
                      </g>
                    );
                  })()}

                  {/* 結晶化バー */}
                  {isCrystal && (() => {
                    const withDue = row.pieces.filter(p => p.due_date);
                    if (!withDue.length) return null;
                    const allX = withDue.map(p => LABEL_W + dayOffset(new Date(p.due_date!), viewStart) * dayW + dayW/2);
                    const sp = row.pieces.find(p => p.start_date);
                    const x1 = sp ? LABEL_W + dayOffset(new Date(sp.start_date!), viewStart) * dayW + dayW/2
                                  : Math.min(...allX) - 12;
                    const x2 = Math.max(...allX) + nodeR;
                    const cy = row.y + row.height / 2;
                    const segW = row.pieces.length > 1 ? (x2 - x1) / row.pieces.length : 0;
                    return (
                      <g style={{ animation: 'cr-crystal 0.6s ease forwards', pointerEvents: 'none' }}>
                        <rect x={x1} y={cy - 5} width={x2 - x1} height={10} rx={5} fill="#CCCCCC" opacity={0.55} />
                        {row.pieces.map((_, i) => i > 0 && (
                          <line key={i} x1={x1 + segW*i} y1={cy - 5} x2={x1 + segW*i} y2={cy + 5}
                            stroke="var(--surface)" strokeWidth={1.5} />
                        ))}
                        <rect x={x2 + 6} y={cy - 9} width={32} height={16} rx={8} fill="var(--surface-sub)" />
                        <text x={x2 + 22} y={cy + 4} textAnchor="middle" fontSize={9} fontWeight={600}
                          fill="var(--text-3)">{row.pieces.length}件</text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {/* ── エッジ（張力インジケーター + バッファ数字）— ラベル列より右側のみ表示 ── */}
            <g clipPath="url(#timeline-clip)">
            {drawEdges.map(conn => {
              const from = nodeMap.get(conn.from_piece_id);
              const to   = nodeMap.get(conn.to_piece_id);
              if (!from || !to) return null;
              const fromP = pieceById.get(conn.from_piece_id);
              const toP   = pieceById.get(conn.to_piece_id);
              if (!fromP || !toP) return null;

              // ドラッグオフセット
              const fromDragX = chainDragId && rows.find(r => r.chainId === chainDragId)?.pieces.some(p => p.id === conn.from_piece_id)
                ? chainDragDelta * dayW : pieceDragRef.current?.pieceId === conn.from_piece_id ? pieceDragDelta * dayW : 0;
              const toDragX = chainDragId && rows.find(r => r.chainId === chainDragId)?.pieces.some(p => p.id === conn.to_piece_id)
                ? chainDragDelta * dayW : pieceDragRef.current?.pieceId === conn.to_piece_id ? pieceDragDelta * dayW : 0;

              const buf     = calcBuffer(fromP, toP);
              const es      = getEdgeStyle(buf, fromP.status);
              const edgeKey = `${conn.from_piece_id}-${conn.to_piece_id}`;
              const isHov   = hoveredEdge === edgeKey;

              const x1 = from.x + nodeR + fromDragX;
              const y1 = from.y;
              const x2 = to.x - nodeR + toDragX;
              const y2 = to.y;
              const cpx = Math.max(Math.abs(x2-x1) * 0.42, 28);
              const mx  = (x1 + x2) / 2;
              const my  = (y1 + y2) / 2;

              return (
                <g key={edgeKey}>
                  <path d={`M ${x1} ${y1} C ${x1+cpx} ${y1} ${x2-cpx} ${y2} ${x2} ${y2}`}
                    stroke="transparent" strokeWidth={12} fill="none"
                    onMouseEnter={() => setHoveredEdge(edgeKey)}
                    onMouseLeave={() => setHoveredEdge(null)} />
                  <path d={`M ${x1} ${y1} C ${x1+cpx} ${y1} ${x2-cpx} ${y2} ${x2} ${y2}`}
                    stroke={es.stroke} strokeWidth={isHov ? es.width + 1 : es.width}
                    fill="none" strokeDasharray={es.dash || undefined}
                    opacity={fromP.status === 'done' ? 0.45 : 0.8} strokeLinecap="round"
                    style={{ transition: 'stroke 0.3s ease' }}
                    onMouseEnter={() => setHoveredEdge(edgeKey)}
                    onMouseLeave={() => setHoveredEdge(null)} />
                  {isHov && buf !== null && (
                    <g>
                      <rect x={mx - 18} y={my - 11} width={36} height={16} rx={8}
                        fill="var(--surface)" stroke={es.stroke} strokeWidth={1} />
                      <text x={mx} y={my + 1} textAnchor="middle" fontSize={9.5} fontWeight={600}
                        fill={buf < 0 ? '#E60012' : buf < 2 ? '#C88A00' : 'var(--text-2)'}>
                        {buf >= 0 ? `+${buf}d` : `${buf}d`}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
            </g>{/* /timeline-clip エッジ */}

            {/* ── ノード ── */}
            {[...nodeMap.entries()].map(([pieceId, pos]) => {
              const piece = pieceById.get(pieceId);
              if (!piece) return null;

              const isPieceDrag  = pieceDragRef.current?.pieceId === pieceId;
              const isChainDrag  = chainDragId !== null &&
                rows.find(r => r.chainId === chainDragId)?.pieces.some(p => p.id === pieceId);
              const dragOffX = isPieceDrag ? pieceDragDelta * dayW : isChainDrag ? chainDragDelta * dayW : 0;

              const isSaving   = saving.has(pieceId);
              const isSnapping = snappingIds.has(pieceId);
              const isDone     = piece.status === 'done';
              const isActive   = piece.status === 'in_progress';
              const isLocked   = piece.status === 'locked';
              const isOverdue  = !!piece.due_date && new Date(piece.due_date) < today && !isDone;

              const fill   = isOverdue ? '#FFE8E8' : NODE_FILL[piece.status] ?? 'transparent';
              const stroke = isOverdue ? '#E60012' : NODE_STROKE[piece.status] ?? '#888888';
              const r      = isActive ? nodeR + 1.5 : nodeR;

              const isConnFrom = connectingFromId === pieceId;
              return (
                <g key={pieceId}
                  transform={`translate(${dragOffX}, 0)`}
                  style={{ cursor: connectingFromId ? (isConnFrom ? 'not-allowed' : 'crosshair') : (piece.due_date ? 'pointer' : 'default') }}
                  onMouseDown={e => { if (!connectingFromId) handleNodeMouseDown(e, piece); }}
                  onClick={() => {
                    if (connectingFromId) { handleNodeClickForConnect(piece); return; }
                    handleNodeClick(piece);
                  }}
                  onContextMenu={e => handleNodeContextMenu(e, piece)}
                  onMouseEnter={e => {
                    if (pieceDragRef.current || chainDragRef.current) return;
                    setTooltip({ piece, x: e.clientX, y: e.clientY });
                  }}
                  onMouseMove={e => {
                    if (pieceDragRef.current || chainDragRef.current) return;
                    setTooltip(prev => prev?.piece.id === pieceId ? { piece, x: e.clientX, y: e.clientY } : prev);
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {/* 接続モード: from 円のリング */}
                  {isConnFrom && (
                    <circle cx={pos.x} cy={pos.y} r={r + 5}
                      fill="none" stroke="#B46400" strokeWidth={2} strokeDasharray="4 2" opacity={0.8}
                      style={{ pointerEvents: 'none' }} />
                  )}
                  {/* デュレーションバー */}
                  {pos.barEndX - pos.barStartX > 4 && (
                    <>
                      {/* 背景トラック */}
                      <rect x={pos.barStartX} y={pos.y - BAR_H/2}
                        width={pos.barEndX - pos.barStartX} height={BAR_H} rx={BAR_H/2}
                        fill={isDone ? '#E0E0E0' : isLocked ? '#E8E8E8' : '#D0D0D0'}
                        opacity={isDone ? 0.22 : isLocked ? 0.1 : 0.45} />
                      {/* 進捗フィル — in_progress かつ progress > 0 のときのみ */}
                      {isActive && (piece.progress ?? 0) > 0 && (
                        <rect x={pos.barStartX} y={pos.y - BAR_H/2}
                          width={(pos.barEndX - pos.barStartX) * (piece.progress ?? 0) / 100}
                          height={BAR_H} rx={BAR_H/2}
                          fill="#1A1A1A" opacity={0.30} />
                      )}
                    </>
                  )}

                  {/* ノード円 */}
                  <circle cx={pos.x} cy={pos.y} r={r}
                    fill={fill} stroke={stroke}
                    strokeWidth={isLocked ? 1.5 : isActive ? 0 : 1.5}
                    strokeDasharray={isLocked ? '3 2' : undefined}
                    opacity={isSaving ? 0.5 : 1}
                    style={{
                      transition: 'fill 0.3s ease, opacity 0.25s ease',
                      animation: isSnapping ? 'cr-snap 0.75s ease forwards' : undefined,
                    }} />

                  {isActive && !isOverdue && <circle cx={pos.x} cy={pos.y} r={3.5} fill="#FFFFFF" opacity={0.85} />}
                  {isDone && (
                    <path d={`M ${pos.x-3.5} ${pos.y+0.5} L ${pos.x-0.5} ${pos.y+3.5} L ${pos.x+4} ${pos.y-3}`}
                      stroke="#999999" strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  )}

                  {/* ドラッグ中日付 */}
                  {isPieceDrag && pieceDragDelta !== 0 && piece.due_date && (() => {
                    const nd = toDateStr(addDays(new Date(piece.due_date), pieceDragDelta));
                    return (
                      <g>
                        <rect x={pos.x - 22} y={pos.y - r - 22} width={44} height={16} rx={4} fill="#1A1A1A" />
                        <text x={pos.x} y={pos.y - r - 10} textAnchor="middle" fontSize={9} fill="#FFFFFF" fontWeight={600}>
                          {nd.slice(5).replace('-', '/')}
                        </text>
                      </g>
                    );
                  })()}

                  {/* 期限ラベル */}
                  {piece.due_date && !isDone && !isPieceDrag && zoomLevel === 'day' && (
                    <text x={pos.x} y={pos.y - r - 5} textAnchor="middle" fontSize={8}
                      fill={isOverdue ? '#E60012' : 'var(--text-3)'} opacity={0.65}>
                      {piece.due_date.slice(5).replace('-', '/')}
                    </text>
                  )}

                  {/* タイトル・担当者はホバーツールチップで確認 */}

                  {isSnapping && (
                    <circle cx={pos.x} cy={pos.y} r={nodeR + 7} fill="none" stroke="#1A1A1A" strokeWidth={1}
                      style={{ animation: 'cr-snap 0.75s ease forwards' }} opacity={0.25} />
                  )}

                  {/* 接続モード — ターゲット用ヒットエリア（最前面に配置してクリックを確実に捕捉） */}
                  {connectingFromId && connectingFromId !== pieceId && (
                    <circle cx={pos.x} cy={pos.y} r={r + 8}
                      fill="rgba(180,100,0,0.06)"
                      stroke="#B46400" strokeWidth={1} strokeDasharray="3 2" opacity={0.6}
                      style={{ cursor: 'crosshair', pointerEvents: 'all' }}
                      onClick={e => { e.stopPropagation(); handleNodeClickForConnect(piece); }}
                    />
                  )}

                  {/* カスケードバッジ — ドラッグ中かつ下流ピースあり */}
                  {isPieceDrag && cascadeIds.size > 0 && pieceDragDelta !== 0 && (
                    <g pointerEvents="none">
                      <rect x={pos.x + r + 2} y={pos.y - 10} width={28} height={12} rx={3}
                        fill="#B46400" opacity={0.85} />
                      <text x={pos.x + r + 16} y={pos.y - 2} textAnchor="middle"
                        fontSize={7.5} fill="#FFFFFF" fontWeight={700}>
                        ↓{cascadeIds.size}件
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* カスケードゴースト — ドラッグ中の下流ピースをプレビュー */}
            {cascadeIds.size > 0 && pieceDragDelta !== 0 && [...cascadeIds].map(cId => {
              const pos = nodeMap.get(cId);
              if (!pos) return null;
              const ghostX = pos.x + pieceDragDelta * dayW;
              return (
                <g key={`ghost-${cId}`} pointerEvents="none" opacity={0.45}>
                  {pos.barEndX - pos.barStartX > 4 && (
                    <rect x={pos.barStartX + pieceDragDelta * dayW} y={pos.y - BAR_H/2}
                      width={pos.barEndX - pos.barStartX} height={BAR_H} rx={BAR_H/2}
                      fill="#B46400" opacity={0.15} />
                  )}
                  <circle cx={ghostX} cy={pos.y} r={nodeR}
                    fill="none" stroke="#B46400" strokeWidth={1.5} strokeDasharray="3 2" />
                  <line x1={pos.x} y1={pos.y} x2={ghostX} y2={pos.y}
                    stroke="#B46400" strokeWidth={0.8} strokeDasharray="4 3" opacity={0.35} />
                </g>
              );
            })}

            {!loading && rows.length === 0 && (
              <text x={svgW/2} y={svgH/2} textAnchor="middle" fontSize={12} fill="var(--text-3)" opacity={0.5}>
                ピースがありません
              </text>
            )}
          </svg>}
        </div>
        </div>{/* end: position:relative wrapper */}

      </div>

      {/* ── ピース新規作成モーダル ── */}
      {createModal && (
        <PieceCreateModal
          projects={projects}
          initialStartDate={createModal.startDate}
          initialDueDate={createModal.dueDate}
          initialProjectId={createModal.projectId}
          onClose={() => setCreateModal(null)}
          onCreate={async (body) => {
            const newPiece = await pieceApi.create(body);
            await load();
            setCreateModal(null);
            setSelectedPieceId(newPiece.id);
          }}
        />
      )}

      {/* ── ピース詳細サイドパネル ── */}
      {selectedPieceId && (
        <PieceEditPanel
          piece={pieces.find(p => p.id === selectedPieceId) ?? null}
          onClose={() => setSelectedPieceId(null)}
          onUpdate={(updated) => {
            setPieces(prev => prev.map(p => p.id === updated.id ? { ...p, ...updated } : p));
          }}
          onSave={async (id, body) => {
            setSaving(s => new Set([...s, id]));
            await pieceApi.update(id, body).catch(() => load());
            setSaving(s => { const n = new Set(s); n.delete(id); return n; });
          }}
          onStatusChange={async (id, status) => {
            setPieces(prev => prev.map(p => p.id === id ? { ...p, status: status as PieceRow['status'] } : p));
            await pieceApi.updateStatus(id, status).catch(() => load());
          }}
          navigate={navigate}
          connections={connections}
          allPieces={pieces}
          onAddConnection={async (fromId, toId, type) => {
            await pieceApi.connect(fromId, { to_piece_id: toId, type });
            const conns = await pieceApi.getConnections();
            setConnections(conns);
          }}
          onDeleteConnection={async (connId) => {
            await pieceApi.deleteConnection(connId);
            setConnections(prev => prev.filter(c => c.id !== connId));
          }}
        />
      )}

      {/* ── 接続コンテキストメニュー ── */}
      {contextMenu && (
        <>
          {/* オーバーレイ（クリックで閉じる） */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 299 }}
            onClick={() => setContextMenu(null)}
            onContextMenu={e => { e.preventDefault(); setContextMenu(null); }}
          />
          <div style={{
            position: 'fixed',
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            top: Math.min(contextMenu.y, window.innerHeight - 160),
            zIndex: 300,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 6, boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            padding: '6px 0', minWidth: 180,
            fontFamily: 'system-ui,-apple-system,sans-serif',
          }}>
            {/* ピース名ヘッダー */}
            <div style={{ padding: '4px 14px 8px', borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 1 }}>タスク</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                {contextMenu.piece.title}
              </div>
            </div>

            {/* 接続元にする */}
            <button
              onClick={() => {
                setConnectingFromId(contextMenu.piece.id);
                setContextMenu(null);
                setSelectedPieceId(null);
              }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                padding: '7px 14px', fontSize: 11, color: 'var(--text-1)', cursor: 'pointer' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              ⬤ この◯から接続する
            </button>

            {/* このピースへの接続を削除 */}
            {connections.filter(c => c.from_piece_id === contextMenu.piece.id || c.to_piece_id === contextMenu.piece.id).map(c => {
              const other = pieces.find(p => p.id === (c.from_piece_id === contextMenu.piece.id ? c.to_piece_id : c.from_piece_id));
              const arrow = c.from_piece_id === contextMenu.piece.id ? '→' : '←';
              return (
                <button key={c.id}
                  onClick={async () => {
                    await pieceApi.deleteConnection(c.id);
                    setConnections(prev => prev.filter(x => x.id !== c.id));
                    setContextMenu(null);
                  }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                    padding: '7px 14px', fontSize: 11, color: '#E60012', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FFF0F0')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  × {arrow} {other?.title?.slice(0, 20) ?? '?'} の接続を削除
                </button>
              );
            })}

            {/* タスク詳細を開く */}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 4 }}>
              <button
                onClick={() => {
                  setSelectedPieceId(contextMenu.piece.id);
                  setContextMenu(null);
                }}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
                  padding: '7px 14px', fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                ☰ タスク詳細を開く
              </button>
            </div>
          </div>
        </>
      )}

      {/* 接続モード中バナー */}
      {connectingFromId && (() => {
        const fromPiece = pieces.find(p => p.id === connectingFromId);
        return (
          <div style={{
            position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: '#1A1A1A', color: '#FAFAF8', borderRadius: 8,
            padding: '10px 20px', fontSize: 12, zIndex: 350,
            display: 'flex', alignItems: 'center', gap: 12,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
          }}>
            <span style={{ color: '#B46400' }}>⬤</span>
            <span>「{fromPiece?.title?.slice(0, 20)}」から接続中 — 接続先の◯をクリック</span>
            <button onClick={() => setConnectingFromId(null)} style={{
              background: 'rgba(255,255,255,0.12)', border: 'none', color: '#FAFAF8',
              borderRadius: 4, padding: '3px 8px', fontSize: 10, cursor: 'pointer',
            }}>ESC でキャンセル</button>
          </div>
        );
      })()}

      {/* ── ノードホバーツールチップ ── */}
      {tooltip && (() => {
        const p = tooltip.piece;
        const isOverdue  = !!p.due_date && new Date(p.due_date) < today && p.status !== 'done';
        const isConflict = conflictedPieceIds.has(p.id) && p.status !== 'done';
        const daysOver  = isOverdue ? Math.round((today.getTime() - new Date(p.due_date!).getTime()) / 86400000) : 0;
        const STATUS_LABEL: Record<string, string> = {
          done: '完了', in_progress: '対応中', ready: '待機中', locked: 'ロック中',
        };
        const STATUS_COLOR: Record<string, string> = {
          done: 'var(--text-3)', in_progress: 'var(--text-1)', ready: 'var(--text-2)', locked: 'var(--text-3)',
        };
        // ビューポートはみ出し対策
        const flipX = tooltip.x + 180 > window.innerWidth;
        const left  = flipX ? tooltip.x - 168 : tooltip.x + 14;
        const top   = Math.min(tooltip.y - 10, window.innerHeight - 130);
        return (
          <div style={{
            position: 'fixed', left, top, zIndex: 300, pointerEvents: 'none',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            padding: '10px 12px', minWidth: 154, maxWidth: 210,
            fontFamily: 'system-ui,-apple-system,sans-serif',
          }}>
            {/* タイトル */}
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)',
              marginBottom: 6, lineHeight: 1.3,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {p.title}
            </div>

            {/* ステータス + 担当者 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, color: STATUS_COLOR[p.status] ?? 'var(--text-2)' }}>
                {STATUS_LABEL[p.status] ?? p.status}
              </span>
              {p.assignee_name && (
                <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 8 }}>
                  {p.assignee_name}
                </span>
              )}
            </div>

            {/* 進捗バー（in_progress のみ） */}
            {p.status === 'in_progress' && (p.progress ?? 0) > 0 && (
              <div style={{ marginBottom: 5 }}>
                <div style={{ height: 3, borderRadius: 99, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${p.progress}%`, background: 'var(--text-1)', borderRadius: 99 }} />
                </div>
                <div style={{ fontSize: 8.5, color: 'var(--text-3)', textAlign: 'right', marginTop: 2 }}>
                  {p.progress}%
                </div>
              </div>
            )}

            {/* 期間 */}
            {(p.start_date || p.due_date) && (
              <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: isOverdue ? 5 : 0 }}>
                {p.start_date
                  ? `${p.start_date.slice(5).replace('-','/')} → ${p.due_date?.slice(5).replace('-','/') ?? '—'}`
                  : `締切 ${p.due_date?.slice(5).replace('-','/')}`}
              </div>
            )}

            {/* 遅延バッジ */}
            {isOverdue && (
              <div style={{ marginTop: 5, fontSize: 9, fontWeight: 700, color: '#C0392B',
                background: '#FEF0EF', borderRadius: 4, padding: '2px 6px', display: 'inline-block' }}>
                ⚠ {daysOver}日超過
              </div>
            )}
            {/* 競合バッジ */}
            {isConflict && (
              <div style={{ marginTop: 5, fontSize: 9, fontWeight: 700, color: '#E67000',
                background: '#FFF3E0', borderRadius: 4, padding: '2px 6px', display: 'inline-block' }}>
                チェーン競合 — 前ピースと期日が重なっています
              </div>
            )}

            {/* プロジェクト名 */}
            {p.project_name && (
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border-sub)',
                fontSize: 8.5, color: 'var(--text-3)' }}>
                {p.project_name}
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// ── ピース新規作成モーダル ────────────────────────────────────
interface PieceCreateModalProps {
  projects: Project[];
  initialStartDate?: string;
  initialDueDate?: string;
  initialProjectId?: string;
  onClose: () => void;
  onCreate: (body: Record<string, unknown>) => Promise<void>;
}
function PieceCreateModal({ projects, initialStartDate, initialDueDate, initialProjectId, onClose, onCreate }: PieceCreateModalProps) {
  const [title,      setTitle]      = useState('');
  const [projectId,  setProjectId]  = useState(initialProjectId ?? '');
  const [startDate,  setStartDate]  = useState((initialStartDate ?? '').slice(0, 10));
  const [dueDate,    setDueDate]    = useState((initialDueDate   ?? '').slice(0, 10));
  const [saving,     setSaving]     = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    await onCreate({
      title: title.trim(),
      project_id: projectId || null,
      start_date: startDate || null,
      due_date:   dueDate   || null,
      status:     'ready',
    }).finally(() => setSaving(false));
  };

  const inputSt: React.CSSProperties = {
    width: '100%', fontSize: 12, padding: '6px 9px',
    border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
    background: 'var(--surface-sub)', color: 'var(--text-1)',
    outline: 'none', boxSizing: 'border-box',
    fontFamily: 'system-ui,-apple-system,sans-serif',
  };
  const labelSt: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em',
    marginBottom: 5, display: 'block',
  };

  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 400 }}
        onClick={onClose} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 340, background: 'var(--surface)', borderRadius: 10,
        boxShadow: '0 8px 40px rgba(0,0,0,0.18)', zIndex: 401,
        fontFamily: 'system-ui,-apple-system,sans-serif',
        padding: '20px 20px 16px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>新規タスク</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18 }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>TITLE *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="タスク名を入力..."
              autoFocus style={inputSt} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={labelSt}>PROJECT</label>
            <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...inputSt, height: 30 }}>
              <option value="">プロジェクトなし</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div>
              <label style={labelSt}>開始日</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputSt} />
            </div>
            <div>
              <label style={labelSt}>締切日</label>
              <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputSt} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{
              padding: '7px 16px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
              background: 'var(--surface-sub)', color: 'var(--text-2)', cursor: 'pointer', fontSize: 12,
            }}>キャンセル</button>
            <button type="submit" disabled={!title.trim() || saving} style={{
              padding: '7px 18px', border: 'none', borderRadius: 'var(--r-sm)',
              background: 'var(--text-1)', color: '#FAFAF8', cursor: 'pointer', fontSize: 12, fontWeight: 600,
              opacity: (!title.trim() || saving) ? 0.5 : 1,
            }}>作成</button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── ピース詳細サイドパネル ────────────────────────────────────
interface PieceEditPanelProps {
  piece: PieceRow | null;
  onClose: () => void;
  onUpdate: (updated: Partial<PieceRow> & { id: string }) => void;
  onSave: (id: string, body: Record<string, unknown>) => Promise<void>;
  onStatusChange: (id: string, status: string) => Promise<void>;
  navigate: (path: string) => void;
  connections: Connection[];
  allPieces: PieceRow[];
  onAddConnection: (fromId: string, toId: string, type: string) => Promise<void>;
  onDeleteConnection: (connId: string) => Promise<void>;
}
function PieceEditPanel({ piece, onClose, onUpdate, onSave, onStatusChange, navigate, connections, allPieces, onAddConnection, onDeleteConnection }: PieceEditPanelProps) {
  const STATUS_CYCLE = ['locked', 'ready', 'in_progress', 'done'] as const;
  const STATUS_LABEL: Record<string, string> = {
    locked: 'ロック', ready: '待機', in_progress: '進行中', done: '完了',
  };

  const [localTitle,     setLocalTitle]     = useState(piece?.title     ?? '');
  const [localStartDate, setLocalStartDate] = useState((piece?.start_date ?? '').slice(0, 10));
  const [localDueDate,   setLocalDueDate]   = useState((piece?.due_date   ?? '').slice(0, 10));
  const [localProgress,  setLocalProgress]  = useState(piece?.progress   ?? 0);
  const [connNewTo,      setConnNewTo]      = useState('');
  const [connNewType] = useState('sequential');
  const [connAdding,     setConnAdding]     = useState(false);

  useEffect(() => {
    if (!piece) return;
    setLocalTitle(piece.title ?? '');
    setLocalProgress(piece.progress ?? 0);
    setConnNewTo('');
  }, [piece?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!piece) return;
    setLocalStartDate((piece.start_date ?? '').slice(0, 10));
  }, [piece?.start_date]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!piece) return;
    setLocalDueDate((piece.due_date ?? '').slice(0, 10));
  }, [piece?.due_date]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (!piece) return null;

  const handleTitleBlur = async () => {
    const trimmed = localTitle.trim();
    if (!trimmed || trimmed === piece.title) return;
    onUpdate({ id: piece.id, title: trimmed });
    await onSave(piece.id, { title: trimmed });
  };

  const handleStartBlur = async () => {
    const cur = (piece.start_date ?? '').slice(0, 10);
    if (localStartDate === cur) return;
    const val = localStartDate || null;
    onUpdate({ id: piece.id, start_date: val ?? undefined });
    await onSave(piece.id, { start_date: val });
  };

  const handleDueBlur = async () => {
    const cur = (piece.due_date ?? '').slice(0, 10);
    if (localDueDate === cur) return;
    const val = localDueDate || null;
    onUpdate({ id: piece.id, due_date: val ?? undefined });
    await onSave(piece.id, { due_date: val });
  };

  const handleProgressChange = async (val: number) => {
    setLocalProgress(val);
    onUpdate({ id: piece.id, progress: val });
    await onSave(piece.id, { progress: val });
  };

  const handleStatusClick = async (status: typeof STATUS_CYCLE[number]) => {
    await onStatusChange(piece.id, status);
  };

  const handleAddConnection = async () => {
    if (!connNewTo) return;
    setConnAdding(true);
    await onAddConnection(piece.id, connNewTo, connNewType).catch(() => {});
    setConnAdding(false);
    setConnNewTo('');
  };

  const inputSt: React.CSSProperties = {
    width: '100%', fontSize: 11, padding: '5px 8px',
    border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
    background: 'var(--surface-sub)', color: 'var(--text-1)',
    outline: 'none', boxSizing: 'border-box',
    fontFamily: 'system-ui,-apple-system,sans-serif',
  };
  const labelSt: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em',
    marginBottom: 5, display: 'block',
  };

  const pieceConns = connections.filter(c => c.from_piece_id === piece.id || c.to_piece_id === piece.id);
  const outgoing = pieceConns.filter(c => c.from_piece_id === piece.id);
  const incoming = pieceConns.filter(c => c.to_piece_id   === piece.id);

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: 288,
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.06)',
      zIndex: 200, display: 'flex', flexDirection: 'column',
      fontFamily: 'system-ui,-apple-system,sans-serif',
    }}>
      {/* ヘッダー */}
      <div style={{
        height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', borderBottom: '1px solid var(--border)', flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '-0.01em' }}>
          タスク詳細
        </span>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-3)', fontSize: 16, lineHeight: 1, padding: '4px 6px',
        }}>×</button>
      </div>

      {/* スクロール本体 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>

        {/* タイトル */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelSt}>TITLE</label>
          <textarea value={localTitle} onChange={e => setLocalTitle(e.target.value)}
            onBlur={handleTitleBlur} rows={2}
            style={{ ...inputSt, resize: 'none', lineHeight: 1.5 }} />
        </div>

        {/* ステータス */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelSt}>STATUS</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {STATUS_CYCLE.map(s => (
              <button key={s} onClick={() => handleStatusClick(s)} style={{
                flex: 1, fontSize: 9, padding: '5px 0',
                border: `1px solid ${piece.status === s ? 'var(--text-1)' : 'var(--border)'}`,
                borderRadius: 'var(--r-sm)',
                background: piece.status === s ? 'var(--text-1)' : 'var(--surface-sub)',
                color: piece.status === s ? '#FAFAF8' : 'var(--text-3)',
                cursor: 'pointer', fontWeight: piece.status === s ? 700 : 400,
              }}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {/* 進捗 (in_progress のみ) */}
        {piece.status === 'in_progress' && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelSt}>PROGRESS — {localProgress}%</label>
            <input type="range" min={0} max={100} step={5} value={localProgress}
              onChange={e => setLocalProgress(Number(e.target.value))}
              onMouseUp={() => handleProgressChange(localProgress)}
              onTouchEnd={() => handleProgressChange(localProgress)}
              style={{ width: '100%', accentColor: 'var(--text-1)' }} />
          </div>
        )}

        {/* 日付 */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelSt}>DATES</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div>
              <div style={{ fontSize: 8, color: 'var(--text-3)', marginBottom: 3 }}>開始</div>
              <input type="date" value={localStartDate}
                onChange={e => setLocalStartDate(e.target.value)}
                onBlur={handleStartBlur}
                style={{ ...inputSt, fontSize: 10 }} />
            </div>
            <div>
              <div style={{ fontSize: 8, color: 'var(--text-3)', marginBottom: 3 }}>締切</div>
              <input type="date" value={localDueDate}
                onChange={e => setLocalDueDate(e.target.value)}
                onBlur={handleDueBlur}
                style={{ ...inputSt, fontSize: 10 }} />
            </div>
          </div>
        </div>

        {/* 接続 */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelSt}>CONNECTIONS</label>
          {outgoing.length === 0 && incoming.length === 0 && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 8 }}>接続なし</div>
          )}
          {outgoing.map(c => {
            const target = allPieces.find(p => p.id === c.to_piece_id);
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>→</span>
                <span style={{ fontSize: 10, color: 'var(--text-2)', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {target?.title ?? c.to_piece_id}
                </span>
                <button onClick={() => onDeleteConnection(c.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px',
                  color: 'var(--text-3)', fontSize: 11, flexShrink: 0,
                }}>×</button>
              </div>
            );
          })}
          {incoming.map(c => {
            const src = allPieces.find(p => p.id === c.from_piece_id);
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>←</span>
                <span style={{ fontSize: 10, color: 'var(--text-2)', flex: 1,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {src?.title ?? c.from_piece_id}
                </span>
                <button onClick={() => onDeleteConnection(c.id)} style={{
                  background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px',
                  color: 'var(--text-3)', fontSize: 11, flexShrink: 0,
                }}>×</button>
              </div>
            );
          })}
          {/* 接続追加 */}
          <div style={{ marginTop: 8, display: 'flex', gap: 4 }}>
            <select value={connNewTo} onChange={e => setConnNewTo(e.target.value)}
              style={{ ...inputSt, flex: 1, height: 26, fontSize: 10 }}>
              <option value="">接続先...</option>
              {allPieces.filter(p => p.id !== piece.id).map(p => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
            <button onClick={handleAddConnection} disabled={!connNewTo || connAdding}
              style={{
                padding: '0 8px', border: 'none', borderRadius: 'var(--r-sm)',
                background: 'var(--text-1)', color: '#FAFAF8', cursor: 'pointer', fontSize: 10,
                opacity: (!connNewTo || connAdding) ? 0.4 : 1, flexShrink: 0,
              }}>追加</button>
          </div>
        </div>

      </div>

      {/* フッター: ボードへのリンク */}
      <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
        <button onClick={() => navigate('/board')} style={{
          width: '100%', padding: '7px 0', border: '1px solid var(--border)',
          borderRadius: 'var(--r-sm)', background: 'none', color: 'var(--text-2)',
          cursor: 'pointer', fontSize: 11,
        }}>
          ボードで開く →
        </button>
      </div>
    </div>
  );
}

// ── スタイル ─────────────────────────────────────────────────
const navBtnSt: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
  padding: '4px 7px', cursor: 'pointer', color: 'var(--text-2)',
  display: 'flex', alignItems: 'center', gap: 3, fontSize: 11,
};
