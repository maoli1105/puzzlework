/**
 * WorkshopPage — Worker の工房
 *
 * 「管理画面」ではなく「工房」。
 * Worker が毎朝最初に開き、1日中滞在し、
 * ここから仕事を進め、渡し、学び、修復する場所。
 *
 * 6 Layer:
 *   L1 Hero Piece      — 今触るべき1枚
 *   L2 Context Rail    — 流れのどこにいるか
 *   L3 Repair Shelf    — 自分が解除できる詰まり
 *   L4 Narrative Feed  — なぜこれをやるのか
 *   L5 Growth          — 能力が育つ機会
 *   L6 Next Handoff    — 次に誰へ渡すか
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pieces as pieceApi, users as userApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import type { Piece, Connection } from '../../types/index';
import { useWorkshopProjection } from '../../projections/workshop/useWorkshopProjection';
import { useNarrativeProjection } from '../../projections/narrative/useNarrativeProjection';
import { useCognitivePressure } from '../../projections/cognitive/useCognitivePressure';
import { useFlowState } from '../../projections/flowstate/useFlowState';
import { useFlowEcology } from '../../projections/flowecology/useFlowEcology';
import { ENV_PRESENTATION } from './presentation';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useWebSocket } from '../../hooks/useWebSocket';
import { HeroSection } from './HeroSection';
import { TimelineSection } from './TimelineSection';
import { AlternateFlowsSection } from './AlternateFlowsSection';
import { HandoffSection } from './HandoffSection';
import { QueueSection } from './QueueSection';


// ── デザイントークン ──────────────────────────────────────────────
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
  locked:  '#AAAAAA',
  stale:   '#B46400',
} as const;


// ── 渡せた演出 ────────────────────────────────────────────────────

function HandoffCelebration({ pieceName, nextTitle, onDone }: {
  pieceName: string; nextTitle?: string; onDone: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 2600);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.50)', backdropFilter: 'blur(6px)',
    }}>
      <div style={{
        background: C.surface, border: `2px solid ${C.ink1}`,
        borderRadius: 2, padding: '44px 52px',
        textAlign: 'center', maxWidth: 380, width: '90%',
        animation: 'ws-popup 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        boxShadow: '0 32px 100px rgba(0,0,0,0.25)',
      }}>
        <div style={{ width: 40, height: 4, background: C.accent, margin: '0 auto 28px' }} />
        <div style={{ fontSize: 32, fontWeight: 800, color: C.ink1, letterSpacing: '-0.04em', marginBottom: 10, lineHeight: 1 }}>
          渡せた。
        </div>
        <div style={{ fontSize: 12, color: C.ink3, lineHeight: 1.7 }}>
          <span style={{ fontWeight: 700, color: C.ink1 }}>「{pieceName}」</span>を完了しました
        </div>
        {nextTitle && (
          <div style={{
            marginTop: 20, padding: '14px 18px',
            background: C.sub, border: `1px solid ${C.border}`, borderRadius: 2, textAlign: 'left',
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: C.ink3, letterSpacing: '0.06em', marginBottom: 5 }}>
              NEXT — 次のピースが動き始めます
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.ink1 }}>{nextTitle}</div>
          </div>
        )}
      </div>
      <style>{`@keyframes ws-popup{from{transform:scale(0.85);opacity:0}to{transform:scale(1);opacity:1}}`}</style>
    </div>
  );
}

// ── Cascade 通知 ──────────────────────────────────────────────────
// piece_ready WebSocket イベント受信後に表示。
// 演出ではなく「事実の報告」として設計する。

function CascadeNotice({ titles, onDone, isMobile }: {
  titles: string[]; onDone: () => void; isMobile: boolean;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={{
      position: 'fixed', bottom: isMobile ? 72 : 28, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9998, maxWidth: 360, width: '90%',
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 2, padding: '14px 18px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.10)',
      animation: 'ws-popup 0.25s ease-out',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: C.ready, letterSpacing: '0.08em', marginBottom: 8 }}>
        {titles.length}件が動き始めました
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {titles.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: C.ready, flexShrink: 0 }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: C.ink1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {t}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── (All section components moved to dedicated section files) ────

function Skeleton() {
  return (
    <div>
      <div style={{ height: 200, background: C.sub, borderRadius: 2, marginBottom: 16, animation: 'ws-shimmer 1.4s ease-in-out infinite' }} />
      {[1, 2, 3].map(i => (
        <div key={i} style={{ height: 48, background: C.sub, borderRadius: 2, marginBottom: 8, opacity: 1 - i * 0.15, animation: 'ws-shimmer 1.4s ease-in-out infinite' }} />
      ))}
      <style>{`@keyframes ws-shimmer{0%,100%{opacity:.5}50%{opacity:1}}`}</style>
    </div>
  );
}


// ── Environment Mode ──────────────────────────────────────────────
// environmentMode は UI suppression / emphasis のみに使用する。
// Worker に mode 文言を見せない。

// ── Main Page ─────────────────────────────────────────────────────

export default function WorkshopPage() {
  // ── Data & projections ─────────────────────────────────────────
  const isMobile  = useIsMobile();
  const navigate  = useNavigate();
  const user = useAuthStore(s => s.user);
  const [myPieces,    setMyPieces]    = useState<Piece[]>([]);
  const [allPieces,   setAllPieces]   = useState<Piece[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [workerNames, setWorkerNames] = useState<Map<string, string>>(new Map());
  const [loading,     setLoading]     = useState(true);
  const [celebration, setCelebration] = useState<{ name: string; nextTitle?: string } | null>(null);
  const [cascadeNotice, setCascadeNotice] = useState<{ titles: string[] } | null>(null);
  // celebration 中に届いた piece_ready タイトルを一時保持
  const cascadePendingRef = useRef<string[]>([]);

  useWebSocket((event) => {
    if (event.type === 'piece_ready') {
      const title = (event.payload as { message?: string }).message ?? '';
      // タイトルを正規表現で抽出: 「〜」が着手可能に
      const match = title.match(/「(.+?)」/);
      const pieceTitle = match ? match[1] : title;
      cascadePendingRef.current = [...cascadePendingRef.current, pieceTitle];
    }
  });

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [mine, all, conns, workers] = await Promise.all([
        pieceApi.list({ assignee_id: user.id }),
        // 完了済みを除外して転送量を削減（growthCandidates・コンテキストレールは done 不要）
        pieceApi.list({ status: 'in_progress,ready,locked' }).catch(() => [] as Piece[]),
        pieceApi.getConnections().catch(() => []),
        userApi.workers().catch(() => []),
      ]);
      setMyPieces(mine);
      setAllPieces(Array.isArray(all) ? all : []);
      setConnections(Array.isArray(conns) ? conns : (conns as { connections?: Connection[] }).connections ?? []);
      const nameMap = new Map<string, string>();
      for (const w of (workers as { id: string; name: string }[])) nameMap.set(w.id, w.name);
      setWorkerNames(nameMap);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // ── Workshop Projection ───────────────────────────────────────
  const userSkillTags = (user as unknown as { skill_tags?: string[] })?.skill_tags ?? [];
  const workshop = useWorkshopProjection(
    myPieces, allPieces, connections, user?.id ?? '', userSkillTags,
  );

  // ── Narrative for heroPiece ───────────────────────────────────
  const narrative = useNarrativeProjection(workshop.heroPiece?.piece.id ?? null);

  // ── Temporal urgency (deadline gravity of hero) ───────────────
  const heroUrgency = (() => {
    const due = workshop.heroPiece?.piece.due_date;
    if (!due) return 0.15;
    const daysLeft = (new Date(due).getTime() - Date.now()) / 86_400_000;
    return daysLeft <= 0 ? 1.0 : Math.max(0.15, 1 - daysLeft / 30);
  })();

  // ── Cognitive Pressure ────────────────────────────────────────
  const lastEvent = narrative.events.length > 0
    ? narrative.events[narrative.events.length - 1].timestamp
    : null;
  const cognitive = useCognitivePressure({
    heroPiece:            workshop.heroPiece,
    repairShelf:          workshop.repairShelf,
    growthCandidates:     workshop.growthCandidates,
    nextHandoff:          workshop.nextHandoff,
    contextRailItems:     workshop.contextRail,
    narrativeLastEvent:   lastEvent,
    narrativeHasIssues:   narrative.summary.openIssues.length > 0,
    narrativeHasPatterns: narrative.summary.patterns.length > 0,
    temporalUrgency:      heroUrgency,
  });

  // ── Flow State ────────────────────────────────────────────────
  const { projection: flowProjection, directive: flow, emit: flowEmit } = useFlowState({
    heroProjectId: workshop.heroPiece?.piece.project_id ?? null,
    heroProgress:  workshop.heroPiece?.piece.progress ?? 0,
    repairCount:   workshop.repairShelf.length,
  });

  // staleDays — 最後のイベントからの経過日数。restartPoint 文言に反映される。
  const staleDays = (() => {
    if (narrative.events.length === 0) return 0;
    const last = narrative.events[narrative.events.length - 1].timestamp;
    return Math.floor((Date.now() - new Date(last).getTime()) / 86_400_000);
  })();

  // ── FlowEcology (environment + reentry + friction + continuity) ──
  const environment = useFlowEcology({
    narrative,
    flowProjection,
    pressure:    cognitive,
    repairCount: workshop.repairShelf.length,
    heroTitle:   workshop.heroPiece?.piece.title ?? null,
    staleDays,
  });

  // ── Presentation mapping — environmentMode の直接比較を排除 ────
  const presentation = ENV_PRESENTATION[environment.environmentMode];

  // ── Silent Protection: flowing 中はポーリング抑制（STEP 5）────
  const suppressRef = useRef(false);
  useEffect(() => { suppressRef.current = flow.suppressRefresh; }, [flow.suppressRefresh]);
  useEffect(() => {
    const id = setInterval(() => {
      if (!suppressRef.current) load();
    }, 5 * 60_000);
    return () => clearInterval(id);
  }, [load]);

  // ── downstream chain for celebration ─────────────────────────
  const downstreamMap = new Map<string, string>();
  for (const c of connections) downstreamMap.set(c.from_piece_id, c.to_piece_id);

  // ── piece state updater ───────────────────────────────────────
  function patchPiece(id: string, patch: Partial<Piece>) {
    setMyPieces(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    setAllPieces(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
  }

  const hero = workshop.heroPiece;

  function handleStart() {
    if (!hero) return;
    patchPiece(hero.piece.id, { status: 'in_progress' });
    flowEmit({ type: 'progress_update', value: hero.piece.progress });
  }
  function handleDone() {
    if (!hero) return;
    const nextId    = downstreamMap.get(hero.piece.id);
    const nextPiece = nextId ? allPieces.find(p => p.id === nextId) : undefined;
    cascadePendingRef.current = [];
    setCelebration({ name: hero.piece.title, nextTitle: nextPiece?.title });
    patchPiece(hero.piece.id, { status: 'done', progress: 100 });
    flowEmit({ type: 'handoff_done' });
  }
  function handleProgress(p: number) {
    if (!hero) return;
    patchPiece(hero.piece.id, { progress: p });
    flowEmit({ type: 'progress_update', value: p });
  }

  // queue: my pieces excluding hero, non-done
  const queue = myPieces.filter(
    p => p.id !== hero?.piece.id && p.status !== 'done'
  ).sort((a, b) => {
    const order: Record<string, number> = { in_progress: 0, ready: 1, locked: 2 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

  const handoffWorkerName = workshop.nextHandoff?.assigneeId
    ? workerNames.get(workshop.nextHandoff.assigneeId) ?? null
    : null;

  // ── Page-level visibility gating ──────────────────────────────
  const sectionVisibility = {
    timeline:       !!hero && (
      narrative.loading || !!narrative.summary.headline || narrative.events.length > 0
    ),
    handoff:        !flow.tertiaryHidden || cognitive.attentionTier.handoff !== 'tertiary',
    alternateFlows: !flow.tertiaryHidden
      && !environment.suppressedElements.includes('growth_candidates')
      && workshop.growthCandidates.length > 0,
    queue:          !flow.tertiaryHidden && queue.length > 0,
  };

  // hero-internal visibility
  const heroVisibility = {
    repairShelf: workshop.repairShelf.length > 0,
  };

  // ── Section ordering ───────────────────────────────────────────
  return (
    <div style={{
      maxWidth: 720, margin: '0 auto',
      padding: isMobile ? '16px 12px 80px' : '32px 20px 80px',
      fontFamily: '-apple-system, "Helvetica Neue", sans-serif',
    }}>
      {celebration && (
        <HandoffCelebration
          pieceName={celebration.name}
          nextTitle={celebration.nextTitle}
          onDone={() => {
            setCelebration(null);
            if (cascadePendingRef.current.length > 0) {
              setCascadeNotice({ titles: cascadePendingRef.current });
              cascadePendingRef.current = [];
            }
            load();
          }}
        />
      )}
      {cascadeNotice && (
        <CascadeNotice
          titles={cascadeNotice.titles}
          onDone={() => setCascadeNotice(null)}
          isMobile={isMobile}
        />
      )}

      {/* ── ヘッダー ── */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.ink4, letterSpacing: '0.08em' }}>
          {user?.name} の工房
        </div>
        {!isMobile && (
          <button
            onClick={() => navigate('/marketplace')}
            style={{
              background: 'none', border: `1px solid ${C.border}`,
              borderRadius: 2, padding: '4px 10px',
              fontSize: 10, color: C.ink3, cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            MARKETPLACE
          </button>
        )}
      </div>

      {/* ── Flow State による animation 制御 ── */}
      {!flow.animationsEnabled && (
        <style>{`
          .ws-animated { animation: none !important; transition: none !important; }
        `}</style>
      )}

      {loading ? <Skeleton /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

          {/* ── L1 + L2 + L3: HeroSection（HeroSection.tsx に委譲）── */}
          {hero ? (
            <HeroSection
              piece={hero.piece}
              reason={hero.reason}
              ecology={environment}
              presentation={presentation}
              cognitive={cognitive}
              flow={flow}
              repairQueue={workshop.repairShelf}
              contextRail={workshop.contextRail}
              onStart={handleStart}
              onDone={handleDone}
              onProgress={handleProgress}
              visibility={heroVisibility}
              onRepairInteract={() => flowEmit({ type: 'layer_interact', layer: 'repair' })}
            />
          ) : myPieces.length > 0 ? (
            <div style={{
              padding: '40px 28px', textAlign: 'center',
              background: C.sub, border: `1px solid ${C.border}`, borderRadius: 2,
            }}>
              <div style={{ fontSize: 13, color: C.ink3 }}>すべてのピースが完了しています。</div>
            </div>
          ) : (
            <div style={{
              padding: '60px 28px', textAlign: 'center',
              background: C.sub, border: `1px dashed ${C.ink5}`, borderRadius: 2,
            }}>
              <div style={{ fontSize: 13, color: C.ink4 }}>割り当てられたピースはありません</div>
            </div>
          )}

          {/* ── L4: Narrative（TimelineSection.tsx に委譲）── */}
          {sectionVisibility.timeline && (
            <TimelineSection
              narrative={narrative}
              cognitive={cognitive}
              flow={flow}
            />
          )}


          {/* ── L6: Next Handoff（HandoffSection.tsx に委譲）── */}
          {sectionVisibility.handoff && (
            <HandoffSection
              handoff={workshop.nextHandoff}
              workerName={handoffWorkerName}
              cognitive={cognitive}
              flow={flow}
              onHandoff={handleDone}
            />
          )}

          {/* ── L5: Growth（AlternateFlowsSection.tsx に委譲）── */}
          {sectionVisibility.alternateFlows && (
            <AlternateFlowsSection
              growthCandidates={workshop.growthCandidates}
              cognitive={cognitive}
              flow={flow}
            />
          )}

          {/* ── Queue（QueueSection.tsx に委譲）── */}
          {sectionVisibility.queue && (
            <QueueSection
              queue={queue}
              cognitive={cognitive}
              flow={flow}
            />
          )}

        </div>
      )}
    </div>
  );
}
