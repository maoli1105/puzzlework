/**
 * AssigneeRail
 * ────────────
 * ドラッグ中のみ画面下から滑り上がるワーカーの受け取り帯。
 * ピースをそのまま担当者の上にドロップ → 即座に割り当て変更。
 * フォームを開かない。担当変更が「配置」になる。
 */

import { memo } from 'react';
import { User } from '../../types';

function nameToColor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffff;
  // 彩度を落とした穏やかな色相
  return `hsl(${h % 360}, 26%, 50%)`;
}

interface Props {
  workers:   User[];
  visible:   boolean;
  hoverId:   string | null;  // 現在ホバー中のワーカーID
  onRef:     (workerId: string, el: HTMLDivElement | null) => void;
  isDark?:   boolean;
}

export const AssigneeRail = memo(function AssigneeRail({
  workers, visible, hoverId, onRef, isDark = false,
}: Props) {
  if (workers.length === 0) return null;

  return (
    <div
      style={{
        position:        'absolute',
        bottom:          0,
        left:            0,
        right:           0,
        height:          64,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        gap:             14,
        background:      isDark
          ? 'rgba(22,22,24,0.88)'
          : 'rgba(252,251,249,0.90)',
        backdropFilter:  'blur(8px)',
        borderTop:       isDark
          ? '1px solid rgba(255,255,255,0.06)'
          : '1px solid rgba(0,0,0,0.055)',
        transform:       visible ? 'translateY(0)' : 'translateY(100%)',
        transition:      'transform 0.16s ease',
        zIndex:          50,
        pointerEvents:   'none',  // 受け取りは座標判定で行う
      }}
      aria-hidden="true"
    >
      <span style={{
        fontSize:      9,
        color:         isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.30)',
        letterSpacing: '0.05em',
        marginRight:   6,
        userSelect:    'none',
      }}>
        担当を変える
      </span>

      {workers.map(w => {
        const isHover = hoverId === w.id;
        const color   = nameToColor(w.id);
        const initial = w.name.charAt(0);
        return (
          <div
            key={w.id}
            ref={el => onRef(w.id, el)}
            style={{
              position:        'relative',
              width:           isHover ? 40 : 34,
              height:          isHover ? 40 : 34,
              borderRadius:    '50%',
              background:      color,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              color:           '#fff',
              fontSize:        isHover ? 14 : 12,
              fontWeight:      600,
              transition:      'width 0.1s ease, height 0.1s ease, font-size 0.1s ease, box-shadow 0.1s ease',
              boxShadow:       isHover
                ? `0 0 0 3px ${color}44, 0 2px 10px rgba(0,0,0,0.14)`
                : '0 1px 3px rgba(0,0,0,0.10)',
              userSelect:      'none',
            }}
          >
            {initial}
            {/* 名前ラベル — ホバー時のみ */}
            {isHover && (
              <div style={{
                position:     'absolute',
                bottom:       '115%',
                left:         '50%',
                transform:    'translateX(-50%)',
                background:   isDark ? 'rgba(0,0,0,0.80)' : 'rgba(30,30,30,0.78)',
                color:        '#fff',
                fontSize:     9,
                padding:      '3px 7px',
                borderRadius: 4,
                whiteSpace:   'nowrap',
                pointerEvents:'none',
                letterSpacing:'0.02em',
              }}>
                {w.name}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});
