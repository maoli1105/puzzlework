/**
 * FlowEdge — 使用痕を持つ接続線
 * ────────────────────────────────
 * 「流れ」ではなく「触られた痕跡」を表現する。
 *
 * 視覚次元：
 *   freshness → opacity, saturation, stroke-width
 *   isActive  → 微弱な方向指示（アニメーション最小化）
 *
 * 設計原則：
 *   - SF化禁止。演出なし。
 *   - 「ここ最近よく使われてる」が即座に分かること。
 *   - 放置された線は褪色・細くなる。
 */

import { memo } from 'react';
import {
  EdgeProps,
  getSmoothStepPath,
  EdgeLabelRenderer,
  BaseEdge,
} from 'reactflow';
import { pressureToEdgeWidth } from '../../lib/concentrationScore';

export interface FlowEdgeData {
  type:         string;    // 'sequential' | 'parallel' | 'conditional'
  color:        string;    // edge color
  isActive:     boolean;   // source or target piece is in_progress
  isDimmed:     boolean;
  freshness:    number;    // 0–1 (computeEdgeFreshness の結果)
  flowSpeed:    number | null;  // 廃止予定 (互換性のため残す)
  srcPressure?:  number;    // 0–1: 始点ピースの集中圧力
  tgtPressure?:  number;    // 0–1: 終点ピースの集中圧力
  srcIsolation?: number;    // 0–1: 始点ピースの孤立度
  tgtIsolation?: number;    // 0–1: 終点ピースの孤立度
  srcAmbient?:   number;    // 0–1: 始点ピースの周囲環境品質 (使用帯計算用)
  tgtAmbient?:   number;    // 0–1: 終点ピースの周囲環境品質 (使用帯計算用)
  edgeResidue?:  number;    // 0–1: 定着度 (両端の馴染みの平均)
  isCorridorEdge?: boolean; // v2: 部屋間エッジ密度 ≥ 2 → 通路
  // ── WorkspaceIdentity からの空間人格パラメーター ──
  corridorProminence?: number; // 1.0 = default, 2.0 = very prominent
  edgeVitality?:       number; // active エッジの生き生き感
  staleFadeMult?:      number; // stale エッジの退色強度
  // ── Flow Gravity Field (PHASE 9) ──────────────────────────────────────────
  // 「どこへ向かうべきか」を空間密度として示す。矢印禁止。光禁止。
  // active chain + freshness高 + multi-worker + done近傍 → 0–1 で強度を示す。
  flowGravity?:        number;
  // ── Temporal Flow (PHASE 15) ──────────────────────────────────────────────
  srcGravity?:        number;  // 始点 deadlineGravity
  tgtGravity?:        number;  // 終点 deadlineGravity
  srcCriticality?:    number;  // 始点 criticality (高 → stroke +20%)
  downstreamResidue?: number;  // 始点 futureResidue (高 → edge opacity 低下)
}

