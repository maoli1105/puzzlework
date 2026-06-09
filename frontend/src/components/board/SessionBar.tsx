/**
 * SessionBar — 今日、ここで何をするか
 * ─────────────────────────────────────
 * 「空間」ではなく「行動モード」を先に定義する骨格。
 *
 * セッションの意味:
 *   open    → 全景。何も絞らない。
 *   morning → 朝会。今日動く流れ + 修復候補だけ見える。
 *   repair  → 修復。停滞と孤立だけ残る。健全なものは消える。
 *   focus   → 集中。自分のタスクだけ残る。
 *   handoff → 引き継ぎ。人から人への接点だけが浮く。
 *   review  → 振り返り。完了した流れが時系列で浮く。
 *
 * 設計原則:
 *   - 存在感は最小。知っている人だけが使う。
 *   - hover で展開。通常は細い帯。
 *   - セッション名は「行動」として名付ける。名詞ではなく動詞の文脈。
 */

import { memo, useState } from 'react';

export type SessionMode = 'open' | 'morning' | 'repair' | 'focus' | 'handoff' | 'review';

export const SESSION_META: Record<SessionMode, {
  label:    string;
  sub:      string;   // 何が見えるか
  color:    string;   // accent
}> = {
  open:    { label: '全景',     sub: 'すべて表示',                      color: 'rgba(140,140,140,0.8)' },
  morning: { label: '朝会',     sub: '今日動く流れ + 修復候補',          color: 'rgba(194,154,108,0.9)' },
  repair:  { label: '修復',     sub: '停滞と孤立だけ残る',               color: 'rgba(148,163,184,0.9)' },
  focus:   { label: '集中',     sub: '自分のタスクだけ',                  color: 'rgba(120,180,150,0.9)' },
  handoff: { label: '引き継ぎ', sub: '人から人への接点',                  color: 'rgba(160,130,200,0.9)' },
  review:  { label: '振り返り', sub: '完了した流れが浮く',                color: 'rgba(180,160,130,0.9)' },
};

interface SessionBarProps {
  mode:      SessionMode;
  onChange:  (mode: SessionMode) => void;
  isDark?:   boolean;
}

export const SessionBar = memo(function SessionBar({
  mode,
  onChange,
  isDark = false,
}: SessionBarProps) {
  const [expanded, setExpanded] = useState(false);

  const bg     = isDark ? 'rgba(28,27,26,0.90)' : 'rgba(252,250,247,0.92)';
  const border = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
  const text2  = isDark ? 'rgba(200,190,175,0.50)' : 'rgba(90,80,65,0.50)';

  const current = SESSION_META[mode];

  return (
    <div
      style={{
        position:     'absolute',
        top:          0,
        left:         0,
        right:        0,
        height:       expanded ? 52 : 28,
        zIndex:       62,
        background:   bg,
        borderBottom: `1px solid ${border}`,
        backdropFilter: 'blur(6px)',
        overflow:     'hidden',
        transition:   'height 0.18s ease',
        pointerEvents:'auto',
      }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {/* 通常表示: 現在のセッションを細い帯として */}
      <div style={{
        height:      28,
        display:     'flex',
        alignItems:  'center',
        padding:     '0 16px',
        gap:          8,
      }}>
        <div style={{
          width:        6,
          height:       6,
          borderRadius: '50%',
          background:   current.color,
          flexShrink:   0,
        }} />
        <span style={{
          fontSize:      9,
          fontWeight:    600,
          color:         current.color,
          letterSpacing: '0.06em',
        }}>
          {current.label}
        </span>
        <span style={{ fontSize: 8.5, color: text2 }}>
          {current.sub}
        </span>
      </div>

      {/* 展開時: 全モードをピル表示 */}
      <div style={{
        display:     'flex',
        alignItems:  'center',
        gap:          6,
        padding:     '0 16px',
        height:       24,
        opacity:      expanded ? 1 : 0,
        transition:  'opacity 0.12s',
      }}>
        {(Object.keys(SESSION_META) as SessionMode[]).map(m => {
          const meta    = SESSION_META[m];
          const isActive = m === mode;
          return (
            <button
              key={m}
              onClick={() => { onChange(m); setExpanded(false); }}
              style={{
                padding:      '3px 10px',
                borderRadius: 12,
                border:       `1px solid ${isActive ? meta.color : meta.color.replace(/[\d.]+\)$/, '0.25)')}`,
                background:   isActive ? meta.color.replace(/[\d.]+\)$/, '0.12)') : 'transparent',
                color:        isActive ? meta.color : text2,
                fontSize:     9,
                fontWeight:   isActive ? 700 : 500,
                cursor:       'pointer',
                letterSpacing: '0.04em',
                whiteSpace:   'nowrap',
                transition:   'background 0.1s, border-color 0.1s',
              }}
            >
              {meta.label}
            </button>
          );
        })}
      </div>
    </div>
  );
});
