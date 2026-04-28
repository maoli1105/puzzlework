import React from 'react';
import { useViewport } from 'reactflow';
import { RemoteCursor } from '../../types';

// ─── ユーザーIDからカーソル色を決定（安定したハッシュ）────────────────────────
const CURSOR_PALETTE = [
  '#6366F1', // indigo
  '#0EA5E9', // sky
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EC4899', // pink
  '#8B5CF6', // violet
  '#14B8A6', // teal
  '#F97316', // orange
  '#EF4444', // red
  '#84CC16', // lime
];
function cursorColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = ((h << 5) - h) + userId.charCodeAt(i);
  return CURSOR_PALETTE[Math.abs(h) % CURSOR_PALETTE.length];
}

// ─── カーソル SVG ─────────────────────────────────────────────────────────────
function CursorSVG({ color }: { color: string }) {
  return (
    <svg width="18" height="22" viewBox="0 0 18 22" fill="none" style={{ display: 'block', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}>
      <path
        d="M0 0 L0 16 L4.5 12 L7.5 20 L9.5 19 L6.5 11 L12 11 Z"
        fill={color}
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── RemoteCursors overlay ───────────────────────────────────────────────────
const STALE_MS = 8000; // 8秒操作なければフェード

interface Props {
  cursors: Map<string, RemoteCursor>;
}

export default function RemoteCursors({ cursors }: Props) {
  const { x, y, zoom } = useViewport();
  const now = Date.now();

  if (cursors.size === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 998,
        overflow: 'hidden',
      }}
    >
      {[...cursors.values()].map((c) => {
        const age     = now - c.updatedAt;
        const stale   = age > STALE_MS;
        const opacity = stale ? 0 : Math.max(0.35, 1 - age / STALE_MS);
        const color   = cursorColor(c.userId);

        // flow 座標 → スクリーン座標
        const sx = c.x * zoom + x;
        const sy = c.y * zoom + y;

        return (
          <div
            key={c.userId}
            style={{
              position: 'absolute',
              left: sx,
              top:  sy,
              opacity,
              transition: 'opacity 0.6s ease',
              willChange: 'transform',
            }}
          >
            <CursorSVG color={color} />
            {/* 名前ラベル */}
            <div style={{
              position: 'absolute',
              top: 18,
              left: 6,
              background: color,
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: '"Inter","Outfit",sans-serif',
              letterSpacing: '0.02em',
              padding: '2px 7px',
              borderRadius: 6,
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
              userSelect: 'none',
            }}>
              {c.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
