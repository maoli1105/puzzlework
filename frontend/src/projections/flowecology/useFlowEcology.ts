/**
 * useFlowEcology — React hook
 *
 * friction / reentry / continuity / environment の4 hookを統合。
 * NarrativeProjection + FlowStateProjection + CognitivePressure から
 * FlowEcologyProjection を計算する。
 *
 * 新しい API コールなし。events 走査は1回だけ。
 */

import { useMemo, useRef } from 'react';
import { computeFlowEcology, ENVIRONMENT_MODE_ORDER } from './index';
import type { FlowEcologyProjection, EnvironmentMode } from './types';
import type { FlowStateProjection } from '../flowstate/index';
import type { NarrativeProjection } from '../narrative/types';

export type { FlowEcologyProjection, EnvironmentMode } from './types';
export type { UnresolvedThread, ReentryMode, DecayLevel, SuppressedElement } from './types';

export function useFlowEcology(params: {
  narrative:      NarrativeProjection;
  flowProjection: FlowStateProjection;
  /** CognitivePressure から quietMode だけ使う */
  pressure:       { quietMode: boolean };
  staleDays?:     number;
  repairCount?:   number;
  heroTitle?:     string | null;
  lastRecoveryAt?: number | null;
}): FlowEcologyProjection {
  const {
    narrative,
    flowProjection,
    pressure,
    staleDays    = 0,
    repairCount  = 0,
    heroTitle    = null,
    lastRecoveryAt = null,
  } = params;

  // Gentle World Transition — environmentMode の急落下を防ぐ
  const prevEnvModeRef = useRef<EnvironmentMode>('open');

  return useMemo(() => {
    const now = Date.now();

    // まず制限なしで計算してターゲット envMode を確認
    const target = computeFlowEcology({
      events:    narrative.events,
      headline:  narrative.summary.headline,
      openIssues: narrative.summary.openIssues,
      momentum:  narrative.summary.momentum,
      residue:   narrative.residue ?? [],
      flowState:         flowProjection.state,
      contextSwitchLoad: flowProjection.contextSwitchLoad,
      interruptionRisk:  flowProjection.interruptionRisk,
      focusIntegrity:    flowProjection.focusIntegrity,
      quietMode:  pressure.quietMode,
      staleDays,
      repairCount,
      heroTitle,
      lastRecoveryAt,
      now,
    });

    const prevIdx   = ENVIRONMENT_MODE_ORDER.indexOf(prevEnvModeRef.current);
    const targetIdx = ENVIRONMENT_MODE_ORDER.indexOf(target.environmentMode);
    const gentleMaxIdx = Math.min(targetIdx, prevIdx + 1);
    const gentleMax    = ENVIRONMENT_MODE_ORDER[gentleMaxIdx];

    const proj = gentleMaxIdx < targetIdx
      ? computeFlowEcology({
          events:    narrative.events,
          headline:  narrative.summary.headline,
          openIssues: narrative.summary.openIssues,
          momentum:  narrative.summary.momentum,
          residue:   narrative.residue ?? [],
          flowState:         flowProjection.state,
          contextSwitchLoad: flowProjection.contextSwitchLoad,
          interruptionRisk:  flowProjection.interruptionRisk,
          focusIntegrity:    flowProjection.focusIntegrity,
          quietMode:  pressure.quietMode,
          staleDays,
          repairCount,
          heroTitle,
          lastRecoveryAt,
          now,
        }, gentleMax)
      : target;

    prevEnvModeRef.current = proj.environmentMode;
    return proj;
  }, [
    narrative.pieceId,
    narrative.events.length,
    narrative.residue.length,
    narrative.summary.headline,
    narrative.summary.momentum,
    narrative.summary.openIssues.length,
    flowProjection.state,
    flowProjection.contextSwitchLoad,
    flowProjection.interruptionRisk,
    flowProjection.focusIntegrity,
    pressure.quietMode,
    staleDays,
    repairCount,
    heroTitle,
    lastRecoveryAt,
  ]);
}
