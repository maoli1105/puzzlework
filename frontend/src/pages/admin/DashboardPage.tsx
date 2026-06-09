import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { pieces as pieceApi, projects as projectApi } from '../../services/api';
import { RefreshCw, FileText, Copy, Check, ChevronDown, ArrowRight, Target, Activity, AlertTriangle, Wrench } from 'lucide-react';
import { okrs as okrApi } from '../../services/api';
import { SkeletonCard } from '../../components/common/Skeleton';

interface AtRiskPiece {
  id: string; title: string; status: string;
  due_date: string | null; assignee_name: string | null;
  business_impact: number; risk_type: 'overdue' | 'stale' | 'unassigned';
}
interface SpofUser {
  id: string; name: string; email: string;
  critical_piece_count: number; total_business_impact: number;
}
interface OrgHealth {
  score: number;
  at_risk_pieces: AtRiskPiece[];
  spof_users: SpofUser[];
  total_business_impact_at_risk: number;
  pieces_on_time_pct: number;
  overloaded_count: number;
  stale_count: number;
  in_progress_count: number;
  done_this_week: number;
}

interface WeeklyTrend { week: string; done_count: number; }

interface ProjectRow {
  id: string; name: string; status: string;
  total_pieces: number; done_pieces: number; in_progress_pieces: number;
  avg_progress: number; overdue_pieces: number;
  next_due?: string | null;
  members?: { name: string }[];
}

interface StandupReport {
  generated_at: string;
  completed_yesterday: { title: string; assignee_name: string | null; completed_at: string }[];
  in_progress: { title: string; assignee_name: string | null; due_date: string | null; progress: number; business_impact: number }[];
  overdue: { title: string; assignee_name: string | null; due_date: string; business_impact: number }[];
  unassigned_ready: { title: string; business_impact: number }[];
}

function formatStandupText(r: StandupReport): string {
  const date = new Date().toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  const lines: string[] = [`■ デイリースタンドアップ ${date}`, ''];
  if (r.completed_yesterday.length > 0) {
    lines.push('【完了（昨日）】');
    r.completed_yesterday.forEach(p => lines.push(`  ✓ ${p.title}${p.assignee_name ? `（${p.assignee_name}）` : ''}`));
    lines.push('');
  }
  if (r.in_progress.length > 0) {
    lines.push('【進行中】');
    r.in_progress.forEach(p => {
      const due = p.due_date ? ` 〆${new Date(p.due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}` : '';
      lines.push(`  → ${p.title}${p.assignee_name ? `（${p.assignee_name}）` : ''}${due} ${p.progress}%`);
    });
    lines.push('');
  }
  if (r.overdue.length > 0) {
    lines.push('【⚠️ 期限超過・要対応】');
    r.overdue.forEach(p => {
      const impact = p.business_impact > 0 ? ` ¥${(p.business_impact / 10000).toFixed(0)}万影響` : '';
      lines.push(`  ! ${p.title}${p.assignee_name ? `（${p.assignee_name}）` : ''}${impact}`);
    });
    lines.push('');
  }
  if (r.unassigned_ready.length > 0) {
    lines.push('【着手待ち（担当未設定）】');
    r.unassigned_ready.slice(0, 3).forEach(p => lines.push(`  - ${p.title}`));
    lines.push('');
  }
  return lines.join('\n');
}

interface OkrSummary { id: string; title: string; key_results: { current_value: number; target_value: number }[]; status: string; }
function okrPct(o: OkrSummary): number {
  if (!o.key_results.length) return 0;
  const sum = o.key_results.reduce((s, kr) => s + (kr.target_value > 0 ? Math.min(100, (kr.current_value / kr.target_value) * 100) : 0), 0);
  return Math.round(sum / o.key_results.length);
}

interface ActivityItem {
  id: string; event_type: string; old_value: string | null; new_value: string | null;
  created_at: string; piece_title: string; piece_id: string; user_name: string | null;
}
const EVENT_LABELS: Record<string, string> = {
  status_changed: 'ステータス変更', assigned: 'アサイン', connected: '接続',
  published: '外部公開', blocker_reported: 'ブロッカー報告', marketplace_accepted: 'マーケット受注',
};
const EVENT_COLORS: Record<string, string> = {
  status_changed: '#555555', assigned: '#555555', connected: '#B46400',
  published: '#B46400', blocker_reported: '#E60012', marketplace_accepted: '#555555',
};

