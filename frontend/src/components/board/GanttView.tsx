import { useState, useMemo } from 'react';
import { Piece, Connection, Project } from '../../types';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  pieces: Piece[];
  connections: Connection[];
  projectMap: Record<string, Project>;
  workerMap: Record<string, { name: string }>;
  onPieceClick: (piece: Piece) => void;
}

const STATUS_COLOR: Record<string, string> = {
  locked:      '#9CA3AF',
  ready:       '#059669',
  in_progress: '#2563EB',
  done:        '#6B7280',
};

const DAY_W     = 30;
const VIEW_DAYS = 56;   // 8週
const ROW_H     = 36;
const GROUP_H   = 32;
const LABEL_W   = 220;

function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function fmtDay(d: Date) {
  return d.getDate();
}

// 月ヘッダー用に日配列を月ごとにグループ化
function groupByMonth(days: Date[]) {
  const groups: { label: string; start: number; count: number }[] = [];
  days.forEach((d, i) => {
    const label = `${d.getMonth() + 1}月`;
    if (groups.length === 0 || groups[groups.length - 1].label !== label) {
      groups.push({ label, start: i, count: 1 });
    } else {
      groups[groups.length - 1].count++;
    }
  });
  return groups;
}

export default function GanttView({ pieces, projectMap, onPieceClick }: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (key: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const visible = pieces.filter(p => p.start_date || p.due_date);

  const days = useMemo(() =>
    Array.from({ length: VIEW_DAYS }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i - 7);
      return d;
    }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const monthGroups = useMemo(() => groupByMonth(days), [days]);

  // プロジェクトごとにグループ化（未割り当ては最後）
  const groups = useMemo(() => {
    const map = new Map<string, { project: Project | null; pieces: Piece[] }>();

    for (const p of visible) {
      const key = p.project_id ?? '__none__';
      if (!map.has(key)) {
        map.set(key, { project: p.project_id ? (projectMap[p.project_id] ?? null) : null, pieces: [] });
      }
      map.get(key)!.pieces.push(p);
    }

    // プロジェクト名ソート、未割り当ては末尾
    const entries = [...map.entries()].sort(([a], [b]) => {
      if (a === '__none__') return 1;
      if (b === '__none__') return -1;
      const nameA = projectMap[a]?.name ?? '';
      const nameB = projectMap[b]?.name ?? '';
      return nameA.localeCompare(nameB, 'ja');
    });

    return entries.map(([key, val]) => ({ key, ...val }));
  }, [visible, projectMap]);

  if (visible.length === 0) {
    return (
      <div style={{
        height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-3)', fontSize: 13, fontFamily: '-apple-system, sans-serif',
      }}>
        開始日または期日が設定されたピースがありません
      </div>
    );
  }

  const todayOffset = daysBetween(days[0], today);

  return (
    <div style={{ height: '100%', overflowY: 'auto', overflowX: 'auto', fontFamily: '-apple-system, sans-serif' }}>

      {/* ── ヘッダー（2段・sticky） ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface)', borderBottom: '2px solid var(--border)' }}>

        {/* 月ラベル行 */}
        <div style={{ display: 'flex' }}>
          <div style={{ width: LABEL_W, flexShrink: 0 }} />
          <div style={{ display: 'flex' }}>
            {monthGroups.map((m, i) => (
              <div
                key={i}
                style={{
                  width: m.count * DAY_W,
                  padding: '4px 8px',
                  fontSize: 10, fontWeight: 700,
                  color: 'var(--text-3)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  borderLeft: i > 0 ? '1px solid var(--border)' : undefined,
                }}
              >
                {m.label}
              </div>
            ))}
          </div>
        </div>

        {/* 日付行 */}
        <div style={{ display: 'flex' }}>
          <div style={{
            width: LABEL_W, flexShrink: 0,
            padding: '4px 12px',
            fontSize: 10, fontWeight: 600,
            color: 'var(--text-3)',
          }}>
            ピース
          </div>
          <div style={{ display: 'flex' }}>
            {days.map((d, i) => {
              const isToday = daysBetween(today, d) === 0;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={i}
                  style={{
                    width: DAY_W,
                    textAlign: 'center',
                    fontSize: 9,
                    fontWeight: isToday ? 700 : 400,
                    color: isToday ? '#2563EB' : isWeekend ? '#D1D5DB' : 'var(--text-3)',
                    padding: '4px 0',
                    borderLeft: '1px solid var(--border)',
                    background: isToday ? '#EFF6FF' : isWeekend ? 'var(--surface-sub)' : undefined,
                  }}
                >
                  {fmtDay(d)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── グループ行 ── */}
      {groups.map(({ key, project, pieces: gPieces }) => {
        const isCollapsed = collapsed.has(key);
        const projectColor = project?.color ?? '#9CA3AF';
        const projectName  = project?.name ?? '未割り当て';

        return (
          <div key={key}>
            {/* プロジェクトヘッダー行 */}
            <div
              onClick={() => toggle(key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: GROUP_H,
                cursor: 'pointer',
                background: 'var(--surface-sub)',
                borderBottom: '1px solid var(--border)',
                userSelect: 'none',
              }}
            >
              <div style={{
                width: LABEL_W,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0 10px',
              }}>
                {/* プロジェクトカラードット */}
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: projectColor, flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {projectName}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 500 }}>
                  {gPieces.length}件
                </span>
                <span style={{ color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
                  {isCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                </span>
              </div>
              {/* グリッド背景（ヘッダー行にも） */}
              <div style={{ display: 'flex', flex: 1 }}>
                {days.map((d, i) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div key={i} style={{
                      width: DAY_W, height: GROUP_H, flexShrink: 0,
                      borderLeft: '1px solid var(--border)',
                      background: isWeekend ? 'rgba(0,0,0,0.02)' : undefined,
                    }} />
                  );
                })}
              </div>
            </div>

            {/* ピース行（開いてる時のみ） */}
            {!isCollapsed && gPieces.map(p => {
              const start = p.start_date ? new Date(p.start_date) : (p.due_date ? new Date(p.due_date) : null);
              const end   = p.due_date   ? new Date(p.due_date)   : start;
              if (!start || !end) return null;

              const startOffset = daysBetween(days[0], start);
              const duration    = Math.max(1, daysBetween(start, end) + 1);
              const color       = STATUS_COLOR[p.status] ?? '#888';
              const progress    = Math.min(100, Math.max(0, p.progress ?? 0));

              const barLeft  = startOffset * DAY_W + 2;
              const barWidth = Math.min(duration * DAY_W - 4, (VIEW_DAYS - startOffset) * DAY_W - 4);
              const visible_bar = startOffset < VIEW_DAYS && startOffset + duration > 0;

              return (
                <div key={p.id} style={{ display: 'flex', borderBottom: '1px solid var(--border)', alignItems: 'center', height: ROW_H }}>
                  {/* ラベル列 */}
                  <div
                    style={{
                      width: LABEL_W, flexShrink: 0,
                      padding: '0 12px 0 22px',
                      fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: 'pointer', color: 'var(--text-1)',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    onClick={() => onPieceClick(p)}
                  >
                    {/* ステータスドット */}
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: color, flexShrink: 0, opacity: 0.85,
                    }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                      {p.title}
                    </span>
                    {progress > 0 && progress < 100 && (
                      <span style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>
                        {progress}%
                      </span>
                    )}
                  </div>

                  {/* バー列 */}
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', height: '100%', flex: 1 }}>
                    {/* グリッドセル背景 */}
                    {days.map((d, i) => {
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      return (
                        <div key={i} style={{
                          width: DAY_W, height: '100%', flexShrink: 0,
                          borderLeft: '1px solid var(--border)',
                          background: isWeekend ? 'rgba(0,0,0,0.02)' : undefined,
                        }} />
                      );
                    })}

                    {/* 今日線 */}
                    {todayOffset >= 0 && todayOffset < VIEW_DAYS && (
                      <div style={{
                        position: 'absolute',
                        left: todayOffset * DAY_W + DAY_W / 2,
                        top: 0, bottom: 0,
                        width: 1,
                        background: '#BFDBFE',
                        pointerEvents: 'none',
                        zIndex: 1,
                      }} />
                    )}

                    {/* ガントバー（プログレス付き） */}
                    {visible_bar && barWidth > 0 && (
                      <div
                        onClick={() => onPieceClick(p)}
                        title={`${p.title}（${progress}%）`}
                        style={{
                          position: 'absolute',
                          left: Math.max(0, barLeft),
                          width: barLeft < 0 ? barWidth + barLeft : barWidth,
                          height: 22,
                          borderRadius: 4,
                          cursor: 'pointer',
                          overflow: 'hidden',
                          zIndex: 2,
                          // トラック（薄い背景）
                          background: `${color}28`,
                          border: `1px solid ${color}55`,
                        }}
                      >
                        {/* プログレスフィル */}
                        <div style={{
                          position: 'absolute',
                          left: 0, top: 0, bottom: 0,
                          width: `${progress}%`,
                          background: color,
                          opacity: p.status === 'done' ? 0.5 : 0.85,
                          borderRadius: progress === 100 ? 3 : '3px 0 0 3px',
                          transition: 'width 0.3s ease',
                        }} />
                        {/* タイトルラベル（バーが広い時のみ） */}
                        {barWidth > 50 && (
                          <div style={{
                            position: 'absolute',
                            left: 6, top: 0, bottom: 0,
                            display: 'flex', alignItems: 'center',
                            fontSize: 9, fontWeight: 600,
                            color: progress > 30 ? '#fff' : color,
                            whiteSpace: 'nowrap', overflow: 'hidden',
                            pointerEvents: 'none',
                            letterSpacing: '-0.01em',
                            mixBlendMode: progress > 30 ? 'normal' : undefined,
                          }}>
                            {p.title}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
