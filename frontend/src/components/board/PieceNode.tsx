import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import { PieceStatus } from '../../types';

// ─── Body dimensions ────────────────────────────────────────────────────────
const W    = 196;
const H    = 132;
const TAB  = 20;
const NECK = 12;
const R    = 8;
const SVG_W = W + TAB;
const SVG_H = H + TAB;

// ─── Zinc-alloy color palette per status ────────────────────────────────────
const ZINC: Record<PieceStatus, {
  hilite: string; base: string; mid: string;
  text: string; label: string;
  fillTop: string; fillBot: string; waterline: string;
}> = {
  locked: {
    hilite: '#EAE6DB', base: '#BDB7A3', mid: '#8E8875',
    text: '#5C584E', label: 'LOCKED',
    fillTop: '#8E8875', fillBot: '#4D493D', waterline: '#C8C2B0',
  },
  ready: {
    hilite: '#EAF2E0', base: '#BDCBAD', mid: '#96A385',
    text: '#4D543D', label: 'READY',
    fillTop: '#7EB87A', fillBot: '#3D6B39', waterline: '#A8C8A0',
  },
  in_progress: {
    hilite: '#E6EBF2', base: '#ADC1D1', mid: '#8596A3',
    text: '#3D4D54', label: 'IN PROGRESS',
    fillTop: '#6B9EC8', fillBot: '#3D6080', waterline: '#90BAD8',
  },
  done: {
    hilite: '#F9F7F2', base: '#E6E2D9', mid: '#D1CCBF',
    text: '#3D3A34', label: 'DONE',
    fillTop: '#C8C4BA', fillBot: '#9E9482', waterline: '#E0DCCE',
  },
};

// ─── 4-sided jigsaw piece path ───────────────────────────────────────────────
function piecePath(w: number, h: number, tab: number, neck: number, r: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const k  = 0.58;
  const s  = 0.68;
  return [
    `M ${r} 0`,
    `L ${cx - neck} 0`,
    `C ${cx - neck} ${tab * k}   ${cx - tab * s} ${tab}   ${cx} ${tab}`,
    `C ${cx + tab * s} ${tab}   ${cx + neck} ${tab * k}   ${cx + neck} 0`,
    `L ${w - r} 0`,
    `Q ${w} 0  ${w} ${r}`,
    `L ${w} ${cy - neck}`,
    `C ${w + tab * k} ${cy - neck}   ${w + tab} ${cy - tab * s}   ${w + tab} ${cy}`,
    `C ${w + tab} ${cy + tab * s}   ${w + tab * k} ${cy + neck}   ${w} ${cy + neck}`,
    `L ${w} ${h - r}`,
    `Q ${w} ${h}  ${w - r} ${h}`,
    `L ${cx + neck} ${h}`,
    `C ${cx + neck} ${h + tab * k}   ${cx + tab * s} ${h + tab}   ${cx} ${h + tab}`,
    `C ${cx - tab * s} ${h + tab}   ${cx - neck} ${h + tab * k}   ${cx - neck} ${h}`,
    `L ${r} ${h}`,
    `Q 0 ${h}  0 ${h - r}`,
    `L 0 ${cy + neck}`,
    `C ${tab * k} ${cy + neck}   ${tab} ${cy + tab * s}   ${tab} ${cy}`,
    `C ${tab} ${cy - tab * s}   ${tab * k} ${cy - neck}   0 ${cy - neck}`,
    `L 0 ${r}`,
    `Q 0 0  ${r} 0`,
    'Z',
  ].join(' ');
}

// ─── Utilities ───────────────────────────────────────────────────────────────
const AVATAR_PALETTE = [
  '#6366f1','#0ea5e9','#10b981','#f59e0b',
  '#ec4899','#8b5cf6','#14b8a6','#f97316',
];
function avatarColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h) + id.charCodeAt(i);
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// ─── Component props ─────────────────────────────────────────────────────────
interface Props {
  data: {
    piece: {
      id: string; title: string; status: PieceStatus;
      priority: number; skill_tags: string[];
      is_external?: boolean; progress: number;
      due_date: string | null; assignee_id: string | null;
    };
    isConnecting?: boolean;
    isBottleneck?: boolean;
    isBlocked?: boolean;       // upstream locked = cascade glow
    isCritical?: boolean;      // critical path = golden glow
    impactScale?: number;      // business_impact → visual size (0.85 ~ 1.35)
    projectColor?: string;
    projectName?: string;
    assigneeName?: string;
    isDimmed?: boolean;
    isHighlighted?: boolean;
    // ─ Hierarchy ─
    childCount?: number;       // number of direct children
    isExpanded?: boolean;      // are children currently shown?
    onToggleExpand?: () => void;
    isChild?: boolean;         // is this piece a child of another?
    // ─ LOD ─
    isLOD?: boolean;           // true when zoom < LOD_THRESHOLD → simplified render
  };
  selected: boolean;
}

