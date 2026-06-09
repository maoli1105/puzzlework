/**
 * QueueSection — Queue composition を WorkshopPage から分離。
 * visibility gating は WorkshopPage 側で行う。
 *
 * その他のピース（hero 以外・non-done）の一覧表示。
 */

import type { Piece } from '../../types/index';
import type { CognitivePressure } from '../../projections/cognitive/types';
import type { FlowUIDirective } from '../../projections/flowstate/index';
import { TIER_OPACITY } from './CollapseWrapper';

// ── ローカルデザイントークン ──────────────────────────────────────
const C = {
  ink1:    'var(--text-1)',
  ink3:    'var(--text-3)',
  ink4:    'var(--text-4)',
  surface: 'var(--surface)',
  border:  'var(--border)',
  ready:   '#555555',
  accent:  '#E60012',
  locked:  '#AAAAAA',
} as const;

const STATUS_LABEL: Record<string, string> = {
  locked: 'ロック中', ready: '着手可能', in_progress: '進行中', done: '完了',
};
const STATUS_COLOR: Record<string, string> = {
  locked: C.locked, ready: C.ready, in_progress: C.accent, done: C.ink4,
};

function dueLabel(due: string | null): { text: string; urgent: boolean } | undefined {
  if (!due) return undefined;
  const diff = Math.ceil((new Date(due).getTime() - Date.now()) / 86_400_000);
  if (diff < 0)  return { text: `${Math.abs(diff)}日超過`, urgent: true };
  if (diff === 0) return { text: '今日期限',               urgent: true };
  if (diff <= 5)  return { text: `残${diff}日`,            urgent: true };
  return         { text: `残${diff}日`,                    urgent: false };
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: C.ink4,
      letterSpacing: '0.08em', marginBottom: 10, textTransform: 'uppercase',
    }}>
      {text}
    </div>
  );
}

// QueueSection remains flat until multiple prop domains emerge
function QueueCard({ piece }: { piece: Piece }) {
  const col = STATUS_COLOR[piece.status] ?? C.ink4;
  const due = dueLabel(piece.due_date);
  return (
    <div style={{
      padding: '10px 14px', background: C.surface,
      border: `1px solid ${C.border}`, borderRadius: 2,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <div style={{ width: 3, height: 24, background: col, borderRadius: 2, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.ink1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {piece.title}
        </div>
        <div style={{ fontSize: 10, color: col }}>{STATUS_LABEL[piece.status]}</div>
      </div>
      {due && <span style={{ fontSize: 9, color: due.urgent ? C.accent : C.ink3, flexShrink: 0 }}>{due.text}</span>}
    </div>
  );
}

// QueueSection composition contract
// ── QueueSection — Queue の composition ──────────────────────────
export function QueueSection({
  queue,
  cognitive,
  flow,
}: {
  queue:     Piece[];
  cognitive: CognitivePressure;
  flow:      FlowUIDirective;
}) {
  return (
    <section style={{ opacity: Math.min(TIER_OPACITY[cognitive.attentionTier.queue], flow.peripheralOpacity) }}>
      <SectionLabel text="その他のピース" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {queue.map(p => <QueueCard key={p.id} piece={p} />)}
      </div>
    </section>
  );
}