// ─── freshness から stroke パラメータを計算 ──────────────────────────────────
// ─── 導線の視覚パラメータを計算 ──────────────────────────────────────────────
// freshness → opacity/strokeWidth/satFilter/dashPattern
// edgeResidue → 定着した接続ほど dash が均質化・安定する
//   長期維持された導線は「定着した経路」として読める
//   放置されても定着度が高ければ実線 → 「使われていないが確かに存在する経路」
function edgeVisuals(
  freshness:      number,
  isActive:       boolean,
  isDimmed:       boolean,
  edgeResidue:    number,
  edgeVitality:   number = 1.0,
  staleFadeMult:  number = 1.0,
) {
  if (isDimmed) return {
    opacity: 0.06, strokeWidth: 0.8, satFilter: 'saturate(15%)',
    dashPattern: '4 7', activeGlow: false,
  };

  // ── 空気量 (air) ─────────────────────────────────────────────────────────
  // 停滞ルートは「空気が薄い」。鮮度が低いほど導線が消えていく。
  // stale(fresh<0.25): ほぼ霞む → 通路がそこにあることは分かるが存在感ゼロ
  const air = freshness < 0.25
    ? freshness * 3.2          // 0 → 0.80 (完全に薄い)
    : freshness < 0.50
    ? 0.80 + (freshness - 0.25) * 1.0  // 0.80 → 1.05
    : freshness < 0.75
    ? 1.05 + (freshness - 0.50) * 0.3  // 1.05 → 1.13
    : 1.13 + (freshness - 0.75) * 0.4; // 1.13 → 1.23

  const baseOpacity = Math.min(0.35, air * 0.48);

  // stale 退色補正
  const stalePenalty = freshness < 0.50
    ? Math.max(0, (0.5 - freshness) * (staleFadeMult - 1) * 0.7)
    : 0;
  const opacity = Math.max(0.04, baseOpacity * (1 - stalePenalty));

  // ── stroke 幅 ────────────────────────────────────────────────────────────
  // active → 太く前に出る / stale → 細く空気に溶ける
  const baseStroke = freshness >= 0.75 ? 0.9
    : freshness >= 0.50 ? 0.7
    : freshness >= 0.25 ? 0.5
    : 0.4;                 // 0.25 以下: 極細 — 「道があった痕跡」

  const activeWidth = isActive
    ? baseStroke + 0.6 * edgeVitality
    : baseStroke;

  // ── dash パターン ────────────────────────────────────────────────────────
  const effectiveFreshness = freshness + edgeResidue * 0.28;
  const dashPattern = effectiveFreshness < 0.30
    ? '6 6'               // 断片的 — 流れが絶えた
    : effectiveFreshness < 0.55
    ? '5 4'
    : undefined;

  // ── 色フィルタ ────────────────────────────────────────────────────────────
  const satFilter = freshness < 0.50
    ? `saturate(${Math.round(freshness * 80 + 10)}%)`
    : undefined;

  // active glow は FlowEdge 本体でレンダリングの有無を判断
  const activeGlow = isActive && freshness > 0.35;

  return { opacity, strokeWidth: activeWidth, satFilter, dashPattern, activeGlow };
}

