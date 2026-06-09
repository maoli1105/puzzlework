/**
 * CollapseWrapper — Cognitive layer の collapsed / hidden / visible 制御。
 * WorkshopPage と各 section ファイルで共有する。
 *
 * peripheralOpacity を受け取り、Math.min(TIER_OPACITY[tier], peripheralOpacity) で
 * Flow + Cognitive の二重制御を内部で統一する。
 * 呼び出し元に外側 opacity wrapper div は不要。
 */

import React, { useState } from 'react';
import type { CollapseState, AttentionTier } from '../../projections/cognitive/types';

const C_CW = {
  ink4: '#BBBBBB',
  ink5: '#E0E0E0',
} as const;

export const TIER_OPACITY: Record<AttentionTier, number> = {
  primary:   1.0,
  secondary: 0.72,
  tertiary:  0.50,
};

export function CollapseWrapper({
  state, tier, collapsedLabel, children,
  peripheralOpacity = 1,
}: {
  state:             CollapseState;
  tier:              AttentionTier;
  collapsedLabel:    string;
  children:          React.ReactNode;
  /** flow.peripheralOpacity を渡す。省略時は 1（Flow 制御なし）。
   *  内部で Math.min(TIER_OPACITY[tier], peripheralOpacity) として統合。 */
  peripheralOpacity?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const opacity = Math.min(TIER_OPACITY[tier], peripheralOpacity);

  if (state === 'hidden') return null;

  if (state === 'collapsed' && !expanded) {
    return (
      <div style={{ opacity }}>
        <button
          onClick={() => setExpanded(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', background: 'none', border: 'none',
            padding: '6px 0', cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ width: 16, height: 1, background: C_CW.ink5, flexShrink: 0 }} />
          <span style={{ fontSize: 10, color: C_CW.ink4 }}>{collapsedLabel}</span>
          <span style={{ fontSize: 9, color: C_CW.ink5, marginLeft: 'auto' }}>展開</span>
        </button>
      </div>
    );
  }

  return (
    <div style={{ opacity }}>
      {state === 'collapsed' && expanded && (
        <button
          onClick={() => setExpanded(false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            width: '100%', background: 'none', border: 'none',
            padding: '0 0 8px', cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: 9, color: C_CW.ink4 }}>▲ 折りたたむ</span>
        </button>
      )}
      {children}
    </div>
  );
}
