/**
 * AtmosphereLayer
 * ───────────────
 * ボードの「空気」を作る3層構造：
 *
 *   Layer 1: 温度背景   — warmth に応じてごく微妙に色変化 (CSS transition 3s)
 *   Layer 2: 接続フラッシュ  — 接続成立時の微発光 (200ms fade)
 *   Layer 3: 場の質感   — boardPresenceScore → 静的な明るさ (transition 4s)
 *
 * ReactFlow の外側に置くことで、board canvas の repaint と完全に切り離す。
 * すべて pointer-events: none。アニメーションなし。
 */

import { useEffect, useState } from 'react';
import { warmthToDarkColor, warmthToLightColor } from '../../lib/boardAtmosphere';

interface Props {
  warmth:          number;   // 0–100
  isStuck:         boolean;
  connectionFlash: boolean;  // true の間だけ発光表示
  presenceScore?:  number;   // 0–1: ボード全体の場の質感
  hueShift?:       number;   // WorkspaceIdentity.atmosphereHueShift
}

export function AtmosphereLayer({
  warmth,
  isStuck,
  connectionFlash,
  presenceScore = 0.4,
  hueShift = 0,
}: Props) {
  // ダークモード検出（.dark クラスが documentElement に付いているか）
  const [isDark, setIsDark] = useState(
    () => document.documentElement.classList.contains('dark')
  );
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const bgColor = isDark
    ? warmthToDarkColor(warmth, hueShift)
    : warmthToLightColor(warmth, hueShift);

  return (
    <>
      {/* ── Layer 1: 温度背景 ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: bgColor,
          transition: 'background 4s ease',
          zIndex: 0,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />

      {/* ── Layer 2: 接続フラッシュ ── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: isDark
            ? 'radial-gradient(ellipse 45% 40% at 50% 50%, rgba(255,255,255,0.08) 0%, transparent 100%)'
            : 'radial-gradient(ellipse 45% 40% at 50% 50%, rgba(255,255,255,0.5) 0%, transparent 100%)',
          opacity: connectionFlash ? 1 : 0,
          transition: connectionFlash
            ? 'opacity 20ms ease-in'
            : 'opacity 280ms ease-out',
          zIndex: 2,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />

      {/*
        ── Layer 3: 場の質感 (静的) ──
        ボード全体の使用帯スコア → 背景の「座り心地」。
        アニメーションなし。transition 4s で状態変化をゆっくり反映。

        高スコア: 中央がごく薄く明るい → 「長く使われた場所」感
        低スコア: ほぼ透明 → 空気がない、まだ馴染んでいない

        opacity は 0.012–0.038 の範囲。知覚閾値以下で動作する。
      */}
      {!isStuck && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: isDark
              ? `radial-gradient(ellipse 80% 65% at 50% 50%, rgba(200,205,220,1) 0%, transparent 100%)`
              : `radial-gradient(ellipse 80% 65% at 50% 50%, rgba(100,110,140,1) 0%, transparent 100%)`,
            opacity: 0.012 + presenceScore * 0.026,
            transition: 'opacity 4s ease',
            zIndex: 3,
            pointerEvents: 'none',
          }}
          aria-hidden="true"
        />
      )}
    </>
  );
}
