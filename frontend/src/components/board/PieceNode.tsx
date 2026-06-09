import { memo, useEffect, useRef, useState } from 'react';
import { Handle, Position } from 'reactflow';
import { PieceStatus } from '../../types';
import type { PieceVisuals } from '../../lib/compositeVisualState';

// ─── Body dimensions ────────────────────────────────────────────────────────
const W    = 196;
const H    = 132;
const TAB  = 20;
const NECK = 12;
const R    = 8;
const SVG_W = W + TAB;  // 216 — right tab protrudes here
const SVG_H = H + TAB;  // 152 — bottom tab protrudes here

// ─── Status palette (border + accent only — body is white) ──────────────────
const STATUS: Record<PieceStatus, {
  border: string;   // stroke color
  tint:   string;   // very light tint for fill (optional)
  label:  string;   // display label
  dot:    string;   // progress fill color
}> = {
  locked:      { border: '#94a3b8', tint: '#f8fafc', label: 'LOCKED',      dot: '#94a3b8' },
  ready:       { border: '#22c55e', tint: '#f0fdf4', label: 'READY',        dot: '#22c55e' },
  in_progress: { border: '#3b82f6', tint: '#eff6ff', label: 'IN PROGRESS',  dot: '#3b82f6' },
  done:        { border: '#9ca3af', tint: '#f9fafb', label: 'DONE',         dot: '#9ca3af' },
};

