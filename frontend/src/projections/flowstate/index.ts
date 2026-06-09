/**
 * Flow State Engine — pure function
 *
 * Session signals → CognitiveFlowState + metrics。
 * ReactFlow を import しない。UI state を持たない。
 */

import type { CognitiveFlowState, FlowStateProjection, FlowUIDirective } from './types';

export type { FlowStateProjection, FlowUIDirective, CognitiveFlowState, FlowSignal } from './types';

const MIN_MS  =  60_000;
const HOUR_MS = 3_600_000;

// ── State Machine input ───────────────────────────────────────────

export interface FlowStateInput {
  /** 現在のセッション開始時刻 */
  sessionStart:          number;
  /** 直近 30 分のプロジェクト切り替えタイムスタンプ */
  recentProjectSwitches: number[];
  /** 直近 30 分の Repair 操作カウント */
  recentRepairInteracts: number;
  /** 直近 30 分の異なる Layer 操作カウント */
  recentLayerJumps:      number;
  /** 最後に進捗更新した時刻（null = 更新なし）*/
  lastProgressAt:        number | null;
  /** 最後に handoff/blocker 解決した時刻（null = なし）*/
  lastRecoveryAt:        number | null;
  /** 現在の修復棚アイテム数 */
  repairCount:           number;
  /** Hero の progress 0-100 */
  heroProgress:          number;
  /** 直前の状態（遷移に使う）*/
  previousState:         CognitiveFlowState;
  now:                   number;
}

// ── Computation ───────────────────────────────────────────────────

export function computeFlowState(input: FlowStateInput): FlowStateProjection {
  const {
    sessionStart, recentProjectSwitches, recentRepairInteracts,
    recentLayerJumps, lastProgressAt, lastRecoveryAt,
    repairCount, heroProgress, previousState, now,
  } = input;

  const sessionDuration = now - sessionStart;
  const switchCount     = recentProjectSwitches.length;

  // ── 修復後（recovering）────────────────────────────────────────
  if (lastRecoveryAt && now - lastRecoveryAt < 10 * MIN_MS) {
    const interruptionRisk  = Math.max(0, 0.4 - (now - lastRecoveryAt) / (10 * MIN_MS) * 0.4);
    const contextSwitchLoad = Math.min(1, switchCount / 4) * 0.5;
    const focusIntegrity    = 0.6 + (now - lastRecoveryAt) / (10 * MIN_MS) * 0.2;
    return { state: 'recovering', interruptionRisk, contextSwitchLoad, focusIntegrity };
  }

  // ── 疲弊（exhausted）──────────────────────────────────────────
  // 3h 超 + 修復棚 3件超 + 進捗更新なし 30min
  const staleProgress = !lastProgressAt || (now - lastProgressAt) > 30 * MIN_MS;
  if (sessionDuration > 3 * HOUR_MS && repairCount > 2 && staleProgress) {
    return {
      state:             'exhausted',
      interruptionRisk:  0.3,
      contextSwitchLoad: Math.min(1, switchCount / 4),
      focusIntegrity:    0.25,
    };
  }

  // ── 思考分断（fractured）─────────────────────────────────────
  // 30min 以内に 3 プロジェクト切り替え、または layer jump 多発
  const tooManyProjectSwitches = switchCount >= 3;
  const tooManyLayerJumps      = recentLayerJumps >= 5;
  const tooManyRepairs         = recentRepairInteracts >= 3;

  if (tooManyProjectSwitches || (tooManyLayerJumps && tooManyRepairs)) {
    const interruptionRisk  = Math.min(1, switchCount / 5 * 0.6 + recentLayerJumps / 8 * 0.4);
    const contextSwitchLoad = Math.min(1, switchCount / 4);
    const focusIntegrity    = Math.max(0, 0.4 - switchCount * 0.1);
    return { state: 'fractured', interruptionRisk, contextSwitchLoad, focusIntegrity };
  }

  // ── 作業開始（entering）──────────────────────────────────────
  // セッション 5 分未満、または Hero が変わったばかり（前状態が recovering/entering）
  if (
    sessionDuration < 5 * MIN_MS ||
    previousState === 'entering' && sessionDuration < 10 * MIN_MS
  ) {
    return {
      state:             'entering',
      interruptionRisk:  0.2,
      contextSwitchLoad: Math.min(0.5, switchCount / 4),
      focusIntegrity:    0.55,
    };
  }

  // ── 没入（flowing）────────────────────────────────────────────
  // 切り替えなし、進捗あり、操作少
  const steadyProject  = switchCount === 0;
  const activeProgress = lastProgressAt && (now - lastProgressAt) < 20 * MIN_MS;
  const lowJumps       = recentLayerJumps < 3;

  if (steadyProject && (activeProgress || heroProgress >= 20) && lowJumps) {
    const focusIntegrity    = Math.min(1, 0.7 + (sessionDuration / (30 * MIN_MS)) * 0.3);
    const interruptionRisk  = recentLayerJumps * 0.05;
    const contextSwitchLoad = 0;
    return { state: 'flowing', interruptionRisk, contextSwitchLoad, focusIntegrity };
  }

  // ── default: entering ─────────────────────────────────────────
  return {
    state:             'entering',
    interruptionRisk:  0.2,
    contextSwitchLoad: Math.min(0.5, switchCount / 4),
    focusIntegrity:    0.5,
  };
}

// ── UI Directive ─────────────────────────────────────────────────

export function getFlowUIDirective(proj: FlowStateProjection): FlowUIDirective {
  switch (proj.state) {
    case 'flowing':
      return {
        tertiaryHidden:    true,
        animationsEnabled: false,
        peripheralOpacity: 0.60,
        heroEmphasis:      2,
        narrativeExpanded: false,
        suppressRefresh:   true,   // 集中中はポーリングしない
      };

    case 'fractured':
      return {
        tertiaryHidden:    true,
        animationsEnabled: false,
        peripheralOpacity: 0.50,
        heroEmphasis:      4,
        narrativeExpanded: false,
        suppressRefresh:   false,
      };

    case 'exhausted':
      return {
        tertiaryHidden:    true,
        animationsEnabled: false,
        peripheralOpacity: 0.50,
        heroEmphasis:      0,
        narrativeExpanded: false,
        suppressRefresh:   false,
      };

    case 'recovering':
      return {
        tertiaryHidden:    false,
        animationsEnabled: true,
        peripheralOpacity: 0.85,
        heroEmphasis:      1,
        narrativeExpanded: true,
        suppressRefresh:   false,
      };

    case 'entering':
    default:
      return {
        tertiaryHidden:    false,
        animationsEnabled: true,
        peripheralOpacity: 1.0,
        heroEmphasis:      0,
        narrativeExpanded: false,
        suppressRefresh:   false,
      };
  }
}
