/**
 * PieceNodeV2 — Jigsaw Ticket
 * ──────────────────────────────────────────────────────────────────
 * 旧: TicketWork。桜井政博式チケット管理の思想から生まれた PuzzleWork。
 *
 * ピース形状 = "この仕事は、他の仕事と接続される前提で存在している" という宣言。
 * タブ（突起）とブランク（くぼみ）は装飾ではなく、接続可能性の表現。
 *
 * 設計原則:
 *   - タブは細く・小さく。主張しない。ただし形として認識できる。
 *   - ストローク = プロジェクトカラー。同じプロジェクトのピースは同じ色の輪郭を持つ。
 *   - 影で奥行きを作る。色の濃さで状態を作らない。
 *   - タイトルは必ず読めること。
 *
 * バウンディングボックス: 216×152 (レイアウト互換)
 * ジグソー本体: W=203, H=139, TAB=13 (細く洗練されたタブ)
 */

import React, { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { PieceStatus } from '../../types';
import type { PieceVisuals } from '../../lib/compositeVisualState';
import { piecePath } from './PieceNode';

// ─── Bounding box (レイアウト互換のため classic と同サイズを維持) ─────────────
export const PIECE_NODE_V2_W = 216;
export const PIECE_NODE_V2_H = 152;

// ─── Jigsaw 寸法 ──────────────────────────────────────────────────────────────
// TAB=13: 元の20より40%小さい → タブが主張しない
// NECK=8: 細いネック → 上品な曲線
const W    = 203;
const H    = 139;
const TAB  = 13;
const NECK = 8;
const R    = 7;

const JIG_PATH = piecePath(W, H, TAB, NECK, R);

// ─── ステータス別サーフェス ───────────────────────────────────────────────────
const SURFACE: Record<PieceStatus, {
  bg:         string;
  dotColor:   string;
  dotAlpha:   number;
  titleAlpha: number;
}> = {
  locked: {
    bg:         '#F4F5F7',
    dotColor:   'rgba(148,163,184,1)',
    dotAlpha:   0.55,
    titleAlpha: 0.40,
  },
  ready: {
    bg:         '#FAFAFA',
    dotColor:   'rgba(46,170,78,1)',
    dotAlpha:   0.65,
    titleAlpha: 0.82,
  },
  in_progress: {
    bg:         '#FDFCF8',
    dotColor:   'rgba(26,26,26,1)',
    dotAlpha:   0.78,
    titleAlpha: 1.0,
  },
  done: {
    bg:         '#EDEDEF',
    dotColor:   'rgba(160,160,162,1)',
    dotAlpha:   0.30,
    titleAlpha: 0.28,
  },
};

// ─── Props ───────────────────────────────────────────────────────────────────
interface Props {
  data: {
    piece: {
      id: string; title: string; status: PieceStatus;
      priority: number; skill_tags: string[];
      is_external?: boolean; progress: number;
      due_date: string | null; assignee_id: string | null;
      project_id: string | null;
    };
    isConnecting?: boolean;
    isBottleneck?: boolean;
    isBlocked?: boolean;
    isCritical?: boolean;
    impactScale?: number;
    projectColor?: string;
    projectName?: string;
    assigneeName?: string;
    isDimmed?: boolean;
    isHighlighted?: boolean;
    isCascadeAffected?: boolean;
    isLOD?: boolean;
    visuals?: PieceVisuals;
    pieceRole?: 'hero' | 'support' | 'background';
    weight?:           number;
    repairedRecently?: boolean;
    onStatusAdvance?: () => void;
    isDragAssignMode?: boolean;
    onProjectHover?: (projectId: string | null) => void;
    deadlineGravity?: number;
    futureResidue?:   number;
    criticalPath?:    number;
    // ── Jigsaw tab direction markers ──────────────────────────────────────────
    // エッジ非表示モード: タブに方向刻印を描く
    // right: 右凸タブに ▶ / bottom: 下凸タブに ▼
    // left: 左ブランクに ◀ / top: 上ブランクに ▲
    tabArrows?: { right?: boolean; bottom?: boolean; left?: boolean; top?: boolean };
    // ── Incoming connection indicator ─────────────────────────────────────────
    tabIncoming?: { left?: boolean; top?: boolean; right?: boolean; bottom?: boolean };
    // ── Tab click: 方向反転コールバック ─────────────────────────────────────────
    onRightTabClick?: () => void;
    onBottomTabClick?: () => void;
    onLeftTabClick?: () => void;
    onTopTabClick?: () => void;
    // ── Tab right-click: 接続を切り離す ─────────────────────────────────────────
    onRightTabDetach?: () => void;
    onBottomTabDetach?: () => void;
    onLeftTabDetach?: () => void;
    onTopTabDetach?: () => void;
  };
  selected: boolean;
}

// ─── Handle style ────────────────────────────────────────────────────────────
const handleStyle: React.CSSProperties = {
  width: 12, height: 12, borderRadius: '50%',
  background: 'var(--text-3)', border: '2px solid var(--surface)',
  opacity: 0, transition: 'opacity 0.12s',
  top: H / 2,
};

// ─── LOD: ズームアウト時の点表示 ─────────────────────────────────────────────
const LOD_CX = PIECE_NODE_V2_W / 2;
const LOD_CY = PIECE_NODE_V2_H / 2;
const LOD_R  = 13;

function PieceNodeV2LOD({ data }: Props) {
  const { piece, visuals } = data;
  const s           = SURFACE[piece.status];
  const gColor      = visuals?.groundColor   ?? 'transparent';
  const gOpac       = visuals?.groundOpacity ?? 0;
  const isWarm      = gColor.startsWith('rgba(194');
  const isCool      = gColor.startsWith('rgba(148');
  const haloOpacity = Math.min(0.35, gOpac * 12);
  const haloColor   = isWarm ? 'rgba(194,154,108,1)'
    : isCool ? 'rgba(148,163,184,1)'
    : 'rgba(175,182,205,0.7)';

  const progress = Math.min(100, Math.max(0, piece.progress ?? 0));
  const circ     = 2 * Math.PI * LOD_R;

  return (
    <div style={{ width: PIECE_NODE_V2_W, height: PIECE_NODE_V2_H,
      display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      {haloOpacity > 0.02 && (
        <div style={{ position: 'absolute', width: 72, height: 72, borderRadius: '50%',
          background: `radial-gradient(circle, ${haloColor} 0%, transparent 72%)`,
          opacity: haloOpacity, pointerEvents: 'none' }} />
      )}
      {piece.status === 'in_progress' && (
        <svg style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          width={PIECE_NODE_V2_W} height={PIECE_NODE_V2_H}>
          <circle cx={LOD_CX} cy={LOD_CY} r={LOD_R}
            fill="none" stroke="rgba(26,26,26,0.14)" strokeWidth={2} />
          {progress > 0 && (
            <circle cx={LOD_CX} cy={LOD_CY} r={LOD_R}
              fill="none" stroke="rgba(26,26,26,0.80)" strokeWidth={2}
              strokeDasharray={circ} strokeDashoffset={circ * (1 - progress / 100)}
              strokeLinecap="round"
              style={{ transform: 'rotate(-90deg)', transformOrigin: `${LOD_CX}px ${LOD_CY}px` }}
            />
          )}
        </svg>
      )}
      <div style={{ width: 9, height: 9, borderRadius: '50%',
        background: s.dotColor, opacity: s.dotAlpha * 0.9, position: 'relative', zIndex: 1 }} />
      {/* LODでもジグソーモードではハンドルを描画しない */}
      {data.tabArrows === undefined && (
        <>
          <Handle type="target" id="left"  position={Position.Left}  style={handleStyle} />
          <Handle type="source" id="right" position={Position.Right} style={handleStyle} />
        </>
      )}
    </div>
  );
}

// ─── Main Jigsaw Node ─────────────────────────────────────────────────────────
export default function PieceNodeV2({ data, selected }: Props) {
  // workshopTheme 判定: tabArrows が undefined でなければジグソーモード
  const isJigsaw = data.tabArrows !== undefined;
  const {
    piece, assigneeName, isDimmed = false, visuals, onStatusAdvance,
    isDragAssignMode = false, onProjectHover,
    deadlineGravity = 0, criticalPath = 0,
    tabArrows = {},
    onRightTabClick,
    onBottomTabClick,
    onRightTabDetach,
    onBottomTabDetach,
  } = data;
  const [hovered, setHovered] = useState(false);

  if (data.isLOD) return <PieceNodeV2LOD data={data} selected={selected} />;

  const s           = SURFACE[piece.status];
  const role        = data.pieceRole ?? 'support';
  const isHero      = role === 'hero';
  const isBackground = role === 'background';
  const weight      = data.weight ?? 0;
  const isStagnated = weight > 0.5;

  // ── opacity ──────────────────────────────────────────────────────────────
  const baseOpacity   = visuals?.baseOpacity ?? 1;
  const stagnatedFade = isStagnated && !isDimmed ? 0.82 : 1;
  const nodeOpacity   = isDimmed ? 0.15
    : isBackground ? Math.min(0.65, baseOpacity)
    : baseOpacity * stagnatedFade;

  // ── transform ────────────────────────────────────────────────────────────
  const transforms: string[] = [];
  if (isHero) transforms.push('scale(1.03)');
  if (criticalPath > 4) transforms.push('scale(1.05)');
  const ty = weight < 0 ? weight * 1.5 : weight > 0 ? weight * 2.5 : 0;
  if (ty !== 0) transforms.push(`translateY(${ty.toFixed(1)}px)`);
  const transform = transforms.length > 0 ? transforms.join(' ') : undefined;

  // ── ストロークカラー ─────────────────────────────────────────────────────
  // プロジェクトカラー = ピースの輪郭 → 同一プロジェクトが視覚的にグループ化
  const projectColor    = data.projectColor ?? null;
  const isHighlighted   = data.isHighlighted || data.isCascadeAffected;
  const strokeColor     = selected
    ? '#3B82F6'
    : isHighlighted
    ? 'rgba(194,154,108,0.90)'
    : projectColor
    ? projectColor
    : 'rgba(0,0,0,0.12)';
  const strokeWidth     = selected ? 1.5
    : isHighlighted ? 1.2
    : 0.75;
  const strokeOpacity   = selected ? 1
    : piece.status === 'locked'  ? 0.28
    : piece.status === 'done'    ? 0.20
    : piece.status === 'ready'   ? 0.55
    : 0.70;  // in_progress

  // ── CSS filter ───────────────────────────────────────────────────────────
  const sat = visuals?.saturation ?? 100;
  const bri = visuals?.brightness ?? 100;
  const pieceFilter = (sat < 95 || bri < 98) ? `saturate(${sat}%) brightness(${bri}%)` : undefined;

  // ── progress ─────────────────────────────────────────────────────────────
  const progress = Math.min(100, Math.max(0, piece.progress ?? 0));
  // 下から積み上がる進捗フィル（ジグソー形状にクリップされる）
  void (H * (1 - progress / 100)); // fillY reserved for future fill animation

  // ── deadline shadow ───────────────────────────────────────────────────────
  const urgentGlow = deadlineGravity > 0.7
    ? `0 3px ${Math.round(8 + deadlineGravity * 10)}px rgba(0,0,0,${(0.06 + deadlineGravity * 0.05).toFixed(3)})`
    : null;

  return (
    <div
      className={[
        'piece-node-v2',
        selected ? 'selected' : '',
        piece.status === 'in_progress' ? 'in-progress' : '',
      ].filter(Boolean).join(' ')}
      draggable={isDragAssignMode}
      onDragStart={isDragAssignMode ? (e) => {
        e.dataTransfer.setData('pz-piece-drag', piece.id);
        e.dataTransfer.effectAllowed = 'move';
      } : undefined}
      onMouseEnter={() => { setHovered(true); onProjectHover?.(piece.project_id ?? null); }}
      onMouseLeave={() => { setHovered(false); onProjectHover?.(null); }}
      style={{
        width:           PIECE_NODE_V2_W,
        height:          PIECE_NODE_V2_H,
        position:        'relative',
        opacity:         nodeOpacity,
        transform,
        transformOrigin: 'center center',
        transition:      'opacity 0.2s, transform 0.25s ease',
        cursor:          isDragAssignMode ? 'grab' : 'pointer',
        filter:          pieceFilter,
      }}
    >
      {/* ── Layer 1: 影（クリップの外側） ─────────────────────── */}
      <svg
        width={PIECE_NODE_V2_W} height={PIECE_NODE_V2_H}
        style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <path
          d={JIG_PATH}
          transform={`translate(${isHero ? 1.5 : 1}, ${isHero ? 3.5 : 2.5})`}
          fill={urgentGlow
            ? 'rgba(0,0,0,0.09)'
            : hovered
            ? 'rgba(0,0,0,0.075)'
            : isHero
            ? 'rgba(0,0,0,0.085)'
            : 'rgba(0,0,0,0.055)'}
          style={{ transition: 'fill 0.18s' }}
        />
      </svg>

      {/* ── Layer 2: ジグソー本体（CSS clip-path） ─────────────── */}
      <div
        style={{
          position:   'absolute',
          left:        0, top: 0,
          width:       PIECE_NODE_V2_W,
          height:      PIECE_NODE_V2_H,
          clipPath:    `path("${JIG_PATH}")`,
          background:  s.bg,
          transition:  'background 0.25s',
        }}
      >
        {/* 進捗フィル（下から） */}
        {progress > 0 && (
          <div style={{
            position:   'absolute',
            left: 0, bottom: 0, right: 0,
            height:     `${progress}%`,
            background: piece.status === 'in_progress'
              ? 'rgba(26,26,26,0.042)'
              : 'rgba(100,100,100,0.025)',
            transition: 'height 0.4s ease',
          }} />
        )}

        {/* bottleneck / blocked — 左端の縦ライン + 上部の薄い塗り */}
        {(data.isBlocked || data.isBottleneck) && (
          <>
            {/* 左端の縦ライン */}
            <div style={{
              position: 'absolute', left: 2, top: 0, bottom: 0, width: 2,
              background: data.isBlocked
                ? 'rgba(180,100,0,0.35)'
                : 'rgba(148,163,184,0.55)',
            }} />
            {/* 上部 グラデーション: blocked=暖色, bottleneck=寒色 */}
            <div style={{
              position: 'absolute', left: 0, top: 0, right: 0, height: '30%',
              background: data.isBlocked
                ? 'linear-gradient(to bottom, rgba(180,100,0,0.06) 0%, transparent 100%)'
                : 'linear-gradient(to bottom, rgba(148,163,184,0.08) 0%, transparent 100%)',
              pointerEvents: 'none',
            }} />
          </>
        )}

        {/* ── タイトル ─────────────────────────────────── */}
        <div style={{
          position:   'absolute',
          left:        16, top: 18,
          right:       16,
          fontSize:    12,
          fontWeight:  piece.status === 'in_progress' ? 520 : 400,
          color:       'var(--text-1)',
          opacity:     s.titleAlpha,
          lineHeight:  1.42,
          letterSpacing: '-0.012em',
          overflow:    'hidden',
          display:     '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}>
          {piece.title}
        </div>

        {/* ── 下部: assignee + status dot ─────────────── */}
        <div style={{
          position:       'absolute',
          left:            16, right: 16,
          bottom:          16,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:             4,
        }}>
          <span style={{
            fontSize: 9.5, color: 'var(--text-3)',
            opacity: piece.status === 'done' ? 0.40 : 0.72,
            overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', flex: 1,
          }}>
            {assigneeName ?? ''}
          </span>

          {/* ステータスドット */}
          <div
            title={onStatusAdvance ? '次のステータスへ' : undefined}
            onClick={onStatusAdvance ? (e) => { e.stopPropagation(); onStatusAdvance(); } : undefined}
            style={{
              width: 7, height: 7, borderRadius: '50%',
              background: s.dotColor, opacity: s.dotAlpha,
              cursor: onStatusAdvance ? 'pointer' : 'default',
              flexShrink: 0, transition: 'transform 0.1s',
            }}
            onMouseEnter={onStatusAdvance ? (e) => {
              (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.7)';
            } : undefined}
            onMouseLeave={onStatusAdvance ? (e) => {
              (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
            } : undefined}
          />
        </div>
      </div>

      {/* ── Layer 3: アウトライン（プロジェクトカラー） + タブ刻印 ── */}
      <svg
        width={PIECE_NODE_V2_W} height={PIECE_NODE_V2_H}
        style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
        aria-hidden="true"
      >
        <path
          d={JIG_PATH}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeOpacity={strokeOpacity}
          className="jig-outline"
          style={{ transition: 'stroke 0.2s, stroke-opacity 0.2s' }}
        />
        {/*
          ── タブ方向刻印 ────────────────────────────────────────────────
          凸タブの先端に小さな三角を刻む。矢印ではなく「形の一部」として。
          「この仕事は次の仕事へ繋がっている」を線ではなく形で伝える。

          右タブ (凸): 先端 ≈ (W+TAB-1, H/2) = (215, 69.5)
          下タブ (凸): 先端 ≈ (W/2, H+TAB-1) = (101.5, 151)
        */}
        {/*
          ── 右凸タブ: 水平方向接続インジケータ ─────────────────────────────
          右方向接続(▶): 根元→先端 (送り出し方向)
          左方向接続(◀): 先端→根元 (逆向き。先端に底辺, 根元に頂点)
          両者ともに右凸タブ上に描くことで「凸タブ = 接続点」を常に明確にする。
          右・左が両立する場合は右を優先。
        */}
        {(tabArrows.right || tabArrows.left) && (
          <polygon
            data-tab-side={tabArrows.right ? 'right' : 'left'}
            points={tabArrows.right
              // ▶: 根元(W-4)が底辺, 先端(W+TAB-4)が頂点 — タブ中央寄りに配置
              ? `${W - 4},${H/2 - 7} ${W - 4},${H/2 + 7} ${W + TAB - 4},${H/2}`
              // ◀: 先端(W+TAB-4)が底辺, 根元(W-4)が頂点
              : `${W + TAB - 4},${H/2 - 7} ${W + TAB - 4},${H/2 + 7} ${W - 4},${H/2}`
            }
            fill={strokeColor}
            opacity={Math.min(0.9, strokeOpacity * 1.2)}
            onClick={(e) => {
              e.stopPropagation();
              if (onRightTabClick) onRightTabClick();
            }}
            onContextMenu={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (onRightTabDetach) onRightTabDetach();
            }}
            style={{ transition: 'opacity 0.2s', cursor: 'pointer', pointerEvents: 'all' }}
          />
        )}
        {/*
          ── 下凸タブ: 垂直方向接続インジケータ ─────────────────────────────
          下方向接続(▼): 根元→先端
          上方向接続(▲): 先端→根元 (逆向き)
          両者ともに下凸タブ上。
        */}
        {(tabArrows.bottom || tabArrows.top) && (
          <polygon
            data-tab-side={tabArrows.bottom ? 'bottom' : 'top'}
            points={tabArrows.bottom
              // ▼: 根元(H-4)が底辺, 先端(H+TAB-4)が頂点 — タブ中央寄り
              ? `${W/2 - 7},${H - 4} ${W/2 + 7},${H - 4} ${W/2},${H + TAB - 4}`
              // ▲: 先端(H+TAB-4)が底辺, 根元(H-4)が頂点
              : `${W/2 - 7},${H + TAB - 4} ${W/2 + 7},${H + TAB - 4} ${W/2},${H - 4}`
            }
            fill={strokeColor}
            opacity={Math.min(0.9, strokeOpacity * 1.2)}
            onClick={(e) => {
              e.stopPropagation();
              if (onBottomTabClick) onBottomTabClick();
            }}
            onContextMenu={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (onBottomTabDetach) onBottomTabDetach();
            }}
            style={{ transition: 'opacity 0.2s', cursor: 'pointer', pointerEvents: 'all' }}
          />
        )}
        {/* 流入ブランク刻印は削除: ジグソー形状（凹）自体が接続受け口を表現する */}
      </svg>

      {/* ── Ground field (作業痕の床の染み) ─────────────────── */}
      {(visuals?.groundOpacity ?? 0) > 0.002 && (
        <div aria-hidden="true" style={{
          position:   'absolute',
          width:       (visuals!.groundRadius ?? 0) * 2,
          height:      Math.round((visuals!.groundRadius ?? 0) * 0.42),
          top:         Math.round(PIECE_NODE_V2_H * 0.60 - (visuals!.groundRadius ?? 0) * 0.21),
          left:        PIECE_NODE_V2_W / 2 - (visuals!.groundRadius ?? 0),
          borderRadius:'50%',
          background:  `radial-gradient(ellipse at center, ${visuals!.groundColor} 0%, transparent 58%)`,
          opacity:      visuals!.groundOpacity,
          pointerEvents:'none',
          zIndex:       -1,
        }} />
      )}

      {/* ── Handles ─────────────────────────────────────── */}
      {/* ジグソーモードではハンドルを描画しない（ReactFlow CSS が opacity:0 を上書きするため） */}
      {!isJigsaw && (
        <>
          <Handle type="target" id="left"  position={Position.Left}  className="piece-handle"
            style={{ ...handleStyle, left: -6, top: H / 2 }} />
          <Handle type="source" id="right" position={Position.Right} className="piece-handle"
            style={{ ...handleStyle, right: -6, top: H / 2 }} />
        </>
      )}
    </div>
  );
}
