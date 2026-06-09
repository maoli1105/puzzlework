import { useEffect, useState, useCallback } from 'react';
import { pieces as pieceApi, projects as projectApi, leave as leaveApi } from '../../services/api';
import { Piece, Project, LeaveRequest } from '../../types';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalEvent {
  id: string;
  date: string;
  label: string;
  color: string;
  type: 'piece' | 'leave';
  sub?: string;
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  r.setDate(1);
  return r;
}

const STATUS_COLORS: Record<string, string> = {
  locked:      '#A8A8A4',
  ready:       '#4A9B6F',
  in_progress: '#1A56DB',
  done:        '#9CA3AF',
};

const STATUS_LABELS: Record<string, string> = {
  locked: 'ロック', ready: '着手可', in_progress: '進行中', done: '完了',
};

const LEAVE_COLORS: Record<string, string> = {
  pending:  '#B46400',
  approved: '#4A9B6F',
  rejected: '#9CA3AF',
};

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土'];

export default function CalendarPage() {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null); // selected date string

  const load = useCallback(async () => {
    setLoading(true);
    const [ps, pjs, ls] = await Promise.all([
      pieceApi.list().catch(() => [] as Piece[]),
      projectApi.list().catch(() => [] as Project[]),
      leaveApi.list().catch(() => [] as LeaveRequest[]),
    ]);
    const projectMap: Record<string, Project> = Object.fromEntries(pjs.map((p: Project) => [p.id, p]));

    const evts: CalEvent[] = [];

    // Piece due dates
    for (const p of ps as Piece[]) {
      if (!p.due_date || p.status === 'done') continue;
      const proj = p.project_id ? projectMap[p.project_id] : undefined;
      evts.push({
        id: `piece-${p.id}`,
        date: p.due_date.slice(0, 10),
        label: p.title,
        color: proj?.color ?? STATUS_COLORS[p.status],
        type: 'piece',
        sub: STATUS_LABELS[p.status],
      });
    }

    // Leave requests (span multi-day)
    for (const l of ls as LeaveRequest[]) {
      if (l.status === 'rejected') continue;
      const start = new Date(l.start_date);
      const end = new Date(l.end_date);
      const cur = new Date(start);
      while (cur <= end) {
        evts.push({
          id: `leave-${l.id}-${toDateString(cur)}`,
          date: toDateString(cur),
          label: l.user_name ?? '休暇',
          color: LEAVE_COLORS[l.status] ?? '#B46400',
          type: 'leave',
          sub: l.reason ?? undefined,
        });
        cur.setDate(cur.getDate() + 1);
      }
    }

    setEvents(evts);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Build calendar grid: 6 rows × 7 cols
  const firstDay = new Date(month);
  firstDay.setDate(1);
  const startOffset = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const today = toDateString(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const eventsByDate = events.reduce<Record<string, CalEvent[]>>((acc, e) => {
    (acc[e.date] = acc[e.date] || []).push(e);
    return acc;
  }, {});

  const selectedEvents = selected ? (eventsByDate[selected] ?? []) : [];

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', fontSize: 13 }}>
      Loading...
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div className="page-toolbar" style={{
        height: 52, padding: '0 24px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>カレンダー</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>期限・休暇の統合ビュー</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => setMonth(m => addMonths(m, -1))} style={{ padding: '6px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>
            <ChevronLeft size={14} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)', padding: '0 12px', minWidth: 96, textAlign: 'center' }}>
            {month.getFullYear()}年{month.getMonth() + 1}月
          </span>
          <button onClick={() => setMonth(m => addMonths(m, 1))} style={{ padding: '6px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', cursor: 'pointer', color: 'var(--text-2)', display: 'flex', alignItems: 'center' }}>
            <ChevronRight size={14} />
          </button>
          <button
            onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); setMonth(d); }}
            style={{ marginLeft: 4, padding: '5px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 11, background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer' }}
          >
            今月
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Calendar grid */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* DOW header */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {DOW_JA.map((d, i) => (
              <div key={i} style={{
                padding: '8px 0',
                textAlign: 'center',
                fontSize: 11, fontWeight: 600,
                color: i === 0 ? '#E60012' : i === 6 ? '#1A56DB' : 'var(--text-3)',
                letterSpacing: '0.04em',
              }}>
                {d}
              </div>
            ))}
          </div>

          {/* Weeks */}
          <div style={{ flex: 1, display: 'grid', gridTemplateRows: `repeat(${cells.length / 7}, 1fr)`, overflow: 'hidden' }}>
            {Array.from({ length: cells.length / 7 }).map((_, week) => (
              <div key={week} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border-sub)' }}>
                {cells.slice(week * 7, week * 7 + 7).map((date, col) => {
                  const dateStr = date ? toDateString(date) : null;
                  const isToday = dateStr === today;
                  const isSelected = dateStr === selected;
                  const dayEvents = dateStr ? (eventsByDate[dateStr] ?? []) : [];
                  const dow = week * 7 + col;
                  const isSun = dow % 7 === 0;
                  const isSat = dow % 7 === 6;

                  return (
                    <div
                      key={col}
                      onClick={() => { if (dateStr) setSelected(prev => prev === dateStr ? null : dateStr); }}
                      style={{
                        borderRight: col < 6 ? '1px solid var(--border-sub)' : undefined,
                        padding: '6px 5px',
                        minHeight: 0,
                        overflow: 'hidden',
                        background: isSelected
                          ? 'var(--accent-sub)'
                          : date?.getMonth() !== month.getMonth()
                          ? 'var(--bg)'
                          : isSun || isSat ? 'rgba(0,0,0,0.01)' : 'var(--surface)',
                        cursor: date ? 'pointer' : 'default',
                        transition: 'background 0.1s',
                      }}
                    >
                      {date && (
                        <>
                          <div style={{
                            width: 22, height: 22,
                            borderRadius: '50%',
                            background: isToday ? 'var(--accent)' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: 3,
                          }}>
                            <span style={{
                              fontSize: 11,
                              fontWeight: isToday ? 700 : 400,
                              color: isToday ? '#fff' : isSun ? '#E60012' : isSat ? '#1A56DB' : 'var(--text-2)',
                            }}>
                              {date.getDate()}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {dayEvents.slice(0, 3).map(evt => (
                              <div
                                key={evt.id}
                                title={`${evt.label}${evt.sub ? ` (${evt.sub})` : ''}`}
                                style={{
                                  fontSize: 9,
                                  fontWeight: 600,
                                  background: evt.color + '22',
                                  border: `1px solid ${evt.color}55`,
                                  color: evt.type === 'leave' ? evt.color : 'var(--text-1)',
                                  borderRadius: 3,
                                  padding: '1px 4px',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  letterSpacing: '-0.01em',
                                  borderLeft: `2px solid ${evt.color}`,
                                }}
                              >
                                {evt.label}
                              </div>
                            ))}
                            {dayEvents.length > 3 && (
                              <div style={{ fontSize: 9, color: 'var(--text-3)', paddingLeft: 4 }}>
                                +{dayEvents.length - 3}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Side panel: selected day detail */}
        {selected && (
          <div style={{
            width: 240,
            borderLeft: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 3 }}>
                {new Date(selected).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {selectedEvents.length === 0 ? 'イベントなし' : `${selectedEvents.length}件`}
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedEvents.length === 0 && (
                <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-3)', fontSize: 11 }}>
                  この日のイベントはありません
                </div>
              )}
              {selectedEvents.map(evt => (
                <div key={evt.id} style={{
                  borderRadius: 'var(--r-sm)',
                  border: `1px solid ${evt.color}44`,
                  borderLeft: `3px solid ${evt.color}`,
                  padding: '8px 10px',
                  background: evt.color + '0A',
                }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)', marginBottom: 3, letterSpacing: '-0.01em' }}>
                    {evt.label}
                  </div>
                  {evt.sub && (
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>{evt.sub}</div>
                  )}
                  <div style={{ marginTop: 4 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 600,
                      color: evt.color,
                      background: evt.color + '18',
                      border: `1px solid ${evt.color}33`,
                      borderRadius: 3, padding: '1px 6px',
                      letterSpacing: '0.02em',
                    }}>
                      {evt.type === 'piece' ? '期限' : '休暇'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{
        height: 36, padding: '0 24px',
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: '#1A56DB' }} />
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>期限（進行中）</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: '#4A9B6F' }} />
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>休暇（承認済）</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: '#B46400' }} />
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>休暇（申請中）</span>
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)' }}>
          日付をクリックで詳細
        </div>
      </div>
    </div>
  );
}
