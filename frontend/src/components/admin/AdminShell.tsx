import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import UpgradeModal from '../shared/UpgradeModal';
import { useNotificationStore } from '../../store/notificationStore';
import { useWSStore } from '../../store/wsStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { pieces as pieceApi } from '../../services/api';
import { useIsMobile } from '../../hooks/useIsMobile';
import {
  Grid2X2, Kanban, FolderOpen, Users,
  BarChart2, CalendarDays, ChevronLeft, ChevronRight, ChevronDown, LogOut, LayoutDashboard, Zap, Bell, Search, Settings, MessageSquare, Monitor, Layers, FileBarChart2,
  CheckCircle2, CheckCheck, AlertTriangle, TrendingUp, UserCheck, X as XIcon, Lightbulb,
} from 'lucide-react';

const SIDEBAR_W = 216;

// ─── 主動線: 毎日使う4拠点 ────────────────────────────────────────────────────
// ── 毎日使うコア機能（常に表示）
const CORE_NAV = [
  { path: '/overview',  Icon: Layers,     label: '工房',        sub: '今日の全体像' },
  { path: '/board',     Icon: Grid2X2,    label: 'ボード',      sub: '依存関係・流れ' },
  { path: '/gantt',     Icon: BarChart2,  label: 'ガント',      sub: 'スケジュール・期限' },
  { path: '/team',      Icon: Users,      label: 'チーム',      sub: '負荷・メンバー' },
  { path: '/proposals', Icon: Lightbulb,  label: '提案レビュー', sub: 'ワーカーからの提案' },
];

// ─── 計画・管理 ───────────────────────────────────────────────────────────────
const PLAN_NAV = [
  { path: '/kanban',    Icon: Kanban,        label: 'カンバン',     sub: 'ステータス一覧' },
  { path: '/projects',  Icon: FolderOpen,    label: 'プロジェクト', sub: '進捗一括確認' },
  { path: '/calendar',  Icon: CalendarDays,  label: 'カレンダー',   sub: '期限・休暇統合' },
];

// ─── 分析・記録 ────────────────────────────────────────────────────────────────
const ANALYSIS_NAV = [
  { path: '/dashboard', Icon: LayoutDashboard, label: 'ダッシュボード', sub: '数値概要' },
  { path: '/retro',     Icon: MessageSquare,   label: '振り返り',       sub: 'Retrospective' },
  { path: '/report',    Icon: FileBarChart2,   label: 'レポート',       sub: 'プロジェクト横断' },
];

const SETTINGS_ITEM = { path: '/settings', Icon: Settings, label: '設定', sub: 'メンバー・プラン' };

function timeAgo(ts: Date): string {
  const diff = Date.now() - ts.getTime();
  if (diff < 60_000)   return 'たった今';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  return `${Math.floor(diff / 86_400_000)}日前`;
}

