// WorkloadRingPanel — viewMode === 'load' で表示する担当者別負荷リング
// ─ 各ワーカーをドーナツリングで可視化
// ─ ステータス別の内訳（done / in_progress / ready / locked）

import React from 'react';
import { Piece, User } from '../../types';

interface Props {
  pieces: Piece[];
  workers: User[];
}

const STATUS_COLORS = {
  done:        '#A0A096',
  in_progress: '#2563EB',
  ready:       '#059669',
  locked:      '#D1D5DB',
};

const STATUS_LABELS = {
  done:        '完了',
  in_progress: '進行中',
  ready:       '着手可',
  locked:      'ロック',
};

const STATUSES = ['in_progress', 'ready', 'locked', 'done'] as const;

// ─── SVG ドーナツリング ────────────────────────────────────────────────────
function DonutRing({ counts, total, pct }: {
  counts: Record<string, number>;
  total: number;
  pct: number; // 完了率 0-100
}) {
  const R   = 30;
  const SW  = 8;
  const C   = 2 * Math.PI * R;  // 周長

  // 各セグメントの stroke-dasharray / stroke-dashoffset を計算
  // ─ 12時（上）からスタートするため -90deg 回転 → dashoffset で補正
  const segments: { color: string; dash: number; offset: number }[] = [];
  let cumulative = 0;
  for (const s of STATUSES) {
    const count = counts[s] ?? 0;
    const frac  = total > 0 ? count / total : 0;
    const dash  = frac * C;
    // 12時スタート: デフォルト3時スタートから C*0.25 だけ手前にずらす
    // さらに前セグメントの累積分だけ追加オフセット
    segments.push({
      color:  STATUS_COLORS[s as keyof typeof STATUS_COLORS],
      dash,
      offset: C * 0.25 - cumulative,
    });
    cumulative += dash;
  }

  return (
    <div style={{ position: 'relative', width: 76, height: 76, flexShrink: 0 }}>
      <svg width="76" height="76" style={{ overflow: 'visible' }}>
        {/* Background track */}
        <circle cx="38" cy="38" r={R} fill="none"
          stroke="var(--border)" strokeWidth={SW} />
        {/* Segments */}
        {segments.map((seg, i) =>
          seg.dash > 0.01 ? (
            <circle key={i}
              cx="38" cy="38" r={R} fill="none"
              stroke={seg.color} strokeWidth={SW}
              strokeDasharray={`${seg.dash} ${C - seg.dash}`}
              strokeDashoffset={seg.offset}
              style={{ transition: 'stroke-dasharray 0.5s ease' }}
            />
          ) : null
        )}
      </svg>
      {/* Center label */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-1)', lineHeight: 1 }}>
          {Math.round(pct)}
        </span>
        <span style={{ fontSize: 7.5, color: 'var(--text-3)', lineHeight: 1.2 }}>%完了</span>
      </div>
    </div>
  );
}

// ─── 担当なしカード ───────────────────────────────────────────────────────
function UnassignedCard({ pieces }: { pieces: Piece[] }) {
  if (pieces.length === 0) return null;
  const counts = Object.fromEntries(
    STATUSES.map(s => [s, pieces.filter(p => p.status === s).length])
  );
  const done  = counts['done'] ?? 0;
  const total = pieces.length;
  const pct   = total > 0 ? (done / total) * 100 : 0;

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'center',
      padding: '9px 10px',
      background: 'var(--surface-sub)',
      borderRadius: 12,
      border: '1px solid var(--border)',
    }}>
      <DonutRing counts={counts} total={total} pct={pct} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          未割り当て
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          {STATUSES.filter(s => counts[s] > 0).map(s => (
            <span key={s} style={{
              fontSize: 8.5, fontWeight: 700,
              color: STATUS_COLORS[s as keyof typeof STATUS_COLORS],
              background: `${STATUS_COLORS[s as keyof typeof STATUS_COLORS]}18`,
              border: `1px solid ${STATUS_COLORS[s as keyof typeof STATUS_COLORS]}35`,
              borderRadius: 5, padding: '1px 5px',
            }}>
              {counts[s]} {STATUS_LABELS[s as keyof typeof STATUS_LABELS]}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 9, color: 'var(--text-3)' }}>
          合計 {total} 件
        </div>
      </div>
    </div>
  );
}

