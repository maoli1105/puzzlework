/**
 * ProjectReportPage — プロジェクト横断レポート
 * 全プロジェクトの進捗・リスク・担当者分布を俯瞰する
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects as projectApi } from '../../services/api';
import { FileBarChart2, AlertTriangle, TrendingUp, Download, ArrowRight, RefreshCw } from 'lucide-react';

interface Assignee {
  name: string;
  piece_count: number;
  done_count: number;
}

interface ProjectReport {
  id: string;
  name: string;
  description: string;
  color: string;
  status: string;
  due_date: string | null;
  created_at: string;
  total_pieces: number;
  done_pieces: number;
  in_progress_pieces: number;
  ready_pieces: number;
  locked_pieces: number;
  overdue_pieces: number;
  avg_progress: number;
  completion_pct: number;
  delivered_impact: number;
  total_impact: number;
  next_due: string | null;
  assignees: Assignee[];
}

interface WeeklyTrend {
  week: string;
  done_count: number;
}

interface ReportData {
  projects: ProjectReport[];
  weekly_trend: WeeklyTrend[];
}

// ── CSV エクスポート ──────────────────────────────────────────────────────────
function exportCSV(projects: ProjectReport[]) {
  const header = ['プロジェクト名', 'ステータス', '完了率%', '総ピース', '完了', '進行中', '期限超過', '期日', '主担当'];
  const rows = projects.map(p => [
    p.name,
    p.status === 'active' ? '進行中' : p.status === 'completed' ? '完了' : 'アーカイブ',
    p.completion_pct,
    p.total_pieces,
    p.done_pieces,
    p.in_progress_pieces,
    p.overdue_pieces,
    p.due_date ? p.due_date.slice(0, 10) : '',
    p.assignees[0]?.name ?? '',
  ]);
  const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `project_report_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ── ミニスパークバー ──────────────────────────────────────────────────────────
function WeeklySparkbar({ data }: { data: WeeklyTrend[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => d.done_count), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28 }}>
      {data.map((d, i) => (
        <div key={i} title={`${d.week.slice(0, 10)}: ${d.done_count}件`} style={{ flex: 1, background: 'var(--accent)', borderRadius: 2, opacity: 0.5 + (i / data.length) * 0.5, height: `${Math.max(4, (d.done_count / max) * 100)}%`, transition: 'height 0.4s ease', minWidth: 8 }} />
      ))}
    </div>
  );
}

// ── 進捗バー ─────────────────────────────────────────────────────────────────
function ProgressBar({ pct, color, height = 6 }: { pct: number; color: string; height?: number }) {
  return (
    <div style={{ flex: 1, background: 'var(--surface-sub)', borderRadius: 99, height, overflow: 'hidden', border: '1px solid var(--border-sub)' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 99, transition: 'width 0.5s ease' }} />
    </div>
  );
}

function progressColor(pct: number): string {
  if (pct >= 80) return 'var(--text-2)';
  if (pct >= 50) return '#B46400';
  return '#E60012';
}

function daysUntil(dateStr: string): number {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - now.getTime()) / 86_400_000);
}

// ── ProjectRow ────────────────────────────────────────────────────────────────
function ProjectRow({ project, onNavigate }: { project: ProjectReport; onNavigate: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const pct = project.completion_pct;
  const color = progressColor(pct);
  const daysLeft = project.due_date ? daysUntil(project.due_date) : null;
  const overdue = project.overdue_pieces > 0;

  return (
    <div style={{ border: '1px solid var(--border)', borderLeft: `3px solid ${project.color || 'var(--accent)'}`, borderRadius: 'var(--r-lg)', background: 'var(--surface)', overflow: 'hidden' }}>
      {/* メイン行 */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '12px 16px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr 160px 80px 80px 80px 48px', alignItems: 'center', gap: 12 }}
      >
        {/* プロジェクト名 */}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.name}
            </span>
            {overdue && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 9, fontWeight: 700, color: '#E60012', background: 'rgba(230,0,18,0.05)', border: '1px solid rgba(230,0,18,0.20)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
                <AlertTriangle size={8} /> {project.overdue_pieces}超過
              </span>
            )}
          </div>
          {project.description && (
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.description}</div>
          )}
        </div>

        {/* 進捗バー + % */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ProgressBar pct={pct} color={color} height={6} />
          <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0, width: 32, textAlign: 'right' }}>{pct}%</span>
        </div>

        {/* ピース数 */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)' }}>{project.done_pieces}</div>
          <div style={{ fontSize: 9, color: 'var(--text-3)' }}>/ {project.total_pieces}</div>
        </div>

        {/* 期日 */}
        <div style={{ textAlign: 'center' }}>
          {daysLeft !== null ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: daysLeft < 0 ? '#E60012' : daysLeft <= 14 ? '#B46400' : 'var(--text-2)' }}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)}日超過` : daysLeft === 0 ? '今日' : `残${daysLeft}日`}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{project.due_date!.slice(0, 10)}</div>
            </>
          ) : (
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>—</span>
          )}
        </div>

        {/* インパクト */}
        <div style={{ textAlign: 'center' }}>
          {project.total_impact > 0 ? (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>{project.delivered_impact}</div>
              <div style={{ fontSize: 9, color: 'var(--text-3)' }}>/ {project.total_impact}</div>
            </>
          ) : (
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>—</span>
          )}
        </div>

        {/* アクション */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={e => { e.stopPropagation(); onNavigate(); }}
            title="ボードで確認"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex', alignItems: 'center' }}
          >
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* 展開: 担当者内訳 + ステータスドット */}
      {expanded && (
        <div style={{ padding: '10px 16px 14px', borderTop: '1px solid var(--border-sub)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {/* ステータス内訳 */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase' }}>ステータス内訳</div>
            <div style={{ display: 'flex', gap: 16 }}>
              {[
                { label: '完了', count: project.done_pieces, color: 'var(--text-2)' },
                { label: '進行中', count: project.in_progress_pieces, color: '#B46400' },
                { label: '着手可', count: project.ready_pieces, color: '#1A56DB' },
                { label: 'ロック', count: project.locked_pieces, color: '#9CA3AF' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: s.color, letterSpacing: '-0.03em' }}>{s.count}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 担当者内訳 */}
          {project.assignees.length > 0 && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 8, textTransform: 'uppercase' }}>担当者</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {project.assignees.map(a => (
                  <div key={a.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 20, height: 20, borderRadius: '50%', background: `${project.color || 'var(--accent)'}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: project.color || 'var(--accent)', flexShrink: 0 }}>
                      {a.name[0]}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-1)', minWidth: 80 }}>{a.name}</span>
                    <div style={{ width: 80, height: 4, background: 'var(--surface-sub)', borderRadius: 99, overflow: 'hidden' }}>
                      <div style={{ width: `${a.piece_count > 0 ? Math.round((a.done_count / a.piece_count) * 100) : 0}%`, height: '100%', background: project.color || 'var(--accent)', borderRadius: 99, opacity: 0.7 }} />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{a.done_count}/{a.piece_count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── ProjectReportPage ─────────────────────────────────────────────────────────
export default function ProjectReportPage() {
  const navigate = useNavigate();
  const [data,    setData]    = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const result = await projectApi.report();
      setData(result as ReportData);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  const projects = data?.projects ?? [];
  const trend    = data?.weekly_trend ?? [];

  // 全体サマリー
  const totalProjects    = projects.length;
  const activeProjects   = projects.filter(p => p.status !== 'completed').length;
  const totalPieces      = projects.reduce((s, p) => s + p.total_pieces, 0);
  const donePieces       = projects.reduce((s, p) => s + p.done_pieces, 0);
  const overdueProjects  = projects.filter(p => p.overdue_pieces > 0).length;
  const avgCompletion    = totalProjects > 0
    ? Math.round(projects.reduce((s, p) => s + p.completion_pct, 0) / totalProjects)
    : 0;
  const totalDelivered   = projects.reduce((s, p) => s + p.delivered_impact, 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* ── ヘッダー ── */}
      <div className="page-toolbar" style={{ height: 52, padding: '0 24px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <FileBarChart2 size={15} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>プロジェクトレポート</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>進捗・リスク・担当者を横断確認</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {!loading && projects.length > 0 && (
            <button
              onClick={() => exportCSV(projects)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', fontSize: 11, background: 'var(--surface-sub)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer' }}
            >
              <Download size={11} /> CSV
            </button>
          )}
          <button
            onClick={load}
            title="更新"
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-3)' }}
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 40px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: 60, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', opacity: 1 - i * 0.2 }} />
            ))}
          </div>
        ) : (
          <>
            {/* ── サマリーカード行 ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 24 }}>
              {[
                { label: 'プロジェクト', value: activeProjects, sub: `全${totalProjects}件`, icon: <FileBarChart2 size={13} />, color: 'var(--accent)' },
                { label: '全体完了率', value: `${avgCompletion}%`, sub: '平均', icon: <TrendingUp size={13} />, color: avgCompletion >= 70 ? 'var(--text-2)' : avgCompletion >= 40 ? '#B46400' : '#E60012' },
                { label: '完了ピース', value: donePieces, sub: `/ ${totalPieces}件`, icon: null, color: 'var(--text-2)' },
                { label: '期限超過PJ', value: overdueProjects, sub: '要対応', icon: overdueProjects > 0 ? <AlertTriangle size={13} /> : null, color: overdueProjects > 0 ? '#E60012' : 'var(--text-3)' },
                { label: '累計インパクト', value: totalDelivered, sub: '完了分', icon: null, color: '#1A56DB' },
              ].map(card => (
                <div key={card.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {card.icon && <span style={{ color: card.color }}>{card.icon}</span>}
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.03em' }}>{card.label}</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: card.color, letterSpacing: '-0.04em', lineHeight: 1 }}>{card.value}</div>
                  <div style={{ fontSize: 9, color: 'var(--text-3)' }}>{card.sub}</div>
                </div>
              ))}
            </div>

            {/* ── 週別スパークバー ── */}
            {trend.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em', marginBottom: 4 }}>過去4週の完了数</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.03em' }}>
                    {trend.reduce((s, d) => s + d.done_count, 0)}
                    <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)', marginLeft: 4 }}>件</span>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <WeeklySparkbar data={trend} />
                </div>
              </div>
            )}

            {/* ── テーブルヘッダー ── */}
            {projects.length > 0 && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px 80px 80px 80px 48px', gap: 12, padding: '6px 16px', marginBottom: 6 }}>
                  {['プロジェクト', '進捗', '完了/総数', '期日', 'インパクト', ''].map((h, i) => (
                    <div key={i} style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.05em', textAlign: i >= 2 ? 'center' : undefined }}>
                      {h}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {projects.map(p => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      onNavigate={() => navigate(`/projects?project=${p.id}`)}
                    />
                  ))}
                </div>
              </>
            )}

            {projects.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-3)', fontSize: 13 }}>
                プロジェクトがまだありません
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
