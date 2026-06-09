import { useState, useEffect, useCallback } from 'react';
import { pieces as pieceApi, projects as projectApi } from '../../services/api';

// ─── 型定義 ──────────────────────────────────────────────────────────────────
interface OrgHealth {
  score: number;
  at_risk_pieces: {
    id: string; title: string; status: string; due_date: string | null;
    assignee_name: string | null; business_impact: number;
    risk_type: 'overdue' | 'stale' | 'unassigned';
  }[];
  spof_users: { id: string; name: string; critical_piece_count: number; total_business_impact: number }[];
  total_business_impact_at_risk: number;
  pieces_on_time_pct: number;
  overloaded_count: number;
  stale_count: number;
}

interface StandupReport {
  generated_at: string;
  completed_yesterday: { title: string; assignee_name: string | null; completed_at: string }[];
  in_progress: { title: string; assignee_name: string | null; due_date: string | null; progress: number }[];
  overdue: { title: string; assignee_name: string | null; due_date: string; business_impact: number }[];
  unassigned_ready: { title: string; business_impact: number }[];
}

interface ProjectReport {
  id: string; name: string; color: string | null;
  total: number; done: number; in_progress: number; locked: number;
  completion_pct: number; overdue_count: number; total_impact: number;
}

interface VelocityData {
  by_person: { user_id: string; name: string; completed_count: number; avg_days: number | null }[];
  by_skill: { skill: string; avg_days: number | null; count: number }[];
}

// ─── スコアカラー ─────────────────────────────────────────────────────────────
function scoreColor(n: number) {
  if (n >= 80) return '#059669';
  if (n >= 60) return '#D97706';
  return '#DC2626';
}
function scoreLabel(n: number) {
  if (n >= 80) return '良好';
  if (n >= 60) return '注意';
  return '危険';
}

// ─── 相対時刻 ────────────────────────────────────────────────────────────────
function relTime(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 3600) return `${Math.floor(d / 60)}分前`;
  if (d < 86400) return `${Math.floor(d / 3600)}時間前`;
  return `${Math.floor(d / 86400)}日前`;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, color = 'var(--text-1)' }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 130,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, letterSpacing: '-0.03em', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ─── Section header ──────────────────────────────────────────────────────────
