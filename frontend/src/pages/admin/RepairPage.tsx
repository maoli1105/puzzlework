/**
 * RepairPage — 作業台
 * ──────────────────────────────────────────────────────────────────
 * 「問題リスト」ではなく「散らかった作業台」。
 *
 * 修復とは閉じることではない。流れを戻すことだ。
 *
 * 設計原則:
 *   - 赤警告禁止 / 数値の羅列禁止
 *   - 修復操作はカード上で完結する（ページ遷移しない）
 *   - 修復済みは自然に奥へ退く（消えるのではなく沈む）
 *   - 散らかり具合がそのまま状況を語る
 *   - 担当なし → ここで渡せる
 *   - 期限超過 → ここで調整できる
 *   - ロック中 → ここで解除できる
 *   - ブロッカー報告 → ここで対処できる
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { pieces as pieceApi, users as usersApi } from '../../services/api';
import { RefreshCw, ArrowRight, Wrench, Users, Clock, Calendar, AlertTriangle, ShieldAlert } from 'lucide-react';

type RepairView = 'before' | 'after';

// ─── 型 ───────────────────────────────────────────────────────────────────────
interface AtRiskPiece {
  id:              string;
  title:           string;
  status:          string;
  due_date:        string | null;
  assignee_id:     string | null;
  assignee_name:   string | null;
  project_name:    string | null;
  project_id:      string | null;
  business_impact: number;
  risk_type:       'overdue' | 'stale' | 'unassigned';
}

interface BlockerPiece {
  id:             string;
  title:          string;
  status:         string;
  due_date:       string | null;
  assignee_id:    string | null;
  assignee_name:  string | null;
  project_name:   string | null;
  project_id:     string | null;
  business_impact: number;
  blocker_reason: string | null;
  reporter_name:  string | null;
  reported_at:    string;
}

interface SpofUser {
  id:                    string;
  name:                  string;
  critical_piece_count:  number;
  total_business_impact: number;
}

interface OrgHealth {
  at_risk_pieces:   AtRiskPiece[];
  blocker_pieces:   BlockerPiece[];
  spof_users:       SpofUser[];
  stale_count:      number;
  overloaded_count: number;
  in_progress_count: number;
  done_this_week:   number;
  score:            number;
}

interface Worker { id: string; name: string; }

// ─── CSS ─────────────────────────────────────────────────────────────────────
const REPAIR_CSS = `
  @keyframes repair-dot {
    0%, 80%, 100% { transform: scale(0.55); opacity: 0.3; }
    40%            { transform: scale(1);    opacity: 1;   }
  }
  @keyframes repair-card-done {
    from { opacity: 1;    transform: translateY(0)    scale(1); }
    to   { opacity: 0.22; transform: translateY(4px)  scale(0.97); }
  }
`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pieceScatter(id: string): { dx: number; rot: number } {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  const dx  = ((h & 0x3f) / 63 - 0.5) * 14;
  const rot = ((h >> 6 & 0x1f) / 31 - 0.5) * 1.6;
  return { dx, rot };
}

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - now.getTime()) / 86_400_000);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return 'たった今';
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  return `${days}日前`;
}

function actionBtnStyle(variant: 'warm' | 'neutral' | 'ghost' | 'danger' | 'resolve'): React.CSSProperties {
  const base: React.CSSProperties = {
    fontSize: 10, fontWeight: 600,
    padding: '3px 8px', borderRadius: 3,
    cursor: 'pointer', border: 'none',
    letterSpacing: '0.01em',
    transition: 'background 0.1s',
    display: 'inline-flex', alignItems: 'center', gap: 3,
    whiteSpace: 'nowrap',
  };
  if (variant === 'warm')    return { ...base, background: 'rgba(194,154,108,0.12)', color: 'rgba(140,90,10,0.85)' };
  if (variant === 'neutral') return { ...base, background: 'var(--bg)',              color: 'var(--text-2)', border: '1px solid var(--border)' };
  if (variant === 'danger')  return { ...base, background: 'rgba(230,0,18,0.06)',    color: 'rgba(180,0,14,0.85)' };
  if (variant === 'resolve') return { ...base, background: 'var(--surface-sub)',      color: 'var(--text-2)', border: '1px solid var(--border)' };
  return { ...base, background: 'transparent', color: 'var(--text-3)', padding: '3px 6px' };
}

// ─── RepairCard ───────────────────────────────────────────────────────────────
function RepairCard({
  piece, workers, onRepaired, onNavigate,
}: {
  piece:      AtRiskPiece;
  workers:    Worker[];
  onRepaired: () => void;
  onNavigate: () => void;
}) {
  const [phase,        setPhase]        = useState<'idle' | 'acting' | 'done'>('idle');
  const [hovered,      setHovered]      = useState(false);
  const [showAssignee, setShowAssignee] = useState(false);
  const [showDatePick, setShowDatePick] = useState(false);
  const { dx, rot }   = pieceScatter(piece.id);

  const isLocked     = piece.status === 'locked';
  const isUnassigned = !piece.assignee_name;
  const isDone       = phase === 'done';

  async function handleUnlock() {
    if (phase !== 'idle') return;
    setPhase('acting');
    try {
      await pieceApi.updateStatus(piece.id, 'ready');
      setPhase('done');
      setTimeout(onRepaired, 700);
    } catch { setPhase('idle'); }
  }

  async function handleAssign(workerId: string) {
    if (phase !== 'idle') return;
    setShowAssignee(false);
    setPhase('acting');
    try {
      await pieceApi.assign(piece.id, workerId);
      setPhase('done');
      setTimeout(onRepaired, 700);
    } catch { setPhase('idle'); }
  }

  async function handleAdjustDate(deltaDays: number) {
    if (phase !== 'idle') return;
    setShowDatePick(false);
    setPhase('acting');
    try {
      const base = piece.due_date ? new Date(piece.due_date) : new Date();
      base.setDate(base.getDate() + deltaDays);
      const newDate = base.toISOString().split('T')[0];
      await pieceApi.update(piece.id, { due_date: newDate });
      setPhase('done');
      setTimeout(onRepaired, 700);
    } catch { setPhase('idle'); }
  }

  const daysInfo = (() => {
    if (!piece.due_date) return null;
    const d = daysUntil(piece.due_date);
    if (d < 0)   return { text: `${Math.abs(d)}日超過`, color: 'rgba(160,80,20,0.80)' };
    if (d === 0) return { text: '今日が期限',            color: 'rgba(160,80,20,0.80)' };
    if (d <= 3)  return { text: `残${d}日`,              color: 'rgba(160,120,20,0.70)' };
    return null;
  })();

  const accentColor = piece.risk_type === 'unassigned'
    ? 'rgba(100,116,139,0.5)'
    : piece.risk_type === 'overdue'
    ? 'rgba(160,60,30,0.55)'
    : 'rgba(180,130,60,0.50)';

  return (
    <div
      style={{
        marginLeft:      `${dx + 8}px`,
        marginRight:     `${-dx + 4}px`,
        transform:       isDone
          ? `rotate(${rot * 0.3}deg) translateY(5px) scale(0.97)`
          : `rotate(${rot}deg)`,
        opacity:         isDone ? 0.22 : phase === 'acting' ? 0.65 : 1,
        transition:      'opacity 0.4s ease, transform 0.4s ease',
        transformOrigin: 'center bottom',
        // hover 時にこのカードを最前面に出す。transform が stacking context を作るため
        // 子要素 (popup) が sibling カードの下に隠れないよう z-index を上げる。
        position:        'relative',
        zIndex:          hovered ? 10 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowAssignee(false); setShowDatePick(false); }}
    >
      <div style={{
        background:   'var(--surface)',
        border:       '1px solid var(--border)',
        borderLeft:   `2.5px solid ${accentColor}`,
        borderRadius: 5,
        padding:      '9px 10px 8px',
        cursor:       'default',
        position:     'relative',
        transition:   'box-shadow 0.15s',
        boxShadow:    hovered && !isDone ? '0 2px 8px rgba(0,0,0,0.07)' : 'none',
      }}>
        {piece.project_name && (
          <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 3, letterSpacing: '0.02em' }}>
            {piece.project_name}
          </div>
        )}
        <div style={{
          fontSize: 11.5, fontWeight: 500,
          color: 'var(--text-1)',
          lineHeight: 1.4, letterSpacing: '-0.01em',
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          paddingRight: hovered ? 80 : 0,
          transition: 'padding-right 0.1s',
        }}>
          {piece.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
          {piece.assignee_name ? (
            <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>{piece.assignee_name}</span>
          ) : (
            <span style={{ fontSize: 9.5, color: 'rgba(100,116,139,0.8)', fontStyle: 'italic' }}>担当なし</span>
          )}
          {daysInfo && (
            <span style={{ fontSize: 9, color: daysInfo.color, fontWeight: 600 }}>{daysInfo.text}</span>
          )}
          {piece.risk_type === 'stale' && (
            <span style={{ fontSize: 9, color: 'rgba(161,98,7,0.75)' }}>停滞中</span>
          )}
        </div>

        {hovered && !isDone && phase === 'idle' && (
          <div style={{
            position: 'absolute', right: 8, top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex', gap: 4, alignItems: 'center',
          }}>
            {isLocked && (
              <button onClick={e => { e.stopPropagation(); handleUnlock(); }} style={actionBtnStyle('warm')} title="ブロックを解除">
                解除
              </button>
            )}
            {isUnassigned && workers.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button onClick={e => { e.stopPropagation(); setShowAssignee(v => !v); setShowDatePick(false); }} style={actionBtnStyle('neutral')}>
                  <Users size={10} /> 渡す
                </button>
                {showAssignee && (
                  <div style={{ position: 'absolute', right: 0, top: '120%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, boxShadow: '0 4px 14px rgba(0,0,0,0.10)', minWidth: 130, zIndex: 200, overflow: 'hidden' }}>
                    {workers.slice(0, 12).map(w => (
                      <button key={w.id} onClick={e => { e.stopPropagation(); handleAssign(w.id); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 11, color: 'var(--text-1)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-sub)', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {w.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <button onClick={e => { e.stopPropagation(); setShowDatePick(v => !v); setShowAssignee(false); }} style={actionBtnStyle('neutral')}>
                <Calendar size={10} /> 期限
              </button>
              {showDatePick && (
                <div style={{ position: 'absolute', right: 0, top: '120%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, boxShadow: '0 4px 14px rgba(0,0,0,0.10)', zIndex: 200, overflow: 'hidden', minWidth: 110 }}>
                  {[
                    { label: '+1週間',  delta: 7  },
                    { label: '+2週間',  delta: 14 },
                    { label: '+1ヶ月',  delta: 30 },
                    { label: '今日に',  delta: 0  },
                  ].map(opt => (
                    <button key={opt.label} onClick={e => { e.stopPropagation(); handleAdjustDate(opt.delta); }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 11, color: 'var(--text-1)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-sub)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={e => { e.stopPropagation(); onNavigate(); }} style={actionBtnStyle('ghost')} title="ボードで確認">
              <ArrowRight size={12} />
            </button>
          </div>
        )}

        {phase === 'acting' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-3)', display: 'block', animation: `repair-dot 1.1s ${i * 0.18}s ease-in-out infinite` }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BlockerCard ──────────────────────────────────────────────────────────────
function BlockerCard({
  piece, workers, onRepaired, onNavigate,
}: {
  piece:      BlockerPiece;
  workers:    Worker[];
  onRepaired: () => void;
  onNavigate: () => void;
}) {
  const [phase,        setPhase]        = useState<'idle' | 'acting' | 'done'>('idle');
  const [hovered,      setHovered]      = useState(false);
  const [showAssignee, setShowAssignee] = useState(false);
  const { dx, rot }   = pieceScatter(piece.id + '_b');
  const isDone = phase === 'done';

  async function handleResolve() {
    if (phase !== 'idle') return;
    setPhase('acting');
    try {
      // ステータスを in_progress に戻して作業再開を促す
      const nextStatus = piece.status === 'locked' ? 'in_progress' : piece.status;
      if (piece.status === 'locked') await pieceApi.updateStatus(piece.id, nextStatus);
      setPhase('done');
      setTimeout(onRepaired, 700);
    } catch { setPhase('idle'); }
  }

  async function handleAssign(workerId: string) {
    if (phase !== 'idle') return;
    setShowAssignee(false);
    setPhase('acting');
    try {
      await pieceApi.assign(piece.id, workerId);
      setPhase('done');
      setTimeout(onRepaired, 700);
    } catch { setPhase('idle'); }
  }

  return (
    <div
      style={{
        marginLeft: `${dx + 8}px`,
        marginRight: `${-dx + 4}px`,
        transform: isDone
          ? `rotate(${rot * 0.3}deg) translateY(5px) scale(0.97)`
          : `rotate(${rot}deg)`,
        opacity: isDone ? 0.22 : phase === 'acting' ? 0.65 : 1,
        transition: 'opacity 0.4s ease, transform 0.4s ease',
        transformOrigin: 'center bottom',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowAssignee(false); }}
    >
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderLeft: '2.5px solid rgba(230,0,18,0.30)',
        borderRadius: 5,
        padding: '9px 10px 8px',
        cursor: 'default',
        position: 'relative',
        transition: 'box-shadow 0.15s',
        boxShadow: hovered && !isDone ? '0 2px 8px rgba(0,0,0,0.07)' : 'none',
      }}>
        {piece.project_name && (
          <div style={{ fontSize: 9, color: 'var(--text-3)', marginBottom: 3 }}>{piece.project_name}</div>
        )}
        <div style={{
          fontSize: 11.5, fontWeight: 500, color: 'var(--text-1)',
          lineHeight: 1.4, letterSpacing: '-0.01em',
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          paddingRight: hovered ? 90 : 0,
          transition: 'padding-right 0.1s',
        }}>
          {piece.title}
        </div>
        {/* ブロッカー理由 */}
        {piece.blocker_reason && (
          <div style={{ marginTop: 5, padding: '4px 7px', background: 'rgba(230,0,18,0.04)', borderRadius: 3, fontSize: 10, color: 'rgba(200,0,15,0.75)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {piece.blocker_reason}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
          {piece.reporter_name && (
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{piece.reporter_name} が報告 · {timeAgo(piece.reported_at)}</span>
          )}
          {piece.assignee_name && (
            <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>担当: {piece.assignee_name}</span>
          )}
        </div>

        {hovered && !isDone && phase === 'idle' && (
          <div style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: 4, alignItems: 'center' }}>
            <button onClick={e => { e.stopPropagation(); handleResolve(); }} style={actionBtnStyle('resolve')} title="対処済みにする">
              対処済み
            </button>
            {workers.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button onClick={e => { e.stopPropagation(); setShowAssignee(v => !v); }} style={actionBtnStyle('neutral')}>
                  <Users size={10} /> 渡す
                </button>
                {showAssignee && (
                  <div style={{ position: 'absolute', right: 0, top: '120%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, boxShadow: '0 4px 14px rgba(0,0,0,0.10)', minWidth: 130, zIndex: 200, overflow: 'hidden' }}>
                    {workers.slice(0, 12).map(w => (
                      <button key={w.id} onClick={e => { e.stopPropagation(); handleAssign(w.id); }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 11, color: 'var(--text-1)', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border-sub)', cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        {w.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={e => { e.stopPropagation(); onNavigate(); }} style={actionBtnStyle('ghost')} title="ボードで確認">
              <ArrowRight size={12} />
            </button>
          </div>
        )}

        {phase === 'acting' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, background: 'rgba(255,255,255,0.5)', pointerEvents: 'none' }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2].map(i => (
                <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--text-3)', display: 'block', animation: `repair-dot 1.1s ${i * 0.18}s ease-in-out infinite` }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ZoneHeader ──────────────────────────────────────────────────────────────
function ZoneHeader({ icon: Icon, label, note, count, color }: {
  icon: React.ElementType; label: string; note: string; count: number; color: string;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingLeft: 10 }}>
      <Icon size={11} strokeWidth={1.8} style={{ color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>{label}</span>
      <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>{note}</span>
      <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-4, var(--text-3))', background: 'var(--surface-sub)', padding: '1px 6px', borderRadius: 10 }}>
        {count}件
      </span>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────
function RepairSkeleton() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      {[0, 1].map(col => (
        <div key={col} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[0.90, 0.75, 0.88].map((op, i) => (
            <div key={i} style={{ height: 54, borderRadius: 5, background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '2.5px solid var(--border)', opacity: op }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────
function EmptyRepair() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--text-3)' }}>
      <Wrench size={30} strokeWidth={1.2} style={{ opacity: 0.20 }} />
      <div style={{ fontSize: 12, fontWeight: 500 }}>修復が必要なものはない</div>
      <div style={{ fontSize: 10, opacity: 0.6, letterSpacing: '0.02em' }}>工房は整っている</div>
    </div>
  );
}

// ─── RepairPage ───────────────────────────────────────────────────────────────
export default function RepairPage() {
  const navigate = useNavigate();
  const [health,     setHealth]     = useState<OrgHealth | null>(null);
  const [workers,    setWorkers]    = useState<Worker[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [repairView, setRepairView] = useState<RepairView | null>(null);
  const [demoType,   setDemoType]   = useState<string | null>(null);
  const [switching,  setSwitching]  = useState(false);
  const [repairedCount, setRepairedCount] = useState(0);

  async function load() {
    setLoading(true);
    try {
      const [h, ws] = await Promise.all([
        pieceApi.getOrgHealth(),
        usersApi.workers().catch(() => []),
      ]);
      setHealth(h as OrgHealth);
      setWorkers(ws as Worker[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  function handleRepaired() {
    setRepairedCount(c => c + 1);
    load();
  }

  useEffect(() => {
    load();
    axios.get('/api/demo/current')
      .then(r => {
        const t: string = r.data.type ?? 'unknown';
        setDemoType(t);
        if (t.endsWith('_before'))  setRepairView('before');
        else if (t !== 'unknown')   setRepairView('after');
        else                        setRepairView(null);
      })
      .catch(() => {});
  }, []);

  async function handleRepairViewSwitch(view: RepairView) {
    if (!demoType || switching) return;
    const base       = demoType.replace('_before', '');
    const targetType = view === 'before' ? `${base}_before` : base;
    setSwitching(true);
    try {
      await axios.post('/api/demo/switch', { type: targetType });
      setDemoType(targetType);
      setRepairView(view);
      await load();
    } catch { /* silent */ }
    finally { setSwitching(false); }
  }

  const atRisk     = health?.at_risk_pieces  ?? [];
  const blockers   = health?.blocker_pieces  ?? [];
  const spofs      = health?.spof_users      ?? [];

  const unassigned = atRisk.filter(p => p.risk_type === 'unassigned');
  const stale      = atRisk.filter(p => p.risk_type === 'stale');
  const overdue    = atRisk.filter(p => p.risk_type === 'overdue');
  const totalCount = atRisk.length + spofs.length + blockers.length;

  function navTo(id: string) {
    navigate(`/board?piece=${id}`);
  }

  const zones = [
    { id: 'blocker',    label: 'ブロッカー報告', note: 'ワーカーから報告',       pieces: blockers,   icon: ShieldAlert,   color: 'rgba(230,0,18,0.75)', isBlocker: true },
    { id: 'overdue',    label: '期限超過',        note: '予定を過ぎている',       pieces: overdue,    icon: AlertTriangle, color: 'rgba(160,60,30,0.75)',  isBlocker: false },
    { id: 'stale',      label: '長期停滞',        note: 'しばらく動いていない',   pieces: stale,      icon: Clock,         color: 'rgba(161,98,7,0.75)',   isBlocker: false },
    { id: 'unassigned', label: '担当待ち',        note: '受け取り手がいない',     pieces: unassigned, icon: Users,         color: 'rgba(100,116,139,0.75)', isBlocker: false },
  ].filter(z => z.pieces.length > 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <style>{REPAIR_CSS}</style>

      {/* ── ヘッダー ── */}
      <div className="page-toolbar" style={{ height: 52, padding: '0 20px', flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>修復の場</span>
          {!loading && (
            <span style={{ fontSize: 10, color: 'var(--text-3)', marginLeft: 8 }}>
              {totalCount > 0 ? `${totalCount}件 待機中` : '工房は整っている'}
            </span>
          )}
          {repairedCount > 0 && (
            <span style={{ fontSize: 10, color: 'var(--text-2)', marginLeft: 8, fontWeight: 600 }}>
              ✓ {repairedCount}件 修復済み
            </span>
          )}
        </div>

        {/* ブロッカー件数バッジ */}
        {!loading && blockers.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', background: 'rgba(230,0,18,0.05)', border: '1px solid rgba(230,0,18,0.15)', borderRadius: 4 }}>
            <ShieldAlert size={10} style={{ color: 'rgba(200,0,15,0.8)' }} />
            <span style={{ fontSize: 10, color: 'rgba(200,0,15,0.8)', fontWeight: 600 }}>ブロッカー {blockers.length}件</span>
          </div>
        )}

        {/* HealthScore */}
        {!loading && health && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'var(--surface-sub)', borderRadius: 4, border: '1px solid var(--border-sub)' }}>
            <span style={{ fontSize: 9.5, color: 'var(--text-3)' }}>工房スコア</span>
            <span style={{
              fontSize: 13, fontWeight: 800, letterSpacing: '-0.02em',
              color: health.score >= 80 ? 'var(--text-2)' : health.score >= 60 ? '#B46400' : '#E60012',
            }}>
              {health.score}
            </span>
            <span style={{ fontSize: 9, color: 'var(--text-3)' }}>/100</span>
          </div>
        )}

        {/* 修復前 / 修復後 トグル */}
        {repairView !== null && (
          <div style={{ display: 'flex', gap: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden', opacity: switching ? 0.5 : 1, transition: 'opacity 0.15s' }}>
            {(['before', 'after'] as RepairView[]).map(v => {
              const isActive = repairView === v;
              return (
                <button key={v}
                  onClick={() => !isActive && handleRepairViewSwitch(v)}
                  disabled={switching}
                  style={{ padding: '3px 10px', fontSize: 10, background: isActive ? 'rgba(194,154,108,0.10)' : 'transparent', border: 'none', borderLeft: v === 'after' ? '1px solid var(--border)' : 'none', color: isActive ? 'rgba(194,154,108,1)' : 'var(--text-3)', cursor: isActive ? 'default' : 'pointer', transition: 'background 0.12s, color 0.12s' }}
                >
                  {switching && isActive ? '…' : v === 'before' ? '修復前' : '修復後'}
                </button>
              );
            })}
          </div>
        )}

        <button onClick={load} title="更新" style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-3)' }}>
          <RefreshCw size={11} />
        </button>
      </div>

      {/* ── ボディ ── */}
      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg)', padding: '20px 20px 48px' }}>

        {loading ? (
          <RepairSkeleton />
        ) : totalCount === 0 ? (
          <EmptyRepair />
        ) : (
          <>
            {/* サマリー行 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingLeft: 2, flexWrap: 'wrap' }}>
              {blockers.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(200,0,15,0.80)' }}>
                  <ShieldAlert size={11} strokeWidth={1.8} /> ブロッカー {blockers.length}件
                </span>
              )}
              {overdue.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(160,60,30,0.80)' }}>
                  <AlertTriangle size={11} strokeWidth={1.8} /> 期限超過 {overdue.length}件
                </span>
              )}
              {stale.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(161,98,7,0.75)' }}>
                  <Clock size={11} strokeWidth={1.8} /> 停滞 {stale.length}件
                </span>
              )}
              {unassigned.length > 0 && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(100,116,139,0.80)' }}>
                  <Users size={11} strokeWidth={1.8} /> 担当待ち {unassigned.length}件
                </span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 9.5, color: 'var(--text-3)', opacity: 0.65, letterSpacing: '0.01em' }}>
                ホバーで修復アクション表示
              </span>
            </div>

            {/* ── ゾーン 2列グリッド ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '24px 32px' }}>
              {zones.map(zone => (
                <div key={zone.id}>
                  <ZoneHeader
                    icon={zone.icon}
                    label={zone.label}
                    note={zone.note}
                    count={zone.pieces.length}
                    color={zone.color}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {zone.isBlocker
                      ? (zone.pieces as BlockerPiece[]).map(p => (
                          <BlockerCard
                            key={p.id}
                            piece={p}
                            workers={workers}
                            onRepaired={handleRepaired}
                            onNavigate={() => navTo(p.id)}
                          />
                        ))
                      : (zone.pieces as AtRiskPiece[]).map(p => (
                          <RepairCard
                            key={p.id}
                            piece={p}
                            workers={workers}
                            onRepaired={handleRepaired}
                            onNavigate={() => navTo(p.id)}
                          />
                        ))
                    }
                  </div>
                </div>
              ))}

              {/* 属人化ゾーン */}
              {spofs.length > 0 && (
                <div>
                  <ZoneHeader icon={AlertTriangle} label="属人化" note="一人に集中しすぎている" count={spofs.length} color="rgba(230,0,18,0.7)" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {spofs.map(u => (
                      <div key={u.id} style={{ marginLeft: 8, display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '2.5px solid rgba(230,0,18,0.25)', borderRadius: 5 }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(230,0,18,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'rgba(200,0,15,0.9)', flexShrink: 0 }}>
                          {u.name[0]}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-1)' }}>{u.name}</div>
                          <div style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 2 }}>クリティカルなピースを {u.critical_piece_count} 件担当</div>
                        </div>
                        <button onClick={() => navigate(`/board?assignee=${u.id}`)} style={actionBtnStyle('ghost')} title="ボードで確認">
                          <ArrowRight size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
