/**
 * ProjectOrb — 生命体としてのプロジェクト表現
 * ────────────────────────────────────────────
 * 数値ではなく「空気感」で状態を伝える。
 *
 * 表現の次元：
 *   形状  — 欠損・崩れ → 完成度が低いほど輪郭が不安定
 *   色    — 温もり → 活発なほど暖かい色
 *   呼吸  — 速さ・深さ → 健康なほど深くゆっくり
 *   密度  — 内部の点 → 接続・ピース数の密度感
 *   熱点  — 異常発光 → 属人化・危険信号
 *   停滞  — 脱彩色 → 何も動いていない状態
 */

import { memo, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeOrbPatina, computeFreshness } from '../../lib/usagePatina';
import { computeWearAngle } from '../../lib/concentrationScore';
import { computeOrbGap } from '../../lib/missingLayer';
import { computeBoardPresenceScore } from '../../lib/presenceLayer';

// ─── データ型 ────────────────────────────────────────────────────────────────
export interface OrbProject {
  id:               string;
  name:             string;
  total_pieces:     number;
  done_pieces:      number;
  in_progress:      number;
  overdue_pieces:   number;
  members?:         { name: string; pieces_done: number }[];
  next_due?:        string | null;
  // 使用痕計算用 (optional: なければ集計値から近似)
  piecesData?:      import('../../types').Piece[];
}

// ─── 決定論的乱数 (seed → [0,1)) ────────────────────────────────────────────
function seededRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = s ^ (s >>> 16);
    return ((s >>> 0) / 0xFFFFFFFF);
  };
}

function projectSeed(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ─── 有機的な輪郭パスの生成 ─────────────────────────────────────────────────
// completion が高いほど円に近い。低いほど凸凹する。
function generateOrbPath(seed: number, completion: number, r: number): string {
  const POINTS = 20;
  const rng     = seededRng(seed);
  const defect  = (1 - Math.max(0, Math.min(1, completion))) * 0.22;

  const pts: [number, number][] = [];
  for (let i = 0; i < POINTS; i++) {
    const angle = (i / POINTS) * Math.PI * 2 - Math.PI / 2;

    // 複数周波数のノイズで自然な凸凹を作る
    const n1 = (rng() - 0.5) * 2 * defect;
    const n2 = Math.sin(angle * 3 + rng() * Math.PI * 2) * defect * 0.5;
    const n3 = Math.sin(angle * 5 + rng() * Math.PI * 2) * defect * 0.25;

    const radius = r * (1 + n1 + n2 + n3);
    pts.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
  }

  // Catmull-Rom スプライン風の滑らかなパス
  const d: string[] = [];
  for (let i = 0; i < POINTS; i++) {
    const p0 = pts[(i - 1 + POINTS) % POINTS];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % POINTS];
    const p3 = pts[(i + 2) % POINTS];

    if (i === 0) d.push(`M ${p1[0].toFixed(2)} ${p1[1].toFixed(2)}`);

    // コントロールポイント
    const cp1x = (p1[0] + (p2[0] - p0[0]) * 0.18).toFixed(2);
    const cp1y = (p1[1] + (p2[1] - p0[1]) * 0.18).toFixed(2);
    const cp2x = (p2[0] - (p3[0] - p1[0]) * 0.18).toFixed(2);
    const cp2y = (p2[1] - (p3[1] - p1[1]) * 0.18).toFixed(2);

    d.push(`C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`);
  }
  d.push('Z');
  return d.join(' ');
}

// ─── 内部密度ドット位置生成 ──────────────────────────────────────────────────
function generateDots(seed: number, count: number, r: number): [number, number][] {
  const rng  = seededRng(seed + 1);
  const dots: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const dist  = rng() * r * 0.55;
    dots.push([Math.cos(angle) * dist, Math.sin(angle) * dist]);
  }
  return dots;
}

