/**
 * CascadePanel — Impact Engine
 * ピースの期日変更が下流に波及するシミュレーション
 * 「記録ツール」→「設計ツール」への転換点
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { pieces as pieceApi } from '../../services/api';
import { Piece } from '../../types';
import { Zap, X, TrendingUp, TrendingDown, ChevronRight, AlertTriangle } from 'lucide-react';

interface AffectedPiece {
  id: string;
  title: string;
  delta_days: number;
  new_due_date: string | null;
  new_start_date: string | null;
  business_impact: number;
}

interface CascadeResult {
  root_id: string;
  delta_days: number;
  affected: AffectedPiece[];
  total_impact: number;
}

interface Props {
  piece: Piece;
  onClose: () => void;
  /** 波及するピースIDセットをボードに伝達 */
  onAffectedChange: (ids: Set<string>, deltaDays: number) => void;
  /** 実際に期日を確定 */
  onApply: (rootId: string, deltaDays: number, affected: AffectedPiece[]) => void;
}

const DEBOUNCE_MS = 320;

export default function CascadePanel({ piece, onClose, onAffectedChange, onApply }: Props) {
  const [deltaDays, setDeltaDays]   = useState(0);
  const [result,    setResult]      = useState<CascadeResult | null>(null);
  const [loading,   setLoading]     = useState(false);
  const [applying,  setApplying]    = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const fetch = useCallback(async (d: number) => {
    if (d === 0) { setResult(null); onAffectedChange(new Set(), 0); return; }
    setLoading(true);
    try {
      const r: CascadeResult = await (pieceApi as any).cascadeImpact(piece.id, d);
      setResult(r);
      onAffectedChange(new Set(r.affected.map(a => a.id)), d);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [piece.id, onAffectedChange]);

  // スライダー変化でデバウンス
  const handleChange = (val: number) => {
    setDeltaDays(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetch(val), DEBOUNCE_MS);
  };

  // マウント時にdelta=0でクリア
  useEffect(() => {
    onAffectedChange(new Set(), 0);
    return () => {
      clearTimeout(debounceRef.current);
      onAffectedChange(new Set(), 0);
    };
  }, [onAffectedChange]);

  async function handleApply() {
    if (!result || deltaDays === 0) return;
    setApplying(true);
    try {
      await onApply(piece.id, deltaDays, result.affected);
    } finally {
      setApplying(false);
    }
  }

  const sign  = deltaDays > 0 ? '+' : '';
  const color = deltaDays > 0 ? '#B46400' : deltaDays < 0 ? 'var(--text-2)' : 'var(--text-3)';
  const impactM = result ? Math.round(result.total_impact / 10000) : 0; // 万円

  return (
    <div style={{
      position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      zIndex: 30, width: 520, maxWidth: 'calc(100vw - 40px)',
      background: 'var(--surface)',
      border: `1px solid ${deltaDays !== 0 ? '#B4640066' : 'var(--border)'}`,
      borderRadius: 16,
      boxShadow: deltaDays !== 0
        ? '0 8px 40px rgba(245,158,11,0.18), 0 2px 12px rgba(0,0,0,0.10)'
        : '0 8px 32px rgba(0,0,0,0.12)',
      transition: 'box-shadow 0.3s, border-color 0.3s',
      overflow: 'hidden',
    }}>
      {/* ── ヘッダー ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 16px 10px',
        borderBottom: '1px solid var(--border)',
        background: deltaDays !== 0 ? 'rgba(245,158,11,0.04)' : undefined,
      }}>
        <Zap size={14} color="#B46400" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
            Impact Engine
          </div>
          <div style={{
            fontSize: 11, color: 'var(--text-2)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {piece.title}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6,
        }}>
          <X size={14} />
        </button>
      </div>

      {/* ── スライダー ── */}
      <div style={{ padding: '14px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)', width: 52, flexShrink: 0 }}>
            期日変更
          </span>
          <input
            type="range" min={-90} max={90} value={deltaDays}
            onChange={e => handleChange(Number(e.target.value))}
            style={{ flex: 1, accentColor: color }}
          />
          <span style={{
            fontSize: 18, fontWeight: 800, color,
            width: 62, textAlign: 'right', flexShrink: 0,
            letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums',
          }}>
            {sign}{deltaDays}日
          </span>
        </div>

        {/* ショートカットボタン */}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          {[-14, -7, -3, 0, 3, 7, 14].map(d => (
            <button key={d} onClick={() => handleChange(d)} style={{
              padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)',
              background: deltaDays === d ? color : 'var(--bg)',
              color:      deltaDays === d ? '#fff' : 'var(--text-3)',
              fontSize: 10, fontWeight: 700, cursor: 'pointer',
              transition: 'background 0.15s',
            }}>
              {d === 0 ? '0' : `${d > 0 ? '+' : ''}${d}`}
            </button>
          ))}
        </div>
      </div>

      {/* ── 結果エリア ── */}
      {deltaDays !== 0 && (
        <div style={{ borderTop: '1px solid var(--border)', maxHeight: 220, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
              波及計算中…
            </div>
          ) : result && result.affected.length > 0 ? (
            <>
              {/* 合計インパクト */}
              <div style={{
                padding: '10px 16px',
                display: 'flex', alignItems: 'center', gap: 8,
                background: 'rgba(245,158,11,0.06)',
                borderBottom: '1px solid var(--border)',
              }}>
                {deltaDays > 0
                  ? <TrendingDown size={13} color="#B46400" />
                  : <TrendingUp size={13} color="var(--text-2)" />}
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)' }}>
                  {result.affected.length}件のピースが波及
                </span>
                {impactM > 0 && (
                  <span style={{
                    marginLeft: 'auto', fontSize: 11, fontWeight: 800,
                    color: deltaDays > 0 ? '#B46400' : 'var(--text-2)',
                  }}>
                    {deltaDays > 0 ? '-' : '+'}¥{impactM.toLocaleString()}万
                  </span>
                )}
              </div>

              {/* 影響ピース一覧 */}
              {result.affected.map((a, i) => (
                <div key={a.id} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px',
                  borderBottom: i < result.affected.length - 1 ? '1px solid var(--border-sub, #f0f0f0)' : undefined,
                }}>
                  <ChevronRight size={10} color={color} style={{ flexShrink: 0 }} />
                  <span style={{
                    fontSize: 11, color: 'var(--text-1)',
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {a.title}
                  </span>
                  {a.new_due_date && (
                    <span style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
                      → {new Date(a.new_due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
                    </span>
                  )}
                  <span style={{
                    fontSize: 10, fontWeight: 700, color,
                    flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                  }}>
                    {sign}{a.delta_days}日
                  </span>
                </div>
              ))}
            </>
          ) : result && result.affected.length === 0 ? (
            <div style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>
              波及するピースはありません
            </div>
          ) : null}
        </div>
      )}

      {/* ── フッター：適用ボタン ── */}
      <div style={{
        padding: '10px 16px',
        display: 'flex', gap: 8, justifyContent: 'flex-end',
        borderTop: '1px solid var(--border)',
      }}>
        {deltaDays !== 0 && result && result.affected.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 'auto', fontSize: 10, color: '#B46400' }}>
            <AlertTriangle size={11} />
            <span>実際の期日を変更します</span>
          </div>
        )}
        <button onClick={onClose} style={{
          padding: '5px 14px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--bg)',
          color: 'var(--text-2)', fontSize: 11, cursor: 'pointer',
        }}>
          キャンセル
        </button>
        <button
          onClick={handleApply}
          disabled={deltaDays === 0 || !result || applying}
          style={{
            padding: '5px 18px', borderRadius: 8, border: 'none',
            background: deltaDays !== 0 && result ? '#B46400' : 'var(--border)',
            color: deltaDays !== 0 && result ? '#fff' : 'var(--text-3)',
            fontSize: 11, fontWeight: 700, cursor: deltaDays !== 0 && result ? 'pointer' : 'not-allowed',
            transition: 'background 0.15s',
          }}
        >
          {applying ? '適用中…' : `${sign}${deltaDays}日で確定`}
        </button>
      </div>
    </div>
  );
}
