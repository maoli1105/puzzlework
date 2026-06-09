import React, {
  useEffect, useState, useCallback, useRef, useLayoutEffect, useMemo,
} from 'react';
import { Piece, PieceStatus, Project, Connection } from '../../types';
import {
  pieces as pieceApi, users as userApi, projects as projectApi, ai as aiApi,
} from '../../services/api';
import {
  RefreshCw, Lock, CheckCircle2, Zap, CircleCheck,
  Download, Upload, Search, X, Link2,
  LayoutGrid, List, ChevronUp, ChevronDown, ChevronRight, Sparkles,
  AlertTriangle,
} from 'lucide-react';
import BulkImportModal from '../../components/admin/BulkImportModal';
import PieceDetailPanel from '../../components/board/PieceDetailPanel';
import AiParseModal from '../../components/board/AiParseModal';
import { SkeletonTable } from '../../components/common/Skeleton';
import ErrorBoundary from '../../components/common/ErrorBoundary';
import { useWebSocket } from '../../hooks/useWebSocket';
import { WSEvent } from '../../types';

interface Worker { id: string; name: string; active_pieces: number; }
interface ArrowPath {
  id: string; d: string; type: string;
  active: boolean; // source piece is done
  highlighted: boolean;
}

const COLUMNS: {
  status: PieceStatus; label: string; Icon: React.ElementType;
  accent: string; bg: string; border: string;
}[] = [
  { status: 'locked',      label: 'ロック中',   Icon: Lock,         accent: '#888888', bg: 'var(--surface-sub, #F8F8F7)', border: 'var(--border)' },
  { status: 'ready',       label: '着手可能',   Icon: CheckCircle2, accent: '#555555', bg: 'var(--surface-sub, #F8F8F7)', border: 'var(--border)' },
  { status: 'in_progress', label: '進行中',     Icon: Zap,          accent: '#B46400', bg: 'rgba(180,100,0,0.03)',         border: 'rgba(180,100,0,0.25)' },
  { status: 'done',        label: '完了',       Icon: CircleCheck,  accent: '#AAAAAA', bg: 'var(--surface-sub, #F8F8F7)', border: 'var(--border)' },
];

// Priority → hue color
const P_COLORS = ['', '#D1FAE5', '#BAE6FD', '#FDE68A', '#FDBA74', '#FCA5A5'];
const P_LABELS = ['', 'P1', 'P2', 'P3', 'P4', 'P5'];
const P_TEXT   = ['', '#065F46', '#0369A1', '#92400E', '#C2410C', '#B91C1C'];

/** 期限を相対ラベルに変換 */
function relativeDate(dateStr: string): { label: string; urgent: boolean } {
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff < -1) return { label: `${Math.abs(diff)}日超過`, urgent: true };
  if (diff === -1) return { label: '昨日', urgent: true };
  if (diff === 0)  return { label: '今日', urgent: true };
  if (diff === 1)  return { label: '明日', urgent: false };
  if (diff <= 7)   return { label: `${diff}日後`, urgent: false };
  return { label: d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }), urgent: false };
}