// ─── warmth → 色 (dark mode 前提) ───────────────────────────────────────────
// 停滞 (warmth≈0): 冷たいグレー青  /  活発 (warmth≈100): 明るいインジゴ紫
// lum を広めに取ることで「一目で差がわかる」明暗コントラストを確保。
function warmthToColor(warmth: number): { fill: string; glow: string } {
  const t    = warmth / 100;
  // hue: 210(冷青) → 260(暖インジゴ)
  const hue  = 210 + t * 50;
  // sat: 8%(ほぼグレー) → 78%(鮮やか)
  const sat  = 8   + t * 70;
  // lum: 16%(暗い) → 58%(明るく存在感あり)  ← ここを広げた
  const lum  = 16  + t * 42;
  const fill = `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${lum.toFixed(0)}%)`;
  const glow = `hsl(${hue.toFixed(0)}, ${Math.min(92, sat + 15).toFixed(0)}%, ${Math.min(72, lum + 14).toFixed(0)}%)`;
  return { fill, glow };
}

// ─── プロジェクトの「生命指標」を計算 ────────────────────────────────────────
function computeOrbMetrics(p: OrbProject) {
  const total      = Math.max(1, p.total_pieces);
  const completion = p.done_pieces / total;
  const activity   = p.in_progress / total;
  const overdueRt  = p.overdue_pieces / total;

  const warmth = Math.max(0, Math.min(100,
    completion * 45 + activity * 40 - overdueRt * 25 + 15
  ));

  const isStuck   = p.in_progress === 0 && p.done_pieces === 0;
  const isDanger  = overdueRt > 0.4;

  // 属人化検出: 1人が全ピースの60%以上担当
  const members    = p.members ?? [];
  const topMember  = members.length > 0
    ? members.reduce((a, b) => a.pieces_done > b.pieces_done ? a : b, members[0])
    : null;
  const isSPOF = topMember !== null && total >= 4
    && (topMember.pieces_done / total) >= 0.6;

  const breathDuration = isStuck ? 1.8 : 3 + (warmth / 100) * 2.5;
  const dotCount = Math.min(8, Math.max(2, Math.round((p.in_progress + 1) * 1.5)));

  // Orbのサイズ: ピース数 × 活動度で決定
  //   1件:  baseR≈32  → SVG≈96px  (小さな点のような工房)
  //   10件: baseR≈56  → SVG≈144px (中規模工房)
  //   25件: baseR≈72  → SVG≈176px (大工房)
  //   停滞プロジェクトは同ピース数でもやや小さく見える (−warmth補正)
  const sizeByCount = 28 + Math.min(44, Math.sqrt(total) * 8.5);
  const baseR = Math.round(sizeByCount * (isStuck ? 0.80 : 1.0));

  return { completion, warmth, isStuck, isDanger, isSPOF, breathDuration, dotCount, baseR };
}

// ─── ProjectOrb コンポーネント ────────────────────────────────────────────────
interface Props {
  project:  OrbProject;
  onClick?: () => void;
}

