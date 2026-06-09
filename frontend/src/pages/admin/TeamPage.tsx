/**
 * TeamPage — チーム
 * ───────────────────────────────────────────
 * 誰が詰まっているか・誰に余裕があるかを一目で分かるページ。
 * 50人規模でも読める負荷比較リスト。
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { users as userApi, leave as leaveApi, pieces as pieceApi } from '../../services/api';
import { LeaveRequest } from '../../types';
import { Plus, Check, X, ChevronRight, BarChart2, Clock, Briefcase, RefreshCw, UserPlus } from 'lucide-react';

// ─── 型 ───────────────────────────────────────────────────────────────────────
interface WorkerDetail {
  id:                string;
  name:              string;
  email:             string;
  role:              string;
  active_pieces:     number;
  total_pieces_done: number;
  overdue_pieces:    number;
}

interface WorkerStats {
  user: WorkerDetail;
  skills: { skill: string; pieces_done: number; avg_days: number }[];
  recent_completed: { title: string; actual_days: number; business_impact: number; created_at: string }[];
  active_pieces: { id: string; title: string; status: string; due_date: string | null; progress: number }[];
}

// ─── 負荷レベル ───────────────────────────────────────────────────────────────
const LOAD = (n: number) => {
  if (n >= 6) return { color: '#E60012', bg: 'rgba(230,0,18,0.06)',  label: '過負荷', tier: 3 };
  if (n >= 4) return { color: '#B46400', bg: 'rgba(180,100,0,0.06)',  label: '高負荷', tier: 2 };
  if (n >= 1) return { color: '#1A56DB', bg: 'transparent',           label: '通常',   tier: 1 };
  return         { color: 'var(--text-2)', bg: 'transparent',               label: '余裕',   tier: 0 };
};

const STATUS_LABELS: Record<string, string> = {
  locked: 'ロック', ready: '準備完了', in_progress: '進行中', done: '完了',
};

type Tab = 'workload' | 'forecast' | 'leave';
const TABS: [Tab, string][] = [
  ['workload', '負荷状況'],
  ['forecast', '4週間予測'],
  ['leave',    '休暇管理'],
];

// ─── TeamPage ─────────────────────────────────────────────────────────────────
export default function TeamPage() {
  const navigate = useNavigate();
  const [tab,     setTab]     = useState<Tab>('workload');
  const [workers, setWorkers] = useState<WorkerDetail[]>([]);
  const [leaves,  setLeaves]  = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ws, ls] = await Promise.all([
        userApi.workers(),
        leaveApi.list().catch(() => []),
      ]);
      setWorkers(ws as WorkerDetail[]);
      setLeaves(ls as LeaveRequest[]);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleLeaveStatus(id: string, status: 'approved' | 'rejected') {
    await leaveApi.updateStatus(id, status);
    setLeaves(prev => prev.map(l => l.id === id ? { ...l, status } : l));
  }

  const actualWorkers = workers.filter(w => w.role !== 'admin');
  const totalActive   = actualWorkers.reduce((s, w) => s + w.active_pieces, 0);
  const overloaded    = actualWorkers.filter(w => w.active_pieces >= 6).length;
  const avgLoad       = actualWorkers.length > 0
    ? (totalActive / actualWorkers.length).toFixed(1)
    : '0';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── ヘッダー ── */}
      <div style={{
        height: 48, flexShrink: 0,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', padding: '0 20px', gap: 0,
      }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>チーム</span>
          {!loading && (
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
              {actualWorkers.length}人
              {overloaded > 0 && (
                <span style={{ marginLeft: 6, color: '#E60012', fontWeight: 600 }}>
                  · 過負荷 {overloaded}人
                </span>
              )}
            </span>
          )}
        </div>
        {/* 招待ボタン */}
        <button
          onClick={() => navigate('/settings')}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', marginRight: 8,
            background: 'var(--accent-sub)', border: '1px solid rgba(180,100,0,0.25)',
            borderRadius: 6, fontSize: 11, fontWeight: 700, color: 'var(--accent)',
            cursor: 'pointer', transition: 'opacity 0.1s', flexShrink: 0,
          }}
          title="設定ページでメンバーを招待"
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <UserPlus size={12} />
          メンバーを招待
        </button>

        {/* タブ */}
        <div style={{ display: 'flex', gap: 0, alignSelf: 'stretch', alignItems: 'stretch' }}>
          {TABS.map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '0 14px', background: 'none', border: 'none',
                borderBottom: tab === t ? '2px solid var(--text-1)' : '2px solid transparent',
                color: tab === t ? 'var(--text-1)' : 'var(--text-3)',
                fontSize: 11.5, fontWeight: tab === t ? 600 : 400,
                cursor: 'pointer',
                transition: 'color 0.1s',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <button
          onClick={load}
          style={{ marginLeft: 12, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-3)' }}
        >
          <RefreshCw size={11} />
        </button>
      </div>

      {/* ── ボディ ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'auto', padding: '18px 20px' }}>
          {loading ? (
            <LoadingSkeleton />
          ) : tab === 'workload' ? (
            <WorkloadView
              workers={actualWorkers}
              totalActive={totalActive}
              avgLoad={avgLoad}
              overloaded={overloaded}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : tab === 'forecast' ? (
            <ForecastView workers={actualWorkers} leaves={leaves} />
          ) : (
            <LeaveView leaves={leaves} workers={actualWorkers} onStatusChange={handleLeaveStatus} onRefresh={load} />
          )}
        </div>

        {selectedId && (
          <WorkerDetailPanel
            workerId={selectedId}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </div>
  );
}

// ─── WorkloadView ─────────────────────────────────────────────────────────────
function WorkloadView({ workers, totalActive, avgLoad, overloaded, selectedId, onSelect }: {
  workers:    WorkerDetail[];
  totalActive: number;
  avgLoad:    string;
  overloaded: number;
  selectedId: string | null;
  onSelect:   (id: string | null) => void;
}) {
  const maxLoad    = Math.max(...workers.map(w => w.active_pieces), 1);
  const totalDone  = workers.reduce((s, w) => s + (w.total_pieces_done || 0), 0);

  // 負荷ティア別にグループ化
  const groups = [
    { tier: 3, label: '過負荷',  note: '6件以上',  color: '#E60012', items: workers.filter(w => LOAD(w.active_pieces).tier === 3) },
    { tier: 2, label: '高負荷',  note: '4〜5件',   color: '#B46400', items: workers.filter(w => LOAD(w.active_pieces).tier === 2) },
    { tier: 1, label: '通常',    note: '1〜3件',   color: '#1A56DB', items: workers.filter(w => LOAD(w.active_pieces).tier === 1) },
    { tier: 0, label: '余裕あり', note: '担当なし', color: 'var(--text-2)', items: workers.filter(w => LOAD(w.active_pieces).tier === 0) },
  ].filter(g => g.items.length > 0);

  return (
    <div>
      {/* サマリーstrip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 1, background: 'var(--border)', border: '1px solid var(--border)', borderRadius: 3, overflow: 'hidden', marginBottom: 20 }}>
        {[
          { label: 'チーム人数',  value: `${workers.length}人`,   warn: false },
          { label: '進行中合計',  value: `${totalActive}件`,      warn: false },
          { label: '平均負荷',    value: `${avgLoad}件/人`,        warn: parseFloat(avgLoad) >= 4 },
          { label: '過負荷人数',  value: `${overloaded}人`,        warn: overloaded > 0 },
          { label: '累計完了',    value: `${totalDone}件`,         warn: false },
        ].map(item => (
          <div key={item.label} style={{ background: 'var(--surface)', padding: '12px 16px' }}>
            <div style={{ fontSize: 9.5, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 3 }}>{item.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: item.warn ? '#E60012' : 'var(--text-1)' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {/* グループ別リスト */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {groups.map(group => (
          <div key={group.tier}>
            {/* グループヘッダー */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, paddingLeft: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: group.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>{group.label}</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{group.note}</span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)' }}>{group.items.length}人</span>
            </div>

            {/* メンバー行 */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, overflow: 'hidden' }}>
              {group.items.map((w, i) => {
                const load = LOAD(w.active_pieces);
                const barPct = Math.round((w.active_pieces / maxLoad) * 100);
                const isSelected = selectedId === w.id;
                return (
                  <div
                    key={w.id}
                    onClick={() => onSelect(isSelected ? null : w.id)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '26px 1fr 180px 56px 60px 28px',
                      alignItems: 'center',
                      gap: 10,
                      padding: '9px 14px',
                      borderBottom: i < group.items.length - 1 ? '1px solid var(--border-sub)' : 'none',
                      background: isSelected ? 'var(--accent-sub)' : load.bg,
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                    }}
                    onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--surface-sub)'; }}
                    onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = load.bg; }}
                  >
                    {/* アバター */}
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: isSelected ? 'var(--accent)' : `${load.color}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700,
                      color: isSelected ? '#fff' : load.color,
                      flexShrink: 0,
                    }}>
                      {w.name[0]}
                    </div>

                    {/* 名前 */}
                    <div style={{ overflow: 'hidden' }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {w.name}
                      </div>
                      <div style={{ fontSize: 9.5, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {w.email}
                      </div>
                    </div>

                    {/* 負荷バー */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ background: 'var(--surface-sub)', borderRadius: 99, height: 5, border: '1px solid var(--border-sub)', overflow: 'hidden' }}>
                        <div style={{ background: load.color, borderRadius: 99, height: '100%', width: `${barPct}%`, transition: 'width 0.4s ease', minWidth: w.active_pieces > 0 ? 4 : 0 }} />
                      </div>
                    </div>

                    {/* 件数 */}
                    <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: load.color, letterSpacing: '-0.01em' }}>
                      {w.active_pieces}件
                      {w.overdue_pieces > 0 && (
                        <div style={{ fontSize: 9, color: '#E60012', fontWeight: 600 }}>遅延{w.overdue_pieces}</div>
                      )}
                    </div>

                    {/* 負荷ラベル */}
                    <div style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: 9.5, fontWeight: 600, color: load.color, background: `${load.color}14`, border: `1px solid ${load.color}30`, borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                        {load.label}
                      </span>
                    </div>

                    {/* 詳細 */}
                    <ChevronRight size={12} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── WorkerDetailPanel ────────────────────────────────────────────────────────
function WorkerDetailPanel({ workerId, onClose }: { workerId: string; onClose: () => void }) {
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setStats(null);
    userApi.stats(workerId)
      .then(s => setStats(s as WorkerStats))
      .finally(() => setLoading(false));
  }, [workerId]);

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const totalImpact = stats?.recent_completed.reduce((s, p) => s + (p.business_impact || 0), 0) ?? 0;

  return (
    <div style={{ width: 310, borderLeft: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
      {/* パネルヘッダー */}
      <div style={{ height: 52, padding: '0 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        {stats && (
          <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
            {stats.user.name[0]}
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {loading ? '…' : stats?.user.name ?? '不明'}
          </div>
          {stats && (
            <div style={{ fontSize: 9.5, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {stats.user.email}
            </div>
          )}
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 4, display: 'flex' }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '14px' }}>
        {loading ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12, textAlign: 'center', paddingTop: 32 }}>読み込み中...</div>
        ) : !stats ? (
          <div style={{ color: 'var(--text-3)', fontSize: 12 }}>データなし</div>
        ) : (
          <>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 18 }}>
              {[
                { icon: <Briefcase size={11} />, label: '進行中', value: `${stats.user.active_pieces}件`, warn: stats.user.active_pieces >= 6 },
                { icon: <Check size={11} />, label: '累計完了', value: `${stats.user.total_pieces_done}件`, warn: false },
                { icon: <Clock size={11} />, label: '平均日数', value: stats.skills.length > 0 ? (() => { const tot = stats.skills.reduce((s, sk) => s + sk.pieces_done, 0); return tot > 0 ? `${Math.round(stats.skills.reduce((s, sk) => s + sk.avg_days * sk.pieces_done, 0) / tot)}日` : '—'; })() : '—', warn: false },
                { icon: <BarChart2 size={11} />, label: '貢献', value: totalImpact > 0 ? `¥${(totalImpact / 10000).toFixed(0)}万` : '—', warn: false },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg)', border: `1px solid ${item.warn ? 'rgba(230,0,18,0.20)' : 'var(--border)'}`, borderRadius: 6, padding: '9px 11px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-3)', marginBottom: 3 }}>
                    {item.icon}
                    <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{item.label}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: item.warn ? '#E60012' : 'var(--text-1)', letterSpacing: '-0.02em' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* スキル別 */}
            {stats.skills.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <PanelSection icon={<BarChart2 size={10} />} label="スキル別実績" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {stats.skills.map(sk => {
                    const maxDone = Math.max(...stats.skills.map(s => s.pieces_done), 1);
                    return (
                      <div key={sk.skill}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                          <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{sk.skill}</span>
                          <span style={{ color: 'var(--text-3)' }}>{sk.pieces_done}件 · avg {sk.avg_days ?? '?'}日</span>
                        </div>
                        <div style={{ background: 'var(--surface-sub)', borderRadius: 99, height: 3 }}>
                          <div style={{ background: 'var(--accent)', borderRadius: 99, height: '100%', width: `${Math.round((sk.pieces_done / maxDone) * 100)}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 進行中ピース */}
            {stats.active_pieces.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <PanelSection icon={<Briefcase size={10} />} label="進行中ピース" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {stats.active_pieces.map(p => {
                    const overdue = p.due_date && new Date(p.due_date) < new Date();
                    return (
                      <div key={p.id} style={{ background: 'var(--bg)', border: `1px solid ${overdue ? 'rgba(230,0,18,0.20)' : 'var(--border)'}`, borderRadius: 5, padding: '7px 9px' }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-1)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 9, color: 'var(--text-3)', background: 'var(--border)', borderRadius: 3, padding: '1px 5px' }}>
                            {STATUS_LABELS[p.status] ?? p.status}
                          </span>
                          {p.due_date && (
                            <span style={{ fontSize: 9, color: overdue ? '#E60012' : 'var(--text-3)' }}>
                              {overdue ? '遅延' : ''} ~{new Date(p.due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                            </span>
                          )}
                          {p.progress > 0 && (
                            <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 'auto' }}>{p.progress}%</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 最近完了 */}
            {stats.recent_completed.length > 0 && (
              <div>
                <PanelSection icon={<Check size={10} />} label="最近の完了" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {stats.recent_completed.slice(0, 5).map((p, i) => (
                    <div key={i} style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 5, padding: '7px 9px' }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-1)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{p.actual_days}日</span>
                        {p.business_impact > 0 && <span style={{ fontSize: 9, color: 'var(--text-2)' }}>¥{(p.business_impact / 10000).toFixed(0)}万</span>}
                        <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 'auto' }}>{fmt(p.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.skills.length === 0 && stats.active_pieces.length === 0 && stats.recent_completed.length === 0 && (
              <div style={{ color: 'var(--text-3)', fontSize: 12, textAlign: 'center', paddingTop: 24 }}>まだ実績データがありません</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function PanelSection({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 7 }}>
      <span style={{ color: 'var(--text-3)' }}>{icon}</span>
      <span style={{ fontSize: 9.5, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}

// ─── ForecastView ─────────────────────────────────────────────────────────────
// 全ピースではなく /pieces を status フィルタ付きで取得して軽量化
function ForecastView({ workers, leaves }: { workers: WorkerDetail[]; leaves: LeaveRequest[] }) {
  const [activePieces, setActivePieces] = useState<{ id: string; assignee_id: string | null; due_date: string | null }[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    pieceApi.list({ status: 'in_progress,ready,locked' })
      .then((ps: any[]) => {
        setActivePieces(ps.filter((p: any) => p.due_date && p.assignee_id));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const today    = new Date();
  const dayOfWeek = today.getDay();
  const monday   = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const weeks = Array.from({ length: 4 }, (_, i) => {
    const start = new Date(monday);
    start.setDate(monday.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end, label: `${start.getMonth() + 1}/${start.getDate()}〜` };
  });

  const approvedLeaves = leaves.filter(l => l.status === 'approved');

  function isOnLeave(workerId: string, week: { start: Date; end: Date }) {
    return approvedLeaves.some(l => {
      if (l.user_id !== workerId) return false;
      const ls = new Date(l.start_date); const le = new Date(l.end_date);
      return ls <= week.end && le >= week.start;
    });
  }

  function pieceCount(workerId: string, week: { start: Date; end: Date }) {
    return activePieces.filter(p => {
      if (p.assignee_id !== workerId || !p.due_date) return false;
      const d = new Date(p.due_date);
      return d >= week.start && d <= week.end;
    }).length;
  }

  function cellStyle(count: number, onLeave: boolean): { bg: string; border: string; color: string; label: string } {
    if (onLeave)  return { bg: '#FEF9C3', border: '#FDE047', color: '#92400E', label: '休暇' };
    if (count === 0) return { bg: 'var(--surface-sub)', border: 'var(--border)', color: 'var(--text-2)', label: '余裕' };
    if (count <= 2)  return { bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8', label: `${count}件` };
    if (count <= 4)  return { bg: '#FFFBEB', border: '#FDE68A', color: '#92400E', label: `${count}件` };
    return { bg: 'rgba(230,0,18,0.05)', border: 'rgba(230,0,18,0.20)', color: '#E60012', label: `${count}件` };
  }

  if (!loaded) return <div style={{ color: 'var(--text-3)', fontSize: 12, paddingTop: 24 }}>読み込み中...</div>;

  // 最大20人まで表示（スクロール対象）
  const displayWorkers = workers.slice(0, 40);

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>
        今後4週間の期限到来ピース数（担当者別）と休暇予定
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, overflow: 'auto' }}>
        {/* ヘッダー行 */}
        <div style={{ display: 'grid', gridTemplateColumns: '150px repeat(4, 1fr)', minWidth: 500, borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <div style={{ padding: '8px 12px', fontSize: 9.5, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>メンバー</div>
          {weeks.map((w, i) => (
            <div key={i} style={{ padding: '8px 10px', textAlign: 'center', borderLeft: '1px solid var(--border-sub)', fontSize: 10.5, fontWeight: 600, color: 'var(--text-2)' }}>
              第{i + 1}週
              <div style={{ fontSize: 9.5, fontWeight: 400, color: 'var(--text-3)', marginTop: 1 }}>{w.label}</div>
            </div>
          ))}
        </div>

        {displayWorkers.map((w, wi) => (
          <div key={w.id} style={{ display: 'grid', gridTemplateColumns: '150px repeat(4, 1fr)', minWidth: 500, borderBottom: wi < displayWorkers.length - 1 ? '1px solid var(--border-sub)' : 'none' }}>
            <div style={{ padding: '9px 12px', display: 'flex', alignItems: 'center', gap: 7 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--surface-sub)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>
                {w.name[0]}
              </div>
              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
            </div>
            {weeks.map((week, wi2) => {
              const onLeave = isOnLeave(w.id, week);
              const count   = pieceCount(w.id, week);
              const cell    = cellStyle(count, onLeave);
              return (
                <div key={wi2} style={{ padding: '8px 10px', borderLeft: '1px solid var(--border-sub)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ background: cell.bg, border: `1px solid ${cell.border}`, borderRadius: 5, padding: '3px 10px', fontSize: 11, fontWeight: 600, color: cell.color, minWidth: 44, textAlign: 'center' }}>
                    {cell.label}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {workers.length === 0 && (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>ワーカーがいません</div>
        )}
      </div>
      {workers.length > 40 && (
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8, textAlign: 'center' }}>
          上位40人を表示中（全{workers.length}人）
        </div>
      )}
    </div>
  );
}

// ─── LeaveView ────────────────────────────────────────────────────────────────
function LeaveView({ leaves, workers, onStatusChange, onRefresh }: {
  leaves: LeaveRequest[];
  workers: WorkerDetail[];
  onStatusChange: (id: string, status: 'approved' | 'rejected') => void;
  onRefresh: () => void;
}) {
  const [form, setForm]           = useState({ start_date: '', end_date: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showForm, setShowForm]   = useState(false);

  const leaveApi_local = leaveApi; // avoid naming conflict

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.start_date || !form.end_date) return;
    setSubmitting(true);
    try {
      await leaveApi_local.create(form);
      setForm({ start_date: '', end_date: '', reason: '' });
      setShowForm(false);
      onRefresh();
    } finally { setSubmitting(false); }
  }

  const workerName = (id: string) => workers.find(w => w.id === id)?.name ?? id;
  const LEAVE_STATUS: Record<string, { color: string; label: string }> = {
    pending:  { color: '#B46400', label: '申請中' },
    approved: { color: 'var(--text-2)', label: '承認済' },
    rejected: { color: '#94A3B8', label: '却下' },
  };

  const sections: [string, LeaveRequest[]][] = [
    ['申請中', leaves.filter(l => l.status === 'pending')],
    ['承認済', leaves.filter(l => l.status === 'approved')],
    ['却下',   leaves.filter(l => l.status === 'rejected')],
  ];

  return (
    <div style={{ maxWidth: 680 }}>
      <div style={{ marginBottom: 18 }}>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', background: 'var(--text-1)', color: '#FAFAF8', border: 'none', borderRadius: 6, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}
        >
          <Plus size={12} /> 休暇申請
        </button>

        {showForm && (
          <form onSubmit={handleSubmit} style={{ marginTop: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 10, marginBottom: 12 }}>
              {[
                { key: 'start_date', label: '開始日', type: 'date' },
                { key: 'end_date',   label: '終了日', type: 'date' },
                { key: 'reason',     label: '理由',   type: 'text', placeholder: '例: 有給休暇' },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize: 9.5, color: 'var(--text-3)', fontWeight: 600, marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{f.label}</div>
                  <input
                    type={f.type}
                    value={form[f.key as keyof typeof form]}
                    onChange={e => setForm({ ...form, [f.key]: e.target.value })}
                    placeholder={(f as any).placeholder}
                    required={f.key !== 'reason'}
                    style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 5, padding: '6px 9px', fontSize: 12, boxSizing: 'border-box', outline: 'none', color: 'var(--text-1)', background: 'var(--surface)' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" disabled={submitting} style={{ padding: '6px 16px', background: 'var(--text-1)', color: '#FAFAF8', border: 'none', borderRadius: 5, fontSize: 11.5, fontWeight: 600, cursor: 'pointer' }}>
                {submitting ? '送信中...' : '申請する'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={{ padding: '6px 12px', background: 'transparent', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 5, fontSize: 11.5, cursor: 'pointer' }}>
                キャンセル
              </button>
            </div>
          </form>
        )}
      </div>

      {leaves.length === 0 && <div style={{ color: 'var(--text-3)', fontSize: 12, paddingTop: 20 }}>休暇申請はありません</div>}

      {sections.map(([title, items]) => items.length === 0 ? null : (
        <div key={title} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>{title}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {items.map(l => {
              const s = LEAVE_STATUS[l.status];
              return (
                <div key={l.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-sub)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>
                    {workerName(l.user_id)[0]}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-1)', marginBottom: 1 }}>{workerName(l.user_id)}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>
                      {l.start_date} 〜 {l.end_date}
                      {l.reason && <span style={{ marginLeft: 8 }}>· {l.reason}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, color: s.color, border: `1px solid ${s.color}44`, borderRadius: 4, padding: '2px 7px', flexShrink: 0 }}>{s.label}</span>
                  {l.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button onClick={() => onStatusChange(l.id, 'approved')} style={{ width: 26, height: 26, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={12} strokeWidth={2.5} />
                      </button>
                      <button onClick={() => onStatusChange(l.id, 'rejected')} style={{ width: 26, height: 26, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── LoadingSkeleton ──────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {[0.95, 0.85, 0.75, 0.65, 0.55].map((op, i) => (
        <div key={i} style={{ height: 42, borderRadius: 5, background: 'var(--surface)', border: '1px solid var(--border)', opacity: op }} />
      ))}
    </div>
  );
}

