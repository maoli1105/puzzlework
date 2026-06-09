/**
 * useFlowState — session tracking + flow state computation
 *
 * セッション中の行動シグナルを蓄積し、
 * CognitiveFlowState を計算して FlowUIDirective を返す。
 *
 * ユーザーには状態を見せない。環境が変わるだけ。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { computeFlowState, getFlowUIDirective } from './index';
import type {
  FlowStateProjection, FlowUIDirective, CognitiveFlowState, FlowSignal,
} from './types';

const MIN_MS    =  60_000;
const WINDOW_MS = 30 * MIN_MS; // 30 分ウィンドウ
const TICK_MS   = 60 * 1000;   // 60 秒ごとに再計算

interface SessionLog {
  sessionStart:     number;
  projectSwitches:  { projectId: string | null; at: number }[];
  repairInteracts:  { at: number }[];
  layerInteracts:   { layer: string; at: number }[];
  lastProgressAt:   number | null;
  lastRecoveryAt:   number | null;
  lastHeroProjectId: string | null;
}

function newLog(): SessionLog {
  return {
    sessionStart:     Date.now(),
    projectSwitches:  [],
    repairInteracts:  [],
    layerInteracts:   [],
    lastProgressAt:   null,
    lastRecoveryAt:   null,
    lastHeroProjectId: null,
  };
}

function trimWindow<T extends { at: number }>(arr: T[], now: number): T[] {
  return arr.filter(x => now - x.at < WINDOW_MS);
}

export interface UseFlowStateReturn {
  projection:    FlowStateProjection;
  directive:     FlowUIDirective;
  /** WorkshopPage からシグナルを送る */
  emit:          (signal: FlowSignal) => void;
}

export function useFlowState(params: {
  heroProjectId: string | null;
  heroProgress:  number;
  repairCount:   number;
}): UseFlowStateReturn {
  const logRef   = useRef<SessionLog>(newLog());
  const prevRef  = useRef<CognitiveFlowState>('entering');

  const [projection, setProjection] = useState<FlowStateProjection>({
    state: 'entering', interruptionRisk: 0.2, contextSwitchLoad: 0, focusIntegrity: 0.5,
  });

  // ── 再計算ロジック ─────────────────────────────────────────────
  const recompute = useCallback(() => {
    const now = Date.now();
    const log = logRef.current;

    // ウィンドウ外のイベントを刈り込む
    log.projectSwitches = trimWindow(log.projectSwitches, now);
    log.repairInteracts = trimWindow(log.repairInteracts, now);
    log.layerInteracts  = trimWindow(log.layerInteracts, now);

    const next = computeFlowState({
      sessionStart:          log.sessionStart,
      recentProjectSwitches: log.projectSwitches.map(x => x.at),
      recentRepairInteracts: log.repairInteracts.length,
      recentLayerJumps:      log.layerInteracts.length,
      lastProgressAt:        log.lastProgressAt,
      lastRecoveryAt:        log.lastRecoveryAt,
      repairCount:           params.repairCount,
      heroProgress:          params.heroProgress,
      previousState:         prevRef.current,
      now,
    });

    prevRef.current = next.state;
    setProjection(next);
  }, [params.repairCount, params.heroProgress]);

  // ── hero project 変化を検知 → project switch シグナル ─────────
  useEffect(() => {
    const log = logRef.current;
    if (
      log.lastHeroProjectId !== null &&
      log.lastHeroProjectId !== params.heroProjectId
    ) {
      log.projectSwitches.push({ projectId: params.heroProjectId, at: Date.now() });
      recompute();
    }
    log.lastHeroProjectId = params.heroProjectId;
  }, [params.heroProjectId, recompute]);

  // ── 60 秒ごとに再計算（時間ベースの遷移用）───────────────────
  useEffect(() => {
    const id = setInterval(recompute, TICK_MS);
    return () => clearInterval(id);
  }, [recompute]);

  // ── emit: WorkshopPage から受け取るイベント ───────────────────
  const emit = useCallback((signal: FlowSignal) => {
    const log = logRef.current;
    const now = Date.now();

    switch (signal.type) {
      case 'hero_change':
        if (log.lastHeroProjectId !== signal.projectId) {
          log.projectSwitches.push({ projectId: signal.projectId, at: now });
          log.lastHeroProjectId = signal.projectId;
        }
        break;

      case 'progress_update':
        log.lastProgressAt = now;
        break;

      case 'handoff_done':
      case 'blocker_resolved':
        log.lastRecoveryAt = now;
        log.projectSwitches = []; // 達成後はリセット
        log.repairInteracts = [];
        log.layerInteracts  = [];
        break;

      case 'layer_interact':
        if (signal.layer === 'repair') {
          log.repairInteracts.push({ at: now });
        }
        log.layerInteracts.push({ layer: signal.layer, at: now });
        break;
    }

    recompute();
  }, [recompute]);

  const directive = getFlowUIDirective(projection);

  return { projection, directive, emit };
}
