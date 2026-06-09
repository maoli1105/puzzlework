import { useEffect, useState, useRef } from 'react';
import { pieces as pieceApi, projects as projectApi } from '../../services/api';
import { Map, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react';

interface Piece {
  id: string;
  title: string;
  status: string;
  start_date: string | null;
  due_date: string | null;
  project_id: string | null;
  progress: number;
  priority: number;
  assignee_name?: string;
}

interface Project {
  id: string;
  name: string;
  color: string;
}

const STATUS_COLORS: Record<string, string> = {
  locked:      '#A8A8A4',
  ready:       '#4A9B6F',
  in_progress: '#1A56DB',
  done:        '#9CA3AF',
};

const LABEL_W = 180;
const ROW_H = 32;
const HEADER_H = 52;
const GROUP_HEADER_H = 28;
const DAY_PX_DEFAULT = 18;

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDate(s: string): Date {
  return new Date(s);
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtMonthYear(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export default function RoadmapPage() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [dayPx, setDayPx] = useState(DAY_PX_DEFAULT);
  const [viewStart, setViewStart] = useState<Date>(() => {
    const d = startOfWeek(new Date());
    d.setDate(d.getDate() - 7);
    return d;
  });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const TOTAL_DAYS = Math.round(840 / dayPx) + 28;

  useEffect(() => {
    Promise.all([
      pieceApi.list().catch(() => []),
      projectApi.list().catch(() => []),
    ]).then(([ps, pjs]) => {
      setPieces(ps as Piece[]);
      setProjects(pjs as Project[]);
      setLoading(false);
    });
  }, []);

  function syncScroll(src: 'header' | 'body', scrollLeft: number) {
    if (src === 'body' && headerRef.current) headerRef.current.scrollLeft = scrollLeft;
    if (src === 'header' && bodyRef.current) bodyRef.current.scrollLeft = scrollLeft;
  }

  // Group pieces by project
  const grouped: { project: Project | null; pieces: Piece[] }[] = [];
  const noProject = pieces.filter(p => !p.project_id && (p.start_date || p.due_date));
  if (noProject.length > 0) grouped.push({ project: null, pieces: noProject });
  for (const proj of projects) {
    const ps = pieces.filter(p => p.project_id === proj.id && (p.start_date || p.due_date));
    if (ps.length > 0) grouped.push({ project: proj, pieces: ps });
  }

  // Days array
  const days = Array.from({ length: TOTAL_DAYS }, (_, i) => addDays(viewStart, i));
  const totalW = days.length * dayPx;

  // Week markers
  const weekMarkers: { day: number; label: string }[] = [];
  let lastMonth = -1;
  for (let i = 0; i < days.length; i++) {
    const d = days[i];
    if (d.getDay() === 0) {
      const isMonthStart = d.getMonth() !== lastMonth;
      weekMarkers.push({ day: i, label: isMonthStart ? fmtMonthYear(d) : fmtDate(d) });
      if (isMonthStart) lastMonth = d.getMonth();
    }
  }

  function xOf(date: Date): number {
    const diffMs = date.getTime() - viewStart.getTime();
    const diffDays = diffMs / 86400000;
    return diffDays * dayPx;
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayX = xOf(today);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: 'inherit' }}>
      {/* Top bar */}
      <div className="page-toolbar" style={{ height: 52, padding: '0 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <Map size={14} style={{ color: 'var(--accent)' }} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>ロードマップ</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>タイムライン一覧ビュー</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Zoom */}
          <button onClick={() => setDayPx(d => Math.max(8, d - 4))} style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-2)', display: 'flex' }}><Minus size={12} /></button>
          <span style={{ fontSize: 11, color: 'var(--text-3)', minWidth: 40, textAlign: 'center' }}>{dayPx}px/日</span>
          <button onClick={() => setDayPx(d => Math.min(40, d + 4))} style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-2)', display: 'flex' }}><Plus size={12} /></button>
          {/* Nav */}
          <button onClick={() => setViewStart(d => addDays(d, -14))} style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-2)', display: 'flex' }}><ChevronLeft size={14} /></button>
          <button
            onClick={() => { const d = startOfWeek(new Date()); d.setDate(d.getDate() - 7); setViewStart(d); }}
            style={{ padding: '4px 10px', fontSize: 11, background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-2)' }}
          >
            今日
          </button>
          <button onClick={() => setViewStart(d => addDays(d, 14))} style={{ padding: '4px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-2)', display: 'flex' }}><ChevronRight size={14} /></button>
        </div>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>Loading...</div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left label column */}
          <div style={{ width: LABEL_W, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ height: HEADER_H, borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }} />
            <div style={{ flex: 1, overflowY: 'hidden', overflowX: 'hidden' }}>
              {grouped.map(({ project, pieces: gPieces }) => (
                <div key={project?.id ?? 'none'}>
                  <div style={{ height: GROUP_HEADER_H, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-sub)', borderBottom: '1px solid var(--border-sub)', borderTop: '1px solid var(--border-sub)' }}>
                    {project && <div style={{ width: 8, height: 8, borderRadius: 2, background: project.color, flexShrink: 0 }} />}
                    <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {project ? project.name : '未分類'}
                    </span>
                  </div>
                  {gPieces.map(p => (
                    <div key={p.id} style={{ height: ROW_H, padding: '0 12px', display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border-sub)', background: hoveredId === p.id ? 'var(--accent-sub)' : 'var(--surface)', transition: 'background 0.1s' }} onMouseEnter={() => setHoveredId(p.id)} onMouseLeave={() => setHoveredId(null)}>
                      <span style={{ fontSize: 11, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Timeline area */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Header scroll */}
            <div
              ref={headerRef}
              style={{ height: HEADER_H, overflowX: 'scroll', overflowY: 'hidden', flexShrink: 0, borderBottom: '1px solid var(--border)' }}
              onScroll={e => syncScroll('header', (e.target as HTMLDivElement).scrollLeft)}
            >
              <div style={{ width: totalW, height: '100%', background: 'var(--surface)', position: 'relative' }}>
                {/* Month / week markers */}
                {weekMarkers.map(m => (
                  <div key={m.day} style={{ position: 'absolute', left: m.day * dayPx, top: 0, height: '100%', borderLeft: '1px solid var(--border-sub)' }}>
                    <span style={{ position: 'absolute', top: 8, left: 4, fontSize: 9, fontWeight: 600, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{m.label}</span>
                  </div>
                ))}
                {/* Today marker in header */}
                {todayX >= 0 && todayX <= totalW && (
                  <div style={{ position: 'absolute', left: todayX, top: 0, bottom: 0, width: 2, background: '#E60012', opacity: 0.7 }}>
                    <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 9, fontWeight: 700, color: '#E60012', whiteSpace: 'nowrap' }}>今日</span>
                  </div>
                )}
              </div>
            </div>

            {/* Body scroll */}
            <div
              ref={bodyRef}
              style={{ flex: 1, overflowX: 'scroll', overflowY: 'auto' }}
              onScroll={e => {
                const el = e.target as HTMLDivElement;
                syncScroll('body', el.scrollLeft);
                // Also sync left label scroll
                const labelsEl = el.parentElement?.previousElementSibling?.querySelector('div:last-child') as HTMLDivElement | null;
                if (labelsEl) labelsEl.scrollTop = el.scrollTop;
              }}
            >
              <div style={{ width: totalW, position: 'relative' }}>
                {/* Today line */}
                {todayX >= 0 && todayX <= totalW && (
                  <div style={{ position: 'absolute', left: todayX, top: 0, bottom: 0, width: 1.5, background: '#E60012', opacity: 0.25, zIndex: 1, pointerEvents: 'none' }} />
                )}

                {/* Weekend shading */}
                {days.map((d, i) => {
                  const dow = d.getDay();
                  if (dow !== 0 && dow !== 6) return null;
                  return <div key={i} style={{ position: 'absolute', left: i * dayPx, top: 0, width: dayPx, bottom: 0, background: 'rgba(0,0,0,0.025)', pointerEvents: 'none' }} />;
                })}

                {/* Groups and rows */}
                {grouped.map(({ project, pieces: gPieces }) => (
                  <div key={project?.id ?? 'none'}>
                    {/* Group header spacer */}
                    <div style={{ height: GROUP_HEADER_H, borderBottom: '1px solid var(--border-sub)', borderTop: '1px solid var(--border-sub)', background: 'var(--surface-sub)' }} />
                    {gPieces.map(p => {
                      const s = p.start_date ? toDate(p.start_date) : p.due_date ? addDays(toDate(p.due_date), -3) : null;
                      const e = p.due_date ? toDate(p.due_date) : p.start_date ? addDays(toDate(p.start_date), 3) : null;
                      if (!s || !e) return (
                        <div key={p.id} style={{ height: ROW_H, borderBottom: '1px solid var(--border-sub)', background: hoveredId === p.id ? 'var(--accent-sub)' : 'transparent' }} onMouseEnter={() => setHoveredId(p.id)} onMouseLeave={() => setHoveredId(null)} />
                      );

                      const x1 = xOf(s);
                      const x2 = xOf(e);
                      const barW = Math.max(x2 - x1, 8);
                      const color = project ? project.color : STATUS_COLORS[p.status] ?? '#A8A8A4';
                      const pct = p.progress ?? 0;

                      return (
                        <div
                          key={p.id}
                          style={{ height: ROW_H, borderBottom: '1px solid var(--border-sub)', position: 'relative', background: hoveredId === p.id ? 'var(--accent-sub)' : 'transparent', transition: 'background 0.1s' }}
                          onMouseEnter={() => setHoveredId(p.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <div
                            title={`${p.title}\n${s.toLocaleDateString('ja-JP')} → ${e.toLocaleDateString('ja-JP')}\n進捗: ${pct}%`}
                            style={{
                              position: 'absolute',
                              left: x1,
                              top: 6,
                              width: barW,
                              height: ROW_H - 12,
                              borderRadius: 4,
                              background: color + (p.status === 'done' ? '55' : 'CC'),
                              border: `1px solid ${color}`,
                              overflow: 'hidden',
                              cursor: 'default',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            {/* Progress fill */}
                            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: color, opacity: 0.4 }} />
                            {barW > 40 && (
                              <span style={{ position: 'relative', fontSize: 9, fontWeight: 600, color: p.status === 'done' ? 'var(--text-3)' : '#fff', paddingLeft: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: barW - 8 }}>
                                {p.title}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                {grouped.length === 0 && (
                  <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                    start_date または due_date が設定されたピースがありません
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
