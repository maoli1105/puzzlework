/**
 * VelocityPage — 組織記憶
 * ────────────────────────────────────────────────────────────
 * 「誰が何を、どれくらいの速さでこなすか」を蓄積・可視化する。
 *
 * タブ:
 *   [ワーカー] 個人別スキル習熟曲線 + 成長トレンド
 *   [スキル]   スキル別速度ランキング
 *   [傾向]     週次完了数 / 速度推移チャート
 */

import { useEffect, useState } from 'react';
import { pieces as pieceApi } from '../../services/api';
import { TrendingUp, TrendingDown, Minus, Users, Tag, Activity, ChevronUp, ChevronDown } from 'lucide-react';

// ─── 型 ─────────────────────────────────────────────────────────────────────
interface WorkerGrowth {
  id:              string;
  name:            string;
  total_done:      number;
  avg_days_all:    number | null;
  avg_days_early:  number | null;
  avg_days_recent: number | null;
  trend:           number | null;  // positive = getting faster (%)
  total_impact:    number;
  top_skills: { tag: string; count: number; avg_days: number | null }[];
}

interface WeekPoint { week: string; pieces_done: number; avg_days: number | null; }
interface SkillRank  { tag: string; count: number; avg_days: number | null; total_impact: number; }

interface GrowthData {
  workers:       WorkerGrowth[];
  weekly_trend:  WeekPoint[];
  skill_ranking: SkillRank[];
}

type Tab = 'workers' | 'skills' | 'trend';

// ─── ミニバー ────────────────────────────────────────────────────────────────
function MiniBar({ value, max, color, height = 6 }: { value: number; max: number; color: string; height?: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div style={{ flex: 1, background: 'var(--surface-sub)', borderRadius: 99, height, overflow: 'hidden', border: '1px solid var(--border-sub)' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
    </div>
  );
}

// ─── 速度バー (速いほど長い: 反転スケール) ────────────────────────────────────
function SpeedBar({ days, maxDays }: { days: number | null; maxDays: number }) {
  if (!days) return <div style={{ flex: 1 }} />;
  const pct = maxDays > 0 ? Math.min(((maxDays - days + 1) / maxDays) * 100, 100) : 0;
  const color = days <= 3 ? '#16a34a' : days <= 5 ? '#B46400' : '#E60012';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <div style={{ flex: 1, background: 'var(--surface-sub)', borderRadius: 99, height: 5, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 9, fontWeight: 700, color, minWidth: 28, textAlign: 'right' }}>{days}日</span>
    </div>
  );
}

// ─── 成長バッジ ──────────────────────────────────────────────────────────────
function TrendBadge({ trend }: { trend: number | null }) {
  if (trend === null) return null;
  if (Math.abs(trend) < 5) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, padding: '1px 7px', borderRadius: 99, background: 'var(--surface-sub)', color: 'var(--text-3)', border: '1px solid var(--border)', fontWeight: 600 }}>
        <Minus size={8} /> 横ばい
      </span>
    );
  }
  if (trend > 0) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, padding: '1px 7px', borderRadius: 99, background: 'rgba(22,163,74,0.08)', color: '#16a34a', border: '1px solid rgba(22,163,74,0.25)', fontWeight: 700 }}>
        <TrendingUp size={9} /> +{trend}% 速く
      </span>
    );
  }
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, padding: '1px 7px', borderRadius: 99, background: 'rgba(230,0,18,0.06)', color: '#E60012', border: '1px solid rgba(230,0,18,0.2)', fontWeight: 700 }}>
      <TrendingDown size={9} /> {trend}% 遅く
    </span>
  );
}