// ─── LOD (simplified box at low zoom) ───────────────────────────────────────
const STATUS_LOD_BG: Record<PieceStatus, string> = {
  locked:      '#BDB7A3',
  ready:       '#7EB87A',
  in_progress: '#6B9EC8',
  done:        '#C8C4BA',
};
const STATUS_LOD_BORDER: Record<PieceStatus, string> = {
  locked:      '#8E8875',
  ready:       '#3D6B39',
  in_progress: '#3D6080',
  done:        '#9E9482',
};
function PieceNodeLOD({ data, selected }: Props) {
  const { piece, impactScale = 1, isDimmed = false, isBlocked, isCritical } = data;
  const bg     = STATUS_LOD_BG[piece.status];
  const border = STATUS_LOD_BORDER[piece.status];
  const scale  = impactScale;
  const glow   = isCritical ? `0 0 10px 3px #F59E0B88` :
                 isBlocked  ? `0 0 10px 3px #F9731688` : undefined;
  return (
    <div style={{
      width:  SVG_W * scale,
      height: SVG_H * scale,
      background: bg,
      borderRadius: 8,
      border: `2px solid ${border}`,
      boxShadow: selected ? `0 0 0 2px #6366f1, ${glow ?? ''}` : glow,
      opacity: isDimmed ? 0.25 : 1,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '4px 8px', overflow: 'hidden',
      transition: 'opacity 0.2s',
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, color: '#fff',
        textAlign: 'center', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        textShadow: '0 1px 2px rgba(0,0,0,0.4)',
        letterSpacing: '-0.01em',
        width: '100%',
      }}>
        {piece.title.replace(/^【.+?】/, '')}
      </span>
    </div>
  );
}