export const ProjectOrb = memo(function ProjectOrb({ project, onClick }: Props) {
  const seed    = useMemo(() => projectSeed(project.id), [project.id]);
  const metrics = useMemo(() => computeOrbMetrics(project), [project]);
  const { fill: fillColor, glow: glowColor } = useMemo(
    () => warmthToColor(metrics.warmth), [metrics.warmth]
  );

  // 使用痕レイヤー
  const orbPatina = useMemo(
    () => computeOrbPatina(project.piecesData ?? []),
    [project.piecesData]
  );

  const { completion, isStuck, isSPOF, dotCount, baseR } = metrics;

  // 有機的パス (completion, seed が変わらない限り再計算しない)
  const bodyPath = useMemo(
    () => generateOrbPath(seed, completion, baseR),
    [seed, completion, baseR]
  );

  // 局所摩耗: 担当集中による非対称アーク角度
  const wearAngle = useMemo(
    () => computeWearAngle(project.members),
    [project.members]
  );

  // Orb 全体の presence 質感スコア
  const presenceScore = useMemo(() => {
    if (project.piecesData && project.piecesData.length > 0) {
      const freshnesses = project.piecesData.map(p => computeFreshness(p));
      return computeBoardPresenceScore(freshnesses);
    }
    // piecesData がない場合: in_progress / total から近似
    const activityRatio = project.total_pieces > 0
      ? (project.in_progress + project.done_pieces * 0.4) / project.total_pieces
      : 0.3;
    return Math.min(1, activityRatio);
  }, [project.piecesData, project.in_progress, project.done_pieces, project.total_pieces]);

  // 欠損痕: 孤立ピース比率から活動痕の断絶を計算
  const orbGap = useMemo(() => {
    // piecesData があれば precise。なければ overdue/done の比率から近似。
    const fakePieces = project.piecesData ?? [];
    // isolation が実際にはここではなく PuzzleBoard で計算されるため、
    // 簡易近似:孤立ピースは (total - done - in_progress) のうち done でないもの
    // ここでは直接 computeOrbGap へ空の isolation を渡し、
    // 代わりに missingArcPct を overdue 比率から近似する
    const isolated = Math.max(0, project.total_pieces - project.done_pieces - project.in_progress);
    const missingArcPct = project.total_pieces > 0
      ? Math.min(1, isolated / project.total_pieces)
      : 0;
    return { missingArcPct, gapStartAngle: computeOrbGap(fakePieces, {}, seed).gapStartAngle };
  }, [project.total_pieces, project.done_pieces, project.in_progress, seed]);
  void computeOrbGap; // used above

  // 内部密度ドット
  const dots = useMemo(
    () => generateDots(seed, dotCount, baseR),
    [seed, dotCount, baseR]
  );

  // ホバー状態 + マウス座標（fixed ツールチップ用）
  const [hovered,  setHovered]  = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const SVG_SIZE = (baseR + 16) * 2;  // Orb + グロー余白
  const cx = SVG_SIZE / 2;
  const cy = SVG_SIZE / 2;

  // Completion arc (baseR * 0.92 の円の上に描く)
  const arcR          = baseR * 0.92;
  const circumference = 2 * Math.PI * arcR;
  const arcDash       = circumference * Math.min(1, completion);
  const arcGap        = circumference * Math.max(0, 1 - completion);

  // 停滞 or 低鮮度: フィルターで脱彩色・冷却
  const patinaFilter = !isStuck && orbPatina.avgFreshness < 0.40
    ? `saturate(${Math.round(orbPatina.avgFreshness * 120 + 15)}%) brightness(${Math.round(75 + orbPatina.avgFreshness * 30)}%)`
    : undefined;
  const stuckFilter = isStuck
    ? 'saturate(0.15) brightness(0.65)'
    : patinaFilter;

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      onMouseEnter={e => { setHovered(true); setMousePos({ x: e.clientX, y: e.clientY }); }}
      onMouseMove={e => setMousePos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        width:  SVG_SIZE,
        height: SVG_SIZE,
        cursor: 'pointer',
        filter: stuckFilter,
        transition: 'filter 1.5s ease, transform 0.2s ease',
        transform: hovered ? 'scale(1.06)' : 'scale(1)',
        // 赤警告グロー廃止。過負荷は saturation/brightness 減衰で表現済み。
      }}
    >
      {/*
        ── Presence field: 場の存在感 ──
        Orb の背後に静的な existence bloom を置く。
        アニメーションなし / GPU なし。
        presenceScore が高いほど広く / 濃い → 「ここに何かある」感。
        overview に広い余白があるからこそ、この bloom の差が地図として読める。
        停滞工房: 極めて薄い → 「気配がない」
        活発工房: 適度に広い → 「ここに人がいる」
      */}
      <div
        aria-hidden="true"
        style={{
          position:      'absolute',
          width:         SVG_SIZE * (1.6 + presenceScore * 0.9),
          height:        SVG_SIZE * (1.6 + presenceScore * 0.9),
          top:           SVG_SIZE / 2 - (SVG_SIZE * (1.6 + presenceScore * 0.9)) / 2,
          left:          SVG_SIZE / 2 - (SVG_SIZE * (1.6 + presenceScore * 0.9)) / 2,
          borderRadius:  '50%',
          background:    `radial-gradient(circle, ${glowColor} 0%, transparent 60%)`,
          opacity:       isStuck ? 0.005 : 0.008 + presenceScore * 0.030,
          pointerEvents: 'none',
        }}
      />

      {/* ── 色温度オーバーレイ (静的) ── */}
      {/* warmth に応じた内部色温度。アニメーションなし。 */}
      <div
        aria-hidden="true"
        style={{
          position:      'absolute',
          inset:         0,
          borderRadius:  '50%',
          background:    `radial-gradient(circle at center, ${glowColor}44 0%, transparent 65%)`,
          opacity:       isStuck ? 0.08 : 0.22,
          pointerEvents: 'none',
          transition:    'opacity 2s ease',
        }}
      />

      {/* ── メインSVG ── */}
      <svg
        width={SVG_SIZE}
        height={SVG_SIZE}
        viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
        style={{ overflow: 'visible', display: 'block' }}
      >
        <g transform={`translate(${cx}, ${cy})`}>

          {/* 背景グロー（ホバー時強化）*/}
          <circle
            r={baseR + 8}
            fill="none"
            stroke={glowColor}
            strokeWidth={hovered ? 8 : 4}
            opacity={hovered ? 0.18 : 0.06}
            style={{ transition: 'opacity 0.3s, stroke-width 0.3s' }}
          />

          {/* 有機的ボディ（欠損表現あり）*/}
          <path
            d={bodyPath}
            fill={fillColor}
            opacity={0.85}
            style={{ transition: 'fill 2s ease, opacity 0.3s' }}
          />

          {/*
            ── 欠損輪郭: completion arc が閉じていない部分を示す ──
            【構造】
            1. ゴースト弧 (薄い点線、全周) を最初に描く
            2. 完成度アーク (実線) を上から重ねて完成部分を隠す
            → 残った点線部分だけが「まだ来ていない輪郭」として見える
            アニメーションなし。
          */}
          {/* 1. base ring */}
          <circle
            r={arcR}
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={1.2}
          />
          {/* 2. 欠損ゴースト弧 (全周に非常に薄い点線) */}
          {completion < 0.92 && (
            <circle
              r={arcR}
              fill="none"
              stroke="rgba(255,255,255,0.10)"
              strokeWidth={1.5}
              strokeDasharray="1.5 9"
              strokeLinecap="round"
              opacity={Math.min(0.4, (1 - completion) * 0.55)}
              style={{ transition: 'opacity 1s ease' }}
            />
          )}
          {/* 3. 完成度アーク (実線、上に重ねることでゴーストを隠す) */}
          {completion > 0.01 && (
            <circle
              r={arcR}
              fill="none"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth={2.5}
              strokeDasharray={`${arcDash} ${arcGap}`}
              strokeLinecap="round"
              transform="rotate(-90)"
              style={{ transition: 'stroke-dasharray 1s ease' }}
            />
          )}

          {/* 内部密度ドット */}
          {dots.map(([x, y], i) => (
            <circle
              key={i}
              cx={x} cy={y}
              r={1.4}
              fill="rgba(255,255,255,0.55)"
              opacity={0.6 + i * 0.04}
            />
          ))}

          {/*
            ── 使用痕アーク: 最近の活動量を静的弧で表現 ──
            アニメーションなし。「ここ最近どれだけ動いたか」の痕跡。
            completion arc とは別の半径に描く (baseR * 1.08)
          */}
          {orbPatina.activityArcPct > 0.05 && (
            <>
              {/* 活動痕の背景弧 (薄い) */}
              <circle
                r={baseR * 1.08}
                fill="none"
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={3}
              />
              {/*
                活動量に対応した明るい弧 — 局所摩耗あり
                wearAngle: 担当集中が偏っている方向へアークが回転する
                → 「特定方向だけ削れた」使用痕に見える
              */}
              <circle
                r={baseR * 1.08}
                fill="none"
                stroke={fillColor}
                strokeWidth={3}
                strokeDasharray={`${2 * Math.PI * baseR * 1.08 * orbPatina.activityArcPct} ${2 * Math.PI * baseR * 1.08}`}
                strokeLinecap="round"
                transform={`rotate(${wearAngle - 90})`}
                opacity={0.35 + orbPatina.avgFreshness * 0.3}
                style={{ transition: 'stroke-dasharray 1.5s ease' }}
              />
            </>
          )}

          {/*
            ── 欠損弧: 孤立ピースがある場所の活動痕が「途切れる」 ──
            アニメーションなし。構造の空白を静止画で示す。
            実線でなく極細破線 → 「あるはずの部分が来なかった」感覚。
          */}
          {orbGap.missingArcPct > 0.05 && (
            <circle
              r={baseR * 1.08}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth={1.5}
              strokeDasharray={`2 7`}
              strokeLinecap="round"
              transform={`rotate(${orbGap.gapStartAngle + (1 - orbGap.missingArcPct) * 360 - 90})`}
              strokeDashoffset={
                /* 欠損部分だけ破線を出す: gapSize相当の dash */
                -(2 * Math.PI * baseR * 1.08 * (1 - orbGap.missingArcPct))
              }
              opacity={Math.min(0.45, orbGap.missingArcPct * 0.9)}
              style={{ transition: 'opacity 1.5s ease' }}
            />
          )}

          {/* 放置感: avgFreshness が低い場合、Orb全体を少し冷やす */}
          {orbPatina.avgFreshness < 0.45 && (
            <circle
              r={baseR * 0.95}
              fill="rgba(180,200,255,0.06)"
              opacity={1 - orbPatina.avgFreshness * 1.5}
            />
          )}

          {/* 属人化マーク (静的) — 動きで主張しない、位置だけ示す */}
          {isSPOF && (
            <circle
              cx={baseR * 0.35}
              cy={-baseR * 0.35}
              r={3.0}
              fill="rgba(245,158,11,0.65)"
            />
          )}

          {/* 停滞 — 静的な破線。動かない。「止まっている」を動きで表さない。 */}
          {isStuck && (
            <path
              d={`M ${-baseR * 0.4} ${baseR * 0.1} Q 0 ${baseR * 0.15} ${baseR * 0.4} ${baseR * 0.1}`}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1}
              strokeDasharray="3 4"
            />
          )}

        </g>
      </svg>

      {/* ── プロジェクト名ラベル ── */}
      <div
        style={{
          position: 'absolute',
          bottom: -22,
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: 10,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.6)',
          whiteSpace: 'nowrap',
          letterSpacing: '0.03em',
          textAlign: 'center',
          maxWidth: SVG_SIZE + 20,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          pointerEvents: 'none',
          transition: 'color 0.2s',
          ...(hovered ? { color: 'rgba(255,255,255,0.95)' } : {}),
        }}
      >
        {project.name}
      </div>

      {/* ── ホバーポップアップ (portal → transform の影響を受けない) ── */}
      {hovered && createPortal((() => {
        const TIP_W  = 176;
        const TIP_H  = 130;
        const MARGIN = 14;
        const showBelow = mousePos.y - TIP_H - MARGIN < 80;
        const tipTop  = showBelow
          ? mousePos.y + MARGIN
          : mousePos.y - TIP_H - MARGIN;
        const tipLeft = Math.min(
          Math.max(MARGIN, mousePos.x - TIP_W / 2),
          window.innerWidth - TIP_W - MARGIN
        );
        return (
          <div style={{
            position: 'fixed', top: tipTop, left: tipLeft,
            width: TIP_W,
            background: 'rgba(15,15,20,0.94)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 10, padding: '10px 14px',
            zIndex: 9999, pointerEvents: 'none',
            animation: 'orb-popup-in 180ms ease-out',
            fontFamily: 'system-ui,-apple-system,sans-serif',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.95)', marginBottom: 7, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
              {project.name}
            </div>
            <HoverRow label="完了" value={`${project.done_pieces} / ${project.total_pieces}`} />
            <HoverRow label="進行中" value={`${project.in_progress}`} />
            {project.overdue_pieces > 0 && (
              <HoverRow label="期限超過" value={`${project.overdue_pieces}`} danger />
            )}
            {isSPOF && <HoverRow label="属人化" value="要注意" warn />}
            {isStuck && <HoverRow label="状態" value="停滞中" warn />}
          </div>
        );
      })(), document.body)}
    </div>
  );
});

function HoverRow({
  label, value, danger, warn,
}: { label: string; value: string; danger?: boolean; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{
        fontSize: 10, fontWeight: 600,
        color: danger ? '#f87171' : warn ? '#fbbf24' : 'rgba(255,255,255,0.8)',
      }}>
        {value}
      </span>
    </div>
  );
}
