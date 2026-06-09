/**
 * FlowEcology Engine — pure function
 *
 * friction / reentry / continuity / environment を統合。
 * events を1回だけ走査し、すべての診断を導出する。
 *
 * React を import しない。UI state を持たない。
 * 数値表示禁止。brain score 禁止。Worker を管理しない。
 */

import type {
  FlowEcologyInput,
  FlowEcologyProjection,
  FrictionType, FrictionLevel, ReentryCost,
  ContinuityState, EnvironmentMode, SuppressedElement,
  UnresolvedThread,
  ReentryMode, DecayLevel,
  NarrativeEventSlim, ResidueNoteSlim,
} from './types';

export type {
  FlowEcologyInput,
  FlowEcologyProjection,
  FrictionType, FrictionLevel, ReentryCost,
  ContinuityState, EnvironmentMode, SuppressedElement,
  UnresolvedThread,
  ReentryMode, DecayLevel,
} from './types';

const DAY_MS = 86_400_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function daysSince(iso: string | null, now: number): number | null {
  if (!iso) return null;
  return Math.floor((now - new Date(iso).getTime()) / DAY_MS);
}

function tier<T>(value: number, low: number, high: number, levels: [T, T, T]): T {
  if (value <= low)  return levels[0];
  if (value <= high) return levels[1];
  return levels[2];
}

// ── Step 1: Single Events Scan ────────────────────────────────────────────────

interface EventScan {
  blockerCount:    number;
  reopenCount:     number;
  assigneeChanges: number;
  reasonCount:     number;
  currentStatus:   string;
  latestEventAt:   string | null;
}

function scanEvents(events: NarrativeEventSlim[]): EventScan {
  let blockerCount    = 0;
  let reopenCount     = 0;
  let assigneeChanges = 0;
  let reasonCount     = 0;
  let currentStatus   = 'locked';
  let latestEventAt: string | null = null;

  for (const ev of events) {
    if (ev.kind === 'blocker_reported') blockerCount++;
    if (ev.kind === 'assigned')         assigneeChanges++;
    if (ev.reason)                      reasonCount++;
    if (ev.kind === 'status_changed') {
      const from = ev.from ?? '';
      const to   = ev.to   ?? '';
      const wasActive = from === 'in_progress' || from === 'done';
      const wentBack  = to === 'locked' || to === 'ready';
      if (wasActive && wentBack) reopenCount++;
      currentStatus = to || currentStatus;
    }
  }
  if (events.length > 0) {
    latestEventAt = events[events.length - 1].timestamp;
  }
  return { blockerCount, reopenCount, assigneeChanges, reasonCount, currentStatus, latestEventAt };
}

// ── Step 2: Friction ──────────────────────────────────────────────────────────

interface FrictionResult {
  frictionLevel:   FrictionLevel;
  frictionTypes:   FrictionType[];
  reentryCost:     ReentryCost;
  contextGap:      boolean;
  primaryFriction: FrictionType | null;
}