// ─── PieceNode ────────────────────────────────────────────────────────────────
function PieceNode({ data, selected }: Props) {
  // LOD: at low zoom render a fast simplified box instead of full SVG
  if (data.isLOD) return <PieceNodeLOD data={data} selected={selected} />;

  const {
    piece, isConnecting, isBottleneck, isBlocked, isCritical,
    impactScale = 1,
    projectColor, assigneeName,
    isDimmed = false, isHighlighted = false,
    childCount = 0, isExpanded = false, onToggleExpand,
    isChild = false,
  } = data;

  const z   = ZINC[piece.status];
  const pid = piece.id;

  // Due-date calculations
  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const dueDate = piece.due_date ? new Date(piece.due_date) : null;
  const daysDiff = dueDate
    ? Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000)
    : null;
  const isOverdue  = daysDiff !== null && daysDiff <  0 && piece.status !== 'done';
  const isDueSoon  = daysDiff !== null && daysDiff >= 0 && daysDiff <= 3 && piece.status !== 'done';

  // Liquid-fill progress
  const progress = Math.max(0, Math.min(100, piece.progress ?? 0));
  const fillY    = H * (1 - progress / 100);

  const path = piecePath(W, H, TAB, NECK, R);

  // Unique gradient/filter IDs per piece
  const gMain  = `gm-${pid}`;
  const gSpec  = `gs-${pid}`;
  const gEdge  = `ge-${pid}`;
  const gFillG = `gf-${pid}`;
  const fMet   = `fm-${pid}`;
  const clipId = `cp-${pid}`;

  const isValidTarget = isConnecting && piece.status === 'ready';

  return (
    <div
      style={{
        position: 'relative',
        width: SVG_W,
        height: SVG_H,
        cursor: 'pointer',
        opacity: isDimmed ? 0.12 : 1,
        transform: `scale(${(impactScale * (isHighlighted ? 1.04 : 1)).toFixed(3)})`,
        transformOrigin: 'center center',
        transition: 'opacity 0.22s ease, transform 0.2s ease',
        animation: isValidTarget ? 'magnetic-pulse 1s ease-in-out infinite' : undefined,
        zIndex: isHighlighted ? 2 : 1,
      }}
    >
      {/* ← Left handle = target（入力・スロット側）*/}
      <Handle
        type="target"
        position={Position.Left}
        className="piece-handle"
        style={{
          width: 14, height: 14, borderRadius: '50%',
          background: '#818cf8', border: '2.5px solid #fff',
          top: H / 2, left: 0,
          transform: 'translate(-50%, -50%)',
          opacity: 0, transition: 'opacity 0.15s, transform 0.15s',
          zIndex: 10,
        }}
      />
      {/* Right handle → = source（出力・タブ側）*/}
      <Handle
        type="source"
        position={Position.Right}
        className="piece-handle"
        style={{
          width: 14, height: 14, borderRadius: '50%',
          background: '#6366f1', border: '2.5px solid #fff',
          top: H / 2, right: 0,
          transform: 'translate(50%, -50%)',
          opacity: 0, transition: 'opacity 0.15s, transform 0.15s',
          zIndex: 10,
        }}
      />

      {/* SVG に pointerEvents:none → Handle がマウスイベントを受け取れる */}
      <svg
        width={SVG_W} height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ overflow: 'visible', display: 'block', pointerEvents: 'none' }}
      >
        <defs>
          {/* Main body gradient */}
          <linearGradient id={gMain} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={z.hilite} />
            <stop offset="15%"  stopColor={z.hilite} />
            <stop offset="55%"  stopColor={z.base} />
            <stop offset="100%" stopColor={z.mid} />
          </linearGradient>

          {/* Specular sheen */}
          <linearGradient id={gSpec} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.10)" />
            <stop offset="40%"  stopColor="rgba(255,255,255,0)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>

          {/* Bevel edge */}
          <linearGradient id={gEdge} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(255,255,255,0.45)" />
            <stop offset="50%"  stopColor="rgba(255,255,255,0.05)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.18)" />
          </linearGradient>

          {/* Liquid fill gradient */}
          <linearGradient id={gFillG} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={z.fillTop} stopOpacity={0.18} />
            <stop offset="100%" stopColor={z.fillBot} stopOpacity={0.50} />
          </linearGradient>

          {/* Drop-shadow + depth filter */}
          <filter id={fMet} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" result="blur" />
            <feOffset dx="0" dy="1.5" result="off" />
            <feComponentTransfer in="off" result="sh">
              <feFuncA type="linear" slope="0.35" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode in="sh" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Clip to piece shape (for liquid fill) */}
          <clipPath id={clipId}>
            <path d={path} />
          </clipPath>
        </defs>

        {/* ── Soft drop shadow ── */}
        <path
          d={path} transform="translate(3,7)"
          fill="rgba(0,0,0,0.28)"
          style={{ filter: 'blur(10px)' }}
        />

        {/* ── Cascade blocked: warm outer glow ── */}
        {isBlocked && (
          <path d={path} fill="none" stroke="#F59E0B" strokeWidth={6}
            style={{
              opacity: 0.35,
              animation: 'cascade-glow 2s ease-in-out infinite',
              filter: 'blur(6px)',
            }} />
        )}

        {/* ── Main metallic body ── */}
        <g filter={`url(#${fMet})`}>
          <path d={path} fill={`url(#${gMain})`} />
          <path d={path} fill={`url(#${gSpec})`} />
        </g>

        {/* ── Liquid progress fill ── */}
        {progress > 0 && (
          <rect
            x="0" y={fillY}
            width={SVG_W + 4} height={SVG_H - fillY + 4}
            fill={`url(#${gFillG})`}
            clipPath={`url(#${clipId})`}
          />
        )}

        {/* ── Waterline (dashed) ── */}
        {progress > 1 && progress < 99 && (
          <line
            x1="4" y1={fillY}
            x2={W - 4} y2={fillY}
            stroke={z.waterline}
            strokeWidth={1.2}
            strokeDasharray="4.5 3"
            opacity={0.55}
            clipPath={`url(#${clipId})`}
          />
        )}

        {/* ── Overdue / due-soon indicator bar at top ── */}
        {isOverdue && (
          <rect x="3" y="3" width={W - 6} height={3.5}
            fill="#EF4444" rx={2} opacity={0.9}
            clipPath={`url(#${clipId})`} />
        )}
        {isDueSoon && !isOverdue && (
          <rect x="3" y="3" width={W - 6} height={3.5}
            fill="#F59E0B" rx={2} opacity={0.85}
            clipPath={`url(#${clipId})`} />
        )}

        {/* ── Critical path: golden outer glow ── */}
        {isCritical && !selected && (
          <path d={path} fill="none" stroke="#F59E0B" strokeWidth={3}
            style={{ filter: 'drop-shadow(0 0 8px rgba(245,158,11,0.7))' }} />
        )}

        {/* ── Stroke ── */}
        {selected ? (
          <path d={path} fill="none" stroke="#3B82F6" strokeWidth={2.5}
            style={{ filter: 'drop-shadow(0 0 6px rgba(59,130,246,0.65))' }} />
        ) : isHighlighted ? (
          <path d={path} fill="none" stroke={z.base} strokeWidth={2.2}
            style={{ filter: `drop-shadow(0 0 5px ${z.base}88)` }} />
        ) : isBlocked ? (
          <path d={path} fill="none" stroke="#F59E0B" strokeWidth={2}
            style={{ animation: 'cascade-glow 2s ease-in-out infinite' }} />
        ) : isBottleneck ? (
          <path d={path} fill="none" stroke="#EF4444" strokeWidth={2}
            style={{ filter: 'drop-shadow(0 0 4px rgba(239,68,68,0.45))' }} />
        ) : (
          <>
            <path d={path} fill="none" stroke={`url(#${gEdge})`} strokeWidth={1.2} />
            <path d={path} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={0.5}
              transform="translate(0.5,0.5)" />
          </>
        )}

        {/* ── Bottleneck pulse halo ── */}
        {isBottleneck && (
          <path d={path} fill="none" stroke="#EF4444" strokeWidth={5}
            style={{
              opacity: 0.22,
              animation: 'bottleneck-flash 1.5s ease-in-out infinite',
              filter: 'blur(5px)',
            }} />
        )}

        {/* ── Cascade blocked chain icon ── */}
        {isBlocked && !isBottleneck && (
          <text x={W - 18} y={TAB + 14} fontSize="12" opacity={0.75}
            style={{ userSelect: 'none', animation: 'cascade-glow 2s ease-in-out infinite' }}>
            ⛓
          </text>
        )}

        {/* ── Text + badges ── */}
        <foreignObject x={0} y={0} width={SVG_W} height={SVG_H}>
          <div
            {...{ xmlns: 'http://www.w3.org/1999/xhtml' }}
            style={{
              width: '100%', height: '100%',
              display: 'flex', flexDirection: 'column',
              justifyContent: 'space-between',
              padding: `${TAB + 12}px 12px 11px ${TAB + 12}px`,
              boxSizing: 'border-box',
              pointerEvents: 'none',
              fontFamily: '"Inter", "Outfit", sans-serif',
            }}
          >
            {/* ── Top row: title + assignee avatar ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <div style={{
                flex: 1,
                fontSize: 12.5,
                fontWeight: 700,
                color: z.text,
                lineHeight: 1.28,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                letterSpacing: '-0.022em',
                textShadow: '0 1px 4px rgba(0,0,0,0.55)',
              }}>
                {piece.title}
              </div>

              {assigneeName && (
                <div style={{
                  flexShrink: 0,
                  width: 22, height: 22, borderRadius: '50%',
                  background: avatarColor(piece.assignee_id ?? 'x'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7.5, fontWeight: 800, color: '#fff',
                  border: '1.5px solid rgba(255,255,255,0.55)',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                  letterSpacing: 0,
                  marginTop: 1,
                }}>
                  {initials(assigneeName)}
                </div>
              )}
            </div>

            {/* ── Bottom row: meta badges ── */}
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 4, flexWrap: 'nowrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                {/* Priority */}
                {piece.priority > 0 && (
                  <span style={{
                    fontSize: 8, fontWeight: 800, color: '#111',
                    background: 'rgba(255,255,255,0.90)',
                    borderRadius: 2, padding: '1px 4px',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.22)',
                    letterSpacing: '0.02em',
                  }}>
                    P{piece.priority}
                  </span>
                )}
                {/* Status label */}
                <span style={{
                  fontSize: 7.5, fontWeight: 700,
                  color: 'rgba(255,255,255,0.52)',
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                }}>
                  {z.label}
                </span>
                {/* Project dot */}
                {projectColor && (
                  <div style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: projectColor,
                    boxShadow: `0 0 3px ${projectColor}`,
                    flexShrink: 0,
                  }} />
                )}
                {/* EXT badge */}
                {piece.is_external && (
                  <span style={{
                    fontSize: 7.5, fontWeight: 700,
                    color: 'rgba(255,255,255,0.80)',
                    border: '1px solid rgba(255,255,255,0.45)',
                    borderRadius: 2, padding: '1px 3px',
                    background: 'rgba(0,0,0,0.18)',
                    letterSpacing: '0.04em',
                  }}>EXT</span>
                )}
              </div>

              {/* Due date label */}
              {daysDiff !== null && piece.status !== 'done' && (
                <span style={{
                  fontSize: 8, fontWeight: 700,
                  color: isOverdue
                    ? '#FCA5A5'
                    : isDueSoon
                      ? '#FCD34D'
                      : 'rgba(255,255,255,0.38)',
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap',
                }}>
                  {isOverdue
                    ? `${Math.abs(daysDiff)}d超過`
                    : daysDiff === 0
                      ? '今日'
                      : `${daysDiff}d`}
                </span>
              )}
            </div>
          </div>
        </foreignObject>
      </svg>

      {/* ── Child indicator: thin left bar for child pieces ── */}
      {isChild && (
        <div style={{
          position: 'absolute', top: 14, left: 1,
          width: 3, height: H - 28, borderRadius: 2,
          background: projectColor || 'var(--accent)',
          opacity: 0.65, pointerEvents: 'none',
          zIndex: 4,
        }} />
      )}

      {/* ── Child expand/collapse button ── */}
      {childCount > 0 && (
        <div
          onClick={e => { e.stopPropagation(); onToggleExpand?.(); }}
          style={{
            position: 'absolute',
            bottom: -16, left: '50%', transform: 'translateX(-50%)',
            background: isExpanded ? 'var(--accent)' : 'var(--surface)',
            border: `1.5px solid ${isExpanded ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 20, padding: '1px 9px',
            fontSize: 8.5, fontWeight: 700,
            color: isExpanded ? '#fff' : 'var(--text-2)',
            cursor: 'pointer', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 3,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            transition: 'background 0.15s, color 0.15s',
            zIndex: 5,
          }}>
          <span style={{ fontSize: 7 }}>{isExpanded ? '▼' : '▶'}</span>
          <span>{childCount} 子タスク</span>
        </div>
      )}
    </div>
  );
}

// カスタムコンパレータ: data オブジェクトは毎回新規生成されるが
// 実際に描画に影響するフィールドだけを比較することで不要な再レンダリングを防ぐ
function arePiecePropsEqual(prev: Props, next: Props): boolean {
  if (prev.selected !== next.selected) return false;
  const pd = prev.data; const nd = next.data;
  return (
    pd.piece.status      === nd.piece.status      &&
    pd.piece.title       === nd.piece.title       &&
    pd.piece.assignee_id === nd.piece.assignee_id &&
    pd.piece.progress    === nd.piece.progress    &&
    pd.piece.due_date    === nd.piece.due_date    &&
    pd.piece.priority    === nd.piece.priority    &&
    pd.isBlocked      === nd.isBlocked      &&
    pd.isCritical     === nd.isCritical     &&
    pd.isBottleneck   === nd.isBottleneck   &&
    pd.isDimmed       === nd.isDimmed       &&
    pd.isHighlighted  === nd.isHighlighted  &&
    pd.isLOD          === nd.isLOD          &&
    pd.isConnecting   === nd.isConnecting   &&
    pd.childCount     === nd.childCount     &&
    pd.isExpanded     === nd.isExpanded     &&
    pd.isChild        === nd.isChild        &&
    pd.impactScale    === nd.impactScale    &&
    pd.projectColor   === nd.projectColor   &&
    pd.assigneeName   === nd.assigneeName
    // onToggleExpand は除外 — コールバック参照が変わっても描画は変わらない
  );
}

export default memo(PieceNode, arePiecePropsEqual);

// Export dimensions for use in PuzzleBoard layout
export const PIECE_NODE_W = SVG_W;
export const PIECE_NODE_H = SVG_H;