// ─── 4-sided jigsaw piece path ───────────────────────────────────────────────
export function piecePath(w: number, h: number, tab: number, neck: number, r: number): string {
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

// ─── Shared gradient/clip IDs ────────────────────────────────────────────────
export const SHARED_PATH = piecePath(W, H, TAB, NECK, R);

/** Clip path ID for the jigsaw outline (shared, defined in SharedPieceDefs) */
const CLIP_ID = 'pz-clip';

/**
 * Render ONCE at board level (inside a 0×0 SVG).
 * Only needs the clip path now — gradients are gone.
 */
export function SharedPieceDefs() {
  return (
    <svg
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={CLIP_ID}>
          <path d={SHARED_PATH} />
        </clipPath>
      </defs>
    </svg>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────
const AVATAR_PALETTE = [
  '#6366f1','#0ea5e9','#10b981','#B46400',
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
    isBlocked?: boolean;
    isCritical?: boolean;
    impactScale?: number;
    projectColor?: string;
    projectName?: string;
    assigneeName?: string;
    isDimmed?: boolean;
    isHighlighted?: boolean;
    isCascadeAffected?: boolean;
    childCount?: number;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
    isChild?: boolean;
    isLOD?: boolean;
    _justCompleted?: boolean;  // 完了瞬間のspringアニメーション
    _resonating?: boolean;     // 接続波紋が届いた周辺ピース
    visuals?: PieceVisuals;    // 合成済み最終視覚状態 (compositeVisualState)
  };
  selected: boolean;
}

// ─── LOD (temperature dot at low zoom) ──────────────────────────────────────
// 「小さいカード」ではなく「地形」。
// ground field の暖/冷を継承してクラスター地形を表現する。
// 単体では dot。密集すると温度ハローが重なって「塊」に見える。
function PieceNodeLOD({ data, selected }: Props) {
  const { piece, impactScale = 1, isDimmed = false, visuals } = data;
  const s = STATUS[piece.status];
  const scale = impactScale;

  // Ground field から温度を読む
  const gColor = visuals?.groundColor  ?? 'transparent';
  const gOpac  = visuals?.groundOpacity ?? 0;
  const isWarm = gColor.startsWith('rgba(194');  // warm ochre
  const isCool = gColor.startsWith('rgba(148');  // cool slate

  // LOD 用に amplify: 個別 max 0.028 → 重なり地形の視認が目的なので 14× 程度に増幅
  const haloOpacity = Math.min(0.40, gOpac * 14);
  const haloColor   = isWarm ? 'rgba(194,154,108,1)'
                    : isCool ? 'rgba(148,163,184,1)'
                    : 'rgba(175,182,205,0.7)';   // neutral

  // ハロー半径: ground radius をベースに LOD 向けに拡大
  const haloRadius  = Math.max(90, (visuals?.groundRadius ?? 90) * 1.35);

  // ステータスドット: 状態色で縁取り、温度で内側をうっすら染める
  const dotSize     = Math.round(44 * scale);
  const dotFill     = isWarm
    ? `${s.tint}`
    : isCool
    ? 'rgba(241,245,249,1)'
    : s.tint;
  const baseOpacity = visuals?.baseOpacity ?? 1;

  const cx = (SVG_W * scale) / 2;
  const cy = (SVG_H * scale) / 2;

  return (
    <div style={{
      position: 'relative',
      width:    SVG_W * scale,
      height:   SVG_H * scale,
      opacity:  isDimmed ? 0.15 : baseOpacity,
    }}>
      {/* 温度ハロー — 水平楕円で「床の温もり/冷たさ」を表す */}
      {haloOpacity > 0.008 && (
        <div
          aria-hidden="true"
          style={{
            position:      'absolute',
            width:         haloRadius * 2,
            height:        Math.round(haloRadius * 2 * 0.50),
            top:           cy - haloRadius * 0.50,
            left:          cx - haloRadius,
            borderRadius:  '50%',
            background:    `radial-gradient(ellipse at center, ${haloColor} 0%, transparent 70%)`,
            opacity:       haloOpacity,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* ステータスドット — 小さな円が状態を保持する */}
      <div style={{
        position:     'absolute',
        width:        dotSize,
        height:       dotSize,
        borderRadius: '50%',
        top:          cy - dotSize / 2,
        left:         cx - dotSize / 2,
        background:   dotFill,
        border:       `${selected ? 2.5 : 1.5}px solid ${selected ? '#3B82F6' : s.border}`,
        boxShadow:    selected ? '0 0 0 2px #3B82F680' : `0 1px 4px rgba(0,0,0,0.10)`,
        opacity:      (visuals?.borderAlpha ?? 1),
      }} />

      {/* 進捗リング — in_progress のとき常時表示（progress=0 はトラックのみ） */}
      {piece.status === 'in_progress' && (() => {
        const r      = dotSize / 2 + 5 * scale;
        const circ   = 2 * Math.PI * r;
        const prog   = Math.min(100, piece.progress ?? 0);
        const filled = circ * prog / 100;
        const svgSz  = (r + 4) * 2;
        return (
          <svg
            style={{
              position:      'absolute',
              top:           cy - (r + 4),
              left:          cx - (r + 4),
              pointerEvents: 'none',
              overflow:      'visible',
            }}
            width={svgSz}
            height={svgSz}
          >
            {/* トラック（薄い円） */}
            <circle
              cx={r + 4} cy={r + 4} r={r}
              fill="none"
              stroke={s.border}
              strokeWidth={2 * scale}
              opacity={0.22}
            />
            {/* フィル（進捗分） */}
            {prog > 0 && (
              <circle
                cx={r + 4} cy={r + 4} r={r}
                fill="none"
                stroke={s.border}
                strokeWidth={2.5 * scale}
                strokeLinecap="round"
                strokeDasharray={`${filled} ${circ}`}
                transform={`rotate(-90 ${r + 4} ${r + 4})`}
                opacity={0.85}
                style={{ transition: 'stroke-dasharray 0.4s ease' }}
              />
            )}
          </svg>
        );
      })()}
    </div>
  );
}

// ─── PieceNode ────────────────────────────────────────────────────────────────
function PieceNode({ data, selected }: Props) {
  if (data.isLOD) return <PieceNodeLOD data={data} selected={selected} />;

  const {
    piece, isConnecting, isBottleneck, isBlocked, isCritical,
    impactScale = 1,
    projectColor, assigneeName,
    isDimmed = false, isHighlighted = false, isCascadeAffected = false,
    childCount = 0, isExpanded = false, onToggleExpand,
    isChild = false,
    _justCompleted = false, _resonating = false,
    visuals,
  } = data;

  // ── 合成済み視覚状態: visuals がない場合は素通し状態で描画する ──────────
  const v: PieceVisuals = visuals ?? {
    saturation:  100, brightness:  100,
    baseOpacity: 1.0, borderWarm:  false,
    borderAlpha: 1.0, shadowAlpha: 1.0, contentAlpha: 1.0,
    dropShadow:  undefined,
    auraRadius:  0,   auraOpacity: 0,   auraColor:    'transparent',
    groundRadius: 0,  groundOpacity: 0, groundColor:  'transparent',
  };

  // ── ホバー状態: メタ情報表示切り替え ────────────────────────────────────
  const [hovered, setHovered] = useState(false);

  // ── アニメーション用 ref（DOM に直接 class を付けてアニメーション） ──────
  const nodeRef = useRef<HTMLDivElement>(null);

  // 完了 spring アニメーション
  useEffect(() => {
    if (!_justCompleted || !nodeRef.current) return;
    const el = nodeRef.current;
    el.classList.add('piece-spring-complete');
    const t = setTimeout(() => el.classList.remove('piece-spring-complete'), 900);
    return () => clearTimeout(t);
  }, [_justCompleted]);

  // 接続共鳴アニメーション
  useEffect(() => {
    if (!_resonating || !nodeRef.current) return;
    const el = nodeRef.current;
    el.classList.add('piece-resonating');
    const t = setTimeout(() => el.classList.remove('piece-resonating'), 700);
    return () => clearTimeout(t);
  }, [_resonating]);

  const s    = STATUS[piece.status];
  const path = SHARED_PATH;

  // Due-date calculations
  const today    = new Date(); today.setHours(0, 0, 0, 0);
  const dueDate  = piece.due_date ? new Date(piece.due_date) : null;
  const daysDiff = dueDate
    ? Math.ceil((dueDate.getTime() - today.getTime()) / 86_400_000)
    : null;
  const isOverdue = daysDiff !== null && daysDiff <  0 && piece.status !== 'done';
  const isDueSoon = daysDiff !== null && daysDiff >= 0 && daysDiff <= 3 && piece.status !== 'done';

  // Progress fill height (inside piece body only)
  const progress = Math.max(0, Math.min(100, piece.progress ?? 0));
  const fillY    = H * (1 - progress / 100);

  const isValidTarget = isConnecting && piece.status === 'ready';

  // Stroke color — priority: selected > cascade > critical > highlighted > blocked > warm patina > normal
  // ボトルネック・過負荷は使用圧 (pressure shadow) で表現済み。赤は使わない。
  const strokeColor = selected          ? '#3B82F6'
                    : isCascadeAffected ? '#F59E0B'
                    : isCritical        ? '#F59E0B'
                    : isHighlighted     ? s.border
                    : isBlocked         ? '#F59E0B'
                    : v.borderWarm      ? '#F59E0B'   // 最近触られた痕跡: 微かに温かいボーダー
                    : s.border;
  const strokeWidth = selected || isCritical || isBlocked || isCascadeAffected ? 3 : 2;

  return (
    <div
      ref={nodeRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        width: SVG_W,
        height: SVG_H,
        cursor: 'pointer',
        opacity: isDimmed ? 0.15 : v.baseOpacity * v.contentAlpha,
        transform: `scale(${(impactScale * (isHighlighted ? 1.04 : 1)).toFixed(3)})`,
        transformOrigin: 'center center',
        // patina + 集中圧力 filter を合成
        // cascade が最優先。それ以外は patina と pressure shadow を重ねる。
        filter: (() => {
          if (isCascadeAffected) return 'drop-shadow(0 0 6px rgba(245,158,11,0.7))';
          const patinaF = (v.saturation < 80 || v.brightness < 95)
            ? `saturate(${v.saturation}%) brightness(${v.brightness}%)`
            : null;
          const combined = [patinaF, v.dropShadow ?? null].filter(Boolean).join(' ');
          return combined || undefined;
        })(),
        transition: 'opacity 0.22s ease, transform 0.2s ease, filter 0.3s ease',
        animation: isValidTarget ? 'magnetic-pulse 1s ease-in-out infinite' : undefined,
        zIndex: isCascadeAffected ? 3 : isHighlighted ? 2 : 1,
      }}
    >
      {/*
        ── Ground field: 場の定着感 ──
        z-index: -1 でピース body (白塗り) の背面に配置。
        楕円形（水平に潰す）で「床の染み」に見せる。
        ピース境界を超えて空白域まで滲み出す部分が
        隣接ピースと重なることで初めて「場の密度差」が現れる。
        単体 opacity max ~0.028 → 肉眼では知覚不可能。
        新演出・アニメーションなし。
      */}
      {v.groundOpacity > 0.002 && (
        <div
          aria-hidden="true"
          style={{
            position:      'absolute',
            width:         v.groundRadius * 2,
            height:        Math.round(v.groundRadius * 2 * 0.42),  // 横長楕円で「床」感
            top:           Math.round(SVG_H * 0.60 - v.groundRadius * 0.42),
            left:          SVG_W / 2 - v.groundRadius,
            borderRadius:  '50%',
            background:    `radial-gradient(ellipse at center, ${v.groundColor} 0%, transparent 58%)`,
            opacity:       v.groundOpacity,
            pointerEvents: 'none',
            zIndex:        -1,  // ピース stacking context 内で最背面
          }}
        />
      )}

      {/*
        ── Presence aura: 場の存在感 ──
        単体では見えない opacity。密集したとき重なりが密度になる。
        「使い込まれた机の表面」のメカニズム。
        pointerEvents なし / アニメーションなし / GPU なし。
      */}
      {v.auraOpacity > 0.004 && (
        <div
          aria-hidden="true"
          style={{
            position:        'absolute',
            width:           v.auraRadius * 2,
            height:          v.auraRadius * 2,
            top:             SVG_H / 2 - v.auraRadius,
            left:            SVG_W / 2 - v.auraRadius,
            borderRadius:    '50%',
            background:      `radial-gradient(circle, ${v.auraColor} 0%, transparent 65%)`,
            opacity:         v.auraOpacity,
            pointerEvents:   'none',
          }}
        />
      )}

      {/* Handles */}
      <Handle
        type="target" position={Position.Left} className="piece-handle"
        style={{
          width: 14, height: 14, borderRadius: '50%',
          background: '#94a3b8', border: '2.5px solid #fff',
          top: H / 2, left: 0,
          transform: 'translate(-50%, -50%)',
          opacity: 0, transition: 'opacity 0.15s',
          zIndex: 10,
        }}
      />
      <Handle
        type="source" position={Position.Right} className="piece-handle"
        style={{
          width: 14, height: 14, borderRadius: '50%',
          background: '#E60012', border: '2.5px solid #fff',
          top: H / 2, right: 0,
          transform: 'translate(50%, -50%)',
          opacity: 0, transition: 'opacity 0.15s',
          zIndex: 10,
        }}
      />

      <svg
        width={SVG_W} height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ overflow: 'visible', display: 'block', pointerEvents: 'none' }}
      >
        {/* ── Drop shadow — 孤立ピースは影が薄い（地面から浮いて見える） ── */}
        <path
          d={path}
          transform="translate(2,4)"
          fill={`rgba(0,0,0,${(0.10 * v.shadowAlpha).toFixed(3)})`}
        />

        {/* ── Cascade blocked: 輪郭を少し強調 ── */}
        {isBlocked && (
          <path d={path} fill="none" stroke="#F59E0B" strokeWidth={6}
            style={{ opacity: 0.22, animation: 'cascade-glow 2s ease-in-out infinite' }} />
        )}

        {/* ── White body fill ── */}
        <path d={path} fill={s.tint} />

        {/* ── Progress fill (subtle tint from bottom) ── */}
        {progress > 0 && (
          <rect
            x={0} y={fillY}
            width={SVG_W} height={SVG_H - fillY}
            fill={s.dot} opacity={0.10}
            clipPath={`url(#${CLIP_ID})`}
          />
        )}

        {/* 期日超過・期日近接: 色バーではなく memoryLayer の scatter スコアで表現済み */}

        {/* ── Status border stroke — 孤立ピースはボーダーが透ける（輪郭が定まらない） ── */}
        <path d={path} fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeOpacity={v.borderAlpha}
          style={isBlocked ? { animation: 'cascade-glow 2s ease-in-out infinite' } : undefined}
        />

        {/* ── Waterline ── */}
        {progress > 1 && progress < 99 && (
          <line
            x1={4} y1={fillY} x2={W - 4} y2={fillY}
            stroke={s.border} strokeWidth={1}
            strokeDasharray="4 3" opacity={0.5}
            clipPath={`url(#${CLIP_ID})`}
          />
        )}

        {/* ── Progress ring (in_progress のとき右上コーナーに表示) ── */}
        {piece.status === 'in_progress' && (() => {
          const rr   = 11;
          const cx2  = W - 20;
          const cy2  = TAB + 18;
          const circ = 2 * Math.PI * rr;
          const fill = circ * progress / 100;
          return (
            <g>
              {/* トラック */}
              <circle cx={cx2} cy={cy2} r={rr}
                fill="none" stroke={s.border} strokeWidth={2} opacity={0.18} />
              {/* フィル */}
              {progress > 0 && (
                <circle cx={cx2} cy={cy2} r={rr}
                  fill="none" stroke={s.border} strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeDasharray={`${fill} ${circ}`}
                  transform={`rotate(-90 ${cx2} ${cy2})`}
                  opacity={0.82}
                  style={{ transition: 'stroke-dasharray 0.4s ease' }}
                />
              )}
              {/* パーセント数値 */}
              {progress > 0 && (
                <text x={cx2} y={cy2 + 3.5} textAnchor="middle"
                  fontSize={7} fontWeight={700} fill={s.border} opacity={0.75}>
                  {progress}
                </text>
              )}
            </g>
          );
        })()}

        {/* ── Blocked chain icon ── */}
        {isBlocked && !isBottleneck && (
          <text x={W - 20} y={TAB + 16} fontSize="12" opacity={0.65}
            style={{ userSelect: 'none', animation: 'cascade-glow 2s ease-in-out infinite' }}>
            ⛓
          </text>
        )}

        {/*
          ── Text content ──
          foreignObject is clamped to the piece BODY (W × H, not SVG_W × SVG_H)
          so text never spills into the tab protrusions.
          Safe interior: x=TAB+8 … W-8, y=TAB+8 … H-8
        */}
        <foreignObject x={0} y={0} width={W} height={H}>
          <div
            {...{ xmlns: 'http://www.w3.org/1999/xhtml' }}
            style={{
              width: '100%', height: '100%',
              display: 'flex', flexDirection: 'column',
              justifyContent: 'space-between',
              // top/left padding covers the tab notch slots; right/bottom keep text inside body
              padding: `${TAB + 8}px 10px 10px ${TAB + 8}px`,
              boxSizing: 'border-box',
              pointerEvents: 'none',
              fontFamily: '"Inter", "Outfit", sans-serif',
              overflow: 'hidden',
            }}
          >
            {/* ── Top row: title + assignee ── */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
              <div style={{
                flex: 1, minWidth: 0,
                fontSize: 12,
                fontWeight: 700,
                color: '#1e293b',
                lineHeight: 1.30,
                overflow: 'hidden',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                letterSpacing: '-0.02em',
              }}>
                {piece.title}
              </div>
              {assigneeName && (
                <div style={{
                  flexShrink: 0,
                  width: 20, height: 20, borderRadius: '50%',
                  background: avatarColor(piece.assignee_id ?? 'x'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7, fontWeight: 800, color: '#fff',
                  border: '1.5px solid rgba(255,255,255,0.8)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  marginTop: 1,
                }}>
                  {initials(assigneeName)}
                </div>
              )}
            </div>

            {/* ── Bottom row ───────────────────────────────────────────────
                デフォルト: ステータスドット + プロジェクト点のみ
                ホバー:     ステータス文字 + 優先度 + EXT + 期日 表示
                「知りたくなったとき現れる」。常時は最小。
            ── */}
            <div style={{
              display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', gap: 4,
              minHeight: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'hidden' }}>
                {/* ステータスドット: 常時表示 (色は border と一致) */}
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: s.dot, flexShrink: 0,
                  opacity: 0.85,
                }} />

                {/* ホバー時のみ: ステータスラベル */}
                {hovered && (
                  <span style={{
                    fontSize: 8, fontWeight: 700,
                    color: s.border,
                    background: `${s.border}18`,
                    borderRadius: 3, padding: '1.5px 5px',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}>
                    {s.label}
                  </span>
                )}

                {/* ホバー時のみ: 優先度 */}
                {hovered && piece.priority > 0 && (
                  <span style={{
                    fontSize: 8, fontWeight: 700,
                    color: '#64748b',
                    background: '#f1f5f9',
                    borderRadius: 3, padding: '1.5px 5px',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>
                    P{piece.priority}
                  </span>
                )}

                {/* プロジェクトドット: 常時表示 */}
                {projectColor && (
                  <div style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: projectColor, flexShrink: 0,
                  }} />
                )}

                {/* ホバー時のみ: EXT バッジ */}
                {hovered && piece.is_external && (
                  <span style={{
                    fontSize: 7.5, fontWeight: 700,
                    color: '#64748b', border: '1px solid #cbd5e1',
                    borderRadius: 3, padding: '1px 3px',
                    whiteSpace: 'nowrap', flexShrink: 0,
                  }}>EXT</span>
                )}
              </div>

              {/* ホバー時のみ: 期日 */}
              {hovered && daysDiff !== null && piece.status !== 'done' && (
                <span style={{
                  fontSize: 8, fontWeight: 700,
                  color: isOverdue  ? '#ef4444'
                       : isDueSoon  ? '#B46400'
                       : '#94a3b8',
                  letterSpacing: '-0.01em',
                  whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {isOverdue
                    ? `${Math.abs(daysDiff)}d超過`
                    : daysDiff === 0 ? '今日'
                    : `${daysDiff}d`}
                </span>
              )}
            </div>
          </div>
        </foreignObject>
      </svg>

      {/* ── Child indicator bar ── */}
      {isChild && (
        <div style={{
          position: 'absolute', top: TAB + 6, left: 2,
          width: 3, height: H - TAB - 12, borderRadius: 2,
          background: projectColor || '#6366f1',
          opacity: 0.55, pointerEvents: 'none',
          zIndex: 4,
        }} />
      )}

      {/* ── Expand/collapse child button ── */}
      {childCount > 0 && (
        <div
          onClick={e => { e.stopPropagation(); onToggleExpand?.(); }}
          style={{
            position: 'absolute',
            bottom: -14, left: '50%', transform: 'translateX(-50%)',
            background: isExpanded ? '#E60012' : '#fff',
            border: `1.5px solid ${isExpanded ? '#E60012' : '#e2e8f0'}`,
            borderRadius: 20, padding: '1px 8px',
            fontSize: 8.5, fontWeight: 700,
            color: isExpanded ? '#fff' : '#64748b',
            cursor: 'pointer', whiteSpace: 'nowrap',
            display: 'flex', alignItems: 'center', gap: 3,
            boxShadow: '0 2px 6px rgba(0,0,0,0.10)',
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
    pd.isChild          === nd.isChild          &&
    pd.impactScale      === nd.impactScale      &&
    pd.projectColor     === nd.projectColor     &&
    pd.assigneeName     === nd.assigneeName     &&
    pd._justCompleted      === nd._justCompleted      &&
    pd._resonating         === nd._resonating         &&
    pd.visuals?.saturation   === nd.visuals?.saturation   &&
    pd.visuals?.brightness   === nd.visuals?.brightness   &&
    pd.visuals?.baseOpacity  === nd.visuals?.baseOpacity  &&
    pd.visuals?.borderWarm   === nd.visuals?.borderWarm   &&
    pd.visuals?.borderAlpha  === nd.visuals?.borderAlpha  &&
    pd.visuals?.shadowAlpha  === nd.visuals?.shadowAlpha  &&
    pd.visuals?.contentAlpha === nd.visuals?.contentAlpha &&
    pd.visuals?.dropShadow   === nd.visuals?.dropShadow   &&
    pd.visuals?.auraRadius    === nd.visuals?.auraRadius    &&
    pd.visuals?.auraOpacity   === nd.visuals?.auraOpacity   &&
    pd.visuals?.auraColor     === nd.visuals?.auraColor     &&
    pd.visuals?.groundRadius  === nd.visuals?.groundRadius  &&
    pd.visuals?.groundOpacity === nd.visuals?.groundOpacity &&
    pd.visuals?.groundColor   === nd.visuals?.groundColor
  );
}

export default memo(PieceNode, arePiecePropsEqual);

// Export dimensions for use in PuzzleBoard layout
export const PIECE_NODE_W = SVG_W;
export const PIECE_NODE_H = SVG_H;