// ─── ワーカーカード ───────────────────────────────────────────────────────
function WorkerCard({ worker, pieces }: { worker: User; pieces: Piece[] }) {
  const counts = Object.fromEntries(
    STATUSES.map(s => [s, pieces.filter(p => p.status === s).length])
  );
  const done    = counts['done'] ?? 0;
  const active  = (counts['in_progress'] ?? 0) + (counts['ready'] ?? 0);
  const total   = pieces.length;
  const pct     = total > 0 ? (done / total) * 100 : 0;

  // 負荷レベル: active 件数で判断
  const loadLevel = active >= 5 ? 'high' : active >= 3 ? 'mid' : 'low';
  const loadColor = { high: '#EF4444', mid: '#F59E0B', low: '#10B981' }[loadLevel];

  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'center',
      padding: '9px 10px',
      background: 'var(--surface-sub)',
      borderRadius: 12,
      border: `1px solid ${loadLevel === 'high' ? '#FCA5A555' : 'var(--border)'}`,
      boxShadow: loadLevel === 'high' ? '0 0 0 1px #FCA5A530' : undefined,
    }}>
      <DonutRing counts={counts} total={total} pct={pct} />
      <div style={{ minWidth: 0, flex: 1 }}>
        {/* Name + load badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {worker.name}
          </span>
          <span style={{
            fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 5,
            background: `${loadColor}18`, color: loadColor, border: `1px solid ${loadColor}40`,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {active} 稼働
          </span>
        </div>
        {/* Status badges */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
          {STATUSES.filter(s => counts[s] > 0).map(s => (
            <span key={s} style={{
              fontSize: 8.5, fontWeight: 700,
              color: STATUS_COLORS[s as keyof typeof STATUS_COLORS],
              background: `${STATUS_COLORS[s as keyof typeof STATUS_COLORS]}18`,
              border: `1px solid ${STATUS_COLORS[s as keyof typeof STATUS_COLORS]}35`,
              borderRadius: 5, padding: '1px 5px',
            }}>
              {counts[s]} {STATUS_LABELS[s as keyof typeof STATUS_LABELS]}
            </span>
          ))}
        </div>
        {/* Active piece titles */}
        {pieces.filter(p => p.status === 'in_progress').slice(0, 2).map(p => (
          <div key={p.id} style={{
            fontSize: 8.5, color: 'var(--text-3)', lineHeight: 1.4,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <span style={{ width: 4, height: 4, borderRadius: 1, background: STATUS_COLORS.in_progress, flexShrink: 0, display: 'inline-block' }} />
            {p.title}
          </div>
        ))}
        {total === 0 && (
          <div style={{ fontSize: 8.5, color: 'var(--text-3)' }}>割り当てなし</div>
        )}
      </div>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────
export default function WorkloadRingPanel({ pieces, workers }: Props) {
  // workers にアサインされたピースを集計
  const byWorker: Record<string, Piece[]> = {};
  const unassigned: Piece[] = [];
  for (const p of pieces) {
    if (!p.assignee_id) {
      unassigned.push(p);
    } else {
      if (!byWorker[p.assignee_id]) byWorker[p.assignee_id] = [];
      byWorker[p.assignee_id].push(p);
    }
  }

  // active (in_progress) 件数で降順ソート
  const sorted = [...workers].sort((a, b) => {
    const aActive = (byWorker[a.id] ?? []).filter(p => p.status === 'in_progress').length;
    const bActive = (byWorker[b.id] ?? []).filter(p => p.status === 'in_progress').length;
    return bActive - aActive;
  });

  // 凡例データ
  const legend = STATUSES.map(s => ({
    s, color: STATUS_COLORS[s as keyof typeof STATUS_COLORS],
    label: STATUS_LABELS[s as keyof typeof STATUS_LABELS],
  }));

  return (
    <div style={{
      position: 'absolute', top: 16, left: 16, bottom: 16,
      width: 256,
      zIndex: 10,
      display: 'flex', flexDirection: 'column',
      gap: 0,
      pointerEvents: 'none',
    }}>
      {/* Panel */}
      <div style={{
        background: 'var(--surface)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        maxHeight: '100%',
        pointerEvents: 'auto',
      }}>
        {/* Header */}
        <div style={{
          padding: '10px 14px 8px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 7 }}>
            負荷マップ
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {legend.map(({ s, color, label }) => (
              <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: color, display: 'inline-block' }} />
                <span style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 600 }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Scrollable worker list */}
        <div style={{
          overflowY: 'auto', padding: '8px 8px',
          display: 'flex', flexDirection: 'column', gap: 6,
          flex: 1,
        }}>
          {sorted.map(w => (
            <WorkerCard key={w.id} worker={w} pieces={byWorker[w.id] ?? []} />
          ))}
          <UnassignedCard pieces={unassigned} />
        </div>

        {/* Summary footer */}
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '7px 14px',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9.5, color: 'var(--text-3)', fontWeight: 600 }}>
            <span>{workers.length} 名</span>
            <span>
              {pieces.filter(p => p.status === 'in_progress').length} 稼働中 / {pieces.length} 件
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