function computeFriction(
  scan: EventScan,
  residue: ResidueNoteSlim[],
  totalEvents: number,
  staleDays: number,
): FrictionResult {
  const { blockerCount, reopenCount, assigneeChanges, reasonCount, currentStatus } = scan;
  const frictionTypes: FrictionType[] = [];

  const hasResidueContext = residue.some(r =>
    r.type === 'handoff' || r.type === 'decision' || r.type === 'insight'
  );
  const contextGap = totalEvents > 2 && reasonCount === 0 && !hasResidueContext;
  if (contextGap) frictionTypes.push('context_gap');

  if (reopenCount >= 2 || (reopenCount >= 1 && blockerCount >= 2)) {
    frictionTypes.push('rework');
  }
  if (assigneeChanges >= 3) {
    frictionTypes.push('ownership');
  }

  const uncertaintyCount = residue.filter(r => r.type === 'uncertainty').length;
  const decisionCount    = residue.filter(r => r.type === 'decision').length;
  const hasBlockerResidue = residue.some(r => r.type === 'blocker');
  if (uncertaintyCount >= 2 || (uncertaintyCount >= 1 && decisionCount === 0 && blockerCount >= 1)) {
    frictionTypes.push('ambiguity');
  }

  const daysSinceProgress = staleDays > 0 ? staleDays : null;
  if (currentStatus === 'locked' || (daysSinceProgress !== null && daysSinceProgress > 7)) {
    frictionTypes.push('waiting');
  }
  if (staleDays > 14 || (hasBlockerResidue && currentStatus === 'locked')) {
    if (!frictionTypes.includes('waiting')) {
      frictionTypes.push('dependency');
    }
  }

  let score = frictionTypes.length * 2 + reopenCount + blockerCount
            + Math.min(assigneeChanges, 3);
  if (contextGap) score += 2;
  if (staleDays > 30) score += 2;

  const frictionLevel: FrictionLevel =
    score === 0  ? 'low'
    : score <= 3 ? 'medium'
    : score <= 7 ? 'high'
    : 'critical';

  const reentryCostScore =
    (residue.length >= 4 ? 2 : residue.length >= 2 ? 1 : 0) +
    (totalEvents >= 10 ? 2 : totalEvents >= 5 ? 1 : 0) +
    (reopenCount >= 1 ? 1 : 0) +
    (assigneeChanges >= 2 ? 1 : 0) +
    (contextGap ? 2 : 0);
  const reentryCost: ReentryCost = tier(reentryCostScore, 2, 4, ['low', 'medium', 'high']);

  const PRIORITY: FrictionType[] = [
    'context_gap', 'rework', 'ambiguity', 'ownership', 'dependency', 'waiting',
  ];
  const primaryFriction = PRIORITY.find(t => frictionTypes.includes(t)) ?? null;

  return { frictionLevel, frictionTypes, reentryCost, contextGap, primaryFriction };
}

// ── Step 3: Reentry ───────────────────────────────────────────────────────────

function deriveRestartPoint(
  residue: ResidueNoteSlim[],
  openIssues: string[],
  momentum: string,
  friction: FrictionResult,
  staleDays: number,
): string {
  // 数日ぶりの復帰 — 最初に日数を示して文脈を取り戻させる
  if (staleDays >= 3 && friction.frictionLevel !== 'low') {
    const prefix = staleDays >= 7 ? `${staleDays}日ぶりの再開` : '数日ぶりの再開';
    const blockerResidue = residue.find(r => r.type === 'blocker');
    if (blockerResidue) return `${prefix} — 「${truncate(blockerResidue.body, 25)}」から`;
    if (friction.contextGap) return `${prefix} — まず文脈メモを確認する`;
    if (momentum === 'blocked') return `${prefix} — ブロッカーの現状確認から`;
    return `${prefix} — 現状確認から始める`;
  }

  const blockerResidue = residue.find(r => r.type === 'blocker');
  if (blockerResidue) {
    return `「${truncate(blockerResidue.body, 30)}」の解消から再開`;
  }
  if (friction.contextGap && friction.frictionLevel !== 'low') {
    return 'まず文脈メモを残してから再開';
  }
  const uncertainResidue = residue.find(r => r.type === 'uncertainty');
  if (uncertainResidue) {
    return `「${truncate(uncertainResidue.body, 30)}」を確認してから進める`;
  }
  if (openIssues.length > 0) {
    const clean = openIssues[0].replace(/^\[文脈\]\s*/, '');
    return `「${truncate(clean, 30)}」を解消してから進める`;
  }
  const handoffResidue = residue.find(r => r.type === 'handoff');
  if (handoffResidue) {
    return '引き継ぎメモを確認してから着手';
  }
  if (momentum === 'blocked')  return 'ブロッカーの原因を特定してから';
  if (momentum === 'cycling')  return '一度立ち止まって方針を確認する';
  if (momentum === 'forward') {
    if (friction.frictionTypes.includes('rework')) return '直近の変更点を確認してから続ける';
    return '着手中の続きから再開';
  }
  return 'スコープと担当を確認してから着手';
}

