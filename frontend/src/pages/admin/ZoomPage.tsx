/**
 * ZoomPage — 3段階ドリルダウン
 *  Level 0: 全社ビュー（プロジェクトカード一覧）
 *  Level 1: プロジェクトビュー（メンバータイル + ピース一覧）
 *  Level 2: ワーカービュー（個人の今日・直近・スキル）
 */
import React, { useState, useEffect, useCallback } from 'react';
import { projects as projectsApi, users as usersApi } from '../../services/api';
import {
  ChevronRight, AlertTriangle, CheckCircle2, Clock, Users,
  Layers, X as XIcon, Zap,
} from 'lucide-react';

// ─── 型 ─────────────────────────────────────────────────────────────────────

interface ProjectSummary {
  id: string;
  name: string;
  color: string;
  status: string;
  description: string;
  total_pieces: number;
  done_pieces: number;
  in_progress_pieces: number;
  overdue_pieces: number;
  completion_pct: number;
  delivered_impact: number;
  total_impact: number;
  next_due: string | null;
  assignees: { name: string; piece_count: number; done_count: number }[];
}

interface Member {
  id: string;
  name: string;
  total: number;
  in_progress: number;
  done: number;
  overdue: number;
  delivered_impact: number;
  next_due: string | null;
}

interface Piece {
  id: string;
  title: string;
  status: string;
  priority: number;
  due_date: string | null;
  assignee_name: string | null;
  assignee_id: string | null;
  business_impact: number;
  progress: number;
  skill_tags: string[];
}

interface WorkerStats {
  in_progress: { id: string; title: string; status: string; due_date: string | null; progress: number; skill_tags: string[] }[];
  recently_completed: { id: string; title: string; completed_at: string; actual_days: number | null; skill_tags: string[] }[];
  skills: { tag: string; count: number }[];
}

// ─── ユーティリティ ──────────────────────────────────────────────────────────

function fmtDate(d: string | null) {
  if (!d) return '—';
  const dt = new Date(d);
  return `${dt.getMonth() + 1}/${dt.getDate()}`;
}

function isOverdue(d: string | null) {
  if (!d) return false;
  return new Date(d) < new Date();
}

function progressColor(pct: number) {
  if (pct >= 80) return '#22c55e';
  if (pct >= 50) return '#B46400';
  return '#94a3b8';
}

const STATUS_LABEL: Record<string, string> = {
  in_progress: '進行中',
  ready: '着手可',
  locked: 'ロック',
  done: '完了',
};
const STATUS_COLOR: Record<string, string> = {
  in_progress: '#B46400',
  ready: '#22c55e',
  locked: '#94a3b8',
  done: '#64748b',
};

// ─── サブコンポーネント ───────────────────────────────────────────────────────

function ProgressBar({ pct, color }: { pct: number; color?: string }) {
  return (
    <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color ?? progressColor(pct), borderRadius: 2, transition: 'width .3s' }} />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
      background: (STATUS_COLOR[status] ?? '#888') + '22',
      color: STATUS_COLOR[status] ?? '#888',
    }}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ─── Level 0: 全社ビュー ─────────────────────────────────────────────────────