function SectionHeader({ title, badge }: { title: string; badge?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-1)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {title}
      </div>
      {badge !== undefined && badge > 0 && (
        <span style={{
          background: '#DC262618', color: '#DC2626',
          border: '1px solid #DC262633', borderRadius: 20,
          padding: '0 7px', fontSize: 10, fontWeight: 700,
        }}>{badge}</span>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function DashboardView() {
  const [health,   setHealth]   = useState<OrgHealth | null>(null);
  const [standup,  setStandup]  = useState<StandupReport | null>(null);
  const [projects, setProjects] = useState<ProjectReport[]>([]);
  const [velocity, setVelocity] = useState<VelocityData | null>(null);
  const [loading,  setLoading]  = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [h, s, p, v] = await Promise.allSettled([
      pieceApi.getOrgHealth(),
      pieceApi.getStandupReport(),
      projectApi.report(),
      pieceApi.getVelocityInsights(),
    ]);
    if (h.status === 'fulfilled') setHealth(h.value as OrgHealth);
    if (s.status === 'fulfilled') setStandup(s.value as StandupReport);
    if (p.status === 'fulfilled') setProjects(p.value as ProjectReport[]);
    if (v.status === 'fulfilled') setVelocity(v.value as VelocityData);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 14 }}>
      データを読み込み中…
    </div>
  );

  const FONT = '"Inter","Outfit",sans-serif';

  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'var(--bg)',
      overflowY: 'auto', padding: '24px 32px',
      fontFamily: FONT, zIndex: 5,
    }}>
      {/* ── ヘッダー ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
            組織ダッシュボード
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.03em' }}>
            組織サマリー
          </div>
        </div>
        {standup && (
          <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
            更新: {relTime(standup.generated_at)}
          </div>
        )}
      </div>

      {/* ── ヘルス スコア + KPI ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
        {health && (
          <div style={{
            background: 'var(--surface)', border: `2px solid ${scoreColor(health.score)}44`,
            borderRadius: 14, padding: '20px 24px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            minWidth: 130,
            boxShadow: `0 0 24px ${scoreColor(health.score)}18`,
          }}>
            <div style={{ fontSize: 48, fontWeight: 900, color: scoreColor(health.score), lineHeight: 1, letterSpacing: '-0.04em' }}>
              {health.score}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: scoreColor(health.score), marginTop: 4 }}>
              {scoreLabel(health.score)}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>ヘルス</div>
          </div>
        )}

        <KpiCard
          label="オンタイム率"
          value={`${health?.pieces_on_time_pct ?? '--'}%`}
          sub="期限内完了タスク"
          color={health && health.pieces_on_time_pct >= 70 ? '#059669' : '#DC2626'}
        />
        <KpiCard
          label="進行中"
          value={standup?.in_progress.length ?? '--'}
          sub="タスク"
        />
        <KpiCard
          label="期限超過"
          value={standup?.overdue.length ?? '--'}
          sub="タスク"
          color={(standup?.overdue.length ?? 0) > 0 ? '#DC2626' : 'var(--text-1)'}
        />
        <KpiCard
          label="未割り当て"
          value={standup?.unassigned_ready.length ?? '--'}
          sub="着手可タスク"
          color={(standup?.unassigned_ready.length ?? 0) > 0 ? '#D97706' : 'var(--text-1)'}
        />
        <KpiCard
          label="リスク影響額"
          value={health ? `¥${(health.total_business_impact_at_risk / 10000).toFixed(0)}万` : '--'}
          sub="リスクタスク合計"
          color={(health?.total_business_impact_at_risk ?? 0) > 0 ? '#DC2626' : 'var(--text-1)'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

        {/* ── プロジェクト別進捗 ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
          <SectionHeader title="プロジェクト進捗" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projects.slice(0, 8).map(p => (
              <div key={p.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color || '#6366f1', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                      {p.name}
                    </span>
                    {p.overdue_count > 0 && (
                      <span style={{ fontSize: 8, background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 4, padding: '0 4px', fontWeight: 700 }}>
                        {p.overdue_count}超過
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', flexShrink: 0 }}>
                    {p.done}/{p.total}
                  </span>
                </div>
                <div style={{ height: 4, borderRadius: 2, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${p.completion_pct}%`,
                    background: p.color || '#6366f1',
                    transition: 'width 0.4s',
                  }} />
                </div>
              </div>
            ))}
            {projects.length === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '12px 0' }}>データなし</div>
            )}
          </div>
        </div>

        {/* ── リスクピース ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
          <SectionHeader title="要注意タスク" badge={health?.at_risk_pieces.length} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(health?.at_risk_pieces.slice(0, 6) ?? []).map(p => {
              const riskColors = { overdue: '#DC2626', stale: '#D97706', unassigned: '#7C3AED' };
              const riskLabels = { overdue: '期限超過', stale: '停滞', unassigned: '未割当' };
              const col = riskColors[p.risk_type];
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  background: col + '08', border: `1px solid ${col}20`, borderRadius: 8,
                }}>
                  <span style={{
                    fontSize: 8.5, fontWeight: 700, color: col,
                    background: col + '18', border: `1px solid ${col}33`,
                    borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                  }}>{riskLabels[p.risk_type]}</span>
                  <span style={{ flex: 1, fontSize: 11, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title.replace(/^【.+?】/, '')}
                  </span>
                  {p.assignee_name && (
                    <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>{p.assignee_name}</span>
                  )}
                </div>
              );
            })}
            {(health?.at_risk_pieces.length ?? 0) === 0 && (
              <div style={{ fontSize: 11, color: '#059669', textAlign: 'center', padding: '12px 0', fontWeight: 600 }}>
                リスクタスクなし ✓
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>

        {/* ── 昨日の完了 + 進行中 ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
          <SectionHeader title={`昨日の完了 (${standup?.completed_yesterday.length ?? 0})`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(standup?.completed_yesterday.slice(0, 5) ?? []).map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 6, height: 6, borderRadius: 2, background: '#A0A096', flexShrink: 0, display: 'inline-block' }} />
                <span style={{ flex: 1, fontSize: 11, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.title.replace(/^【.+?】/, '')}
                </span>
                {p.assignee_name && <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>{p.assignee_name}</span>}
              </div>
            ))}
            {(standup?.completed_yesterday.length ?? 0) === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0' }}>昨日の完了なし</div>
            )}
          </div>
        </div>

        {/* ── 担当者別ベロシティ ── */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
          <SectionHeader title="担当者ベロシティ" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(velocity?.by_person.slice(0, 6) ?? []).map(p => (
              <div key={p.user_id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: '#6366F111', border: '1.5px solid #6366F133',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 800, color: '#6366F1', flexShrink: 0,
                }}>{p.name[0]}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-3)', display: 'flex', gap: 6 }}>
                    <span>{p.completed_count}件完了</span>
                    {p.avg_days != null && <span>平均{p.avg_days}日</span>}
                  </div>
                </div>
                {/* mini bar */}
                <div style={{ width: 60, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{
                    height: '100%', background: '#6366F1', borderRadius: 2,
                    width: `${Math.min(100, (p.completed_count / Math.max(1, ...velocity!.by_person.map(x => x.completed_count))) * 100)}%`,
                  }} />
                </div>
              </div>
            ))}
            {(velocity?.by_person.length ?? 0) === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center', padding: '8px 0' }}>データなし</div>
            )}
          </div>
        </div>
      </div>

      {/* ── スキル別ベロシティ ── */}
      {(velocity?.by_skill.length ?? 0) > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 24 }}>
          <SectionHeader title="スキル別平均所要日数" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {velocity!.by_skill.slice(0, 12).map(s => (
              <div key={s.skill} style={{
                background: 'var(--surface-sub)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '6px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>{s.skill}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
                  {s.avg_days != null ? `${s.avg_days}日` : '—'}
                </div>
                <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{s.count}件</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