function deriveNextLikelyAction(momentum: string, friction: FrictionResult): string {
  const p = friction.primaryFriction;
  if (p === 'context_gap')  return '文脈タブに現状メモを残す';
  if (p === 'ambiguity')    return '不明点を1つ決着させる';
  if (p === 'rework')       return '手戻りの原因を書き留める';
  if (p === 'ownership')    return '担当者を1人に絞る';
  if (p === 'dependency')   return '上流の完了を待つか迂回策を探す';
  if (p === 'waiting')      return '待ち状態の期限を決める';
  if (momentum === 'forward')  return 'このまま進める';
  if (momentum === 'blocked')  return 'ブロッカーを報告する';
  if (momentum === 'cycling')  return '方針を書き留めてから再着手する';
  return '担当者と次の一歩を確認する';
}

function deriveUnresolvedThreads(
  residue: ResidueNoteSlim[],
  openIssues: string[],
): UnresolvedThread[] {
  const threads: UnresolvedThread[] = [];
  for (const r of residue) {
    if (r.type === 'blocker') {
      threads.push({ kind: 'blocker', body: truncate(r.body, 50), urgency: 'high' });
    }
  }
  for (const r of residue) {
    if (r.type === 'uncertainty') {
      threads.push({ kind: 'uncertainty', body: truncate(r.body, 50), urgency: 'medium' });
    }
  }
  for (const r of residue) {
    if (r.type === 'caution') {
      threads.push({ kind: 'caution', body: truncate(r.body, 50), urgency: 'medium' });
    }
  }
  for (const issue of openIssues) {
    if (!issue.startsWith('[文脈]')) {
      threads.push({ kind: 'open_issue', body: truncate(issue, 50), urgency: 'low' });
    }
  }
  return threads.slice(0, 2); // max 2 — 人間が同時保持できる上限
}

function deriveReentryMode(friction: FrictionResult, flowState: string): ReentryMode {
  if (flowState === 'flowing' || flowState === 'recovering') return 'quick';
  if (friction.reentryCost === 'low')    return 'quick';
  if (friction.reentryCost === 'medium') return 'review';
  return 'reset';
}

function deriveDecayLevel(latestEventAt: string | null, now: number): DecayLevel {
  const days = daysSince(latestEventAt, now);
  if (days === null) return 'full';
  if (days <= 3)  return 'full';
  if (days <= 14) return 'summary';
  return 'pattern';
}

// ── Step 4: Continuity ────────────────────────────────────────────────────────

function deriveContinuityState(
  flowState: string,
  frictionLevel: FrictionLevel,
  reentryCost: ReentryCost,
  contextSwitchLoad: number,
  frictionTypes: FrictionType[],
  reopenCount: number,
  assigneeChanges: number,
): ContinuityState {
  if (
    flowState === 'exhausted' ||
    frictionLevel === 'critical' ||
    (frictionLevel === 'high' && reentryCost === 'high')
  ) {
    return 'overloaded';
  }
  if (contextSwitchLoad > 0.5 || (frictionTypes.includes('ownership') && assigneeChanges >= 3)) {
    return 'scattered';
  }
  if (
    flowState === 'fractured' ||
    reopenCount >= 2 ||
    (frictionTypes.includes('rework') && frictionTypes.includes('ambiguity'))
  ) {
    return 'fragmented';
  }
  if (flowState === 'flowing' && frictionLevel === 'low') {
    return 'immersed';
  }
  return 'stable';
}

