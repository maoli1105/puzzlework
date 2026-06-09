/**
 * RepairPulse — 工房の歪み計
 * ──────────────────────────
 * 停滞の「空気の歪み」を常設で示す。赤警告禁止。数値バッジ禁止。
 * 規模に応じてオーラが広がるだけ。hover で場所を示す。click で修復モードへ。
 *
 * 設計原則:
 *   - 「何件あるか」より「冷えてる場所がある」という感覚を出す。
 *   - 数字は hover 後にのみ見える。
 *   - 修復後は即座に気配が薄れる。
 */

import { memo, useState } from 'react';

export interface StalledItem {
  id:    string;
  title: string;
  type:  'locked' | 'stagnant';
}

interface RepairPulseProps {
  items:       StalledItem[];
  onEnterRepairMode: () => void;
  isDark?:     boolean;
}

export const RepairPulse = memo(function RepairPulse({
  items,
  onEnterRepairMode,
  isDark = false,
}: RepairPulseProps) {
  const [hovered, setHovered] = useState(false);

  if (items.length === 0) return null;

  // 規模に応じてオーラの強さが変わる（MAX 15件で最大）
  const intensity = Math.min(1, items.length / 15);

  // 冷色の ambient — 赤禁止。青みがかった slate。
  const auraColor = isDark
    ? `rgba(148,163,200,${0.06 + intensity * 0.09})`
    : `rgba(148,163,184,${0.07 + intensity * 0.10})`;
  const borderColor = isDark
    ? `rgba(148,163,200,${0.18 + intensity * 0.12})`
    : `rgba(148,163,184,${0.22 + intensity * 0.14})`;
  const textColor = isDark ? 'rgba(180,195,210,0.70)' : 'rgba(90,105,120,0.70)';
  const dimText   = isDark ? 'rgba(160,175,190,0.45)' : 'rgba(100,115,130,0.45)';

  // オーラの半径: 停滞が多いほど広がる
  const auraSize = 52 + intensity * 20;

  return (
    <div
      style={{
        position: 'absolute',
        bottom:   20,
        right:    20,
        zIndex:   44,
      }}
    >
      {/* hover 時のプレビューリスト */}
      {hovered && (
        <div style={{
          position:      'absolute',
          bottom:        auraSize + 8,
          right:         0,
          minWidth:      160,
          maxWidth:      220,
          background:    isDark ? 'rgba(30,28,26,0.94)' : 'rgba(252,250,247,0.94)',
          border:        `1px solid ${borderColor}`,
          borderRadius:  8,
          padding:       '8px 0',
          backdropFilter:'blur(6px)',
          pointerEvents: 'none',
        }}>
          <div style={{
            fontSize:      8,
            fontWeight:    700,
            color:         dimText,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            padding:       '0 10px 4px',
          }}>
            修復待ち {items.length}件
          </div>
          {items.slice(0, 6).map(item => (
            <div key={item.id} style={{
              display:    'flex',
              alignItems: 'center',
              gap:         6,
              padding:    '3px 10px',
            }}>
              <div style={{
                width:        4,
                height:       4,
                borderRadius: '50%',
                background:   item.type === 'locked'
                  ? 'rgba(148,163,184,0.7)'
                  : 'rgba(120,140,160,0.5)',
                flexShrink:   0,
              }} />
              <span style={{
                fontSize:     9.5,
                color:        textColor,
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
                maxWidth:     170,
              }}>
                {item.title}
              </span>
            </div>
          ))}
          {items.length > 6 && (
            <div style={{ fontSize: 8.5, color: dimText, padding: '3px 10px' }}>
              他 {items.length - 6}件...
            </div>
          )}
        </div>
      )}

      {/* メインの ambient circle */}
      <div
        onClick={onEnterRepairMode}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width:        auraSize,
          height:       auraSize,
          borderRadius: '50%',
          background:   `radial-gradient(circle at 50% 50%, ${auraColor} 0%, transparent 70%)`,
          border:       `1px solid ${hovered ? borderColor : borderColor.replace(/[\d.]+\)$/, `${parseFloat(borderColor.match(/([\d.]+)\)$/)?.[1] ?? '0.2') * 0.7})`)  }`,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'center',
          cursor:       'pointer',
          transition:   'width 0.3s ease, height 0.3s ease, border-color 0.2s',
          transform:    hovered ? 'scale(1.08)' : 'scale(1)',
        }}
      >
        {/* 中心: 件数を極小表示 (hover でのみ主張する) */}
        <span style={{
          fontSize:    hovered ? 11 : 9,
          fontWeight:  600,
          color:       textColor,
          transition:  'font-size 0.15s',
          lineHeight:  1,
        }}>
          {items.length}
        </span>
      </div>
    </div>
  );
});
