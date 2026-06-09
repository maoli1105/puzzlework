/**
 * AlternateFlowsSection — alternate flow composition を WorkshopPage から分離。
 * visibility gating は WorkshopPage 側で行う。
 *
 * L5: Growth Opportunity（「別の流れ」— 能力が育つ隣の機会）
 * flow.tertiaryHidden / suppressedElements / candidates.length による可視性判断は呼び出し元が行う。
 */

import type { GrowthCandidate } from '../../projections/workshop/types';
import type { CognitivePressure } from '../../projections/cognitive/types';
import type { FlowUIDirective } from '../../projections/flowstate/index';
import { CollapseWrapper } from './CollapseWrapper';

// ── ローカルデザイントークン ──────────────────────────────────────
const C = {
  ink1:   'var(--text-1)',
  ink3:   'var(--text-3)',
  ink4:   'var(--text-4)',
  surface: 'var(--surface)',
  sub:    'var(--surface-sub)',
  border: 'var(--border)',
  ready:  '#555555',
} as const;

const GROWTH_REASON_LABEL: Record<string, string> = {
  skill_match:         '関連している',
  new_project:         '新しい文脈',
  adjacent_difficulty: '近い領域',
  mentor_possible:     '誰かを助けられる',
};

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

// GrowthOpportunity remains flat until multiple prop domains emerge
function GrowthOpportunity({ candidates }: { candidates: GrowthCandidate[] }) {
  return (
    <section>
      <SectionLabel text="別の流れ" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {candidates.slice(0, 3).map(({ piece, reason }) => (
          <div key={piece.id} style={{
            padding: '10px 14px', background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 2,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.ink1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {piece.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                <span style={{ fontSize: 9, color: C.ready, fontWeight: 600 }}>
                  {GROWTH_REASON_LABEL[reason] ?? reason}
                </span>
                {piece.skill_tags.slice(0, 2).map(t => (
                  <span key={t} style={{ fontSize: 9, padding: '1px 6px', background: C.sub, color: C.ink3, borderRadius: 2 }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// AlternateFlowsSection composition contract
// ── AlternateFlowsSection — L5 の composition ────────────────────
export function AlternateFlowsSection({
  growthCandidates,
  cognitive,
  flow,
}: {
  growthCandidates: GrowthCandidate[];
  cognitive:        CognitivePressure;
  flow:             FlowUIDirective;
}) {
  return (
    <CollapseWrapper
      state={cognitive.collapseState.growth}
      tier={cognitive.attentionTier.growth}
      collapsedLabel="別の流れ"
      peripheralOpacity={flow.peripheralOpacity}
    >
      <GrowthOpportunity candidates={growthCandidates} />
    </CollapseWrapper>
  );
}
