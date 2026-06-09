/**
 * GhostEdge — 潜在接続の引力場
 * ──────────────────────────────
 * これはエッジではない。
 * 「ここに繋がりが来そうな場所がある」という空間の性質。
 *
 * 意識の閾値以下の opacity で描く。
 * ラベルなし / 矢印なし / 色なし / アニメーションなし。
 *
 * ユーザーは提案されたと感じない。
 * 「なんとなくここを繋ぎたくなった」が正しい反応。
 */

import { memo } from 'react';
import { EdgeProps, getSmoothStepPath, BaseEdge } from 'reactflow';

export interface GhostEdgeData {
  score: number;  // 0–1: affinity score (opacity 計算用)
}

export const GhostEdge = memo(function GhostEdge({
  id,
  sourceX, sourceY,
  targetX, targetY,
  sourcePosition, targetPosition,
  data,
}: EdgeProps<GhostEdgeData>) {
  const score = data?.score ?? 0.4;

  const [edgePath] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
    borderRadius: 20,
  });

  // 意識閾値以下の opacity: 0.03–0.07
  // score が高いほど少しだけ濃い (しかし常に極めて薄い)
  const opacity = 0.03 + score * 0.04;

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={{
        stroke:          'rgba(140,140,160,1)',
        strokeWidth:     1,
        opacity,
        strokeDasharray: '2 18',
        strokeLinecap:   'round',
        pointerEvents:   'none',
        // filter なし / transition なし — 静止した引力場
      }}
    />
  );
});