export default function KanbanPage() {
  const [allPieces, setAllPieces]   = useState<Piece[]>([]);
  const [workers, setWorkers]       = useState<Worker[]>([]);
  const [projects, setProjects]     = useState<Project[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [dragging, setDragging]     = useState<string | null>(null);
  const [dragOver, setDragOver]     = useState<PieceStatus | null>(null);
  const [dragOverCard, setDragOverCard] = useState<string | null>(null);
  const [dragOverPos, setDragOverPos]  = useState<'above' | 'below'>('below');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterProject,  setFilterProject]  = useState('');
  const [filterText,     setFilterText]     = useState('');
  const [loading, setLoading]       = useState(true);
  const [selected, setSelected]     = useState<Set<string>>(new Set());
  const [bulkAssignee, setBulkAssignee] = useState('');
  const [showImport,    setShowImport]    = useState(false);
  const [showAiParse,  setShowAiParse]  = useState(false);
  const [currentPlan,  setCurrentPlan]  = useState<string>('free');
  const [viewMode, setViewMode]     = useState<'board' | 'table'>('board');
  const [sortKey, setSortKey]       = useState<'title' | 'status' | 'due_date' | 'priority' | 'progress'>('priority');
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc');
  const [detailPiece, setDetailPiece] = useState<Piece | null>(null);
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null);
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string | null>>(new Set());
  const [showArrows,   setShowArrows]   = useState(false);   // デフォルトOFF
  const [focusActive,  setFocusActive]  = useState(false);   // 進行中+待機のみ表示
  const [cardDense,    setCardDense]    = useState(true);    // コンパクトカードモード

  // ── 接続モード ──────────────────────────────────────────
  const [connectMode,   setConnectMode]   = useState(false);
  const [connectSource, setConnectSource] = useState<string | null>(null);
  const [connectType,   setConnectType]   = useState<'sequential' | 'parallel' | 'conditional'>('sequential');

  // ── ホバー依存チェーン ──────────────────────────────────
  const [hoveredPiece, setHoveredPiece] = useState<string | null>(null);
  const [hoveredArrow,  setHoveredArrow]  = useState<string | null>(null);

  // ── SVG矢印 ─────────────────────────────────────────────
  const [arrowPaths, setArrowPaths] = useState<ArrowPath[]>([]);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());

  // ── Undo ────────────────────────────────────────────────
  type UndoEntry =
    | { type: 'status'; pieceId: string; prevStatus: PieceStatus; nextStatus: PieceStatus; title: string }
    | { type: 'assign'; pieceId: string; prevAssignee: string | null; nextAssignee: string | null; title: string };
  const undoStack = useRef<UndoEntry[]>([]);

  function pushUndo(entry: UndoEntry) {
    undoStack.current = [...undoStack.current.slice(-19), entry];
  }

  useEffect(() => {
    async function handleUndo(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'z') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      const entry = undoStack.current[undoStack.current.length - 1];
      if (!entry) return;
      undoStack.current = undoStack.current.slice(0, -1);
      if (entry.type === 'status') {
        setAllPieces(prev => prev.map(p => p.id === entry.pieceId ? { ...p, status: entry.prevStatus } : p));
        pieceApi.updateStatus(entry.pieceId, entry.prevStatus).catch(() => {});
        showToast(`「${entry.title}」を元に戻しました`);
      } else if (entry.type === 'assign') {
        setAllPieces(prev => prev.map(p => p.id === entry.pieceId ? { ...p, assignee_id: entry.prevAssignee } : p));
        pieceApi.assign(entry.pieceId, entry.prevAssignee).catch(() => {});
        showToast(`「${entry.title}」の担当者を元に戻しました`);
      }
    }
    document.addEventListener('keydown', handleUndo);
    return () => document.removeEventListener('keydown', handleUndo);
  }, []);

  // Escape でconnectモード解除
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && connectMode) {
        setConnectMode(false); setConnectSource(null);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [connectMode]);

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2800);
  }

  const loadConnections = useCallback(async () => {
    try { setConnections(await pieceApi.getConnections()); } catch {}
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [ps, ws, pjs] = await Promise.all([pieceApi.list(), userApi.workers(), projectApi.list()]);
    setAllPieces(ps); setWorkers(ws); setProjects(pjs);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    loadConnections();
  }, [load, loadConnections]);

  // ワーカーがステータスを更新したらリアルタイムで反映
  useWebSocket(useCallback((event: WSEvent) => {
    if (event.type === 'piece_status_changed' || event.type === 'piece_done' || event.type === 'auto_promoted') {
      load();
    }
  }, [load]));

  // プラン取得
  useEffect(() => {
    import('../../services/api').then(({ auth }) => {
      auth.me().then((me: { plan?: string }) => setCurrentPlan(me.plan ?? 'free')).catch(() => {});
    });
  }, []);

  // ── フィルター ───────────────────────────────────────────
  const filtered = allPieces.filter(p => {
    if (filterAssignee && p.assignee_id !== filterAssignee) return false;
    if (filterProject  && p.project_id  !== filterProject)  return false;
    if (filterText && !p.title.toLowerCase().includes(filterText.toLowerCase())) return false;
    if (focusActive && p.status !== 'in_progress' && p.status !== 'ready') return false;
    return true;
  });
  const hasFilter = !!(filterAssignee || filterProject || filterText);

  // フォーカスモード時は active な列のみ表示
  const visibleColumns = focusActive
    ? COLUMNS.filter(c => c.status === 'in_progress' || c.status === 'ready')
    : COLUMNS;

  // カードごとの依存数（upstream / downstream）を事前計算
  const connMap = useMemo(() => {
    const map = new Map<string, { up: number; down: number; upDone: number }>();
    for (const c of connections) {
      if (!map.has(c.from_piece_id)) map.set(c.from_piece_id, { up: 0, down: 0, upDone: 0 });
      if (!map.has(c.to_piece_id))   map.set(c.to_piece_id,   { up: 0, down: 0, upDone: 0 });
      map.get(c.from_piece_id)!.down++;
      map.get(c.to_piece_id)!.up++;
      // upstream が done かどうか
      const fromPiece = allPieces.find(p => p.id === c.from_piece_id);
      if (fromPiece?.status === 'done') map.get(c.to_piece_id)!.upDone++;
    }
    return map;
  }, [connections, allPieces]);

  // ── 依存チェーン計算 ─────────────────────────────────────
  const getDepChain = useCallback((pieceId: string | null): Set<string> => {
    if (!pieceId) return new Set();
    const result = new Set<string>([pieceId]);
    const addUp   = (id: string) => connections.filter(c => c.to_piece_id   === id).forEach(c => { if (!result.has(c.from_piece_id)) { result.add(c.from_piece_id); addUp(c.from_piece_id); } });
    const addDown = (id: string) => connections.filter(c => c.from_piece_id === id).forEach(c => { if (!result.has(c.to_piece_id))   { result.add(c.to_piece_id);   addDown(c.to_piece_id); } });
    addUp(pieceId); addDown(pieceId);
    return result;
  }, [connections]);

  const highlightedIds = hoveredPiece ? getDepChain(hoveredPiece) : null;

  // ── SVG矢印再計算（showArrows=false の間はスキップしてフリーズ防止）
  useLayoutEffect(() => {
    if (!showArrows) {
      setArrowPaths(prev => prev.length === 0 ? prev : []);
      return;
    }
    const visibleIds = new Set(filtered.map(p => p.id));
    const paths: ArrowPath[] = [];
    for (const c of connections) {
      if (!visibleIds.has(c.from_piece_id) || !visibleIds.has(c.to_piece_id)) continue;
      const fromEl = cardRefs.current.get(c.from_piece_id);
      const toEl   = cardRefs.current.get(c.to_piece_id);
      if (!fromEl || !toEl) continue;
      const fr = fromEl.getBoundingClientRect();
      const tr = toEl.getBoundingClientRect();
      if (fr.width === 0 || tr.width === 0) continue;
      const fx = fr.right - 2, fy = fr.top + fr.height * 0.5;
      const tx = tr.left  + 2, ty = tr.top  + tr.height * 0.5;
      const dx = Math.max(Math.abs(tx - fx) * 0.55, 48);
      const d = `M${fx},${fy} C${fx + dx},${fy} ${tx - dx},${ty} ${tx},${ty}`;
      const fromPiece = allPieces.find(p => p.id === c.from_piece_id);
      const isHigh = !!(hoveredPiece && (c.from_piece_id === hoveredPiece || c.to_piece_id === hoveredPiece));
      paths.push({ id: c.id, d, type: c.type, active: fromPiece?.status === 'done', highlighted: isHigh });
    }
    // 前回と同内容なら参照を保持して再レンダーをスキップ（無限ループ防止）
    setArrowPaths(prev => {
      if (
        prev.length === paths.length &&
        prev.every((p, i) =>
          p.id === paths[i].id &&
          p.d  === paths[i].d &&
          p.active      === paths[i].active &&
          p.highlighted === paths[i].highlighted
        )
      ) return prev;
      return paths;
    });
  }); // runs every render — getBoundingClientRect is cheap; state guard above prevents infinite loop

  // ── 接続モード: カードクリック ───────────────────────────
  async function handleCardConnectClick(pieceId: string) {
    if (!connectSource) {
      setConnectSource(pieceId);
      return;
    }
    if (connectSource === pieceId) { setConnectSource(null); return; }
    try {
      await pieceApi.connect(connectSource, { to_piece_id: pieceId, type: connectType });
      await loadConnections();
      showToast('依存関係を接続しました');
    } catch { showToast('接続に失敗しました', false); }
    setConnectSource(null);
    setConnectMode(false);
  }

  // ── 接続削除 ────────────────────────────────────────────
  async function handleDeleteArrow(arrowId: string) {
    try {
      await pieceApi.deleteConnection(arrowId);
      setConnections(prev => prev.filter(c => c.id !== arrowId));
      showToast('接続を削除しました');
    } catch { showToast('削除に失敗しました', false); }
  }

  // ── ドラッグ ────────────────────────────────────────────
  const STATUS_LABEL: Record<string, string> = {
    locked: 'ロック中', ready: '着手可能', in_progress: '進行中', done: '完了',
  };

  async function handleDrop(targetStatus: PieceStatus) {
    if (!dragging) return;
    const piece = allPieces.find(p => p.id === dragging);
    if (!piece) { setDragging(null); setDragOver(null); setDragOverCard(null); return; }

    if (piece.status === targetStatus && dragOverCard && dragOverCard !== dragging) {
      const colPieces = [...allPieces.filter(p => p.status === targetStatus)]
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
      const targetIdx = colPieces.findIndex(p => p.id === dragOverCard);
      if (targetIdx !== -1) {
        const insertIdx = dragOverPos === 'above' ? targetIdx : targetIdx + 1;
        const before = colPieces[insertIdx - 1];
        const after  = colPieces[insertIdx];
        const bo = before && before.id !== dragging ? before.display_order ?? 0 : undefined;
        const ao = after  && after.id  !== dragging ? after.display_order  ?? 0 : undefined;
        const newOrder = bo !== undefined && ao !== undefined ? (bo + ao) / 2
          : bo !== undefined ? bo + 1 : ao !== undefined ? ao - 1 : 0;
        setAllPieces(prev => prev.map(p => p.id === dragging ? { ...p, display_order: newOrder } : p));
        pieceApi.reorder(dragging, bo, ao).catch(() => {});
      }
    } else if (piece.status !== targetStatus) {
      const prevStatus = piece.status;
      setAllPieces(prev => prev.map(p => p.id === dragging ? { ...p, status: targetStatus } : p));
      try {
        await pieceApi.updateStatus(dragging, targetStatus);
        pushUndo({ type: 'status', pieceId: dragging, prevStatus, nextStatus: targetStatus, title: piece.title });
        showToast(`「${piece.title}」→ ${STATUS_LABEL[targetStatus]}`);
      } catch {
        setAllPieces(prev => prev.map(p => p.id === dragging ? { ...p, status: prevStatus } : p));
        showToast('移動できませんでした', false);
      }
    }
    setDragging(null); setDragOver(null); setDragOverCard(null);
  }

  async function handleAssign(pieceId: string, assigneeId: string | null) {
    const piece = allPieces.find(p => p.id === pieceId);
    const prev = piece?.assignee_id ?? null;
    setAllPieces(ps => ps.map(p => p.id === pieceId ? { ...p, assignee_id: assigneeId } : p));
    try {
      await pieceApi.assign(pieceId, assigneeId);
      pushUndo({ type: 'assign', pieceId, prevAssignee: prev, nextAssignee: assigneeId, title: piece?.title ?? '' });
    } catch { setAllPieces(ps => ps.map(p => p.id === pieceId ? { ...p, assignee_id: prev } : p)); }
  }

  function exportCsv() {
    const rows = [
      ['タイトル', 'ステータス', '担当者', '優先度', 'スキルタグ', 'ビジネスインパクト（円）', '期限'],
      ...filtered.map(p => [
        p.title, STATUS_LABEL[p.status] ?? p.status,
        workers.find(w => w.id === p.assignee_id)?.name ?? '未割り当て',
        p.priority, (p.skill_tags ?? []).join('|'),
        p.business_impact ?? 0,
        p.due_date ? new Date(p.due_date).toLocaleDateString('ja-JP') : '',
      ]),
    ];
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kanban_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (loading) return <div style={{ padding: 24 }}><SkeletonTable rows={8} /></div>;

  return (
    <>
    <ErrorBoundary>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.ok ? '#18181B' : '#B91C1C',
          color: '#fff', padding: '9px 18px', borderRadius: 10,
          fontSize: 12, fontWeight: 500, zIndex: 9999,
          boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
          pointerEvents: 'none',
        }}>{toast.msg}</div>
      )}

      {/* SVG overlay for connection arrows — showArrows が true のときのみ表示 */}
      <svg
        style={{
          position: 'fixed', inset: 0, width: '100vw', height: '100vh',
          zIndex: 20,
          overflow: 'visible',
          opacity: showArrows ? 1 : 0,
          transition: 'opacity 0.2s',
          pointerEvents: 'none',   /* SVG全体は常に透過。矢印パス個別にstroke指定 */
        }}
      >
        <defs>
          <marker id="arrow-blue" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#888888" opacity="0.8" />
          </marker>
          <marker id="arrow-amber" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#B46400" opacity="0.85" />
          </marker>
          <marker id="arrow-green" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#555555" opacity="0.9" />
          </marker>
          <marker id="arrow-hover" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill="#E60012" />
          </marker>
        </defs>
        {arrowPaths.map(a => {
          const isHover = hoveredArrow === a.id;
          const col = a.highlighted ? '#E60012' : a.active ? '#555555' : a.type === 'conditional' ? '#B46400' : '#888888';
          const marker = a.highlighted ? 'arrow-hover' : a.active ? 'arrow-green' : a.type === 'conditional' ? 'arrow-amber' : 'arrow-blue';
          const opacity = hoveredPiece && !a.highlighted ? 0.1 : isHover ? 1 : 0.55;
          return (
            <g key={a.id} style={{ pointerEvents: showArrows ? 'auto' : 'none' }}>
              {/* clickable hitbox (wider invisible path) */}
              <path
                d={a.d} fill="none" stroke="transparent" strokeWidth={12}
                style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                onClick={() => handleDeleteArrow(a.id)}
                onMouseEnter={() => setHoveredArrow(a.id)}
                onMouseLeave={() => setHoveredArrow(null)}
              />
              <path
                d={a.d} fill="none"
                stroke={isHover ? '#EF4444' : col}
                strokeWidth={isHover ? 2 : a.highlighted ? 2 : 1.5}
                strokeDasharray={a.active ? undefined : a.type === 'conditional' ? '5 4' : undefined}
                markerEnd={isHover ? 'url(#arrow-hover)' : `url(#${marker})`}
                opacity={opacity}
                style={{ transition: 'opacity 0.15s, stroke 0.15s' }}
              />
            </g>
          );
        })}
      </svg>

      {/* Connect mode banner */}
      {connectMode && (
        <div style={{
          position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)',
          background: connectSource ? '#B46400' : 'var(--text-1)',
          color: '#fff', padding: '8px 20px', borderRadius: 99,
          fontSize: 12, fontWeight: 600, zIndex: 9998,
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
        }}>
          <Link2 size={13} />
          {connectSource
            ? `接続元を選択中 → 接続先をクリック`
            : '接続元カードをクリック'}
          <select
            value={connectType}
            onChange={e => setConnectType(e.target.value as typeof connectType)}
            onClick={e => e.stopPropagation()}
            style={{ marginLeft: 8, padding: '2px 6px', borderRadius: 6, border: 'none', fontSize: 11, background: 'rgba(255,255,255,0.2)', color: '#fff', cursor: 'pointer', outline: 'none' }}
          >
            <option value="sequential">sequential</option>
            <option value="parallel">parallel</option>
            <option value="conditional">conditional</option>
          </select>
          <button onClick={() => { setConnectMode(false); setConnectSource(null); }}
            style={{ marginLeft: 8, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 6, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>
            ✕ Esc
          </button>
        </div>
      )}

      <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* ── Header ─────────────────────────────────────────── */}
          <div className="page-toolbar" style={{
            height: 52, padding: '0 20px',
            background: 'var(--surface)', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>カンバン</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                {connections.length > 0 ? `${connections.length}件の依存関係` : 'ドラッグで移動 · 矢印で依存設定'}
              </div>
            </div>

            <div style={{ marginLeft: 'auto', display: 'flex', gap: 7, alignItems: 'center' }}>
              {/* View toggle */}
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
                {(['board', 'table'] as const).map(m => (
                  <button key={m} onClick={() => setViewMode(m)}
                    style={{
                      padding: '5px 9px', border: 'none', cursor: 'pointer',
                      background: viewMode === m ? 'var(--text-1)' : 'var(--surface)',
                      color: viewMode === m ? '#FAFAF8' : 'var(--text-3)',
                      display: 'flex', alignItems: 'center',
                    }}>
                    {m === 'board' ? <LayoutGrid size={12} /> : <List size={12} />}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={11} style={{ position: 'absolute', left: 7, color: 'var(--text-3)', pointerEvents: 'none' }} />
                <input value={filterText} onChange={e => setFilterText(e.target.value)}
                  placeholder="検索..."
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 7px 5px 22px', fontSize: 11, background: 'var(--surface)', color: 'var(--text-1)', width: 120, outline: 'none' }}
                />
                {filterText && <button onClick={() => setFilterText('')} style={{ position: 'absolute', right: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, display: 'flex' }}><X size={10} /></button>}
              </div>

              <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}
                style={{ border: `1px solid ${filterAssignee ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, padding: '5px 8px', fontSize: 11, background: 'var(--surface)', color: filterAssignee ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', outline: 'none' }}>
                <option value="">全メンバー</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>

              <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
                style={{ border: `1px solid ${filterProject ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 6, padding: '5px 8px', fontSize: 11, background: 'var(--surface)', color: filterProject ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', outline: 'none' }}>
                <option value="">全PJ</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>

              {hasFilter && (
                <button onClick={() => { setFilterText(''); setFilterAssignee(''); setFilterProject(''); }}
                  style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '4px 7px', fontSize: 11, background: 'var(--surface)', color: '#E60012', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <X size={10} /> クリア
                </button>
              )}

              {/* ── ビュー制御 ── */}
              <div style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }} />

              {/* フォーカスモード */}
              <button
                onClick={() => setFocusActive(v => !v)}
                title="進行中・着手可能のみ表示"
                style={{
                  border: `1px solid ${focusActive ? 'rgba(180,100,0,0.5)' : 'var(--border)'}`,
                  borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 600,
                  background: focusActive ? 'rgba(180,100,0,0.06)' : 'var(--surface)',
                  color: focusActive ? '#B46400' : 'var(--text-3)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'all 0.15s',
                }}>
                <Zap size={11} /> {focusActive ? 'フォーカス中' : 'フォーカス'}
              </button>

              {/* 矢印トグル */}
              <button
                onClick={() => setShowArrows(v => !v)}
                title="依存関係の矢印を表示/非表示"
                style={{
                  border: `1px solid ${showArrows ? 'rgba(180,100,0,0.5)' : 'var(--border)'}`,
                  borderRadius: 6, padding: '4px 10px', fontSize: 11,
                  background: showArrows ? 'rgba(180,100,0,0.06)' : 'var(--surface)',
                  color: showArrows ? '#B46400' : 'var(--text-3)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'all 0.15s',
                }}>
                <Link2 size={11} /> 矢印
              </button>

              {/* コンパクトモード */}
              <button
                onClick={() => setCardDense(v => !v)}
                title="カードを詳細/コンパクト切り替え"
                style={{
                  border: `1px solid ${cardDense ? 'var(--text-1)' : 'var(--border)'}`,
                  borderRadius: 6, padding: '4px 10px', fontSize: 11,
                  background: cardDense ? 'var(--text-1)' : 'var(--surface)',
                  color: cardDense ? '#FAFAF8' : 'var(--text-3)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  transition: 'all 0.15s',
                }}>
                <LayoutGrid size={11} /> {cardDense ? 'コンパクト' : '詳細'}
              </button>

              {/* Connect mode toggle */}
              <button
                onClick={() => { setConnectMode(m => !m); setConnectSource(null); }}
                title="依存関係を矢印で接続（Esc でキャンセル）"
                style={{
                  border: `1px solid ${connectMode ? 'var(--text-1)' : 'var(--border)'}`,
                  borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600,
                  background: connectMode ? 'var(--text-1)' : 'var(--surface)',
                  color: connectMode ? '#FAFAF8' : 'var(--text-2)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.15s',
                }}>
                <Link2 size={12} />
                {connectMode ? '接続中...' : '矢印接続'}
              </button>

              {/* AI テキスト解析ボタン */}
              <button
                onClick={() => setShowAiParse(true)}
                title="テキストからピースを自動作成（Proプラン）"
                style={{
                  border: `1px solid ${currentPlan !== 'free' ? 'rgba(180,100,0,0.4)' : 'var(--border)'}`,
                  borderRadius: 6, padding: '5px 10px', fontSize: 11, fontWeight: 600,
                  background: currentPlan !== 'free' ? 'rgba(180,100,0,0.06)' : 'var(--surface)',
                  color: currentPlan !== 'free' ? '#B46400' : 'var(--text-3)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                  transition: 'all 0.15s',
                }}>
                <Sparkles size={11} />
                文章から作成
                {currentPlan === 'free' && (
                  <span style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.04em' }}>PRO</span>
                )}
              </button>

              <button onClick={() => setShowImport(true)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 9px', fontSize: 11, background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Upload size={12} /> CSV
              </button>

              <button onClick={exportCsv}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 9px', fontSize: 11, background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <Download size={12} />
              </button>

              <button onClick={() => { load(); loadConnections(); }}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '5px 9px', fontSize: 11, background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <RefreshCw size={12} />
              </button>
            </div>
          </div>

          {/* ── Bulk action bar ─────────────────────────────────── */}
          {selected.size > 0 && (
            <div style={{ padding: '7px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>{selected.size}件選択</span>
              <select value={bulkAssignee} onChange={e => setBulkAssignee(e.target.value)}
                style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '3px 7px', fontSize: 11, background: 'var(--surface)', color: 'var(--text-2)', outline: 'none' }}>
                <option value="">担当者を一括変更...</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <button
                onClick={async () => {
                  if (!bulkAssignee || selected.size === 0) return;
                  const ids = [...selected];
                  setAllPieces(prev => prev.map(p => ids.includes(p.id) ? { ...p, assignee_id: bulkAssignee || null } : p));
                  await Promise.all(ids.map(id => pieceApi.assign(id, bulkAssignee || null).catch(() => {})));
                  setSelected(new Set()); setBulkAssignee('');
                }}
                disabled={!bulkAssignee}
                style={{ padding: '3px 12px', background: 'var(--text-1)', color: '#FAFAF8', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', opacity: bulkAssignee ? 1 : 0.5 }}>
                適用
              </button>
              <button onClick={() => setSelected(new Set())}
                style={{ marginLeft: 'auto', padding: '3px 9px', background: 'none', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                解除
              </button>
            </div>
          )}

          {/* ── Table view ──────────────────────────────────────── */}
          {viewMode === 'table' && (
            <PieceTableView
              pieces={filtered} workers={workers} selected={selected}
              sortKey={sortKey} sortDir={sortDir}
              onSort={key => { if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortKey(key); setSortDir('desc'); } }}
              onToggleSelect={id => setSelected(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; })}
              onAssign={handleAssign}
            />
          )}

          {/* ── Board ───────────────────────────────────────────── */}
          {viewMode === 'board' && (
            <div style={{ flex: 1, display: 'flex', gap: 10, padding: '14px 16px', overflow: 'auto' }}>
              {visibleColumns.map(col => {
                const colPieces = filtered.filter(p => p.status === col.status);
                const isOver    = dragOver === col.status;
                const ColIcon   = col.Icon;
                const impact    = colPieces.reduce((s, p) => s + Number(p.business_impact || 0), 0);
                return (
                  <div
                    key={col.status}
                    onDragOver={e => { e.preventDefault(); setDragOver(col.status); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null); }}
                    onDrop={e => { e.preventDefault(); handleDrop(col.status); }}
                    style={{
                      flex: '1 1 0', minWidth: 230,
                      background: isOver ? col.bg : 'var(--surface-sub, #F8F8F7)',
                      border: `1px solid ${isOver ? col.accent + '66' : col.border}`,
                      borderTop: `3px solid ${col.accent}`,
                      borderRadius: 10,
                      display: 'flex', flexDirection: 'column',
                      transition: 'border-color 0.12s, background 0.12s',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Column header */}
                    <div style={{ padding: '10px 12px 9px', display: 'flex', alignItems: 'center', gap: 7, borderBottom: `1px solid ${col.border}` }}>
                      <ColIcon size={13} color={col.accent} strokeWidth={2.2} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em', flex: 1 }}>{col.label}</span>
                      {/* WIP 過多警告 */}
                      {col.status === 'in_progress' && colPieces.length > 8 && (
                        <span title="進行中が多すぎます" style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, color: '#D97706', fontWeight: 700 }}>
                          <AlertTriangle size={10} /> 過多
                        </span>
                      )}
                      {impact > 0 && (
                        <span style={{ fontSize: 9, color: '#B46400', fontWeight: 700 }}>¥{(impact / 10000).toFixed(0)}万</span>
                      )}
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: col.accent,
                        background: col.bg, border: `1px solid ${col.accent}44`,
                        borderRadius: 99, padding: '1px 8px',
                        minWidth: 22, textAlign: 'center',
                      }}>
                        {colPieces.length}
                      </span>
                    </div>

                    {/* Cards */}
                    <div style={{ flex: 1, padding: '9px 8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {colPieces.length === 0 && !connectMode && (
                        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)', fontSize: 11 }}>
                          ここにドロップ
                        </div>
                      )}

                      {groupPiecesByProject(
                        [...colPieces].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
                        projects,
                      ).map((group, gi, all) => (
                        <React.Fragment key={group.project?.id ?? '__none'}>
                          {/* Swimlane header — shown when multiple project groups and no project filter active */}
                          {!filterProject && all.length > 1 && (() => {
                            const key = group.project?.id ?? null;
                            const isCollapsed = collapsedProjects.has(key);
                            const toggle = () => setCollapsedProjects(prev => {
                              const n = new Set(prev);
                              if (n.has(key)) n.delete(key); else n.add(key);
                              return n;
                            });
                            return (
                              <div
                                onClick={toggle}
                                style={{
                                  fontSize: 10, fontWeight: 600,
                                  color: isCollapsed ? 'var(--text-2)' : 'var(--text-3)',
                                  padding: `${gi === 0 ? 2 : 10}px 4px 3px`,
                                  borderTop: gi > 0 ? '1px solid var(--border)' : 'none',
                                  letterSpacing: '0.02em',
                                  marginTop: gi > 0 ? 4 : 0,
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                  display: 'flex', alignItems: 'center', gap: 4,
                                }}
                              >
                                {isCollapsed
                                  ? <ChevronRight size={9} style={{ opacity: 0.45, flexShrink: 0 }} />
                                  : <ChevronDown  size={9} style={{ opacity: 0.45, flexShrink: 0 }} />
                                }
                                {group.project?.color && (
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: group.project.color, flexShrink: 0, display: 'inline-block' }} />
                                )}
                                {group.project?.name ?? 'プロジェクト未設定'}
                                {isCollapsed && (
                                  <span style={{ fontSize: 9, color: 'var(--text-4)', marginLeft: 2 }}>
                                    ({group.pieces.length})
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                          {!collapsedProjects.has(group.project?.id ?? null) && group.pieces.map(piece => {
                            const cm = connMap.get(piece.id);
                            return (
                              <KanbanCard
                                key={piece.id}
                                piece={piece}
                                project={group.project}
                                workers={workers}
                                connCount={(cm?.up ?? 0) + (cm?.down ?? 0)}
                                upCount={cm?.up ?? 0}
                                downCount={cm?.down ?? 0}
                                upDoneCount={cm?.upDone ?? 0}
                                dense={cardDense}
                                isDragging={dragging === piece.id}
                                isSelected={selected.has(piece.id)}
                                isDetailOpen={detailPiece?.id === piece.id}
                                dragOverPos={dragOverCard === piece.id ? dragOverPos : null}
                                connectMode={connectMode}
                                isConnectSource={connectSource === piece.id}
                                isHighlighted={!!highlightedIds?.has(piece.id)}
                                hasDimming={!!highlightedIds && !highlightedIds.has(piece.id)}
                                cardRefCb={el => {
                                  if (el) cardRefs.current.set(piece.id, el);
                                  else cardRefs.current.delete(piece.id);
                                }}
                                onDragStart={() => setDragging(piece.id)}
                                onDragEnd={() => { setDragging(null); setDragOver(null); setDragOverCard(null); }}
                                onDragEnterCard={pos => { setDragOverCard(piece.id); setDragOverPos(pos); }}
                                onAssign={id => handleAssign(piece.id, id)}
                                onSelect={() => setSelected(prev => { const n = new Set(prev); if (n.has(piece.id)) n.delete(piece.id); else n.add(piece.id); return n; })}
                                onClick={() => connectMode ? handleCardConnectClick(piece.id) : setDetailPiece(detailPiece?.id === piece.id ? null : piece)}
                                onHoverEnter={() => setHoveredPiece(piece.id)}
                                onHoverLeave={() => setHoveredPiece(null)}
                              />
                            );
                          })}
                        </React.Fragment>
                      ))}


                      <QuickAddCard
                        status={col.status}
                        onAdded={piece => { setAllPieces(prev => [...prev, piece]); showToast(`「${piece.title}」を追加`); }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showImport && (
            <BulkImportModal
              onClose={() => setShowImport(false)}
              onImported={count => { setShowImport(false); if (count > 0) load(); }}
            />
          )}
        </div>

        {/* Detail panel */}
        {detailPiece && (
          <div style={{ width: 360, borderLeft: '1px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
            <PieceDetailPanel
              piece={detailPiece}
              onClose={() => setDetailPiece(null)}
              onUpdated={() => { load(); setDetailPiece(null); }}
            />
          </div>
        )}
      </div>
    </ErrorBoundary>

      {/* AI テキスト解析モーダル */}
      {showAiParse && (
        <AiParseModal
          workers={workers}
          projects={projects}
          isPro={currentPlan !== 'free'}
          onClose={() => setShowAiParse(false)}
          onCreated={count => { setShowAiParse(false); if (count > 0) { load(); showToast(`${count}件のピースを作成しました`); } }}
        />
      )}
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/** Group already-sorted pieces by project. Order: named projects (ja sort) → no project. */
function groupPiecesByProject(pieces: Piece[], projects: Project[]): { project: Project | null; pieces: Piece[] }[] {
  const map = new Map<string | null, Piece[]>();
  for (const p of pieces) {
    const key = p.project_id ?? null;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(p);
  }
  const result: { project: Project | null; pieces: Piece[] }[] = [];
  for (const [id, ps] of map) {
    result.push({ project: id ? (projects.find(p => p.id === id) ?? null) : null, pieces: ps });
  }
  result.sort((a, b) => {
    if (!a.project && !b.project) return 0;
    if (!a.project) return 1;
    if (!b.project) return -1;
    return a.project.name.localeCompare(b.project.name, 'ja');
  });
  return result;
}

// ── KanbanCard ────────────────────────────────────────────────────────────────
function KanbanCard({
  piece, project, workers, connCount, upCount, downCount, upDoneCount, dense,
  isDragging, isSelected, isDetailOpen, dragOverPos,
  connectMode, isConnectSource, isHighlighted, hasDimming,
  cardRefCb,
  onDragStart, onDragEnd, onDragEnterCard, onAssign, onSelect, onClick,
  onHoverEnter, onHoverLeave,
}: {
  piece: Piece;
  project: Project | null;
  workers: Worker[];
  connCount: number;
  upCount: number;
  downCount: number;
  upDoneCount: number;
  dense: boolean;
  isDragging: boolean;
  isSelected: boolean;
  isDetailOpen: boolean;
  dragOverPos: 'above' | 'below' | null;
  connectMode: boolean;
  isConnectSource: boolean;
  isHighlighted: boolean;
  hasDimming: boolean;
  cardRefCb: (el: HTMLElement | null) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnterCard: (pos: 'above' | 'below') => void;
  onAssign: (id: string | null) => void;
  onSelect: () => void;
  onClick: () => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
}) {
  const col = COLUMNS.find(c => c.status === piece.status)!;
  const pColor = P_COLORS[piece.priority] || 'transparent';
  const pText  = P_TEXT[piece.priority] || 'transparent';
  const assignee = workers.find(w => w.id === piece.assignee_id);

  let borderStyle = `1px solid ${col.border}`;
  if (isDetailOpen) borderStyle = '1px solid rgba(180,100,0,0.55)';
  if (isSelected)   borderStyle = '1px solid rgba(180,100,0,0.40)';
  if (isConnectSource) borderStyle = '2px solid #B46400';
  if (connectMode && !isConnectSource) borderStyle = `1px dashed rgba(180,100,0,0.35)`;

  return (
    <div
      ref={cardRefCb}
      draggable={!connectMode}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={e => {
        e.preventDefault(); e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        onDragEnterCard(e.clientY < rect.top + rect.height / 2 ? 'above' : 'below');
      }}
      onDragLeave={e => e.stopPropagation()}
      onClick={onClick}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      style={{
        position: 'relative',
        background: isDetailOpen ? 'rgba(180,100,0,0.04)' : isSelected ? 'rgba(180,100,0,0.03)' : isConnectSource ? 'rgba(180,100,0,0.06)' : 'var(--surface, #fff)',
        borderRadius: 7,
        border: borderStyle,
        borderLeft: isConnectSource ? `3px solid #B46400` : `3px solid ${project?.color ?? col.accent}`,
        boxShadow: isDragging
          ? '0 12px 32px rgba(0,0,0,0.15)'
          : isDetailOpen || isHighlighted
          ? '0 2px 12px rgba(0,0,0,0.08)'
          : '0 1px 3px rgba(0,0,0,0.05)',
        cursor: connectMode ? 'crosshair' : 'pointer',
        opacity: isDragging ? 0.45 : hasDimming ? 0.15 : 1,
        transform: isDragging ? 'rotate(1.5deg) scale(1.03)' : 'none',
        transition: 'opacity 0.2s, box-shadow 0.15s, transform 0.15s',
        padding: dense ? '7px 10px' : '10px 11px',
        userSelect: 'none',
        ...(dragOverPos === 'above' ? { boxShadow: '0 -3px 0 0 var(--accent), 0 1px 3px rgba(0,0,0,0.05)' } : {}),
        ...(dragOverPos === 'below' ? { boxShadow: '0 3px 0 0 var(--accent), 0 1px 3px rgba(0,0,0,0.05)' } : {}),
      }}

    >
      {/* ── コンパクト (dense) レイアウト ── */}
      {dense ? (
        <>
          {/* 上段: チェック + タイトル + 期限 + 担当者 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <input type="checkbox" checked={isSelected}
              onChange={e => { e.stopPropagation(); onSelect(); }}
              onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
              style={{ cursor: 'pointer', accentColor: '#B46400', flexShrink: 0, width: 12, height: 12 }} />

            {/* 優先度ドット */}
            {piece.priority > 0 && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: pColor === 'transparent' ? '#ccc' : pColor,
              }} title={P_LABELS[piece.priority]} />
            )}

            <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: 'var(--text-1)',
              lineHeight: 1.3, letterSpacing: '-0.01em',
              overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
            }}>
              {piece.title}
            </span>

            {/* 期限 */}
            {piece.due_date && piece.status !== 'done' && (() => {
              const rd = relativeDate(piece.due_date);
              return (
                <span style={{
                  fontSize: 9, flexShrink: 0,
                  color: rd.urgent ? '#DC2626' : 'var(--text-4)',
                  fontWeight: rd.urgent ? 700 : 400,
                  background: rd.urgent ? '#FEF2F2' : 'transparent',
                  border: rd.urgent ? '1px solid #FECACA' : 'none',
                  borderRadius: 3, padding: rd.urgent ? '0 4px' : '0',
                }}>
                  {rd.label}
                </span>
              );
            })()}

            {/* 担当者アバター */}
            <div style={{ position: 'relative', flexShrink: 0, width: 20, height: 20 }}>
              <select value={piece.assignee_id ?? ''} onChange={e => { e.stopPropagation(); onAssign(e.target.value || null); }}
                onClick={e => e.stopPropagation()}
                style={{ position: 'absolute', inset: 0, appearance: 'none', WebkitAppearance: 'none',
                  width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none' }}
                title={assignee?.name ?? '未割り当て'}>
                <option value="">未割当</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                background: assignee ? col.accent : '#E5E7EB',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8.5, fontWeight: 700, color: assignee ? '#fff' : '#9CA3AF',
                pointerEvents: 'none',
              }}>
                {assignee ? assignee.name.slice(0, 1) : '?'}
              </div>
            </div>
          </div>

          {/* 下段: 依存インジケーター + プロジェクト + 進捗バー */}
          {(upCount > 0 || downCount > 0 || piece.status === 'in_progress' && (piece.progress ?? 0) > 0 || project) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              {/* upstream: 待ち件数 */}
              {upCount > 0 && (
                <span style={{
                  fontSize: 9, color: upCount > upDoneCount ? '#B46400' : 'var(--text-3)',
                  background: upCount > upDoneCount ? 'rgba(180,100,0,0.08)' : 'var(--surface-sub)',
                  borderRadius: 3, padding: '1px 5px', flexShrink: 0,
                  border: `1px solid ${upCount > upDoneCount ? 'rgba(180,100,0,0.30)' : 'var(--border)'}`,
                }}>
                  ↤ {upDoneCount}/{upCount}
                </span>
              )}
              {/* downstream: 解放件数 */}
              {downCount > 0 && (
                <span style={{ fontSize: 9, color: 'var(--text-3)', background: 'var(--surface-sub)',
                  borderRadius: 3, padding: '1px 5px', flexShrink: 0, border: '1px solid var(--border)' }}>
                  ↦ {downCount}件
                </span>
              )}

              {/* プロジェクト */}
              {project && (
                <span style={{ fontSize: 9, color: 'var(--text-4)', flex: 1,
                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                  {project.name}
                </span>
              )}

              {/* 進捗バー */}
              {piece.status === 'in_progress' && (piece.progress ?? 0) > 0 && (
                <div style={{ width: 36, background: 'var(--border)', borderRadius: 99, height: 2.5, flexShrink: 0 }}>
                  <div style={{ background: '#B46400', height: '100%', borderRadius: 99,
                    width: `${piece.progress}%`, transition: 'width 0.4s' }} />
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          {/* ── 詳細 (non-dense) レイアウト ── */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
            <input type="checkbox" checked={isSelected}
              onChange={e => { e.stopPropagation(); onSelect(); }}
              onMouseDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}
              style={{ marginTop: 2, cursor: 'pointer', accentColor: '#B46400', flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.4, letterSpacing: '-0.01em' }}>
              {piece.title}
            </div>
            {piece.priority > 0 && (
              <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700,
                background: pColor, color: pText, borderRadius: 4, padding: '1px 5px', border: `1px solid ${pColor}` }}>
                {P_LABELS[piece.priority]}
              </span>
            )}
          </div>

          {project && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{project.name}</div>
          )}

          {piece.objective && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5, overflow: 'hidden',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.45 }}>
              {piece.objective}
            </div>
          )}

          {(piece.skill_tags ?? []).length > 0 && (
            <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
              {piece.skill_tags.slice(0, 3).map(t => (
                <span key={t} style={{ fontSize: 9, background: 'var(--surface-sub)', color: 'var(--text-2)', borderRadius: 3, padding: '1px 6px', border: '1px solid var(--border)' }}>{t}</span>
              ))}
              {piece.skill_tags.length > 3 && <span style={{ fontSize: 9, color: 'var(--text-3)', padding: '1px 4px' }}>+{piece.skill_tags.length - 3}</span>}
            </div>
          )}

          {/* 依存インジケーター（詳細モード） */}
          {(upCount > 0 || downCount > 0) && (
            <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
              {upCount > 0 && (
                <span style={{ fontSize: 9.5, color: upCount > upDoneCount ? '#B46400' : 'var(--text-3)',
                  background: upCount > upDoneCount ? 'rgba(180,100,0,0.08)' : 'var(--surface-sub)',
                  borderRadius: 4, padding: '2px 7px', border: `1px solid ${upCount > upDoneCount ? 'rgba(180,100,0,0.30)' : 'var(--border)'}` }}>
                  ↤ 前提 {upDoneCount}/{upCount} 完了
                </span>
              )}
              {downCount > 0 && (
                <span style={{ fontSize: 9.5, color: 'var(--text-3)', background: 'var(--surface-sub)',
                  borderRadius: 4, padding: '2px 7px', border: '1px solid var(--border)' }}>
                  ↦ {downCount}件を解放
                </span>
              )}
            </div>
          )}

          {piece.status === 'in_progress' && (piece.progress ?? 0) > 0 && (
            <div style={{ marginTop: 8, background: 'var(--border)', borderRadius: 99, height: 3, overflow: 'hidden' }}>
              <div style={{ background: '#B46400', height: '100%', borderRadius: 99, width: `${piece.progress}%`, transition: 'width 0.4s' }} />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', marginTop: 8, gap: 6 }}>
            {connCount > 0 && (
              <span style={{ fontSize: 9, color: 'var(--text-3)', background: 'var(--surface-sub)', borderRadius: 4, padding: '1px 6px', border: '1px solid var(--border)', fontWeight: 600, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <Link2 size={8} strokeWidth={2.5} /> {connCount}
              </span>
            )}
            {piece.due_date && piece.status !== 'done' && (() => {
              const rd = relativeDate(piece.due_date);
              return (
                <span style={{
                  fontSize: 9.5, flexShrink: 0,
                  color: rd.urgent ? '#DC2626' : 'var(--text-3)',
                  fontWeight: rd.urgent ? 700 : 400,
                  background: rd.urgent ? '#FEF2F2' : 'transparent',
                  border: rd.urgent ? '1px solid #FECACA' : 'none',
                  borderRadius: 3, padding: rd.urgent ? '1px 5px' : '0',
                }}>
                  {rd.label}
                </span>
              );
            })()}
            <div style={{ flex: 1 }} />
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <select value={piece.assignee_id ?? ''} onChange={e => { e.stopPropagation(); onAssign(e.target.value || null); }}
                onClick={e => e.stopPropagation()}
                style={{ appearance: 'none', WebkitAppearance: 'none', width: assignee ? 24 : 72, height: 24,
                  border: '1px solid var(--border)', borderRadius: '50%',
                  background: assignee ? col.accent : 'var(--surface-sub)',
                  color: assignee ? '#fff' : 'var(--text-3)', fontSize: 10, fontWeight: 700,
                  cursor: 'pointer', outline: 'none', textAlign: 'center', paddingLeft: assignee ? 0 : 4,
                  overflow: 'hidden', textOverflow: 'ellipsis' }}
                title={assignee?.name ?? '未割り当て'}>
                <option value="">未割当</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              {assignee && (
                <div style={{ position: 'absolute', inset: 0, background: col.accent, borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: '#fff', pointerEvents: 'none' }}>
                  {assignee.name.slice(0, 1)}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── QuickAddCard ──────────────────────────────────────────────────────────────
function QuickAddCard({ status, onAdded }: { status: string; onAdded: (piece: Piece) => void; }) {
  const [open, setOpen]         = React.useState(false);
  const [title, setTitle]       = React.useState('');
  const [objective, setObjective] = React.useState('');
  const [skillTags, setSkillTags] = React.useState('');
  const [priority, setPriority] = React.useState('');
  const [dueDate, setDueDate]   = React.useState('');
  const [saving, setSaving]     = React.useState(false);
  const [suggesting, setSuggesting] = React.useState(false);
  const [aiHint, setAiHint]     = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  function reset() { setTitle(''); setObjective(''); setSkillTags(''); setPriority(''); setDueDate(''); setAiHint(''); }

  async function suggest() {
    if (!title.trim() || suggesting) return;
    setSuggesting(true); setAiHint('');
    try {
      const s = await aiApi.suggestPiece(title.trim());
      setObjective(s.objective ?? '');
      setSkillTags((s.skill_tags ?? []).join(', '));
      setPriority(String(s.priority ?? ''));
      setDueDate(s.due_date_suggestion ?? '');
      setAiHint(s.reason ?? '');
    } catch { setAiHint('AI提案に失敗しました'); }
    finally { setSuggesting(false); }
  }

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const tags = skillTags.split(',').map(t => t.trim()).filter(Boolean);
      const piece = await pieceApi.create({
        title: title.trim(), status, objective: objective.trim(),
        skill_tags: tags,
        priority: priority ? Number(priority) : undefined,
        due_date: dueDate || undefined,
      });
      onAdded(piece); reset(); setOpen(false);
    } catch {} finally { setSaving(false); }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
      style={{
        width: '100%', marginTop: 4, padding: '6px 0',
        background: 'none', border: '1px dashed var(--border)',
        borderRadius: 7, color: 'var(--text-3)',
        cursor: 'pointer', fontSize: 11,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        transition: 'all 0.12s',
      }}>
      + 追加
    </button>
  );

  return (
    <div style={{ marginTop: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 10px 8px' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          ref={inputRef} value={title} onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { reset(); setOpen(false); } }}
          placeholder="タイトルを入力..."
          style={{ flex: 1, padding: '4px 0', fontSize: 12, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-1)', fontWeight: 500 }}
        />
        <button onClick={suggest} disabled={!title.trim() || suggesting} title="AIで自動補完"
          style={{
            flexShrink: 0, padding: '3px 8px', fontSize: 10, fontWeight: 700,
            border: '1px solid var(--border)', borderRadius: 6,
            background: suggesting ? 'rgba(180,100,0,0.06)' : 'var(--surface-sub)', color: '#B46400',
            cursor: title.trim() && !suggesting ? 'pointer' : 'not-allowed',
            opacity: title.trim() ? 1 : 0.45,
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
          <Sparkles size={10} />
          {suggesting ? '…' : 'AI'}
        </button>
      </div>

      {aiHint && (
        <div style={{ fontSize: 10, color: '#B46400', marginTop: 5, padding: '4px 7px', background: 'rgba(180,100,0,0.06)', borderRadius: 5, borderLeft: '2px solid rgba(180,100,0,0.4)', lineHeight: 1.4 }}>
          {aiHint}
        </div>
      )}

      <textarea value={objective} onChange={e => setObjective(e.target.value)}
        placeholder="目的・完了条件（任意）" rows={2}
        style={{ width: '100%', marginTop: 6, padding: '4px 7px', fontSize: 11, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 5, outline: 'none', color: 'var(--text-1)', resize: 'vertical', boxSizing: 'border-box' }}
      />

      <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
        <input value={skillTags} onChange={e => setSkillTags(e.target.value)} placeholder="タグ（, 区切り）"
          style={{ flex: 2, padding: '4px 7px', fontSize: 11, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 5, outline: 'none', color: 'var(--text-1)' }}
        />
        <select value={priority} onChange={e => setPriority(e.target.value)}
          style={{ flex: '0 0 55px', padding: '4px 4px', fontSize: 11, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 5, outline: 'none', cursor: 'pointer' }}>
          <option value="">P-</option>
          {[1,2,3,4,5].map(n => <option key={n} value={n}>P{n}</option>)}
        </select>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)}
          style={{ flex: '0 0 108px', padding: '4px 6px', fontSize: 11, background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 5, outline: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
        <button onClick={() => { reset(); setOpen(false); }}
          style={{ padding: '3px 10px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer', color: 'var(--text-2)' }}>
          キャンセル
        </button>
        <button onClick={submit} disabled={saving || !title.trim()}
          style={{ padding: '3px 14px', fontSize: 11, border: 'none', borderRadius: 6, background: 'var(--text-1)', color: '#FAFAF8', cursor: 'pointer', fontWeight: 700, opacity: (!title.trim() || saving) ? 0.5 : 1 }}>
          {saving ? '...' : '追加'}
        </button>
      </div>
    </div>
  );
}

// ── PieceTableView (simplified) ───────────────────────────────────────────────
const STATUS_SORT: Record<string, number> = { in_progress: 0, ready: 1, locked: 2, done: 3 };
const STATUS_INFO: Record<string, { label: string; color: string }> = {
  locked:      { label: 'ロック',   color: '#888888' },
  ready:       { label: '着手可',   color: '#555555' },
  in_progress: { label: '進行中',   color: '#B46400' },
  done:        { label: '完了',     color: '#AAAAAA' },
};
const PAGE_SIZE = 50;

function PieceTableView({
  pieces, workers, selected, sortKey, sortDir, onSort, onToggleSelect, onAssign,
}: {
  pieces: Piece[]; workers: Worker[]; selected: Set<string>;
  sortKey: string; sortDir: 'asc' | 'desc';
  onSort: (k: 'title' | 'status' | 'due_date' | 'priority' | 'progress') => void;
  onToggleSelect: (id: string) => void;
  onAssign: (pieceId: string, assigneeId: string | null) => void;
}) {
  const [visible, setVisible] = React.useState(PAGE_SIZE);
  React.useEffect(() => setVisible(PAGE_SIZE), [pieces]);

  const sorted = [...pieces].sort((a, b) => {
    let av: string | number, bv: string | number;
    if (sortKey === 'status')   { av = STATUS_SORT[a.status] ?? 9;  bv = STATUS_SORT[b.status] ?? 9; }
    else if (sortKey === 'due_date')  { av = a.due_date ?? '9999'; bv = b.due_date ?? '9999'; }
    else if (sortKey === 'priority')  { av = a.priority; bv = b.priority; }
    else if (sortKey === 'progress')  { av = a.progress ?? 0; bv = b.progress ?? 0; }
    else { av = a.title.toLowerCase(); bv = b.title.toLowerCase(); }
    return (av < bv ? -1 : av > bv ? 1 : 0) * (sortDir === 'asc' ? 1 : -1);
  });

  const TH = ({ col, label, children }: { col?: 'title' | 'status' | 'due_date' | 'priority' | 'progress'; label?: string; children?: React.ReactNode }) => (
    <th onClick={col ? () => onSort(col) : undefined} style={{
      padding: '8px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700,
      color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase',
      cursor: col ? 'pointer' : 'default', userSelect: 'none',
      borderBottom: '1px solid var(--border)', background: '#FAFAF9', whiteSpace: 'nowrap',
    }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        {children ?? label}
        {col === sortKey && (sortDir === 'asc' ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
      </span>
    </th>
  );

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <thead>
          <tr>
            <TH><input type="checkbox" style={{ cursor: 'pointer' }} onChange={e => sorted.forEach(p => e.target.checked ? !selected.has(p.id) && onToggleSelect(p.id) : selected.has(p.id) && onToggleSelect(p.id))} /></TH>
            <TH col="title" label="タイトル" />
            <TH col="status" label="ステータス" />
            <TH label="担当者" />
            <TH col="due_date" label="期日" />
            <TH col="priority" label="P" />
            <TH col="progress" label="進捗" />
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, visible).map((piece, i) => {
            const isOverdue = piece.due_date && new Date(piece.due_date) < new Date() && piece.status !== 'done';
            const si = STATUS_INFO[piece.status];
            return (
              <tr key={piece.id} style={{ borderBottom: i < sorted.length - 1 ? '1px solid var(--border-sub)' : 'none', background: selected.has(piece.id) ? '#F0F7FF' : 'transparent' }}>
                <td style={{ padding: '8px 12px', width: 32 }}><input type="checkbox" checked={selected.has(piece.id)} onChange={() => onToggleSelect(piece.id)} style={{ cursor: 'pointer' }} /></td>
                <td style={{ padding: '8px 12px', maxWidth: 260 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{piece.title}</div>
                  {(piece.skill_tags ?? []).length > 0 && <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{piece.skill_tags.slice(0, 2).join(' · ')}</div>}
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <span style={{ fontSize: 10, fontWeight: 600, color: si?.color, border: `1px solid ${si?.color}44`, borderRadius: 99, padding: '2px 8px' }}>{si?.label}</span>
                </td>
                <td style={{ padding: '8px 12px' }}>
                  <select value={piece.assignee_id ?? ''} onChange={e => onAssign(piece.id, e.target.value || null)}
                    style={{ border: '1px solid var(--border)', borderRadius: 5, padding: '3px 6px', fontSize: 11, background: '#fff', color: 'var(--text-2)', cursor: 'pointer', outline: 'none', maxWidth: 110 }}>
                    <option value="">未割り当て</option>
                    {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </td>
                <td style={{ padding: '8px 12px', fontSize: 11, color: isOverdue ? '#DC2626' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                  {piece.due_date ? new Date(piece.due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) : '—'}
                  {isOverdue && <span style={{ fontSize: 9, marginLeft: 3, fontWeight: 700 }}>!</span>}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                  {piece.priority > 0 ? <span style={{ fontSize: 10, fontWeight: 700, background: P_COLORS[piece.priority], color: P_TEXT[piece.priority], borderRadius: 4, padding: '1px 5px' }}>{P_LABELS[piece.priority]}</span> : <span style={{ color: 'var(--text-3)', fontSize: 11 }}>—</span>}
                </td>
                <td style={{ padding: '8px 12px', minWidth: 80 }}>
                  {(piece.progress ?? 0) > 0 ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <div style={{ flex: 1, background: '#E5E7EB', borderRadius: 99, height: 4 }}>
                        <div style={{ background: '#B46400', borderRadius: 99, height: '100%', width: `${piece.progress}%` }} />
                      </div>
                      <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>{piece.progress}%</span>
                    </div>
                  ) : <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>}
                </td>
              </tr>
            );
          })}
          {sorted.length === 0 && (
            <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>ピースがありません</td></tr>
          )}
        </tbody>
      </table>
      {sorted.length > visible && (
        <div style={{ padding: '12px', textAlign: 'center' }}>
          <button onClick={() => setVisible(c => c + PAGE_SIZE)}
            style={{ padding: '6px 20px', border: '1px solid var(--border)', borderRadius: 8, background: '#fff', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}>
            さらに {Math.min(PAGE_SIZE, sorted.length - visible)} 件
          </button>
        </div>
      )}
    </div>
  );
}