// ─── FlowEdge ────────────────────────────────────────────────────────────────
export const FlowEdge = memo(function FlowEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  data,
  selected,
  label,
  labelStyle,
}: EdgeProps<FlowEdgeData>) {
  const connType     = data?.type         ?? 'sequential';
  const color        = data?.color        ?? '#AAAAAA';
  const isActive     = data?.isActive     ?? false;
  const isDimmed     = data?.isDimmed     ?? false;
  const freshness    = data?.freshness    ?? 0.5;
  const srcPressure  = data?.srcPressure  ?? 0;
  const tgtPressure  = data?.tgtPressure  ?? 0;
  const srcIsolation = data?.srcIsolation ?? 0;
  const tgtIsolation = data?.tgtIsolation ?? 0;
  const edgeResidue        = data?.edgeResidue        ?? 0;
  const isCorridorEdge     = data?.isCorridorEdge     ?? false;
  const corridorProminence = data?.corridorProminence ?? 1.0;
  const edgeVitality       = data?.edgeVitality       ?? 1.0;
  const staleFadeMult      = data?.staleFadeMult      ?? 1.0;
  const flowGravity        = data?.flowGravity        ?? 0;
  // PHASE 15: Temporal Flow
  const srcGravity        = data?.srcGravity        ?? 0;
  const tgtGravity        = data?.tgtGravity        ?? 0;
  const srcCriticality    = data?.srcCriticality    ?? 0;
  const downstreamResidue = data?.downstreamResidue ?? 0;

  // 孤立ピースに繋がる導線: 片方が孤立していると opacity を落とす
  // → 「ここで経路が途切れている」感覚。線が消えていく。
  const maxIsolation  = Math.max(srcIsolation, tgtIsolation);
  const isolationFade = maxIsolation > 0.2
    ? 1 - (maxIsolation - 0.2) / 0.8 * 0.55   // 最大 -55% opacity
    : 1;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 12,
  });

  const { opacity, strokeWidth: baseStroke, satFilter, dashPattern, activeGlow } =
    edgeVisuals(freshness, isActive, isDimmed, edgeResidue, edgeVitality, staleFadeMult);

  // 使用圧 + corridor boost
  // corridor: 部屋間を複数の接続が走るとき → 通路として少し太く見える
  const baseStrokeWidth = pressureToEdgeWidth(baseStroke, srcPressure, tgtPressure) + (isCorridorEdge ? 0.6 : 0);
  // PHASE 15: srcCriticality 高 → stroke +20%
  const critBoost = srcCriticality > 4 ? 1.2 : 1.0;
  const strokeWidth = baseStrokeWidth * critBoost;

  const finalColor   = selected ? '#3B82F6' : color;
  // PHASE 15: downstreamResidue 高 → edge が薄れる（後続が詰まっている）
  const residueFade  = downstreamResidue > 0.3
    ? Math.max(0.45, 1 - (downstreamResidue - 0.3) * 0.5)
    : 1;
  // PHASE 15: srcGravity / tgtGravity 高 → edge が少し濃くなる（締切引力）
  const gravityBoost = (srcGravity > 0.7 || tgtGravity > 0.7) ? 1.15 : 1.0;
  const finalOpacity = selected ? 1 : opacity * isolationFade * residueFade * gravityBoost;

  return (
    <>
      {/*
        ── Corridor trace: 導線定着の床痕 ──
        高 edgeResidue の接続帯に幅広・極低透明度の暖色ストロークを敷く。
        単体では知覚不可能。近傍の定着接続と重なることで
        「よく使われる通路は少し整理されて見える」を実現する。
        アニメーションなし / 新演出なし。
      */}
      {edgeResidue > 0.28 && !isDimmed && (
        <path
          d={edgePath}
          fill="none"
          stroke="rgba(194,154,108,1)"
          strokeWidth={(4 + edgeResidue * 10) * Math.sqrt(corridorProminence)}
          strokeLinecap="round"
          opacity={edgeResidue * 0.022 * corridorProminence}
          pointerEvents="none"
        />
      )}
      {/* Work Current: corridor trace — 部屋間通路の存在感 */}
      {/* flowGravity が高いほど通路が太く・僅かに濃く見える */}
      {/* "なんとなくそっちを見てしまう" 密度を作る。演出なし。 */}
      {isCorridorEdge && !isDimmed && (
        <path
          d={edgePath}
          fill="none"
          stroke="rgba(180,170,155,1)"
          strokeWidth={(6 + flowGravity * 4) * Math.sqrt(corridorProminence)}
          strokeLinecap="round"
          opacity={(0.06 + Math.min(edgeResidue, 1) * 0.04 + flowGravity * 0.04) * corridorProminence}
          pointerEvents="none"
        />
      )}

      {/* Flow Gravity density dot — 高引力チェーンの「密度の溜まり場」 */}
      {/* 矢印禁止。光禁止。終点に僅かに重みが溜まるだけ。 */}
      {flowGravity > 0.45 && isActive && !isDimmed && (
        <circle
          cx={targetX} cy={targetY}
          r={2 + flowGravity * 3.5}
          fill={finalColor}
          opacity={flowGravity * 0.13 * Math.sqrt(edgeVitality)}
          pointerEvents="none"
        />
      )}

      {/*
        ── Active route glow ──
        今まさに流れているルートに視線が吸われる。
        ベースラインより幅広・極低透明度の warm trace。
        「ここが今動いている」を演出なしで伝える。
      */}
      {activeGlow && (
        <path
          d={edgePath}
          fill="none"
          stroke={finalColor}
          strokeWidth={strokeWidth * 2.5}
          strokeLinecap="round"
          opacity={0.03 * Math.sqrt(edgeVitality)}
          pointerEvents="none"
        />
      )}

      {/* ── ベースライン (使用痕の核) ── */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke:       finalColor,
          strokeWidth,
          opacity:      finalOpacity,
          strokeDasharray: dashPattern,
          filter:       selected
            ? `drop-shadow(0 0 4px ${finalColor}88)`
            : satFilter,
          transition:   'opacity 0.3s, stroke-width 0.3s',
        }}
        markerEnd={`url(#flow-arrow-${connType})`}
      />

      {/* ラベル */}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
              fontSize: 9,
              fontWeight: 700,
              color: finalColor,
              background: 'rgba(255,255,255,0.90)',
              borderRadius: 4,
              padding: '2px 5px',
              border: `1px solid ${finalColor}40`,
              opacity: finalOpacity,
              ...labelStyle,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

// ─── カスタム矢印マーカー定義 ────────────────────────────────────────────────
export function FlowEdgeDefs() {
  const defs = [
    { id: 'sequential',  color: '#94a3b8' },
    { id: 'parallel',    color: '#93c5fd' },
    { id: 'conditional', color: '#d4a574' },
    { id: 'default',     color: '#cbd5e1' },
  ];
  return (
    <svg
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <defs>
        {defs.map(({ id, color }) => (
          <marker
            key={id}
            id={`flow-arrow-${id}`}
            markerWidth={10} markerHeight={10}
            refX={5} refY={3}
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 Z" fill={color} />
          </marker>
        ))}
      </defs>
    </svg>
  );
}
