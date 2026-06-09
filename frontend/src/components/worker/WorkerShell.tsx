import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { users as usersApi, pieces as pieceApi } from '../../services/api';
import { ClipboardList, BarChart2, Store, LogOut, KeyRound, Check, Bell, CheckCircle2, CheckCheck, AlertTriangle, TrendingUp, UserCheck, X as XIcon, Award, Lightbulb, Building2, BookOpen, Mail } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import UpgradeModal from '../shared/UpgradeModal';
import { useNotificationStore } from '../../store/notificationStore';
import { useWebSocket } from '../../hooks/useWebSocket';
import { WSEvent } from '../../types';

const NAV = [
  { path: '/work',              Icon: ClipboardList, label: '自分のピース',        sub: 'タスク・進捗' },
  { path: '/work/stats',        Icon: BarChart2,     label: 'コックピット',        sub: '生産性・強み' },
  { path: '/work/portfolio',    Icon: BookOpen,      label: 'ポートフォリオ',      sub: '完成ピース記録' },
  { path: '/skills',            Icon: Award,         label: 'スキルツリー',        sub: '成長・実績' },
  { path: '/work/proposals',    Icon: Lightbulb,     label: 'ピース提案',          sub: '管理者に提案' },
  { path: '/marketplace',       Icon: Store,         label: 'マーケットプレイス', sub: '企業間の仕事' },
];

// ─── 通知ユーティリティ ──────────────────────────────────────────────────────
function timeAgo(ts: Date): string {
  const diff = Date.now() - ts.getTime();
  if (diff < 60_000)    return 'たった今';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  return `${Math.floor(diff / 86_400_000)}日前`;
}

function NotifIcon({ type }: { type: string }) {
  const s = { size: 13, strokeWidth: 2, style: { flexShrink: 0 } };
  switch (type) {
    case 'piece_ready':    return <CheckCircle2 {...s} style={{ ...s.style, color: 'var(--text-2)' }} />;
    case 'piece_done':     return <CheckCheck   {...s} style={{ ...s.style, color: 'var(--text-3)' }} />;
    case 'piece_assigned': return <UserCheck    {...s} style={{ ...s.style, color: '#B46400' }} />;
    case 'auto_promoted':  return <TrendingUp   {...s} style={{ ...s.style, color: '#B46400' }} />;
    case 'skill_levelup':  return <TrendingUp   {...s} style={{ ...s.style, color: '#B46400' }} />;
    case 'alert':
    case 'bottleneck_alert':
      return <AlertTriangle {...s} style={{ ...s.style, color: '#E60012' }} />;
    default:               return <Bell         {...s} style={{ ...s.style, color: 'var(--text-3)' }} />;
  }
}