function deriveActiveThread(
  momentum: string,
  residue: ResidueNoteSlim[],
  frictionTypes: FrictionType[],
  headline: string,
  blockerCount: number,
): string {
  const blockerRes = residue.find(r => r.type === 'blocker');
  if (blockerRes) return `「${truncate(blockerRes.body, 25)}」解消中`;
  if (blockerCount >= 2 || (momentum === 'blocked' && blockerCount >= 1)) return 'ブロッカー原因調査中';
  const uncertainRes = residue.find(r => r.type === 'uncertainty');
  if (uncertainRes) return `「${truncate(uncertainRes.body, 25)}」検討中`;
  if (frictionTypes.includes('ambiguity')) return '方針検討中';
  const handoffRes = residue.find(r => r.type === 'handoff');
  if (handoffRes) return '引き継ぎ整理中';
  if (momentum === 'cycling') return '方針再検討中';
  if (momentum === 'forward' && headline) return truncate(headline, 30) + 'に向けて進行中';
  if (frictionTypes.includes('rework')) return '修正・やり直し対応中';
  return 'コンテキスト確認中';
}

// ── Step 5: Environment ───────────────────────────────────────────────────────

const ENVIRONMENT_MODE_ORDER: EnvironmentMode[] =
  ['open', 'focused', 'protected', 'recovery', 'shelter'];

export { ENVIRONMENT_MODE_ORDER };

// environmentMode: piece state + session state + workshop state の合成。
// pure piece-level ではないが、WorkshopPage に条件式を漏らさないための最小 renderer hint。
// → suppression/emphasis の具体的制御は WorkshopPage 側が持つ（environmentMode を見て判断）。
// → visibilityBudget / suppressedElements のような renderer 語彙は追加しない。
function deriveEnvironmentMode(
  flowState: string,
  quietMode: boolean,
  frictionLevel: FrictionLevel,
  reentryCost: ReentryCost,
  contextSwitchLoad: number,
  interruptionRisk: number,
  repairCount: number,
  minutesSinceRecovery: number | null,
): EnvironmentMode {
  // shelter: 最大保護
  if (
    (flowState === 'exhausted' && frictionLevel === 'critical') ||
    (quietMode && reentryCost === 'high' && repairCount >= 4) ||
    (frictionLevel === 'critical' && reentryCost === 'high')
  ) {
    return 'shelter';
  }
  // recovery: 回復優先
  if (
    flowState === 'exhausted' ||
    (quietMode && frictionLevel === 'high') ||
    (reentryCost === 'high' && contextSwitchLoad > 0.5)
  ) {
    return 'recovery';
  }
  // protected: 没入中
  if (
    flowState === 'flowing' ||
    (minutesSinceRecovery !== null && minutesSinceRecovery < 10)
  ) {
    return 'protected';
  }
  // focused: 集中中
  if (
    flowState === 'fractured' ||
    (interruptionRisk > 0.4 && contextSwitchLoad > 0.2) ||
    (frictionLevel === 'high' && reentryCost !== 'low')
  ) {
    return 'focused';
  }
  return 'open';
}

function deriveSuppressedElements(mode: EnvironmentMode): SuppressedElement[] {
  switch (mode) {
    case 'open':      return [];
    case 'focused':   return ['edge_animations', 'exploration_ui'];
    case 'protected': return ['edge_animations', 'exploration_ui', 'growth_candidates', 'tertiary_layer', 'handoff_suggestions'];
    case 'recovery':  return ['edge_animations', 'exploration_ui', 'growth_candidates', 'tertiary_layer', 'handoff_suggestions', 'narrative_events', 'peripheral_content'];
    case 'shelter':   return ['edge_animations', 'exploration_ui', 'growth_candidates', 'tertiary_layer', 'handoff_suggestions', 'narrative_events', 'repair_shelf', 'context_rail', 'peripheral_content'];
  }
}

