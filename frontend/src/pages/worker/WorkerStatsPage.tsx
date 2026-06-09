/**
 * WorkerStatsPage — ワーカー個人コックピット
 * 自分の生産性・強み・期限管理を俯瞰する
 */
import { useEffect, useState } from 'react';
import { pieces as pieceApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useIsMobile } from '../../hooks/useIsMobile';
import { TrendingUp, TrendingDown, Minus, AlertCircle, Zap, Target, Clock, Tag, Building2 } from 'lucide-react';

interface Stats {
  done_this_month:  string;
  done_last_month:  string;
  in_progress_count: string;
  ready_count:      string;
  overdue_count:    string;
  avg_days:         string | null;
  impact_this_month: string;
  minutes_this_month: string;
  daily_done: { date: string; count: string }[];
  upcoming:   { id: string; title: string; status: string; due_date: string | null; business_impact: number; priority: number; source: string }[];
  skill_breakdown:      { tag: string; count: string }[];
  weekly_summary:       { week_start: string; count: string; minutes: string; personal_count: string; company_count: string }[];
  time_summary:         { est_total: string; act_total: string; timed_count: string };
  personal_tag_breakdown: { tag: string; count: string; minutes: string }[];
  company_breakdown:    { company_name: string | null; count: string; minutes: string }[];
}

function Sparkline({ data, color }: { data: { date: string; count: string }[]; color: string }) {
  if (data.length < 2) return null;
  const values = data.map(d => parseInt(d.count, 10));
  const max = Math.max(...values, 1);
  const W = 200, H = 40;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - (v / max) * H * 0.85 - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => {
        const x = (i / (values.length - 1)) * W;
        const y = H - (v / max) * H * 0.85 - 2;
        return v > 0 ? <circle key={i} cx={x} cy={y} r={2.5} fill={color} /> : null;
      })}
    </svg>
  );
}

function StatCard({ label, value, sub, icon, color = 'var(--accent)' }: {
  label: string; value: string | number; sub?: string; icon: React.ReactNode; color?: string;
}) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
      padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.04em', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{sub}</div>}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  done: '#AAAAAA', in_progress: '#B46400', ready: '#555555', locked: '#AAAAAA',
};
const STATUS_LABEL: Record<string, string> = {
  done: '完了', in_progress: '進行中', ready: '着手可', locked: 'ロック',
};