function NotifIcon({ type }: { type: string }) {
  const s = { size: 13, strokeWidth: 2, style: { flexShrink: 0 } };
  switch (type) {
    case 'piece_ready':    return <CheckCircle2 {...s} style={{ ...s.style, color: 'var(--text-2)' }} />;
    case 'piece_done':          return <CheckCheck   {...s} style={{ ...s.style, color: 'var(--text-3)' }} />;
    case 'piece_status_changed': return <Zap         {...s} style={{ ...s.style, color: '#B46400' }} />;
    case 'piece_assigned': return <UserCheck    {...s} style={{ ...s.style, color: '#B46400' }} />;
    case 'auto_promoted':  return <TrendingUp   {...s} style={{ ...s.style, color: '#B46400' }} />;
    case 'skill_levelup':  return <TrendingUp   {...s} style={{ ...s.style, color: '#B46400' }} />;
    case 'alert':
    case 'bottleneck_alert':
      return <AlertTriangle {...s} style={{ ...s.style, color: '#E60012' }} />;
    default:               return <Bell         {...s} style={{ ...s.style, color: 'var(--text-3)' }} />;
  }
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifTab, setNotifTab] = useState<'notif' | 'activity'>('notif');
  const [activities, setActivities] = useState<{ piece_id: string; piece_title: string; actor_name: string; action: string; created_at: string; event_type?: string; old_value?: string | null; new_value?: string | null }[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [presentMode, setPresentMode] = useState(false);
  // 現在のパスに応じてセクションを自動展開
  const [planOpen,      setPlanOpen]      = useState(false);
  const [analysisOpen,  setAnalysisOpen]  = useState(false);
  const [newsOpen,      setNewsOpen]      = useState(true);

  useEffect(() => {
    // ダークモード廃止: 常にライトモードで起動
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('theme');
  }, []);
  const notifRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, addNotification, markAllRead, removeNotification } = useNotificationStore();
  const { setSend, setCursor, removeCursor } = useWSStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ type: string; id: string; name: string; status: string }[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('puzzle_search_history') || '[]'); } catch { return []; }
  });
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  function addToHistory(q: string) {
    if (!q.trim() || q.trim().length < 2) return;
    setSearchHistory(prev => {
      const next = [q.trim(), ...prev.filter(h => h !== q.trim())].slice(0, 8);
      localStorage.setItem('puzzle_search_history', JSON.stringify(next));
      return next;
    });
  }

  const { send } = useWebSocket((event) => {
    if (event.type === 'cursor_move') {
      const p = event.payload as { userId: string; name: string; x: number; y: number; timestamp: number };
      setCursor(p.userId, { userId: p.userId, name: p.name, x: p.x, y: p.y, ts: p.timestamp });
    } else if (event.type === 'cursor_leave') {
      const p = event.payload as { userId: string };
      removeCursor(p.userId);
    } else {
      addNotification(event);
    }
  });
  // Make send globally available so any component can broadcast cursor moves
  useEffect(() => { setSend(send); }, [send, setSend]);

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    setSearchOpen(true);
    clearTimeout(searchTimer.current);
    if (q.trim().length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      const results = await pieceApi.search(q).catch(() => []);
      setSearchResults(results);
    }, 300);
  }, []);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const gPending = useRef(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
        setShortcutsOpen(false);
        setPresentMode(false);
        gPending.current = false;
        searchInputRef.current?.blur();
      }
      if (e.key === '?' && !isInput && !e.metaKey && !e.ctrlKey) {
        setShortcutsOpen(v => !v);
      }
      // g+key navigation
      if (!isInput && !e.metaKey && !e.ctrlKey) {
        if (e.key === 'g') {
          gPending.current = true;
          setTimeout(() => { gPending.current = false; }, 1200);
        } else if (gPending.current) {
          gPending.current = false;
          const NAV_MAP: Record<string, string> = { d: '/dashboard', k: '/kanban', t: '/team', p: '/projects', v: '/velocity', b: '/board', s: '/settings' };
          if (NAV_MAP[e.key]) navigate(NAV_MAP[e.key]);
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    if (notifOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notifOpen]);

  const isMobile = useIsMobile();
  const w = collapsed ? 56 : SIDEBAR_W;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  function activityActionText(event_type: string, new_value: string | null): string {
    const STATUS_JA: Record<string, string> = {
      todo: 'ToDo', in_progress: '進行中', review: 'レビュー中', done: '完了', locked: 'ブロック中',
    };
    switch (event_type) {
      case 'status_changed': return `を「${STATUS_JA[new_value ?? ''] ?? new_value}」に変更しました`;
      case 'assigned':       return 'にアサインされました';
      case 'auto_promoted':  return 'を自動昇格しました';
      case 'blocker_reported': return 'でブロッカーを報告しました';
      case 'created':        return 'を作成しました';
      case 'field_updated':  return 'を更新しました';
      default:               return `を更新しました（${event_type}）`;
    }
  }

  async function loadActivity() {
    if (activityLoading) return;
    setActivityLoading(true);
    try {
      const raw = await pieceApi.getActivity(30);
      const mapped = (raw ?? []).map((r: { piece_id: string; piece_title: string; user_name: string; event_type: string; new_value: string | null; created_at: string }) => ({
        piece_id:    r.piece_id,
        piece_title: r.piece_title,
        actor_name:  r.user_name ?? '不明',
        action:      activityActionText(r.event_type, r.new_value),
        created_at:  r.created_at,
        event_type:  r.event_type,
        old_value:   null,
        new_value:   r.new_value,
      }));
      setActivities(mapped);
    } catch { /* ignore */ }
    finally { setActivityLoading(false); }
  }

  // 通知パネル全体 (expanded と collapsed で共用)
  function renderNotifPanel() {
    return (
      <>
        {/* ── ヘッダー ── */}
        <div style={{ padding: '10px 14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>通知</span>
          {notifTab === 'notif' && notifications.length > 0 && (
            <button onClick={() => useNotificationStore.getState().clear()} style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--text-3)', cursor: 'pointer', padding: 0 }}>すべて削除</button>
          )}
        </div>

        {/* ── タブ ── */}
        <div style={{ display: 'flex', gap: 0, padding: '6px 14px 0', borderBottom: '1px solid var(--border)' }}>
          {(['notif', 'activity'] as const).map(tab => {
            const label = tab === 'notif' ? '通知' : 'アクティビティ';
            const active = notifTab === tab;
            return (
              <button key={tab} onClick={() => { setNotifTab(tab); if (tab === 'activity') loadActivity(); }}
                style={{ flex: 1, background: 'none', border: 'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent', padding: '5px 0 7px', fontSize: 11, fontWeight: active ? 700 : 400, color: active ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', transition: 'color 0.1s' }}
              >{label}</button>
            );
          })}
        </div>

        {/* ── 通知タブ ── */}
        {notifTab === 'notif' && (
          notifications.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>通知はありません</div>
          ) : (
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {notifications.map(n => (
                <div
                  key={n.id}
                  onClick={() => { if (n.piece_id) navigate(`/board?piece=${n.piece_id}`); useNotificationStore.getState().markRead(n.id); }}
                  style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-sub)', display: 'flex', gap: 9, alignItems: 'flex-start', background: n.read ? 'transparent' : 'var(--accent-sub)', cursor: n.piece_id ? 'pointer' : 'default', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (n.piece_id) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-sub)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = n.read ? 'transparent' : 'var(--accent-sub)'; }}
                >
                  <div style={{ marginTop: 1, flexShrink: 0 }}><NotifIcon type={n.type} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.45, wordBreak: 'break-all' }}>{n.message}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{timeAgo(n.ts)}</div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); removeNotification(n.id); }}
                    style={{ background: 'none', border: 'none', padding: '1px 2px', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.6, borderRadius: 3 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'; (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-3)'; }}
                  >
                    <XIcon size={11} />
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {/* ── アクティビティタブ ── */}
        {notifTab === 'activity' && (
          activityLoading ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>読み込み中…</div>
          ) : activities.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>アクティビティはありません</div>
          ) : (
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {activities.map((a, i) => (
                <div key={i}
                  onClick={() => navigate(`/board?piece=${a.piece_id}`)}
                  style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-sub)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-sub)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <div style={{ fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 600 }}>{a.actor_name}</span>
                    <span style={{ color: 'var(--text-2)' }}> が </span>
                    <span style={{ color: 'var(--accent)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140, display: 'inline-block', verticalAlign: 'bottom' }}>{a.piece_title}</span>
                    <span style={{ color: 'var(--text-2)' }}>{a.action}</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{timeAgo(new Date(a.created_at))}</div>
                </div>
              ))}
            </div>
          )
        )}
      </>
    );
  }

  // Helper to render a single nav item
  function renderNavItem({ path, Icon, label, sub }: { path: string; Icon: React.ElementType; label: string; sub: string }) {
    const active = location.pathname === path;
    return (
      <button
        key={path}
        onClick={() => navigate(path)}
        title={collapsed ? label : undefined}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 10,
          padding: collapsed ? '10px 0' : '9px 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: 'var(--r-md)', border: 'none', cursor: 'pointer',
          background: active ? 'var(--accent-sub)' : 'transparent',
          color: active ? 'var(--accent)' : 'var(--text-2)',
          marginBottom: 2, position: 'relative',
          transition: 'background 0.12s, color 0.12s',
        }}
        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-sub)'; }}
        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        {active && (
          <div style={{ position: 'absolute', left: 0, top: '18%', bottom: '18%', width: 3, background: 'var(--accent)', borderRadius: '0 3px 3px 0' }} />
        )}
        <Icon size={16} strokeWidth={active ? 2.5 : 1.8} style={{ flexShrink: 0 }} />
        {!collapsed && (
          <div style={{ overflow: 'hidden', textAlign: 'left' }}>
            <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: 'nowrap', letterSpacing: active ? '-0.01em' : 'normal' }}>{label}</div>
            <div className="nav-sub" style={{ fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap', marginTop: 1 }}>{sub}</div>
          </div>
        )}
      </button>
    );
  }

  // セクションヘッダー（計画・管理 / 分析・記録）
  function renderNavSection(label: string, open: boolean, setOpen: (v: boolean) => void) {
    return (
      <button
        onClick={() => setOpen(!open)}
        title={collapsed ? label : undefined}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          gap: collapsed ? 0 : 8,
          padding: collapsed ? '8px 0' : '6px 10px',
          justifyContent: collapsed ? 'center' : 'space-between',
          border: 'none', cursor: 'pointer', background: 'transparent',
          color: 'var(--text-3)', borderRadius: 'var(--r-sm)',
          marginTop: 8, marginBottom: 2,
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-sub)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
      >
        {collapsed ? (
          <ChevronDown size={11} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }} />
        ) : (
          <>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.07em', color: 'var(--text-3)' }}>{label}</span>
            <ChevronDown size={10} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s', flexShrink: 0 }} />
          </>
        )}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>

      {/* Sidebar — hidden in presentation mode and on mobile */}
      {!presentMode && !isMobile && (
      <aside className="admin-sidebar" style={{
        width: w, minWidth: w,
        height: '100vh',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        transition: 'width 0.18s ease',
        // overflow: hidden は外さないとドロップダウンが切れる。
        // テキストはcollapsed切替で即消えるため遷移中のはみ出しは無い。
        overflow: 'visible',
        flexShrink: 0,
      }}>
        {/* Logo + global actions (bell / present / collapse) */}
        <div className="admin-sidebar-logo" style={{
          height: 52,
          padding: '0 8px 0 14px',
          borderBottom: '1px solid var(--border-sub)',
          display: 'flex', alignItems: 'center',
          gap: 5, flexShrink: 0,
          background: 'var(--surface)',
          zIndex: 10,
        }}>
          {/* ロゴ（展開時のみ） */}
          {!collapsed && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontWeight: 900, fontSize: 15, letterSpacing: '-0.03em', color: 'var(--accent)', whiteSpace: 'nowrap' }}>PuzzleWork</div>
              <div style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 1, letterSpacing: '0.10em', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Workspace</div>
            </div>
          )}

          {/* 展開時: プレゼン + 通知ベル */}
          {!collapsed && (
            <>
              {/* Present mode */}
              <button
                onClick={() => setPresentMode(true)}
                title="プレゼンモード（サイドバー非表示）"
                style={{ width: 26, height: 26, borderRadius: 'var(--r-sm)', background: 'none', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}
              >
                <Monitor size={12} />
              </button>

              {/* Notification bell (expanded) */}
              <div ref={notifRef} style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={() => { const opening = !notifOpen; setNotifOpen(opening); if (opening) { setNotifTab('notif'); setTimeout(markAllRead, 1500); } }}
                  style={{ position: 'relative', width: 26, height: 26, borderRadius: 'var(--r-sm)', background: 'none', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                >
                  <Bell size={12} style={{ color: unreadCount > 0 ? '#E60012' : 'var(--text-3)' }} />
                  {unreadCount > 0 && (
                    <div style={{ position: 'absolute', top: -3, right: -3, width: 13, height: 13, borderRadius: '50%', background: '#E60012', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', border: '2px solid var(--surface)' }}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </div>
                  )}
                </button>
                {notifOpen && (
                  <div style={{ position: 'absolute', top: 32, left: 0, width: 320, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 200 }}>
                    {renderNotifPanel()}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Collapse toggle (always) */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}
            title={collapsed ? '展開' : '折りたたむ'}
          >
            {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
          </button>
        </div>

        {/* 展開時: 検索バー / 折りたたみ時: 検索+ベル+プレゼンのアイコン列 */}
        {!collapsed ? (
          /* ── 検索バー（展開） ── */
          <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-sub)', flexShrink: 0, background: 'var(--surface)' }}>
            <div className="admin-search-bar" style={{ position: 'relative' }} ref={searchRef}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={11} style={{ position: 'absolute', left: 8, color: 'var(--text-3)', pointerEvents: 'none' }} />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => handleSearchChange(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && searchQuery.trim().length >= 2) {
                      addToHistory(searchQuery.trim());
                      setSearchOpen(false);
                      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                    }
                  }}
                  placeholder="検索... ⌘K"
                  style={{ width: '100%', paddingLeft: 26, paddingRight: 10, paddingTop: 5, paddingBottom: 5, fontSize: 11.5, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', outline: 'none', color: 'var(--text-1)' }}
                />
              </div>
              {searchOpen && (
                <div style={{ position: 'absolute', top: 34, left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 200 }}>
                  {/* 履歴（クエリが空のとき） */}
                  {searchQuery.trim().length < 2 && searchHistory.length > 0 && (
                    <div>
                      <div style={{ padding: '6px 14px 4px', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em' }}>最近の検索</div>
                      {searchHistory.slice(0, 5).map(h => (
                        <div key={h}
                          onClick={() => { setSearchQuery(h); navigate(`/search?q=${encodeURIComponent(h)}`); setSearchOpen(false); }}
                          style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text-2)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ color: 'var(--text-3)', fontSize: 11 }}>⟳</span> {h}
                        </div>
                      ))}
                      <div style={{ height: 1, background: 'var(--border-sub)', margin: '4px 0' }} />
                    </div>
                  )}
                  {searchQuery.trim().length >= 2 && searchResults.length === 0 ? (
                    <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-3)' }}>見つかりませんでした</div>
                  ) : searchQuery.trim().length >= 2 ? (
                    <>
                      {searchResults.slice(0, 6).map(r => (
                        <div key={r.id}
                          onClick={() => {
                            addToHistory(searchQuery.trim());
                            setSearchOpen(false);
                            setSearchQuery('');
                            if (r.type === 'piece') navigate(`/board?piece=${r.id}`);
                            else if (r.type === 'project') navigate('/projects');
                          }}
                          style={{ padding: '9px 14px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', borderBottom: '1px solid var(--border-sub)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: r.type === 'piece' ? 'var(--accent-sub)' : '#F0FDF4', color: r.type === 'piece' ? 'var(--accent)' : '#15803D', flexShrink: 0 }}>
                            {r.type === 'piece' ? 'ピース' : 'PJ'}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{r.status}</span>
                        </div>
                      ))}
                      <div
                        onClick={() => { addToHistory(searchQuery.trim()); setSearchOpen(false); navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`); }}
                        style={{ padding: '8px 14px', fontSize: 11, color: 'var(--accent)', cursor: 'pointer', textAlign: 'center', borderTop: '1px solid var(--border-sub)', fontWeight: 700 }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--accent-sub)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        すべての結果を見る ({searchResults.length}件) →
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── アイコン列（折りたたみ時） ── */
          <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border-sub)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flexShrink: 0, background: 'var(--surface)' }}>
            {/* 検索 */}
            <button
              onClick={() => navigate('/search')}
              title="検索 (⌘K)"
              style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', background: 'none', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-3)' }}
            >
              <Search size={13} />
            </button>
            {/* 通知ベル (collapsed) */}
            <div ref={notifRef} style={{ position: 'relative' }}>
              <button
                onClick={() => { const opening = !notifOpen; setNotifOpen(opening); if (opening) { setNotifTab('notif'); setTimeout(markAllRead, 1500); } }}
                title="通知"
                style={{ position: 'relative', width: 30, height: 30, borderRadius: 'var(--r-sm)', background: 'none', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
              >
                <Bell size={13} style={{ color: unreadCount > 0 ? '#E60012' : 'var(--text-3)' }} />
                {unreadCount > 0 && (
                  <div style={{ position: 'absolute', top: -3, right: -3, width: 13, height: 13, borderRadius: '50%', background: '#E60012', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#fff', border: '2px solid var(--surface)' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </div>
                )}
              </button>
              {notifOpen && (
                <div style={{ position: 'absolute', top: 0, left: 38, width: 320, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 200 }}>
                  {renderNotifPanel()}
                </div>
              )}
            </div>
            {/* プレゼン */}
            <button
              onClick={() => setPresentMode(true)}
              title="プレゼンモード"
              style={{ width: 30, height: 30, borderRadius: 'var(--r-sm)', background: 'none', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-3)' }}
            >
              <Monitor size={13} />
            </button>
          </div>
        )}

        {/* Nav */}
        <nav className="admin-sidebar-nav" style={{ flex: 1, padding: '8px 6px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

          {/* ── コア機能（毎日使う） ── */}
          {CORE_NAV.map(item => renderNavItem(item))}

          {/* ── 計画・管理 ── */}
          {renderNavSection('計画・管理', planOpen, setPlanOpen)}
          {planOpen && PLAN_NAV.map(item => renderNavItem(item))}

          {/* ── 分析・記録 ── */}
          {renderNavSection('分析・記録', analysisOpen, setAnalysisOpen)}
          {analysisOpen && ANALYSIS_NAV.map(item => renderNavItem(item))}

          <div style={{ flex: 1 }} />

          {/* ── Puzzle News ── */}
          {(() => {
            const plan = user?.plan ?? 'free';
            const isPaid = plan !== 'free';
            if (collapsed) return (
              <a href="https://maoli1105.github.io/puzzle-inc-site/" target="_blank" rel="noopener noreferrer"
                title="Puzzle からのお知らせ"
                style={{ display: 'flex', justifyContent: 'center', padding: '6px 0', color: 'var(--text-3)', textDecoration: 'none' }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <rect x="1" y="3" width="12" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M4 6h6M4 8.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
              </a>
            );
            if (!newsOpen) return (
              <button onClick={() => setNewsOpen(true)}
                style={{ margin: '0 8px 4px', padding: '5px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: 'var(--text-3)', textAlign: 'left', borderRadius: 'var(--r-sm)' }}>
                Puzzle お知らせ ▸
              </button>
            );
            return (
              <div style={{ margin: '0 8px 4px', background: 'var(--surface-sub)', borderRadius: 'var(--r-sm)', overflow: 'hidden', border: '1px solid var(--border-sub)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 8px 3px' }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em' }}>PUZZLE NEWS</span>
                  {isPaid && (
                    <button onClick={() => setNewsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', padding: '0 0 0 4px', lineHeight: 1 }}>×</button>
                  )}
                </div>
                <a href="https://maoli1105.github.io/puzzle-inc-site/" target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', padding: '4px 8px 7px', textDecoration: 'none' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-1)', fontWeight: 500, lineHeight: 1.4 }}>株式会社パズルの最新情報</div>
                  <div style={{ fontSize: 9.5, color: 'var(--accent)', marginTop: 2 }}>puzzle-inc-site →</div>
                </a>
              </div>
            );
          })()}

          {/* ── Plan badge ── */}
          {!collapsed && (() => {
            const plan = user?.plan ?? 'free';
            const PLAN_COLOR: Record<string, string> = { free: '#6B6B68', pro: '#1A56DB', enterprise: '#7C3AED' };
            const PLAN_LABEL: Record<string, string> = { free: 'FREE', pro: 'PRO', enterprise: 'ENT' };
            return (
              <div style={{ margin: '4px 8px 2px', padding: '7px 10px', background: 'var(--surface-sub)', borderRadius: 'var(--r-sm)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{user?.company_name ?? 'ワークスペース'}</span>
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: `${PLAN_COLOR[plan]}20`, color: PLAN_COLOR[plan], letterSpacing: '0.06em' }}>
                  {PLAN_LABEL[plan]}
                </span>
              </div>
            );
          })()}

          {/* ── Settings always visible at bottom ── */}
          <div style={{ height: 1, background: 'var(--border-sub)', margin: '6px 4px' }} />
          {renderNavItem(SETTINGS_ITEM)}
        </nav>

        {/* User */}
        <div className="admin-sidebar-user" style={{
          padding: collapsed ? '10px 0' : '10px 10px',
          borderTop: '1px solid var(--border-sub)',
          display: 'flex', alignItems: 'center', gap: 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
          flexShrink: 0,
        }}>
          <div style={{ width: 27, height: 27, borderRadius: '50%', background: 'var(--zinc-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--zinc-200)', fontWeight: 600, fontSize: 11, flexShrink: 0, letterSpacing: '-0.01em' }}>
            {user?.name?.[0] ?? 'A'}
          </div>
          {!collapsed && (
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
              <button onClick={logout} style={{ background: 'none', border: 'none', padding: 0, fontSize: 10, color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, marginTop: 1 }}>
                <LogOut size={9} /> ログアウト
              </button>
            </div>
          )}
        </div>
      </aside>
      )}

      {/* Main */}
      <main className="admin-main" style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>

        {/* Presentation mode exit hint */}
        {presentMode && (
          <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 200 }}>
            <button
              onClick={() => setPresentMode(false)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 11, color: '#fff', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
            >
              <Monitor size={11} /> プレゼン終了 (Esc)
            </button>
          </div>
        )}

        {/* ? help button */}
        {!presentMode && (
        <button
          onClick={() => setShortcutsOpen(v => !v)}
          title="キーボードショートカット (?)"
          style={{
            position: 'absolute', bottom: 16, right: 16, zIndex: 50,
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: 12, fontWeight: 700,
            color: 'var(--text-3)', boxShadow: 'var(--shadow-sm)',
          }}
        >
          ?
        </button>
        )}

        {/* Shortcuts overlay */}
        {shortcutsOpen && (
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => setShortcutsOpen(false)}
          >
            <div
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', width: 420, padding: '20px 24px', boxShadow: 'var(--shadow-lg)' }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', marginBottom: 16, letterSpacing: '-0.01em' }}>キーボードショートカット</div>
              {[
                { keys: ['⌘K'], desc: '検索バーにフォーカス' },
                { keys: ['Enter'], desc: 'Enter で全文検索ページへ' },
                { keys: ['?'], desc: 'このヘルプを表示' },
                { keys: ['Esc'], desc: '検索 / モーダルを閉じる' },
                { keys: ['G', 'D'], desc: 'ダッシュボードへ移動' },
                { keys: ['G', 'K'], desc: 'カンバンへ移動' },
                { keys: ['G', 'T'], desc: 'チームへ移動' },
                { keys: ['G', 'P'], desc: 'プロジェクトへ移動' },
                { keys: ['G', 'V'], desc: '速度分析へ移動' },
                { keys: ['G', 'B'], desc: 'ボードへ移動' },
                { keys: ['G', 'S'], desc: '設定へ移動' },
                { keys: ['⌘Z'], desc: 'カンバン操作を元に戻す' },
              ].map(item => (
                <div key={item.desc} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-sub)' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{item.desc}</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {item.keys.map((k, ki) => (
                      <React.Fragment key={ki}>
                        {ki > 0 && <span style={{ fontSize: 10, color: 'var(--text-3)', alignSelf: 'center' }}>then</span>}
                        <kbd style={{ fontSize: 11, fontFamily: 'monospace', background: 'var(--surface-sub)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px', color: 'var(--text-1)', boxShadow: '0 1px 0 var(--border)' }}>
                          {k}
                        </kbd>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 12, fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>Esc または外側をクリックで閉じる</div>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflow: 'auto', paddingBottom: isMobile ? 56 : 0 }}>
          {children}
        </div>

        {/* ── モバイル ボトムナビ ─────────────────────────────────── */}
        {isMobile && !presentMode && (
          <>
            {/* Bottom tab bar */}
            <nav style={{
              position: 'fixed', bottom: 0, left: 0, right: 0,
              height: 56, background: 'var(--surface)',
              borderTop: '1px solid var(--border)',
              display: 'flex', alignItems: 'stretch',
              zIndex: 300,
            }}>
              {[
                { path: '/overview', Icon: Layers,    label: '工房'    },
                { path: '/board',    Icon: Grid2X2,   label: 'ボード'  },
                { path: '/kanban',   Icon: Kanban,    label: 'カンバン' },
                { path: '/gantt',    Icon: BarChart2, label: 'ガント'  },
              ].map(({ path, Icon, label }) => {
                const active = location.pathname === path;
                return (
                  <button
                    key={path}
                    onClick={() => { navigate(path); setMobileMenuOpen(false); }}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', gap: 3,
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: active ? '#B46400' : 'var(--text-3)',
                    }}
                  >
                    <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                    <span style={{ fontSize: 9, fontWeight: active ? 700 : 500, letterSpacing: '0.02em' }}>{label}</span>
                  </button>
                );
              })}
              {/* More button */}
              <button
                onClick={() => setMobileMenuOpen(v => !v)}
                style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 3,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: mobileMenuOpen ? '#B46400' : 'var(--text-3)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2.5, alignItems: 'center' }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: 'currentColor' }} />
                  ))}
                </div>
                <span style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.02em' }}>メニュー</span>
              </button>
            </nav>

            {/* Slide-up drawer */}
            {mobileMenuOpen && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 290 }}
                  onClick={() => setMobileMenuOpen(false)}
                />
                <div style={{
                  position: 'fixed', bottom: 56, left: 0, right: 0,
                  background: 'var(--surface)', borderTop: '1px solid var(--border)',
                  borderRadius: '12px 12px 0 0',
                  zIndex: 295, padding: '16px 8px 8px',
                  animation: 'mobile-drawer-up 0.2s ease-out',
                }}>
                  <style>{`@keyframes mobile-drawer-up{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', paddingLeft: 12, marginBottom: 8 }}>NAVIGATION</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
                    {[...PLAN_NAV, ...ANALYSIS_NAV, SETTINGS_ITEM].map(({ path, Icon, label }) => {
                      const active = location.pathname === path;
                      return (
                        <button
                          key={path}
                          onClick={() => { navigate(path); setMobileMenuOpen(false); }}
                          style={{
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 4,
                            padding: '12px 6px',
                            background: active ? 'rgba(180,100,0,0.08)' : 'var(--surface-sub)',
                            border: active ? '1px solid rgba(180,100,0,0.25)' : '1px solid transparent',
                            borderRadius: 8, cursor: 'pointer',
                            color: active ? '#B46400' : 'var(--text-2)',
                          }}
                        >
                          <Icon size={16} strokeWidth={active ? 2 : 1.8} />
                          <span style={{ fontSize: 9, fontWeight: active ? 700 : 400, textAlign: 'center', lineHeight: 1.3 }}>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {/* ユーザー情報 */}
                  <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10, paddingLeft: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>{user?.name}</div>
                      <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{user?.email}</div>
                    </div>
                    <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
                      <LogOut size={12} /> ログアウト
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </main>

      <UpgradeModal />
    </div>
  );
}