function deriveInterruptionShield(mode: EnvironmentMode, interruptionRisk: number, contextSwitchLoad: number): boolean {
  if (mode === 'shelter' || mode === 'recovery') return true;
  if (mode === 'protected') return interruptionRisk > 0.3;
  if (mode === 'focused')   return contextSwitchLoad > 0.4;
  return false;
}

function deriveEnvironmentalPressure(mode: EnvironmentMode, interruptionRisk: number): 'none' | 'low' | 'medium' | 'high' {
  if (mode === 'shelter' || mode === 'recovery') return 'high';
  if (mode === 'protected') return 'medium';
  if (mode === 'focused')   return interruptionRisk > 0.5 ? 'medium' : 'low';
  return 'none';
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * @param input       計算入力
 * @param maxEnvMode  Gentle World Transition 用: このモードを超えて落とさない（省略可）
 */
export function computeFlowEcology(
  input: FlowEcologyInput,
  maxEnvMode?: EnvironmentMode,
): FlowEcologyProjection {
  const {
    events, headline, openIssues, momentum, residue,
    flowState, contextSwitchLoad, interruptionRisk,
    quietMode, staleDays, repairCount, heroTitle, lastRecoveryAt, now,
  } = input;

  // ── 1. events を1回だけ走査 ──────────────────────────────────
  const scan = scanEvents(events);

  // ── 2. friction ───────────────────────────────────────────────
  const friction = computeFriction(scan, residue, events.length, staleDays);

  // ── 3. reentry ────────────────────────────────────────────────
  const restartPoint      = deriveRestartPoint(residue, openIssues, momentum, friction, staleDays);
  const nextLikelyAction  = deriveNextLikelyAction(momentum, friction);
  const unresolvedThreads = deriveUnresolvedThreads(residue, openIssues);
  const reentryMode       = deriveReentryMode(friction, flowState);
  const decayLevel        = deriveDecayLevel(scan.latestEventAt, now);

  // ── 4. continuity ─────────────────────────────────────────────
  const continuityState = deriveContinuityState(
    flowState, friction.frictionLevel, friction.reentryCost,
    contextSwitchLoad, friction.frictionTypes,
    scan.reopenCount, scan.assigneeChanges,
  );
  const activeThread = deriveActiveThread(
    momentum, residue, friction.frictionTypes, headline, scan.blockerCount,
  );

  // ── 5. environment ────────────────────────────────────────────
  const minutesSinceRecovery = lastRecoveryAt !== null
    ? Math.floor((now - lastRecoveryAt) / 60_000)
    : null;

  let envMode = deriveEnvironmentMode(
    flowState, quietMode, friction.frictionLevel, friction.reentryCost,
    contextSwitchLoad, interruptionRisk, repairCount, minutesSinceRecovery,
  );

  // heroTitle が指定されていてもここでは使わない（threadHint は UI 側で参照）
  void heroTitle;

  // Gentle World Transition
  if (maxEnvMode !== undefined) {
    const maxIdx  = ENVIRONMENT_MODE_ORDER.indexOf(maxEnvMode);
    const nextIdx = ENVIRONMENT_MODE_ORDER.indexOf(envMode);
    if (nextIdx > maxIdx) envMode = maxEnvMode;
  }

  const suppressedElements     = deriveSuppressedElements(envMode);
  const interruptionShield     = deriveInterruptionShield(envMode, interruptionRisk, contextSwitchLoad);
  const environmentalPressure  = deriveEnvironmentalPressure(envMode, interruptionRisk);

  return {
    restartPoint,
    nextLikelyAction,
    unresolvedThreads,
    reentryMode,
    decayLevel,
    environmentMode:    envMode,
    suppressedElements,
    interruptionShield,
    diagnostics: {
      frictionLevel:        friction.frictionLevel,
      frictionTypes:        friction.frictionTypes,
      continuityState,
      reentryCost:          friction.reentryCost,
      contextGap:           friction.contextGap,
      activeThread,
      environmentalPressure,
    },
  };
}