function CompanyView({ onSelect }: { onSelect: (p: ProjectSummary) => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    projectsApi.report()
      .then((d) => setProjects(d.projects ?? []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>読み込み中…</div>;

  const active = projects.filter((p) => p.status !== 'archived');
  const overdueTotal = active.reduce((s, p) => s + (p.overdue_pieces ?? 0), 0);
  const inProgressTotal = active.reduce((s, p) => s + (p.in_progress_pieces ?? 0), 0);
  const doneTotal = active.reduce((s, p) => s + (p.done_pieces ?? 0), 0);
  const totalPieces = active.reduce((s, p) => s + (p.total_pieces ?? 0), 0);
  const orgCompletion = totalPieces > 0 ? Math.round((doneTotal / totalPieces) * 100) : 0;

  return (
    <div>
      {/* サマリーバー */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'プロジェクト数', value: active.length, icon: <Layers size={14} />, color: 'var(--text-2)' },
          { label: '進行中タスク', value: inProgressTotal, icon: <Clock size={14} />, color: '#B46400' },
          { label: '期限超過', value: overdueTotal, icon: <AlertTriangle size={14} />, color: overdueTotal > 0 ? '#E60012' : 'var(--text-3)' },
          { label: '全社完了率', value: `${orgCompletion}%`, icon: <CheckCircle2 size={14} />, color: '#22c55e' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{
            flex: '1 1 140px', minWidth: 120,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '12px 16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color, marginBottom: 4 }}>
              {icon}<span style={{ fontSize: 11, fontWeight: 600 }}>{label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-1)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* プロジェクトカード */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {active.map((p) => (
          <button key={p.id} onClick={() => onSelect(p)} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: '16px 18px', cursor: 'pointer',
            textAlign: 'left', transition: 'box-shadow .15s, border-color .15s',
          }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(0,0,0,.1)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = p.color ?? '#B46400';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.boxShadow = '';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color ?? '#B46400', flexShrink: 0 }} />
              <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.name}
              </span>
              <ChevronRight size={14} style={{ color: 'var(--text-4)', flexShrink: 0 }} />
            </div>

            <ProgressBar pct={p.completion_pct} color={p.color} />

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 12, color: 'var(--text-3)' }}>
              <span>{p.completion_pct}% 完了 ({p.done_pieces}/{p.total_pieces})</span>
              {p.next_due && (
                <span style={{ color: isOverdue(p.next_due) ? '#E60012' : 'var(--text-3)' }}>
                  {isOverdue(p.next_due) ? '⚠️ ' : ''}{fmtDate(p.next_due)}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {p.in_progress_pieces > 0 && (
                <span style={{ fontSize: 11, color: '#B46400', background: '#B4640011', padding: '2px 7px', borderRadius: 4 }}>
                  進行中 {p.in_progress_pieces}
                </span>
              )}
              {p.overdue_pieces > 0 && (
                <span style={{ fontSize: 11, color: '#E60012', background: '#E6001211', padding: '2px 7px', borderRadius: 4 }}>
                  ⚠️ 超過 {p.overdue_pieces}
                </span>
              )}
              {p.assignees.length > 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                  <Users size={10} />{p.assignees.length}名
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Level 1: プロジェクトビュー ─────────────────────────────────────────────

function ProjectView({
  project,
  onSelectMember,
}: {
  project: ProjectSummary;
  onSelectMember: (id: string, name: string) => void;
}) {
  const [data, setData] = useState<{ members: Member[]; pieces: Piece[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  useEffect(() => {
    projectsApi.zoomDetail(project.id)
      .then((d) => setData({ members: d.members, pieces: d.pieces as unknown as Piece[] }))
      .finally(() => setLoading(false));
  }, [project.id]);

  const pieces = (data?.pieces ?? []).filter((p) => {
    if (filter !== 'all' && p.status !== filter) return false;
    if (selectedMemberId && p.assignee_id !== selectedMemberId) return false;
    return true;
  });

  if (loading) return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>読み込み中…</div>;

  return (
    <div>
      {/* プロジェクトヘッダー */}
      <div style={{ marginBottom: 20, padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${project.color ?? '#B46400'}`, borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-1)', marginBottom: 4 }}>{project.name}</div>
        {project.description && <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>{project.description}</div>}
        <ProgressBar pct={project.completion_pct} color={project.color} />
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
          {project.completion_pct}% 完了 · {project.in_progress_pieces}件進行中
          {project.overdue_pieces > 0 && (
            <span style={{ color: '#E60012', marginLeft: 8 }}>⚠️ {project.overdue_pieces}件超過</span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* メンバータイル */}
        <div style={{ width: 200, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', marginBottom: 8, textTransform: 'uppercase' }}>
            メンバー ({data?.members.length ?? 0})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => setSelectedMemberId(null)} style={{
              background: selectedMemberId === null ? '#B4640011' : 'var(--surface)',
              border: `1px solid ${selectedMemberId === null ? '#B46400' : 'var(--border)'}`,
              borderRadius: 8, padding: '8px 12px', cursor: 'pointer', textAlign: 'left',
              fontSize: 12, color: 'var(--text-2)', fontWeight: 600,
            }}>
              全員を表示
            </button>
            {data?.members.map((m) => (
              <button key={m.id} onClick={() => setSelectedMemberId(m.id === selectedMemberId ? null : m.id)} style={{
                background: selectedMemberId === m.id ? '#B4640011' : 'var(--surface)',
                border: `1px solid ${selectedMemberId === m.id ? '#B46400' : 'var(--border)'}`,
                borderRadius: 8, padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                transition: 'border-color .15s',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)' }}>{m.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectMember(m.id, m.name); }}
                    title="詳細を見る"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-4)', display: 'flex' }}
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {m.in_progress > 0 && (
                    <span style={{ fontSize: 10, color: '#B46400' }}>進行 {m.in_progress}</span>
                  )}
                  {m.overdue > 0 && (
                    <span style={{ fontSize: 10, color: '#E60012' }}>⚠️{m.overdue}</span>
                  )}
                  <span style={{ fontSize: 10, color: 'var(--text-3)' }}>完了 {m.done}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ピースリスト */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* フィルター */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            {['all', 'in_progress', 'ready', 'locked', 'done'].map((s) => (
              <button key={s} onClick={() => setFilter(s)} style={{
                fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 5, cursor: 'pointer',
                background: filter === s ? '#B46400' : 'var(--surface)',
                color: filter === s ? '#fff' : 'var(--text-3)',
                border: `1px solid ${filter === s ? '#B46400' : 'var(--border)'}`,
              }}>
                {s === 'all' ? 'すべて' : STATUS_LABEL[s]}
              </button>
            ))}
            <span style={{ fontSize: 11, color: 'var(--text-4)', alignSelf: 'center', marginLeft: 4 }}>
              {pieces.length}件
            </span>
          </div>

          {/* ピース行 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {pieces.length === 0 ? (
              <div style={{ padding: 24, color: 'var(--text-4)', fontSize: 13, textAlign: 'center' }}>
                該当するタスクがありません
              </div>
            ) : pieces.map((p) => (
              <div key={p.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 14px',
                display: 'flex', alignItems: 'center', gap: 12,
                opacity: p.status === 'done' ? 0.6 : 1,
              }}>
                <StatusBadge status={p.status} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.title}
                  </div>
                  {p.skill_tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                      {p.skill_tags.slice(0, 3).map((t) => (
                        <span key={t} style={{ fontSize: 10, color: 'var(--text-4)', background: 'var(--bg)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>
                {p.status === 'in_progress' && (
                  <div style={{ width: 40, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#B46400' }}>{p.progress}%</div>
                    <ProgressBar pct={p.progress} color="#B46400" />
                  </div>
                )}
                {p.assignee_name && (
                  <span style={{ fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {p.assignee_name}
                  </span>
                )}
                {p.due_date && (
                  <span style={{
                    fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0,
                    color: isOverdue(p.due_date) && p.status !== 'done' ? '#E60012' : 'var(--text-3)',
                  }}>
                    {isOverdue(p.due_date) && p.status !== 'done' ? '⚠️ ' : ''}{fmtDate(p.due_date)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Level 2: ワーカービュー ──────────────────────────────────────────────────

function WorkerView({ workerId, workerName }: { workerId: string; workerName: string }) {
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    usersApi.stats(workerId)
      .then(setStats)
      .finally(() => setLoading(false));
  }, [workerId]);

  if (loading) return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>読み込み中…</div>;
  if (!stats) return <div style={{ padding: 24, color: 'var(--text-3)', fontSize: 13 }}>データなし</div>;

  const topSkills = (stats.skills ?? []).slice(0, 8);
  const recentItems = (stats.recently_completed ?? []).slice(0, 5);

  return (
    <div>
      <div style={{ marginBottom: 20, padding: '14px 18px', background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid #B46400', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--text-1)', marginBottom: 4 }}>{workerName}</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
          進行中 {stats.in_progress.length}件 · 直近完了 {recentItems.length}件
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* 進行中 */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#B46400', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>
            進行中タスク
          </div>
          {stats.in_progress.length === 0 ? (
            <div style={{ color: 'var(--text-4)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>なし</div>
          ) : stats.in_progress.map((p) => (
            <div key={p.id} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)', marginBottom: 4 }}>{p.title}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <ProgressBar pct={p.progress} color="#B46400" />
                </div>
                <span style={{ fontSize: 11, color: '#B46400', fontWeight: 700 }}>{p.progress}%</span>
                {p.due_date && (
                  <span style={{ fontSize: 11, color: isOverdue(p.due_date) ? '#E60012' : 'var(--text-3)', flexShrink: 0 }}>
                    {fmtDate(p.due_date)}
                  </span>
                )}
              </div>
              {p.skill_tags?.length > 0 && (
                <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                  {p.skill_tags.slice(0, 3).map((t) => (
                    <span key={t} style={{ fontSize: 10, color: 'var(--text-4)', background: 'var(--bg)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>{t}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 直近完了 + スキル */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              直近の完了
            </div>
            {recentItems.length === 0 ? (
              <div style={{ color: 'var(--text-4)', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>なし</div>
            ) : recentItems.map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <CheckCircle2 size={12} style={{ color: '#22c55e', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                {p.actual_days != null && (
                  <span style={{ fontSize: 10, color: 'var(--text-4)', flexShrink: 0 }}>{p.actual_days}日</span>
                )}
              </div>
            ))}
          </div>

          {topSkills.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.06em', textTransform: 'uppercase', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Zap size={11} />スキル
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {topSkills.map((s) => (
                  <span key={s.tag} style={{
                    fontSize: 11, padding: '3px 9px', borderRadius: 12,
                    background: '#B4640022', color: '#B46400', fontWeight: 600,
                    border: '1px solid #B4640044',
                  }}>
                    {s.tag} <span style={{ fontWeight: 400, fontSize: 10, opacity: .7 }}>×{s.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── メインコンポーネント ─────────────────────────────────────────────────────

type Level =
  | { kind: 0 }
  | { kind: 1; project: ProjectSummary }
  | { kind: 2; project: ProjectSummary; workerId: string; workerName: string };

export default function ZoomPage() {
  const [level, setLevel] = useState<Level>({ kind: 0 });

  const goToProject = useCallback((p: ProjectSummary) => {
    setLevel({ kind: 1, project: p });
  }, []);

  const goToWorker = useCallback((project: ProjectSummary, workerId: string, workerName: string) => {
    setLevel({ kind: 2, project, workerId, workerName });
  }, []);

  // パンくず
  const crumbs: { label: string; onClick: () => void }[] = [{ label: '全社', onClick: () => setLevel({ kind: 0 }) }];
  if (level.kind >= 1) {
    const proj = (level as { project: ProjectSummary }).project;
    crumbs.push({ label: proj.name, onClick: () => setLevel({ kind: 1, project: proj }) });
  }
  if (level.kind === 2) {
    crumbs.push({ label: (level as { workerName: string }).workerName, onClick: () => {} });
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      {/* ページタイトル */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>ズームビュー</h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>全社 → プロジェクト → ワーカーの3段階ドリルダウン</p>
        </div>
        {level.kind > 0 && (
          <button onClick={() => setLevel({ kind: 0 })} style={{
            fontSize: 12, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border)',
            borderRadius: 6, padding: '5px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <XIcon size={12} />全社ビューに戻る
          </button>
        )}
      </div>

      {/* パンくずリスト */}
      {crumbs.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, fontSize: 12, color: 'var(--text-3)' }}>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight size={12} style={{ flexShrink: 0 }} />}
              <button
                onClick={c.onClick}
                disabled={i === crumbs.length - 1}
                style={{
                  background: 'none', border: 'none', cursor: i === crumbs.length - 1 ? 'default' : 'pointer',
                  color: i === crumbs.length - 1 ? 'var(--text-1)' : '#B46400',
                  fontWeight: i === crumbs.length - 1 ? 700 : 500,
                  fontSize: 12, padding: '2px 4px', borderRadius: 4,
                  textDecoration: i < crumbs.length - 1 ? 'underline' : 'none',
                }}
              >
                {c.label}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* レベル別コンテンツ */}
      {level.kind === 0 && (
        <CompanyView onSelect={goToProject} />
      )}
      {level.kind === 1 && (
        <ProjectView
          project={(level as { project: ProjectSummary }).project}
          onSelectMember={(id, name) => goToWorker((level as { project: ProjectSummary }).project, id, name)}
        />
      )}
      {level.kind === 2 && (
        <WorkerView
          workerId={(level as { workerId: string }).workerId}
          workerName={(level as { workerName: string }).workerName}
        />
      )}
    </div>
  );
}
