/**
 * TimelineSection — timeline composition を WorkshopPage から分離。
 * visibility gating は WorkshopPage 側で行う。
 *
 * L4: NarrativeFeed（なぜこれをやるのか / 変更履歴）
 * CollapseWrapper + peripheralOpacity による Flow + Cognitive 二重制御。
 */

import { useState } from 'react';
import type { NarrativeProjection } from '../../projections/narrative/useNarrativeProjection';
import type { CognitivePressure } from '../../projections/cognitive/types';
import type { FlowUIDirective } from '../../projections/flowstate/index';
import { CollapseWrapper } from './CollapseWrapper';

// ── ローカルデザイントークン ──────────────────────────────────────
const C = {
  ink1:    'var(--text-1)',
  ink2:    'var(--text-2)',
  ink3:    'var(--text-3)',
  ink4:    'var(--text-4)',
  ink5:    'var(--border)',
  surface: 'var(--surface)',
  sub:     'var(--surface-sub)',
  accent:  '#E60012',
  border:  'var(--border)',
  ready:   '#555555',
  stale:   '#B46400',
} as const;

const MOMENTUM_META: Record<string, { label: string; color: string }> = {
  forward:  { label: '前進中',       color: C.ready },
  blocked:  { label: '詰まりあり',   color: C.stale },
  cycling:  { label: '往復している', color: C.ink3  },
  idle:     { label: '静止中',       color: C.ink4  },
};

const NARRATIVE_KIND_COLOR: Record<string, string> = {
  status_changed:       '#555555',
  assigned:             'var(--text-3)',
  connected:            'var(--text-3)',
  blocker_reported:     C.stale,
  field_updated:        'var(--text-3)',
  auto_promoted:        '#B46400',
  published:            '#B46400',
  marketplace_accepted: C.accent,
};

const NARRATIVE_KIND_LABEL: Record<string, string> = {
  status_changed:       'ステータス変更',
  assigned:             '担当者変更',
  connected:            '接続追加',
  blocker_reported:     'ブロック報告',
  field_updated:        'フィールド編集',
  auto_promoted:        '自動着手可',
  published:            '外部公開',
  marketplace_accepted: '受注',
};

// TimelineSection-internal narrative contract
// ── NarrativeFeed — 圧縮サマリー + 展開時イベント列 ──────────────
function NarrativeFeed({ narrative }: { narrative: NarrativeProjection }) {
  // timeline expansion state は NarrativeFeed 内に閉じる
  const [eventsOpen, setEventsOpen] = useState(false);
  const { events, summary, loading } = narrative;
  const momentum = (summary as { momentum?: string }).momentum ?? 'idle';

  if (loading) return (
    <div style={{ fontSize: 11, color: C.ink4, padding: '8px 0' }}>…</div>
  );

  const momentumMeta = MOMENTUM_META[momentum] ?? MOMENTUM_META.idle;

  return (
    <div>
      {/* 圧縮サマリー */}
      <div style={{
        padding: '12px 14px', background: C.sub, borderRadius: 2,
        border: `1px solid ${C.border}`,
      }}>
        {/* momentum ドット + headline */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{
            flexShrink: 0, marginTop: 4,
            width: 6, height: 6, borderRadius: '50%',
            background: momentumMeta.color,
            display: 'inline-block',
          }} />
          <div style={{ flex: 1 }}>
            {summary.headline && (
              <div style={{ fontSize: 12, fontWeight: 600, color: C.ink1, lineHeight: 1.5 }}>
                {summary.headline}
              </div>
            )}
            <div style={{ fontSize: 9, color: momentumMeta.color, marginTop: 2 }}>
              {momentumMeta.label}
            </div>
          </div>
        </div>

        {/* open issues — 展開時のみ。復帰直後の視界から除外。unresolvedThreads と情報重複しない */}
        {eventsOpen && summary.openIssues.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {summary.openIssues.map((issue, i) => (
              <div key={i} style={{ fontSize: 10, color: C.stale, paddingLeft: 14 }}>
                {issue}
              </div>
            ))}
          </div>
        )}

        {/* patterns */}
        {summary.patterns.length > 0 && (
          <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {summary.patterns.map((p, i) => (
              <div key={i} style={{ fontSize: 10, color: C.ink3, paddingLeft: 14 }}>{p}</div>
            ))}
          </div>
        )}
      </div>

      {/* イベント・未解決一覧は tertiary — 展開時のみ */}
      {(events.length > 0 || summary.openIssues.length > 0) && (
        <div style={{ marginTop: 6 }}>
          <button
            onClick={() => setEventsOpen(v => !v)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 9, color: C.ink4, padding: '4px 0',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ width: 12, height: 1, background: C.ink5 }} />
            {eventsOpen
              ? '閉じる'
              : events.length > 0
                ? `変更履歴 ${events.length}件`
                : `未解決 ${summary.openIssues.length}件`
            }
          </button>

          {eventsOpen && events.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 0, opacity: 0.82 }}>
              {[...events].reverse().slice(0, 8).map((ev, i, arr) => {
                const dot   = NARRATIVE_KIND_COLOR[ev.kind] ?? C.ink4;
                const label = NARRATIVE_KIND_LABEL[ev.kind] ?? ev.kind;
                const isLast = i === arr.length - 1;
                const diff  = (Date.now() - new Date(ev.timestamp).getTime()) / 1000;
                const when  = diff < 60 ? 'たった今'
                  : diff < 3600   ? `${Math.floor(diff / 60)}分前`
                  : diff < 86400  ? `${Math.floor(diff / 3600)}時間前`
                  : `${Math.floor(diff / 86400)}日前`;
                return (
                  <div key={ev.id} style={{ display: 'flex', gap: 10, paddingBottom: isLast ? 0 : 10, position: 'relative' }}>
                    {!isLast && (
                      <div style={{ position: 'absolute', left: 7, top: 18, bottom: 0, width: 1, background: C.border }} />
                    )}
                    <div style={{ width: 15, height: 15, borderRadius: '50%', background: dot, flexShrink: 0, marginTop: 2 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: C.ink1 }}>{label}</span>
                        <span style={{ fontSize: 9, color: C.ink4 }}>{when}</span>
                      </div>
                      {ev.actorName && <div style={{ fontSize: 10, color: C.ink3 }}>{ev.actorName}</div>}
                      {(ev.from || ev.to) && (
                        <div style={{ fontSize: 10, color: C.ink4, marginTop: 1 }}>
                          {ev.from && <span>{ev.from}</span>}
                          {ev.from && ev.to && <span> → </span>}
                          {ev.to && <span style={{ color: C.ink3 }}>{ev.to}</span>}
                        </div>
                      )}
                      {ev.reason && (
                        <div style={{ fontSize: 10, color: C.ink2, fontStyle: 'italic', marginTop: 2 }}>"{ev.reason}"</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// TimelineSection composition contract
// ── TimelineSection — L4 の composition ──────────────────────────
export function TimelineSection({
  narrative,
  cognitive,
  flow,
}: {
  narrative: NarrativeProjection;
  cognitive: CognitivePressure;
  flow:      FlowUIDirective;
}) {
  return (
    <CollapseWrapper
      state={cognitive.collapseState.narrative}
      tier={cognitive.attentionTier.narrative}
      collapsedLabel="なぜ — 文脈あり"
      peripheralOpacity={flow.peripheralOpacity}
    >
      <section>
        <NarrativeFeed narrative={narrative} />
      </section>
    </CollapseWrapper>
  );
}