// ─── WorkerCard ───────────────────────────────────────────────────────────────
function WorkerCard({ worker }: { worker: WorkerGrowth }) {
  const [expanded, setExpanded] = useState(false);
  const maxSkillDays = Math.max(...worker.top_skills.map(s => s.avg_days ?? 0), 1);

  return (
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-lg)',
      overflow: 'hidden',
    }}>
      {/* ヘッダー行 */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
      >
        {/* アバター */}
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'var(--surface-sub)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0,
        }}>
          {worker.name.slice(0, 1)}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>{worker.name}</span>
            <TrendBadge trend={worker.trend} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
              完了 <strong style={{ color: 'var(--text-1)' }}>{worker.total_done}</strong>件
            </span>
            {worker.avg_days_all && (
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
                平均 <strong style={{ color: 'var(--text-1)' }}>{worker.avg_days_all}</strong>日
              </span>
            )}
            {worker.total_impact > 0 && (
              <span style={{ fontSize: 10, color: '#B46400', fontWeight: 600 }}>
                ¥{worker.total_impact.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* 速度改善グラフ（小） */}
        {worker.avg_days_early !== null && worker.avg_days_recent !== null && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, flexShrink: 0 }}>
            <div style={{ fontSize: 8, color: 'var(--text-3)' }}>過去→最近</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{worker.avg_days_early}日</span>
              <span style={{ fontSize: 9, color: 'var(--text-3)' }}>→</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: (worker.trend ?? 0) > 5 ? '#16a34a' : (worker.trend ?? 0) < -5 ? '#E60012' : 'var(--text-2)' }}>
                {worker.avg_days_recent}日
              </span>
            </div>
          </div>
        )}

        {expanded ? <ChevronUp size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                  : <ChevronDown size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
      </div>

      {/* スキル展開 */}
      {expanded && worker.top_skills.length > 0 && (
        <div style={{ padding: '4px 16px 14px', borderTop: '1px solid var(--border-sub)' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, marginTop: 10 }}>
            スキル別速度
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {worker.top_skills.map(s => (
              <div key={s.tag} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 10, color: 'var(--text-2)', minWidth: 100, flexShrink: 0 }}>{s.tag}</span>
                <SpeedBar days={s.avg_days} maxDays={maxSkillDays} />
                <span style={{ fontSize: 9, color: 'var(--text-3)', minWidth: 22, textAlign: 'right', flexShrink: 0 }}>{s.count}件</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TrendChart (SVG折れ線) ──────────────────────────────────────────────────
function TrendChart({ data }: { data: WeekPoint[] }) {
  if (data.length === 0) return (
    <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>
      データがありません（直近12週）
    </div>
  );

  const W = 560, H = 140, PAD = { t: 16, r: 16, b: 28, l: 36 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const n = data.length;

  const maxDone = Math.max(...data.map(d => d.pieces_done), 1);
  const validDays = data.filter(d => d.avg_days !== null).map(d => d.avg_days as number);
  const minDays = Math.min(...validDays, 0);
  const maxDays = Math.max(...validDays, 1);

  const x = (i: number) => PAD.l + (i / Math.max(n - 1, 1)) * cW;
  const yDone = (v: number) => PAD.t + cH - (v / maxDone) * cH;
  const yDays = (v: number) => PAD.t + cH - ((v - minDays) / Math.max(maxDays - minDays, 1)) * cH;

  const donePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${yDone(d.pieces_done).toFixed(1)}`).join(' ');
  const daysPoints = data.filter(d => d.avg_days !== null);
  const daysPath = daysPoints.map((d, idx) => {
    const origIdx = data.indexOf(d);
    return `${idx === 0 ? 'M' : 'L'}${x(origIdx).toFixed(1)},${yDays(d.avg_days!).toFixed(1)}`;
  }).join(' ');

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 10, color: 'var(--text-3)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 3, background: '#B46400', borderRadius: 2, display: 'inline-block' }} />
          件数
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 14, height: 2, borderTop: '2px dashed var(--text-3)', display: 'inline-block' }} />
          平均日数
        </span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <line key={f} x1={PAD.l} y1={PAD.t + cH * (1 - f)} x2={W - PAD.r} y2={PAD.t + cH * (1 - f)}
            stroke="var(--border)" strokeWidth={0.5} />
        ))}
        <path
          d={`${donePath} L${x(n - 1).toFixed(1)},${PAD.t + cH} L${x(0).toFixed(1)},${PAD.t + cH} Z`}
          fill="rgba(180,100,0,0.08)"
        />
        <path d={donePath} fill="none" stroke="#B46400" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {daysPath && <path d={daysPath} fill="none" stroke="var(--text-3)" strokeWidth={1.5} strokeDasharray="4 3" strokeLinecap="round" />}
        {data.map((d, i) => {
          if (n > 6 && i % 2 !== 0) return null;
          return (
            <text key={i} x={x(i)} y={H - 4} textAnchor="middle" fontSize={8} fill="var(--text-3)">
              {d.week}
            </text>
          );
        })}
        {data.map((d, i) => (
          <circle key={i} cx={x(i)} cy={yDone(d.pieces_done)} r={3} fill="#B46400" />
        ))}
      </svg>
    </div>
  );
}

// ─── VelocityPage ──────────────────────────────────────────────────────────────
export default function VelocityPage() {
  const [data, setData]       = useState<GrowthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<Tab>('workers');

  useEffect(() => {
    pieceApi.getVelocityGrowth()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalDone     = data?.workers.reduce((s, w) => s + w.total_done, 0) ?? 0;
  const avgSpeed      = (() => {
    const ws = data?.workers.filter(w => w.avg_days_all) ?? [];
    return ws.length > 0 ? ws.reduce((s, w) => s + (w.avg_days_all ?? 0), 0) / ws.length : 0;
  })();
  const growingCount  = data?.workers.filter(w => (w.trend ?? 0) > 5).length ?? 0;
  const maxImpactWorker = data?.workers.reduce<WorkerGrowth | undefined>(
    (best, w) => w.total_impact > (best?.total_impact ?? 0) ? w : best, undefined
  );

  const TABS = [
    { key: 'workers' as Tab, label: 'ワーカー', Icon: Users },
    { key: 'skills'  as Tab, label: 'スキル',   Icon: Tag },
    { key: 'trend'   as Tab, label: '傾向',     Icon: Activity },
  ];

  const maxSkillCount = Math.max(...(data?.skill_ranking.map(s => s.count) ?? [1]), 1);
  const maxSkillDays  = Math.max(...(data?.skill_ranking.filter(s => s.avg_days !== null).map(s => s.avg_days!) ?? [1]), 1);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ヘッダー */}
      <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        <div className="page-toolbar" style={{ height: 48, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <TrendingUp size={14} style={{ color: '#B46400' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>組織記憶</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>誰が何を、どれくらいの速さでこなすか</span>
        </div>
        <div style={{ display: 'flex', padding: '0 20px' }}>
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '8px 14px', fontSize: 11, fontWeight: tab === key ? 600 : 400,
              color: tab === key ? 'var(--accent)' : 'var(--text-2)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1, letterSpacing: '-0.01em',
            }}>
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 11 }}>
          読み込み中…
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>

          {/* サマリーカード */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 24, maxWidth: 720 }}>
            {[
              { label: '総完了ピース',   value: `${totalDone}件`,                                   sub: '速度ログ合計' },
              { label: '組織平均速度',   value: avgSpeed > 0 ? `${avgSpeed.toFixed(1)}日` : '—',    sub: '1ピースあたり' },
              { label: '成長中メンバー', value: `${growingCount}名`,                                sub: '直近が過去より+5%速い' },
              { label: '最多インパクト', value: maxImpactWorker?.name ?? '—',                       sub: maxImpactWorker ? `¥${maxImpactWorker.total_impact.toLocaleString()}` : '' },
            ].map(({ label, value, sub }) => (
              <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '12px 14px' }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 2 }}>{value}</div>
                <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* ワーカータブ */}
          {tab === 'workers' && (
            <div style={{ maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(data?.workers ?? []).filter(w => w.total_done > 0).length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>
                  速度データがありません。ピースを完了させると蓄積されます。
                </div>
              ) : (
                (data?.workers ?? [])
                  .filter(w => w.total_done > 0)
                  .map(w => <WorkerCard key={w.id} worker={w} />)
              )}
            </div>
          )}

          {/* スキルタブ */}
          {tab === 'skills' && (
            <div style={{ maxWidth: 680 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {(data?.skill_ranking ?? []).map(s => {
                  const dayColor = !s.avg_days ? 'var(--text-3)'
                    : s.avg_days <= 3 ? '#16a34a'
                    : s.avg_days <= 5 ? '#B46400'
                    : '#E60012';
                  const speedPct = s.avg_days && maxSkillDays > 0
                    ? Math.min(((maxSkillDays - s.avg_days + 1) / maxSkillDays) * 100, 100)
                    : 0;
                  return (
                    <div key={s.tag} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px',
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                    }}>
                      <div style={{ width: 110, flexShrink: 0, fontSize: 11, fontWeight: 500, color: 'var(--text-1)' }}>{s.tag}</div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MiniBar value={s.count} max={maxSkillCount} color="var(--text-3)" />
                        <span style={{ fontSize: 9, color: 'var(--text-3)', minWidth: 28, textAlign: 'right' }}>{s.count}件</span>
                      </div>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {s.avg_days !== null ? (
                          <>
                            <div style={{ flex: 1, background: 'var(--surface-sub)', borderRadius: 99, height: 5, overflow: 'hidden' }}>
                              <div style={{ width: `${speedPct}%`, height: '100%', background: dayColor, borderRadius: 99 }} />
                            </div>
                            <span style={{ fontSize: 10, fontWeight: 700, color: dayColor, minWidth: 28, textAlign: 'right' }}>{s.avg_days}日</span>
                          </>
                        ) : <span style={{ fontSize: 9, color: 'var(--text-3)' }}>—</span>}
                      </div>
                      {s.total_impact > 0 && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#B46400', flexShrink: 0, minWidth: 60, textAlign: 'right' }}>
                          ¥{s.total_impact.toLocaleString()}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 16, fontSize: 9, color: 'var(--text-3)' }}>
                <span style={{ color: '#16a34a', fontWeight: 600 }}>● 〜3日 速い</span>
                <span style={{ color: '#B46400', fontWeight: 600 }}>● 4〜5日 標準</span>
                <span style={{ color: '#E60012', fontWeight: 600 }}>● 6日〜 遅い</span>
              </div>
            </div>
          )}

          {/* 傾向タブ */}
          {tab === 'trend' && (
            <div style={{ maxWidth: 680 }}>
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '20px 24px', marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
                  週次完了ピース数 / 平均所要日数
                </div>
                <TrendChart data={data?.weekly_trend ?? []} />
              </div>

              {(data?.workers ?? []).filter(w => w.trend !== null && w.total_done >= 4).length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '16px 20px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
                    個人別 成長スコア
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(data?.workers ?? [])
                      .filter(w => w.trend !== null && w.total_done >= 4)
                      .sort((a, b) => (b.trend ?? 0) - (a.trend ?? 0))
                      .map(w => (
                        <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-1)', width: 80, flexShrink: 0 }}>{w.name}</span>
                          <div style={{ flex: 1, background: 'var(--surface-sub)', borderRadius: 99, height: 8, overflow: 'hidden' }}>
                            <div style={{
                              width: `${Math.min(Math.abs(w.trend ?? 0) * 2, 100)}%`,
                              height: '100%',
                              background: (w.trend ?? 0) > 0 ? '#16a34a' : '#E60012',
                              borderRadius: 99,
                            }} />
                          </div>
                          <TrendBadge trend={w.trend} />
                          <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0, minWidth: 60 }}>
                            {w.avg_days_early}日 → {w.avg_days_recent}日
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
