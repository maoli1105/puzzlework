/**
 * RepairDropZone
 * ──────────────
 * ドラッグ中のみ右下に現れる「修復へ」の受け取り場所。
 * ピースを落とす → locked なら即座に ready 化、それ以外は修復ページへ。
 *
 * 設計原則:
 *   - 主張しない。存在を知らなくても困らない。
 *   - 知った人だけが使う。
 *   - 受け取ったとき、空間が少し整う感覚を返す。
 */

import { memo } from 'react';

interface Props {
  visible:      boolean;  // ドラッグ中のみ true
  receiving:    boolean;  // ゾーン上にホバー中
  stagnantCount: number;  // 停滞ピース数 (文脈として表示)
  isDark?:      boolean;
  onRef:        (el: HTMLDivElement | null) => void;
}

export const RepairDropZone = memo(function RepairDropZone({
  visible, receiving, stagnantCount, isDark = false, onRef,
}: Props) {
  const borderColor = receiving
    ? (isDark ? 'rgba(200,140,60,0.55)' : 'rgba(160,100,20,0.45)')
    : (isDark ? 'rgba(200,140,60,0.18)' : 'rgba(160,100,20,0.18)');

  const bgColor = receiving
    ? (isDark ? 'rgba(200,140,60,0.10)' : 'rgba(160,100,20,0.07)')
    : (isDark ? 'rgba(200,140,60,0.03)' : 'rgba(160,100,20,0.03)');

  const textColor = isDark ? 'rgba(220,170,80,0.70)' : 'rgba(130,85,10,0.65)';
  const dimColor  = isDark ? 'rgba(220,170,80,0.40)' : 'rgba(130,85,10,0.40)';

  return (
    <div
      ref={onRef}
      aria-hidden="true"
      style={{
        position:      'absolute',
        bottom:        72,   // AssigneeRail の上
        right:         20,
        width:         68,
        height:        68,
        borderRadius:  10,
        border:        `1px solid ${borderColor}`,
        background:    bgColor,
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        justifyContent:'center',
        gap:           3,
        opacity:       visible ? 1 : 0,
        transform:     visible
          ? (receiving ? 'scale(1.06)' : 'scale(1)')
          : 'scale(0.84)',
        transition:    'opacity 0.18s ease, transform 0.14s ease, background 0.1s, border-color 0.1s',
        pointerEvents: 'none',  // 受け取りは座標判定で行う
        zIndex:        45,
        userSelect:    'none',
      }}
    >
      {/* アイコン: シンプルな循環矢印 */}
      <svg
        width="18" height="18" viewBox="0 0 18 18" fill="none"
        style={{ opacity: receiving ? 0.9 : 0.6 }}
      >
        <path
          d="M3 9a6 6 0 0 1 10.24-4.24M15 9a6 6 0 0 1-10.24 4.24"
          stroke={textColor}
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <polyline
          points="13,4.5 13.24,4.76 12.98,7"
          stroke={textColor}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="5,13.5 4.76,13.24 5.02,11"
          stroke={textColor}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <span style={{ fontSize: 9, color: textColor, letterSpacing: '0.03em', fontWeight: 500 }}>
        修復へ
      </span>

      {stagnantCount > 0 && (
        <span style={{ fontSize: 8, color: dimColor }}>
          {stagnantCount}件停滞中
        </span>
      )}
    </div>
  );
});