export default function WorkerStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const isMobile = useIsMobile();

  useEffect(() => {
    pieceApi.getMyStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 12 }}>
        読み込み中…
      </div>
    );
  }

  if (!stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', flexDirection: 'column', gap: 12, color: 'var(--text-3)', fontSize: 12 }}>
        <TrendingUp size={28} style={{ opacity: 0.3 }} />
        <div>統計データを取得できませんでした</div>
        <div style={{ fontSize: 10 }}>管理者がデータを蓄積すると表示されます</div>
      </div>
    );
  }

  const doneThis = parseInt(stats.done_this_month, 10);
  const doneLast = parseInt(stats.done_last_month, 10);
  const trend = doneThis > doneLast ? 'up' : doneThis < doneLast ? 'down' : 'flat';
  const trendColor = trend === 'up' ? 'var(--text-2)' : trend === 'down' ? '#E60012' : 'var(--text-3)';
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;

  // 新フィールドが古いキャッシュ or 旧バックエンドで undefined になる場合の防御
  const skillBreakdown      = stats.skill_breakdown       ?? [];
  const weeklySummary       = stats.weekly_summary        ?? [];
  const personalTagBreakdown = stats.personal_tag_breakdown ?? [];
  const companyBreakdown    = stats.company_breakdown     ?? [];

  const maxSkill = Math.max(...skillBreakdown.map(s => parseInt(s.count, 10)), 1);

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: isMobile ? '16px 12px 80px' : '24px 20px 80px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ヘッダー */}
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.03em' }}>
          {user?.name ?? 'あなた'}のコックピット
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>個人の生産性・強みを把握する</div>
      </div>

      {/* KPIカード */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(3, 1fr)', gap: 12 }}>
        <StatCard
          label="今月の完了"
          value={doneThis}
          sub={`先月: ${doneLast}件`}
          icon={<TrendIcon size={14} color={trendColor} />}
          color={trendColor}
        />
        <StatCard
          label="平均完了日数"
          value={stats.avg_days ? `${stats.avg_days}日` : '—'}
          sub="着手〜完了の平均"
          icon={<Zap size={14} />}
        />
        <StatCard
          label="今月の作業時間"
          value={(() => {
            const m = parseInt(stats.minutes_this_month, 10);
            if (!m) return '—';
            return m >= 60 ? `${Math.floor(m/60)}h${m%60 ? m%60+'m' : ''}` : `${m}m`;
          })()}
          sub="実績入力分の合計"
          icon={<Clock size={14} />}
          color="#4A6FA5"
        />
        <StatCard
          label="今月の貢献インパクト"
          value={parseInt(stats.impact_this_month, 10)}
          sub="完了ピースの合計"
          icon={<Target size={14} />}
          color="#B46400"
        />
      </div>

      {/* ステータス概要 */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 12, letterSpacing: '-0.01em' }}>現在の担当状況</div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { key: 'in_progress', val: stats.in_progress_count, label: '進行中' },
            { key: 'ready',       val: stats.ready_count,       label: '着手可' },
            { key: 'overdue',     val: stats.overdue_count,     label: '期限超過' },
          ].map(({ key, val, label }) => {
            const n = parseInt(val, 10);
            const color = key === 'overdue' ? '#E60012' : STATUS_COLOR[key] ?? 'var(--text-1)';
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-0.04em' }}>{n}</span>
                <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{label}</span>
              </div>
            );
          })}
          {parseInt(stats.overdue_count, 10) > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8, padding: '4px 10px', background: 'rgba(230,0,18,0.06)', border: '1px solid rgba(230,0,18,0.20)', borderRadius: 4 }}>
              <AlertCircle size={11} color="#E60012" />
              <span style={{ fontSize: 10, color: '#E60012', fontWeight: 600 }}>期限超過があります</span>
            </div>
          )}
        </div>
      </div>

      {/* アクティビティスパークライン */}
      {stats.daily_done.length > 1 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '-0.01em' }}>30日間の完了推移</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
              {stats.daily_done.reduce((s, d) => s + parseInt(d.count, 10), 0)} 件完了
            </div>
          </div>
          <Sparkline data={stats.daily_done} color="#B46400" />
        </div>
      )}

      {/* 期限が近いピース */}
      {stats.upcoming.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 12, letterSpacing: '-0.01em' }}>直近の期限</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {stats.upcoming.map(p => {
              const daysLeft = p.due_date
                ? Math.ceil((new Date(p.due_date).getTime() - Date.now()) / 86400000)
                : null;
              const urgent = daysLeft !== null && daysLeft <= 3;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border-sub)' }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: STATUS_COLOR[p.status], flexShrink: 0 }}>
                    {STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title}
                  </span>
                  {daysLeft !== null && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: urgent ? '#E60012' : 'var(--text-3)', flexShrink: 0 }}>
                      {daysLeft < 0 ? `${Math.abs(daysLeft)}日超過` : daysLeft === 0 ? '今日' : `残${daysLeft}日`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* スキル強み */}
      {skillBreakdown.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 12, letterSpacing: '-0.01em' }}>あなたの強みスキル</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {skillBreakdown.map(s => {
              const n = parseInt(s.count, 10);
              const pct = Math.round((n / maxSkill) * 100);
              return (
                <div key={s.tag} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-1)', width: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{s.tag}</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--surface-sub)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#B46400', borderRadius: 3, transition: 'width 0.5s ease' }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', width: 24, textAlign: 'right', flexShrink: 0 }}>{n}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 週次サマリー（過去12週） ── */}
      {weeklySummary.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 14, letterSpacing: '-0.01em' }}>週次完了サマリー（過去12週）</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...weeklySummary].reverse().map((w, i) => {
              const weekStart = new Date(w.week_start);
              const weekEnd   = new Date(weekStart.getTime() + 6 * 86400000);
              const label = `${weekStart.getMonth()+1}/${weekStart.getDate()} 〜 ${weekEnd.getMonth()+1}/${weekEnd.getDate()}`;
              const total     = parseInt(w.count, 10);
              const personal  = parseInt(w.personal_count, 10);
              const company   = parseInt(w.company_count, 10);
              const mins      = parseInt(w.minutes, 10);
              const maxCount  = Math.max(...weeklySummary.map(x => parseInt(x.count, 10)), 1);
              const isCurrentWeek = i === 0;
              return (
                <div key={w.week_start} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 10px', borderRadius: 3,
                  background: isCurrentWeek ? 'rgba(180,100,0,0.05)' : 'transparent',
                  border: isCurrentWeek ? '1px solid rgba(180,100,0,0.15)' : '1px solid transparent',
                }}>
                  <span style={{ fontSize: 10, color: 'var(--text-3)', width: 80, flexShrink: 0 }}>{label}</span>
                  {/* 企業 + 個人の積み上げバー */}
                  <div style={{ flex: 1, height: 8, background: 'var(--surface-sub)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
                    <div style={{ width: `${Math.round((company/maxCount)*100)}%`, height: '100%', background: '#4A6FA5', transition: 'width 0.4s ease' }} />
                    <div style={{ width: `${Math.round((personal/maxCount)*100)}%`, height: '100%', background: '#888888', transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', width: 28, textAlign: 'right', flexShrink: 0 }}>{total}</span>
                  {mins > 0 && (
                    <span style={{ fontSize: 9, color: 'var(--text-4)', width: 40, textAlign: 'right', flexShrink: 0 }}>
                      {mins >= 60 ? `${Math.floor(mins/60)}h${mins%60?mins%60+'m':''}` : `${mins}m`}
                    </span>
                  )}
                </div>
              );
            })}
            <div style={{ display: 'flex', gap: 12, marginTop: 4, paddingLeft: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 1, background: '#4A6FA5' }} />
                <span style={{ fontSize: 9, color: 'var(--text-4)' }}>企業</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 8, height: 8, borderRadius: 1, background: '#888888' }} />
                <span style={{ fontSize: 9, color: 'var(--text-4)' }}>個人</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 個人タグ別実績 ── */}
      {personalTagBreakdown.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Tag size={13} color="var(--text-3)" />
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '-0.01em' }}>個人タグ別 完了実績</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {personalTagBreakdown.map(t => {
              const maxN = Math.max(...personalTagBreakdown.map(x => parseInt(x.count, 10)), 1);
              const pct  = Math.round((parseInt(t.count, 10) / maxN) * 100);
              const mins = parseInt(t.minutes, 10);
              return (
                <div key={t.tag} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-1)', width: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{t.tag}</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--surface-sub)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: '#888888', borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', width: 20, textAlign: 'right', flexShrink: 0 }}>{t.count}</span>
                  {mins > 0 && (
                    <span style={{ fontSize: 9, color: 'var(--text-4)', width: 40, textAlign: 'right', flexShrink: 0 }}>
                      {mins >= 60 ? `${Math.floor(mins/60)}h${mins%60?mins%60+'m':''}` : `${mins}m`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 企業別 貢献履歴 ── */}
      {companyBreakdown.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Building2 size={13} color="var(--text-3)" />
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '-0.01em' }}>企業別 完了実績</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {companyBreakdown.map(c => {
              const maxN = Math.max(...companyBreakdown.map(x => parseInt(x.count, 10)), 1);
              const pct  = Math.round((parseInt(c.count, 10) / maxN) * 100);
              const mins = parseInt(c.minutes, 10);
              const name = c.company_name ?? '個人タスク';
              return (
                <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-1)', width: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{name}</span>
                  <div style={{ flex: 1, height: 6, background: 'var(--surface-sub)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: c.company_name ? '#4A6FA5' : '#888888', borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', width: 20, textAlign: 'right', flexShrink: 0 }}>{c.count}</span>
                  {mins > 0 && (
                    <span style={{ fontSize: 9, color: 'var(--text-4)', width: 40, textAlign: 'right', flexShrink: 0 }}>
                      {mins >= 60 ? `${Math.floor(mins/60)}h${mins%60?mins%60+'m':''}` : `${mins}m`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--surface-sub)', borderRadius: 3, fontSize: 10, color: 'var(--text-3)', lineHeight: 1.7 }}>
            これがあなたのキャリア履歴です。ピースを完成させるたびに積み上がります。
          </div>
        </div>
      )}
    </div>
  );
}
