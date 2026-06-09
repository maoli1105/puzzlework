import { ConnectionType } from '../../types';

interface PendingConnection {
  fromId: string; toId: string; fromTitle: string; toTitle: string;
}
interface Props {
  pending: PendingConnection | null;
  onSelect: (type: ConnectionType) => void;
  onCancel: () => void;
}

const CONNECTION_OPTIONS: { type: ConnectionType; label: string; desc: string; accent: string }[] = [
  { type: 'sequential',  label: '順序',    desc: '前のピースが完了したら自動で次が解放される', accent: 'var(--accent)' },
  { type: 'parallel',    label: '並列',    desc: '接続元が全て完了したとき解放される',         accent: '#4A9B6F'      },
  { type: 'conditional', label: '条件分岐', desc: '条件を満たした場合のみ解放される',           accent: '#D97706'      },
];

export default function ConnectTypeModal({ pending, onSelect, onCancel }: Props) {
  if (!pending) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.28)',
      zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        padding: '28px 24px',
        width: 380,
        boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em', marginBottom: 6 }}>
          接続タイプを選択
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 20 }}>
          <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{pending.fromTitle}</span>
          {' → '}
          <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{pending.toTitle}</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {CONNECTION_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              onClick={() => onSelect(opt.type)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 14px',
                background: 'var(--surface)',
                border: `1px solid var(--border)`,
                borderLeft: `3px solid ${opt.accent}`,
                borderRadius: 'var(--r-md)',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--surface)')}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: opt.accent, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-1)', marginBottom: 2, letterSpacing: '-0.01em' }}>
                  {opt.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          style={{
            marginTop: 14, width: '100%', padding: '9px 0',
            background: 'none', border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)', cursor: 'pointer',
            fontSize: 12, color: 'var(--text-3)',
            letterSpacing: '-0.01em',
          }}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}
