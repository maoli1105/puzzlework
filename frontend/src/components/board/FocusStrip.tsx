/**
 * FocusStrip — 今日の流れの入口
 * ──────────────────────────────
 * 画面上部 72px。今日 active な chain / repair 待ち / 新着 が並ぶ。
 * KPIバーではない。「今日ここを触ると流れが戻る」場所を示す。
 *
 * 設計原則:
 *   - カード = camera 誘導トリガー。それだけ。
 *   - 数値ダッシュボード化禁止。
 *   - 赤警告禁止。
 *   - Board = 全景 / FocusStrip = 今日の入口。
 */

import { memo, useState } from 'react';

export interface FocusCard {
  id:           string;
  type:         'chain' | 'repair' | 'freshened';
  title:        string;
  subtitle:     string;
  pieceIds:     string[];
  projectColor?: string;
  urgency:      number;  // 0–1 (表示順序。赤警告禁止。)
}

interface FocusStripProps {
  cards:         FocusCard[];
  onFocusCard:   (pieceIds: string[]) => void;
  isDark?:       boolean;
}

// type ごとの accent 色（暖/冷のみ。赤禁止。）
const TYPE_COLOR: Record<FocusCard['type'], string> = {
  chain:     'rgba(194,154,108,1)',    // 暖 ochre — 流れている
  repair:    'rgba(148,163,184,1)',    // 冷 slate — 詰まっている
  freshened: 'rgba(130,180,160,1)',    // 草 green — 動き始めた
};

const TYPE_BG: Record<FocusCard['type'], string> = {
  chain:     'rgba(194,154,108,0.07)',
  repair:    'rgba(148,163,184,0.07)',
  freshened: 'rgba(130,180,160,0.07)',
};

export const FocusStrip = memo(function FocusStrip({
  cards,
  onFocusCard,
  isDark = false,
}: FocusStripProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  if (cards.length === 0) return null;

  const bg    = isDark ? 'rgba(28,27,26,0.88)' : 'rgba(252,250,247,0.90)';
  const border= isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const text1 = isDark ? 'rgba(230,225,215,0.90)' : 'rgba(40,35,28,0.85)';
  const text2 = isDark ? 'rgba(200,190,175,0.55)' : 'rgba(90,80,65,0.55)';

  return (
    <div
      style={{
        position:     'relative',
        width:        '100%',
        height:       72,
        zIndex:       60,
        background:   bg,
        borderBottom: `1px solid ${border}`,
        backdropFilter: 'blur(8px)',
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        padding:      '0 16px',
        overflowX:    'auto',
        overflowY:    'hidden',
        scrollbarWidth: 'none',
        pointerEvents: 'auto',
      }}
    >
      {/* 「今日の流れ」ラベル — 極小 */}
      <span style={{
        fontSize:      8.5,
        fontWeight:    700,
        color:         text2,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        flexShrink:    0,
        marginRight:   4,
      }}>
        今日
      </span>

      {cards.map(card => {
        const accent  = card.projectColor ?? TYPE_COLOR[card.type];
        const cardBg  = TYPE_BG[card.type];
        const isActive = activeId === card.id;

        return (
          <div
            key={card.id}
            onClick={() => {
              setActiveId(card.id);
              onFocusCard(card.pieceIds);
              setTimeout(() => setActiveId(null), 1200);
            }}
            style={{
              flexShrink:    0,
              minWidth:      140,
              maxWidth:      220,
              height:        50,
              borderRadius:  8,
              border:        `1px solid ${isActive ? accent + 'aa' : accent + '28'}`,
              background:    isActive ? `${accent}14` : cardBg,
              padding:       '0 12px',
              display:       'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              gap:            3,
              cursor:        'pointer',
              userSelect:    'none',
              transition:    'border-color 0.15s, background 0.15s',
            }}
          >
            {/* type indicator dot */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <div style={{
                width: 5, height: 5,
                borderRadius: '50%',
                background: accent,
                opacity: 0.7,
                flexShrink: 0,
              }} />
              <span style={{
                fontSize:   10.5,
                fontWeight: 600,
                color:      text1,
                overflow:   'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth:   170,
              }}>
                {card.title}
              </span>
            </div>
            <span style={{
              fontSize:  8.5,
              color:     text2,
              paddingLeft: 10,
              overflow:  'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {card.subtitle}
            </span>
          </div>
        );
      })}
    </div>
  );
});