// ─── イニシャルアバター ───────────────────────────────────────────────────────
function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  const hue = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `hsl(${hue},55%,52%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff',
      letterSpacing: '-0.02em', flexShrink: 0,
      userSelect: 'none',
    }}>
      {initials}
    </div>
  );
}

const MOBILE_NAV = [
  { path: '/work',              Icon: ClipboardList, label: 'ピース'  },
  { path: '/work/stats',        Icon: BarChart2,     label: 'コックピット' },
  { path: '/work/portfolio',    Icon: BookOpen,      label: 'ポートフォリオ' },
  { path: '/skills',            Icon: Award,         label: 'スキル'  },
  { path: '/work/proposals',    Icon: Lightbulb,     label: '提案' },
];

export default function WorkerShell({ children }: { children: React.ReactNode }) {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { user, logout } = useAuthStore();
  const isMobile  = useIsMobile();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [newsOpen,     setNewsOpen]     = useState(true);
  const [notifOpen,    setNotifOpen]    = useState(false);
  const [notifTab,     setNotifTab]     = useState<'notif' | 'activity' | 'contacts'>('notif');
  const [activities,   setActivities]   = useState<{ piece_id: string; piece_title: string; actor_name: string; action: string; created_at: string }[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [contacts, setContacts] = useState<{ id: string; sender_name: string; sender_email: string; message: string; created_at: string; read_at: string | null }[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const unreadContacts = contacts.filter(c => !c.read_at).length;
  const notifRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, addNotification, markAllRead, removeNotification } = useNotificationStore();
  const [pwModal,    setPwModal]    = useState(false);
  const [pwCurrent,  setPwCurrent]  = useState('');
  const [pwNew,      setPwNew]      = useState('');
  const [pwConfirm,  setPwConfirm]  = useState('');
  const [pwSaving,   setPwSaving]   = useState(false);
  const [pwError,    setPwError]    = useState('');
  const [pwSuccess,  setPwSuccess]  = useState(false);
  const [myCompanies, setMyCompanies] = useState<{ id: string; name: string; role: string }[]>([]);

  // WebSocket — 通知受信
  useWebSocket((event: WSEvent) => { addNotification(event); });

  // 所属会社一覧
  useEffect(() => {
    usersApi.myCompanies().then(setMyCompanies).catch(() => {});
  }, []);

  useEffect(() => {
    // ダークモード廃止: 常にライトモードで起動
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('theme');
  }, []);

  // 外クリックでユーザーメニューを閉じる
  useEffect(() => {
    if (!userMenuOpen) return;
    const close = () => setUserMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [userMenuOpen]);

  // 外クリックで通知パネルを閉じる
  useEffect(() => {
    if (!notifOpen) return;
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [notifOpen]);

  async function loadActivity() {
    if (activityLoading) return;
    setActivityLoading(true);
    try {
      const data = await pieceApi.getActivity(20);
      setActivities(data ?? []);
    } catch { /* ignore */ }
    finally { setActivityLoading(false); }
  }

  async function loadContacts() {
    if (contactsLoading) return;
    setContactsLoading(true);
    try {
      const { users: usersApi } = await import('../../services/api');
      const data = await usersApi.getMyContacts();
      setContacts(data ?? []);
    } catch { /* ignore */ }
    finally { setContactsLoading(false); }
  }

  async function markContactRead(id: string) {
    try {
      const { users: usersApi } = await import('../../services/api');
      await usersApi.markContactRead(id);
      setContacts(prev => prev.map(c => c.id === id ? { ...c, read_at: new Date().toISOString() } : c));
    } catch { /* ignore */ }
  }

  function renderNotifPanel() {
    return (
      <>
        <div style={{ padding: '10px 14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>通知</span>
          {notifTab === 'notif' && notifications.length > 0 && (
            <button onClick={() => useNotificationStore.getState().clear()} style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--text-3)', cursor: 'pointer', padding: 0 }}>すべて削除</button>
          )}
        </div>
        <div style={{ display: 'flex', padding: '6px 14px 0', borderBottom: '1px solid var(--border)' }}>
          {(['notif', 'contacts', 'activity'] as const).map(tab => {
            const label = tab === 'notif' ? '通知' : tab === 'contacts' ? '連絡' : 'アクティビティ';
            const active = notifTab === tab;
            const badge = tab === 'contacts' && unreadContacts > 0 ? unreadContacts : 0;
            return (
              <button key={tab} onClick={() => {
                setNotifTab(tab);
                if (tab === 'activity') loadActivity();
                if (tab === 'contacts') loadContacts();
              }}
                style={{ flex: 1, background: 'none', border: 'none', borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent', padding: '5px 0 7px', fontSize: 11, fontWeight: active ? 700 : 400, color: active ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', transition: 'color 0.1s', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
              >
                {label}
                {badge > 0 && (
                  <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 9, fontWeight: 700, borderRadius: 99, padding: '1px 5px', lineHeight: 1.4 }}>{badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {notifTab === 'notif' && (
          notifications.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>通知はありません</div>
          ) : (
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {notifications.map(n => (
                <div key={n.id}
                  onClick={() => { if (n.piece_id) navigate(`/piece/${n.piece_id}`); useNotificationStore.getState().markRead(n.id); }}
                  style={{ padding: '9px 12px', borderBottom: '1px solid var(--border-sub)', display: 'flex', gap: 9, alignItems: 'flex-start', background: n.read ? 'transparent' : 'var(--accent-sub)', cursor: n.piece_id ? 'pointer' : 'default', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (n.piece_id) (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-sub)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = n.read ? 'transparent' : 'var(--accent-sub)'; }}
                >
                  <div style={{ marginTop: 1, flexShrink: 0 }}><NotifIcon type={n.type} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.45, wordBreak: 'break-all' }}>{n.message}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{timeAgo(n.ts)}</div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); removeNotification(n.id); }}
                    style={{ background: 'none', border: 'none', padding: '1px 2px', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', flexShrink: 0, opacity: 0.6, borderRadius: 3 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.6'; }}
                  >
                    <XIcon size={11} />
                  </button>
                </div>
              ))}
            </div>
          )
        )}

        {notifTab === 'contacts' && (
          contactsLoading ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>読み込み中…</div>
          ) : contacts.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
              <Mail size={20} style={{ opacity: 0.3, display: 'block', margin: '0 auto 8px' }} />
              まだ連絡はありません<br />
              <span style={{ fontSize: 10, marginTop: 4, display: 'block' }}>ポートフォリオを公開すると相談が届きます</span>
            </div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {contacts.map(c => (
                <div
                  key={c.id}
                  onClick={() => !c.read_at && markContactRead(c.id)}
                  style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-sub)', background: c.read_at ? 'transparent' : 'var(--accent-sub)', cursor: c.read_at ? 'default' : 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Mail size={11} color="#B46400" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{c.sender_name}</span>
                    {!c.read_at && <span style={{ fontSize: 9, background: 'var(--accent)', color: '#fff', padding: '1px 5px', borderRadius: 99, fontWeight: 700 }}>NEW</span>}
                    <span style={{ fontSize: 10, color: 'var(--text-4)', marginLeft: 'auto' }}>{timeAgo(new Date(c.created_at))}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as any }}>
                    {c.message}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 4 }}>{c.sender_email}</div>
                </div>
              ))}
            </div>
          )
        )}

        {notifTab === 'activity' && (
          activityLoading ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>読み込み中…</div>
          ) : activities.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>アクティビティはありません</div>
          ) : (
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
              {activities.map((a, i) => (
                <div key={i}
                  onClick={() => navigate(`/piece/${a.piece_id}`)}
                  style={{ padding: '8px 14px', borderBottom: '1px solid var(--border-sub)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-sub)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
                >
                  <div style={{ fontSize: 11.5, color: 'var(--text-1)', lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 600 }}>{a.actor_name}</span>
                    <span style={{ color: 'var(--text-2)' }}> が </span>
                    <span style={{ color: 'var(--accent)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 110, display: 'inline-block', verticalAlign: 'bottom' }}>{a.piece_title}</span>
                    <span style={{ color: 'var(--text-2)' }}> を{a.action}</span>
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

  function handleLogout() { logout(); navigate('/login'); }

  function openPwModal() {
    setUserMenuOpen(false);
    setPwCurrent(''); setPwNew(''); setPwConfirm('');
    setPwError(''); setPwSuccess(false);
    setPwModal(true);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    if (pwNew !== pwConfirm) { setPwError('新しいパスワードが一致しません'); return; }
    if (pwNew.length < 8)    { setPwError('パスワードは8文字以上にしてください'); return; }
    setPwSaving(true);
    try {
      await usersApi.changePassword(pwCurrent, pwNew);
      setPwSuccess(true);
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
      setTimeout(() => setPwModal(false), 1800);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setPwError(msg ?? 'パスワードの変更に失敗しました');
    } finally { setPwSaving(false); }
  }

  const name = user?.name ?? '';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

      {/* ── ヘッダー ── */}
      <header style={{
        height: 52,
        display: 'flex', alignItems: 'center',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 20px',
        position: 'sticky', top: 0, zIndex: 100,
        gap: 0,
      }}>

        {/* ロゴ */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          marginRight: 24, flexShrink: 0,
        }}>
          {/* ジグソーアイコン（SVG） */}
          <svg width={18} height={18} viewBox="0 0 18 18" fill="none">
            <rect x={1} y={1} width={7} height={7} rx={1.5} fill="var(--accent)" opacity={0.9}/>
            <rect x={10} y={1} width={7} height={7} rx={1.5} fill="var(--accent)" opacity={0.55}/>
            <rect x={1} y={10} width={7} height={7} rx={1.5} fill="var(--accent)" opacity={0.55}/>
            <rect x={10} y={10} width={7} height={7} rx={1.5} fill="var(--accent)" opacity={0.35}/>
          </svg>
          <span style={{
            fontSize: 13, fontWeight: 800,
            letterSpacing: '-0.03em', color: 'var(--text-1)',
          }}>
            PuzzleWork
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '1px 6px',
            borderRadius: 20, background: 'var(--accent-sub)',
            color: 'var(--accent)', letterSpacing: '0.05em',
            marginLeft: 2,
          }}>
            WORKER
          </span>
        </div>

        {/* 接続企業数（ヘッダー右端のユーザーメニュー近くに移動するため、ここでは非表示） */}

        {/* ナビゲーション（デスクトップのみ） */}
        {!isMobile && NAV.map(({ path, Icon, label }) => {
          const active = location.pathname === path ||
            (path === '/work' && location.pathname === '/work');
          return (
            <Link key={path} to={path} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '0 14px', height: 52,
              fontSize: 12.5, fontWeight: active ? 700 : 400,
              color: active ? 'var(--accent)' : 'var(--text-2)',
              borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
              textDecoration: 'none', transition: 'color 0.15s',
              flexShrink: 0,
            }}>
              <Icon size={13} strokeWidth={active ? 2.5 : 2} />
              {label}
            </Link>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* Puzzle News */}
        {newsOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 12, padding: '4px 10px', background: 'var(--surface-sub)', borderRadius: 'var(--r-sm)', border: '1px solid var(--border-sub)', flexShrink: 0 }}>
            <a href="https://maoli1105.github.io/puzzle-inc-site/" target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 10.5, color: 'var(--accent)', textDecoration: 'none', fontWeight: 500, whiteSpace: 'nowrap' }}>
              Puzzle お知らせ →
            </a>
            <button onClick={() => setNewsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        )}

        {/* 通知ベル */}
        <div ref={notifRef} style={{ position: 'relative', marginRight: 4 }}>
          <button
            onClick={() => {
              const opening = !notifOpen;
              setNotifOpen(opening);
              if (opening) { setNotifTab('notif'); setTimeout(markAllRead, 1500); }
            }}
            title="通知"
            style={{
              position: 'relative', width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 8, cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <Bell size={14} style={{ color: unreadCount > 0 ? 'var(--accent)' : 'var(--text-3)' }} />
            {unreadCount > 0 && (
              <div style={{
                position: 'absolute', top: -4, right: -4,
                width: 14, height: 14, borderRadius: '50%',
                background: 'var(--accent)', border: '2px solid var(--surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8, fontWeight: 700, color: '#fff',
              }}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </div>
            )}
          </button>
          {notifOpen && (
            <div style={{
              position: 'absolute', top: 40, right: 0, width: 320,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, boxShadow: 'var(--shadow-lg)',
              overflow: 'hidden', zIndex: 200,
            }}>
              {renderNotifPanel()}
            </div>
          )}
        </div>

        {/* ユーザーアバター + メニュー */}
        <div
          style={{ position: 'relative', marginLeft: 6 }}
          onClick={e => { e.stopPropagation(); setUserMenuOpen(v => !v); }}
        >
          <button style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 8px', borderRadius: 8, border: 'none',
            background: userMenuOpen ? 'var(--surface-sub)' : 'none',
            cursor: 'pointer', transition: 'background 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
            onMouseLeave={e => {
              if (!userMenuOpen) e.currentTarget.style.background = 'none';
            }}
          >
            <Avatar name={name} size={26} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {name}
            </span>
          </button>

          {userMenuOpen && (
            <div style={{
              position: 'absolute', top: 40, right: 0, width: 180,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, boxShadow: 'var(--shadow-lg)',
              padding: '6px 0', zIndex: 200,
            }}>
              <div style={{ padding: '8px 14px 10px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-1)' }}>{name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{user?.email}</div>
              </div>
              {/* 所属会社一覧 */}
              {myCompanies.length > 0 && (
                <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.07em', marginBottom: 5 }}>
                    所属会社
                  </div>
                  {myCompanies.map(c => (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '3px 0', fontSize: 11, color: 'var(--text-2)',
                    }}>
                      <Building2 size={10} color="#4A6FA5" />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.name}
                      </span>
                      <span style={{
                        fontSize: 9, color: '#4A6FA5', fontWeight: 700,
                        background: 'rgba(74,111,165,0.1)', padding: '1px 5px', borderRadius: 2,
                      }}>
                        {c.role === 'admin' ? '管理者' : 'ワーカー'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={openPwModal}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 14px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: 'var(--text-2)', textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <KeyRound size={13} />
                パスワードを変更
              </button>
              <button
                onClick={handleLogout}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 14px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: 'var(--text-2)', textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <LogOut size={13} />
                ログアウト
              </button>
            </div>
          )}
        </div>
      </header>

      {/* iPhoneのセーフエリア対応 (PWA/ホーム画面追加時) */}
      <main style={{ paddingBottom: isMobile ? 'calc(56px + env(safe-area-inset-bottom, 0px))' : 0 }}>
        {children}
      </main>

      {/* ── モバイル ボトムナビ ─────────────────────────────────── */}
      {isMobile && (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          height: 'calc(56px + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'stretch',
          zIndex: 200,
        }}>
          {MOBILE_NAV.map(({ path, Icon, label }) => {
            const active = location.pathname === path ||
              (path === '/work' && (location.pathname === '/work' || location.pathname === '/work/pieces'));
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
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
        </nav>
      )}

      {/* ── パスワード変更モーダル ── */}
      {pwModal && (
        <>
          <div onClick={() => setPwModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9000, backdropFilter: 'blur(2px)' }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            zIndex: 9001, width: 'min(380px, 92vw)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '28px 24px',
            fontFamily: 'var(--font)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
                パスワードを変更
              </div>
              <button onClick={() => setPwModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 18, lineHeight: 1, padding: 4 }}>✕</button>
            </div>

            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {pwError && (
                <div style={{ fontSize: 11, color: '#E60012', background: 'rgba(230,0,18,0.05)', border: '1px solid rgba(230,0,18,0.20)', borderRadius: 6, padding: '8px 12px' }}>
                  {pwError}
                </div>
              )}
              {pwSuccess && (
                <div style={{ fontSize: 11, color: 'var(--text-2)', background: 'var(--surface-sub)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={12} /> 変更しました
                </div>
              )}
              {[
                { label: '現在のパスワード', val: pwCurrent, set: setPwCurrent, ph: '••••••••' },
                { label: '新しいパスワード', val: pwNew,     set: setPwNew,     ph: '8文字以上' },
                { label: '確認',             val: pwConfirm, set: setPwConfirm, ph: '再入力' },
              ].map(({ label, val, set, ph }) => (
                <div key={label}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
                  <input
                    type="password" value={val} onChange={e => set(e.target.value)}
                    placeholder={ph} required
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px', fontSize: 13, background: 'var(--surface)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
              <button
                type="submit" disabled={pwSaving}
                style={{ marginTop: 4, padding: '10px 0', background: 'var(--text-1)', color: '#FAFAF8', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: pwSaving ? 'not-allowed' : 'pointer', opacity: pwSaving ? 0.6 : 1 }}
              >
                {pwSaving ? '変更中...' : 'パスワードを変更'}
              </button>
            </form>
          </div>
        </>
      )}

      <UpgradeModal />
    </div>
  );
}