function healthColor(score: number) {
  if (score >= 80) return 'var(--text-2)';
  if (score >= 60) return '#B46400';
  return '#E60012';
}
function healthLabel(score: number) {
  if (score >= 80) return '良好';
  if (score >= 60) return '注意';
  return '警戒';
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<OrgHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [okrData, setOkrData] = useState<OkrSummary[]>([]);
  const [projectReport, setProjectReport] = useState<{ projects: ProjectRow[]; weekly_trend?: WeeklyTrend[] } | null>(null);
  const [standupReport, setStandupReport] = useState<StandupReport | null>(null);
  const [standupOpen, setStandupOpen] = useState(false);
  const [standupLoading, setStandupLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [okrOpen, setOkrOpen] = useState(true);
  const [activityOpen, setActivityOpen] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [countdown, setCountdown] = useState(30);
  const countdownRef = useRef<ReturnType<typeof setInterval>>();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, act, okrList, projReport] = await Promise.all([
        pieceApi.getOrgHealth(),
        pieceApi.getActivity(12).catch(() => []),
        okrApi.list().catch(() => []),
        projectApi.report().catch(() => null),
      ]);
      setHealth(data);
      setActivity(act);
      setOkrData(okrList.filter((o: OkrSummary) => o.status !== 'cancelled'));
      setProjectReport(projReport);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!autoRefresh) { clearInterval(countdownRef.current); return; }
    setCountdown(30);
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { load(); return 30; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(countdownRef.current);
  }, [autoRefresh, load]);

  async function openStandup() {
    setStandupOpen(true);
    setStandupLoading(true);
    try {
      const data = await pieceApi.getStandupReport();
      setStandupReport(data);
    } finally { setStandupLoading(false); }
  }

  async function handleCopy() {
    if (!standupReport) return;
    await navigator.clipboard.writeText(formatStandupText(standupReport));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  useEffect(() => { load(); }, [load]);
  const handleManualRefresh = () => { load(); setCountdown(30); };

  if (loading || !health) return (
    <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
      {[0,1,2].map(i => <SkeletonCard key={i} />)}
    </div>
  );

  const activeProjects = projectReport?.projects?.filter(p => p.status !== 'completed') ?? [];
  const overdue       = health.at_risk_pieces.filter(p => p.risk_type === 'overdue');
  const scoreColor    = healthColor(health.score);
  const weeklyTrend   = projectReport?.weekly_trend ?? [];

  // Fill missing weeks with 0
  const filledTrend: { label: string; count: number }[] = (() => {
    const map: Record<string, number> = {};
    weeklyTrend.forEach(w => { map[w.week.slice(0, 10)] = w.done_count; });
    return Array.from({ length: 4 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (3 - i) * 7);
      const mon = new Date(d); mon.setDate(d.getDate() - d.getDay() + 1);
      const key = mon.toISOString().slice(0, 10);
      const label = i === 3 ? '今週' : i === 2 ? '先週' : `${4 - i}週前`;
      return { label, count: map[key] ?? 0 };
    });
  })();

  const prompts = [
    { label: 'スタンドアップを作る', sub: '今日の状況をSlack用にまとめる', onClick: openStandup },
    { label: 'プロジェクトの遅れを確認', sub: `${overdue.length > 0 ? `${overdue.length}件の遅れあり` : '期限超過なし'}`, onClick: () => navigate('/projects') },
    { label: '誰に仕事を頼むか見る', sub: '負荷バランス・スキル別', onClick: () => navigate('/team') },
    { label: '全体像を画面共有する', sub: '俯瞰ビュー（プレゼン向き）', onClick: () => navigate('/overview') },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div className="page-toolbar" style={{ height: 52, padding: '0 24px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>今日の状況</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
            {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
          </div>
        </div>

        {/* Health score badge */}
        <div style={{ marginLeft: 20, display: 'flex', alignItems: 'center', gap: 7, padding: '4px 10px', background: `${scoreColor}10`, border: `1px solid ${scoreColor}30`, borderRadius: 99 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: scoreColor }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: scoreColor }}>{health.score}</span>
          <span style={{ fontSize: 10, color: scoreColor, opacity: 0.8 }}>{healthLabel(health.score)}</span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
          <button onClick={openStandup} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', background: 'var(--surface-sub)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>
            <FileText size={11} /> スタンドアップ
          </button>
          <button
            onClick={() => setAutoRefresh(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 10, color: 'var(--text-3)', cursor: 'pointer' }}
          >
            <RefreshCw size={10} />
            {autoRefresh ? `${countdown}s` : 'OFF'}
          </button>
          <button onClick={handleManualRefresh} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-3)' }}>
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      {/* Health score bar */}
      <div style={{ height: 3, background: 'var(--border)', flexShrink: 0 }}>
        <div style={{ height: '100%', width: `${health.score}%`, background: scoreColor, transition: 'width 0.8s ease' }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px 32px' }}>

        {/* ── STATS STRIP ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 8, marginBottom: 20 }}>
          <StatCard value={health.in_progress_count} label="進行中"   sub="現在対応中"  onClick={() => navigate('/kanban')} />
          <StatCard value={health.done_this_week}     label="今週完了" sub="この7日間"  onClick={() => navigate('/velocity')} />
          <StatCard value={overdue.length}            label="期限超過" sub="要対応"     urgent={overdue.length > 0} onClick={() => navigate('/repair')} />
          <StatCard value={health.stale_count}        label="停滞"     sub="更新なし"   urgent={health.stale_count > 0} onClick={() => navigate('/repair')} />
          <StatCard value={health.overloaded_count}   label="過負荷"   sub="メンバー"   urgent={health.overloaded_count > 0} onClick={() => navigate('/team')} />
          <StatCard value={health.pieces_on_time_pct} label="オンタイム率" sub="%" isPercent onClick={() => navigate('/velocity')} />
        </div>

        {/* ── ALERT STRIP (overdue) ── */}
        {overdue.length > 0 && (
          <div
            onClick={() => navigate('/repair')}
            style={{
              marginBottom: 20, padding: '12px 16px',
              background: 'rgba(230,0,18,0.04)', border: '1px solid rgba(230,0,18,0.2)',
              borderRadius: 'var(--r-md)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10,
              transition: 'border-color 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(230,0,18,0.4)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(230,0,18,0.2)')}
          >
            <AlertTriangle size={13} style={{ color: '#E60012', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#E60012' }}>{overdue.length}件 期限超過中</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>
                {overdue.slice(0, 2).map(p => p.title).join(' · ')}
                {overdue.length > 2 ? ` 他${overdue.length - 2}件` : ''}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, fontSize: 11, fontWeight: 600, color: '#E60012' }}>
              <Wrench size={11} />
              修復ページへ
            </div>
          </div>
        )}

        {/* ── WEEKLY TREND ── */}
        {filledTrend.some(w => w.count > 0) && (
          <div style={{ marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>週次完了トレンド</span>
              {filledTrend[3].count > filledTrend[2].count && (
                <span style={{ fontSize: 10, color: 'var(--text-2)', fontWeight: 700 }}>
                  ↑ 先週比 +{filledTrend[3].count - filledTrend[2].count}件
                </span>
              )}
              {filledTrend[3].count < filledTrend[2].count && filledTrend[2].count > 0 && (
                <span style={{ fontSize: 10, color: '#E60012', fontWeight: 700 }}>
                  ↓ 先週比 -{filledTrend[2].count - filledTrend[3].count}件
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 52 }}>
              {(() => {
                const max = Math.max(...filledTrend.map(w => w.count), 1);
                return filledTrend.map((w, i) => {
                  const pct = Math.round((w.count / max) * 100);
                  const isThis = i === 3;
                  return (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: isThis ? 700 : 400, color: isThis ? 'var(--accent)' : 'var(--text-3)' }}>
                        {w.count}
                      </span>
                      <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', height: 28 }}>
                        <div style={{
                          width: '100%',
                          height: `${Math.max(pct, 4)}%`,
                          minHeight: 3,
                          background: isThis ? 'var(--accent)' : 'var(--border)',
                          borderRadius: '3px 3px 0 0',
                          transition: 'height 0.4s ease',
                        }} />
                      </div>
                      <span style={{ fontSize: 9, color: isThis ? 'var(--accent)' : 'var(--text-3)', fontWeight: isThis ? 700 : 400, whiteSpace: 'nowrap' }}>
                        {w.label}
                      </span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* ── SPOF / 過負荷メンバー ── */}
        {health.spof_users.length > 0 && (
          <div style={{ marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '10px 14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>過負荷メンバー</span>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>— 集中リスクあり</span>
              <button onClick={() => navigate('/team')} style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}>
                チームを見る <ArrowRight size={9} />
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {health.spof_users.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'var(--surface-sub)', border: '1px solid var(--border)', borderRadius: 99 }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(180,100,0,0.15)', border: '1px solid rgba(180,100,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: '#B46400', flexShrink: 0 }}>
                    {u.name[0]}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-1)' }}>{u.name}</span>
                  <span style={{ fontSize: 10, color: '#B46400', fontWeight: 700 }}>{u.critical_piece_count}件</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── PROJECT PULSE ── */}
        {activeProjects.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '-0.01em' }}>プロジェクトの進み具合</div>
              {activeProjects.length > 5 && (
                <button onClick={() => navigate('/projects')} style={{ fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>
                  すべて見る →
                </button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {activeProjects.slice(0, 5).map(p => {
                const pct = p.total_pieces > 0
                  ? Math.round((p.done_pieces / p.total_pieces) * 100)
                  : p.avg_progress;
                const hasRisk = p.overdue_pieces > 0;
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/projects?id=${p.id}`)}
                    style={{ background: 'var(--surface)', border: `1px solid ${hasRisk ? 'rgba(230,0,18,0.2)' : 'var(--border)'}`, borderRadius: 'var(--r-md)', padding: '10px 14px', cursor: 'pointer', transition: 'border-color 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = hasRisk ? 'rgba(230,0,18,0.4)' : 'var(--text-3)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = hasRisk ? 'rgba(230,0,18,0.2)' : 'var(--border)')}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      {p.overdue_pieces > 0 && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#E60012', background: 'rgba(230,0,18,0.08)', border: '1px solid rgba(230,0,18,0.2)', borderRadius: 99, padding: '1px 6px', flexShrink: 0 }}>
                          {p.overdue_pieces}件超過
                        </span>
                      )}
                      {p.next_due && (
                        <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
                          〆{new Date(p.next_due).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 3, background: 'var(--surface-sub)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: hasRisk ? '#E60012' : 'var(--accent)', borderRadius: 99, transition: 'width 0.5s ease' }} />
                    </div>
                    {(p.in_progress_pieces > 0 || p.done_pieces > 0) && (
                      <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
                        {p.in_progress_pieces > 0 && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{p.in_progress_pieces}件 進行中</span>}
                        {p.done_pieces > 0 && <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{p.done_pieces}/{p.total_pieces}件 完了</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── 話しかけてみて ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', letterSpacing: '-0.01em', marginBottom: 8 }}>
            話しかけてみて
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 7 }}>
            {prompts.map((p, i) => (
              <button
                key={i}
                onClick={p.onClick}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)', cursor: 'pointer', textAlign: 'left',
                  transition: 'border-color 0.12s, background 0.12s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent)';
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--accent-sub)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
                  (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface)';
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-1)', marginBottom: 2 }}>{p.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{p.sub}</div>
                </div>
                <ArrowRight size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
              </button>
            ))}
          </div>
        </div>

        {/* ── OKR (collapsible) ── */}
        {okrData.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <button
              onClick={() => setOkrOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', borderTop: '1px solid var(--border-sub)', marginBottom: okrOpen ? 10 : 0 }}
            >
              <ChevronDown size={12} style={{ transform: okrOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }} />
              <span style={{ fontSize: 11, fontWeight: 500 }}>四半期OKR</span>
              {(() => {
                const totalPct = Math.round(okrData.reduce((s, o) => s + okrPct(o), 0) / okrData.length);
                return <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>{totalPct}%</span>;
              })()}
              <Target size={11} style={{ color: 'var(--text-3)', marginLeft: 4 }} />
            </button>
            {okrOpen && (
              <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(okrData.length, 3)}, 1fr)`, gap: 1, background: 'var(--border)' }}>
                  {okrData.slice(0, 3).map(o => {
                    const p = okrPct(o);
                    return (
                      <div key={o.id} style={{ padding: '12px 14px', background: 'var(--surface)' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-2)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={o.title}>{o.title}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1, background: 'var(--surface-sub)', borderRadius: 99, height: 4, border: '1px solid var(--border-sub)', overflow: 'hidden' }}>
                            <div style={{ width: `${p}%`, height: '100%', background: 'var(--accent)', borderRadius: 99, transition: 'width 0.5s' }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>{p}%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border)' }}>
                  <button onClick={() => navigate('/okr')} style={{ fontSize: 10, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>OKRの詳細を見る →</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Activity (collapsible) ── */}
        {activity.length > 0 && (
          <div>
            <button
              onClick={() => setActivityOpen(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', borderTop: '1px solid var(--border-sub)', marginBottom: activityOpen ? 10 : 0 }}
            >
              <ChevronDown size={12} style={{ transform: activityOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }} />
              <span style={{ fontSize: 11, fontWeight: 500 }}>最近のアクティビティ</span>
              <Activity size={11} style={{ color: 'var(--text-3)', marginLeft: 'auto' }} />
            </button>
            {activityOpen && (
              <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                {activity.map((item, i) => {
                  const color = EVENT_COLORS[item.event_type] ?? '#6B6B68';
                  const label = EVENT_LABELS[item.event_type] ?? item.event_type;
                  const timeAgo = (() => {
                    const diff = Date.now() - new Date(item.created_at).getTime();
                    const mins = Math.floor(diff / 60000);
                    if (mins < 60) return `${mins}分前`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs}時間前`;
                    return `${Math.floor(hrs / 24)}日前`;
                  })();
                  return (
                    <div key={item.id}
                      onClick={() => navigate(`/board?piece=${item.piece_id}`)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 16px', borderBottom: i < activity.length - 1 ? '1px solid var(--border-sub)' : 'none', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginTop: 5, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, color: 'var(--text-1)', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ fontWeight: 600, color }}>{label}</span>{' — '}
                          <span style={{ fontWeight: 500 }}>{item.piece_title}</span>
                          {item.event_type === 'status_changed' && item.new_value && (
                            <span style={{ color: 'var(--text-3)' }}> → {item.new_value}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
                          {item.user_name ?? '不明'} · {timeAgo}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Standup Modal */}
      {standupOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={e => { if (e.target === e.currentTarget) setStandupOpen(false); }}
        >
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--r-lg)', border: '1px solid var(--border)', width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>デイリースタンドアップ</div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>Slackやチャットにコピーして使えます</div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={handleCopy} disabled={!standupReport} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', background: copied ? 'var(--surface-sub)' : 'var(--surface-sub)', border: `1px solid ${copied ? 'var(--border)' : 'var(--border)'}`, borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, color: copied ? 'var(--text-2)' : 'var(--text-2)', cursor: 'pointer' }}>
                  {copied ? <Check size={11} /> : <Copy size={11} />}
                  {copied ? 'コピー完了' : 'コピー'}
                </button>
                <button onClick={() => setStandupOpen(false)} style={{ padding: '6px 10px', background: 'var(--surface-sub)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 11, color: 'var(--text-2)', cursor: 'pointer' }}>閉じる</button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {standupLoading ? (
                <div style={{ textAlign: 'center', color: 'var(--text-3)', padding: '32px 0', fontSize: 13 }}>生成中...</div>
              ) : standupReport ? (
                <pre style={{ fontFamily: '"Hiragino Sans", "Noto Sans JP", sans-serif', fontSize: 12, lineHeight: 1.8, color: 'var(--text-1)', whiteSpace: 'pre-wrap', margin: 0, background: 'var(--bg)', borderRadius: 'var(--r-sm)', padding: '14px 16px', border: '1px solid var(--border)' }}>
                  {formatStandupText(standupReport)}
                </pre>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, sub, urgent, isPercent, onClick }: {
  value: number; label: string; sub: string;
  urgent?: boolean; isPercent?: boolean; onClick: () => void;
}) {
  const color = urgent ? '#E60012' : 'var(--text-1)';
  const bg = urgent ? 'rgba(230,0,18,0.03)' : 'var(--surface)';
  const border = urgent ? 'rgba(230,0,18,0.18)' : 'var(--border)';
  return (
    <button
      onClick={onClick}
      style={{
        background: bg, border: `1px solid ${border}`,
        borderRadius: 'var(--r-lg)', padding: '14px 16px',
        display: 'flex', flexDirection: 'column',
        cursor: 'pointer', textAlign: 'left',
        transition: 'border-color 0.12s, box-shadow 0.12s',
        boxShadow: 'var(--shadow-sm)',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = urgent ? 'rgba(230,0,18,0.4)' : 'var(--accent)';
        (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 3px ' + (urgent ? 'rgba(230,0,18,0.08)' : 'var(--accent-sub)');
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = border;
        (e.currentTarget as HTMLButtonElement).style.boxShadow = 'var(--shadow-sm)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 2, marginBottom: 5 }}>
        <span style={{ fontSize: 34, fontWeight: 800, color, letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</span>
        {isPercent && <span style={{ fontSize: 13, color: 'var(--text-3)', fontWeight: 500 }}>%</span>}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: urgent ? '#E60012' : 'var(--text-2)' }}>{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{sub}</div>
    </button>
  );
}
