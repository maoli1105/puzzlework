/**
 * PhysicsPage — 仕事の物理シミュレーター
 * ────────────────────────────────────────────────────────────
 * 「もしこのピースが N 日ずれたら？」を即座に可視化する。
 *
 * 操作フロー:
 *   1. ピースを選ぶ（検索で絞れる）
 *   2. スライダーでΔ日数を設定（−30〜+30）
 *   3. 右パネルに波及ピースと新しい日程が表示される
 *   4. 「変更を適用」で実際に全ピースの due_date が更新される
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { pieces as pieceApi } from '../../services/api';
import { Activity, Search, AlertTriangle, CheckCircle, ChevronRight, Zap } from 'lucide-react';

// ─── 型 ─────────────────────────────────────────────────────────────────────
interface PieceSummary {
  id:              string;
  title:           string;
  status:          string;
  due_date:        string | null;
  project_name:    string | null;
  business_impact: number;
  assignee_name:   string | null;
}

interface CascadeResult {
  root_id:      string;
  delta_days:   number;
  affected:     {
    id:            string;
    title:         string;
    delta_days:    number;
    new_due_date:  string | null;
    business_impact: number;
  }[];
  total_impact: number;
}

// ─── 日付フォーマット ──────────────────────────────────────────────────────
function fmt(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
}

function shiftDate(d: string | null, delta: number) {
  if (!d) return null;
  const dt = new Date(d);
  dt.setDate(dt.getDate() + delta);
  return dt.toISOString().slice(0, 10);
}

// ─── PhysicsPage ─────────────────────────────────────────────────────────────
export default function PhysicsPage() {
  const [allPieces, setAllPieces]   = useState<PieceSummary[]>([]);
  const [loading, setLoading]       = useState(true);
  const [query, setQuery]           = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [delta, setDelta]           = useState(0);
  const [cascade, setCascade]       = useState<CascadeResult | null>(null);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [applying, setApplying]     = useState(false);
  const [applied, setApplied]       = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 全ピース取得（done以外）
  useEffect(() => {
    setLoading(true);
    pieceApi.list({ limit: '500' })
      .then((res: { items?: PieceSummary[]; pieces?: PieceSummary[] } | PieceSummary[]) => {
        const arr = Array.isArray(res) ? res : ((res as { items?: PieceSummary[] }).items ?? []);
        setAllPieces(arr.filter((p: PieceSummary) => p.status !== 'done'));
      })
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(() => allPieces.find(p => p.id === selectedId) ?? null, [allPieces, selectedId]);

  // カスケード計算（デバウンス 300ms）
  useEffect(() => {
    if (!selectedId || delta === 0) { setCascade(null); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setCascadeLoading(true);
      try {
        const result = await pieceApi.cascadeImpact(selectedId, delta);
        setCascade(result);
      } finally { setCascadeLoading(false); }
    }, 300);
  }, [selectedId, delta]);

  async function handleApply() {
    if (!selectedId || delta === 0) return;
    if (!window.confirm(`「${selected?.title}」を含む ${(cascade?.affected.length ?? 0) + 1} 件の期日を ${delta > 0 ? '+' : ''}${delta}日ずらします。よろしいですか？`)) return;
    setApplying(true);
    try {
      await pieceApi.cascadeApply(selectedId, delta);
      setApplied(true);
      // 反映後はリセット
      setTimeout(() => {
        setApplied(false);
        setDelta(0);
        setCascade(null);
        // ピース一覧を再取得
        pieceApi.list({ limit: '500' }).then((res: { items?: PieceSummary[] } | PieceSummary[]) => {
          const arr = Array.isArray(res) ? res : ((res as { items?: PieceSummary[] }).items ?? []);
          setAllPieces((arr as PieceSummary[]).filter((p: PieceSummary) => p.status !== 'done'));
        });
      }, 2000);
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '適用に失敗しました');
    } finally { setApplying(false); }
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return allPieces;
    const q = query.toLowerCase();
    return allPieces.filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.project_name ?? '').toLowerCase().includes(q)
    );
  }, [allPieces, query]);

  const hasEffect = delta !== 0 && !!selectedId;
  const totalAffected = (cascade?.affected.length ?? 0) + (hasEffect ? 1 : 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ─── ヘッダー ─── */}
      <div style={{
        height: 48, padding: '0 20px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <Activity size={14} style={{ color: '#B46400' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
          仕事の物理シミュレーター
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
          依存ピースへの波及を確認してから日程を変更する
        </span>
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 11 }}>
          読み込み中…
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

          {/* ─── 左: ピース選択 + スライダー ─── */}
          <div style={{
            width: 300, flexShrink: 0,
            borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
          }}>
            {/* 検索 */}
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)', padding: '5px 8px',
              }}>
                <Search size={11} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                <input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="ピースを検索…"
                  style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 11, color: 'var(--text-1)', width: '100%' }}
                />
              </div>
            </div>

            {/* ピース一覧 */}
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 6px' }}>
              {filtered.map(p => {
                const isSelected = p.id === selectedId;
                return (
                  <div
                    key={p.id}
                    onClick={() => { setSelectedId(p.id); setDelta(0); setCascade(null); setApplied(false); }}
                    style={{
                      padding: '8px 10px', borderRadius: 6,
                      cursor: 'pointer', marginBottom: 2,
                      background: isSelected ? 'rgba(180,100,0,0.06)' : 'transparent',
                      border: `1px solid ${isSelected ? 'rgba(180,100,0,0.25)' : 'transparent'}`,
                      transition: 'all 0.1s',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: isSelected ? 600 : 400, color: 'var(--text-1)', lineHeight: 1.3, marginBottom: 2 }}>
                      {p.title}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {p.due_date && (
                        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>
                          期限 {fmt(p.due_date)}
                        </span>
                      )}
                      {p.project_name && (
                        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{p.project_name}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Δ日数スライダー */}
            {selectedId && (
              <div style={{
                padding: '16px 16px 20px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface)',
                flexShrink: 0,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
                  日程ずらし
                </div>

                {/* 値表示 */}
                <div style={{ textAlign: 'center', marginBottom: 10 }}>
                  <span style={{
                    fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em',
                    color: delta === 0 ? 'var(--text-3)' : delta > 0 ? '#E60012' : '#16a34a',
                  }}>
                    {delta === 0 ? '±0' : delta > 0 ? `+${delta}` : `${delta}`}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 4 }}>日</span>
                </div>

                {/* スライダー */}
                <input
                  type="range"
                  min={-30} max={30} step={1}
                  value={delta}
                  onChange={e => { setDelta(parseInt(e.target.value)); setApplied(false); }}
                  style={{ width: '100%', accentColor: delta > 0 ? '#E60012' : delta < 0 ? '#16a34a' : '#888' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-4, var(--text-3))', marginTop: 2 }}>
                  <span>−30日</span>
                  <span>0</span>
                  <span>+30日</span>
                </div>

                {/* クイック選択 */}
                <div style={{ display: 'flex', gap: 4, marginTop: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {[-14, -7, 0, +7, +14].map(d => (
                    <button
                      key={d}
                      onClick={() => { setDelta(d); setApplied(false); }}
                      style={{
                        padding: '3px 8px', fontSize: 10, fontWeight: 600,
                        borderRadius: 'var(--r-sm)', cursor: 'pointer',
                        background: delta === d ? (d > 0 ? '#E60012' : d < 0 ? '#16a34a' : 'var(--text-2)') : 'var(--surface-sub)',
                        color: delta === d ? '#fff' : 'var(--text-2)',
                        border: `1px solid ${delta === d ? 'transparent' : 'var(--border)'}`,
                        transition: 'all 0.1s',
                      }}
                    >
                      {d === 0 ? '±0' : d > 0 ? `+${d}` : `${d}`}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ─── 右: カスケード結果 ─── */}
          <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
            {!selectedId ? (
              <div style={{
                height: '100%', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 12, color: 'var(--text-3)',
              }}>
                <Activity size={32} style={{ opacity: 0.2 }} />
                <div style={{ fontSize: 13, color: 'var(--text-2)' }}>ピースを選んでください</div>
                <div style={{ fontSize: 11 }}>左のリストからシミュレーション対象を選択し、スライダーで日数を変えると波及ピースが表示されます</div>
              </div>
            ) : (
              <div style={{ maxWidth: 600 }}>

                {/* 選択中ピース */}
                <div style={{
                  padding: '14px 16px',
                  background: 'var(--surface)',
                  border: '1px solid rgba(180,100,0,0.3)',
                  borderRadius: 'var(--r-lg)',
                  marginBottom: 20,
                }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#B46400', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                    起点ピース
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>
                    {selected?.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>
                      現在の期限:
                      <span style={{ color: 'var(--text-1)', fontWeight: 600, marginLeft: 4 }}>
                        {fmt(selected?.due_date ?? null)}
                      </span>
                    </div>
                    {delta !== 0 && selected?.due_date && (
                      <>
                        <ChevronRight size={12} style={{ color: 'var(--text-3)' }} />
                        <div style={{ fontSize: 11, fontWeight: 700, color: delta > 0 ? '#E60012' : '#16a34a' }}>
                          {fmt(shiftDate(selected.due_date, delta))}
                          <span style={{ fontSize: 9, marginLeft: 4, fontWeight: 400 }}>
                            ({delta > 0 ? '+' : ''}{delta}日)
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* delta = 0 のとき */}
                {delta === 0 && (
                  <div style={{ padding: '28px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>
                    スライダーで日数を変えると波及ピースが表示されます
                  </div>
                )}

                {/* ローディング */}
                {delta !== 0 && cascadeLoading && (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>
                    計算中…
                  </div>
                )}

                {/* カスケード結果 */}
                {delta !== 0 && !cascadeLoading && cascade && (
                  <>
                    {/* サマリー */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                      gap: 8, marginBottom: 20,
                    }}>
                      {[
                        { label: '波及ピース', value: `${cascade.affected.length}件`, color: cascade.affected.length > 0 ? '#E60012' : 'var(--text-2)' },
                        { label: '影響ビジネス価値', value: cascade.total_impact > 0 ? `¥${cascade.total_impact.toLocaleString()}` : '—', color: cascade.total_impact > 0 ? '#B46400' : 'var(--text-2)' },
                        { label: 'Δ日数', value: `${delta > 0 ? '+' : ''}${delta}日`, color: delta > 0 ? '#E60012' : '#16a34a' },
                      ].map(({ label, value, color }) => (
                        <div key={label} style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--r-lg)',
                          padding: '10px 14px',
                        }}>
                          <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                          <div style={{ fontSize: 20, fontWeight: 800, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
                        </div>
                      ))}
                    </div>

                    {/* 波及ピース一覧 */}
                    {cascade.affected.length === 0 ? (
                      <div style={{
                        padding: '20px', textAlign: 'center',
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)',
                        color: 'var(--text-3)', fontSize: 11,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}>
                        <CheckCircle size={14} style={{ color: '#16a34a' }} />
                        波及ピースなし — このピースだけが影響を受けます
                      </div>
                    ) : (
                      <>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AlertTriangle size={11} style={{ color: '#E60012' }} />
                          波及する {cascade.affected.length}件
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
                          {cascade.affected.map(a => (
                            <div key={a.id} style={{
                              display: 'flex', alignItems: 'center', gap: 10,
                              padding: '9px 14px',
                              background: 'var(--surface)', border: '1px solid var(--border)',
                              borderRadius: 'var(--r-sm)',
                            }}>
                              <div style={{ flex: 1, fontSize: 11, color: 'var(--text-1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {a.title}
                              </div>
                              {a.business_impact > 0 && (
                                <span style={{ fontSize: 9, color: '#B46400', fontWeight: 700, flexShrink: 0 }}>
                                  ¥{a.business_impact.toLocaleString()}
                                </span>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                                <span style={{ fontSize: 9, color: 'var(--text-3)' }}>
                                  → {fmt(a.new_due_date)}
                                </span>
                                <span style={{ fontSize: 8, fontWeight: 700, color: a.delta_days > 0 ? '#E60012' : '#16a34a' }}>
                                  {a.delta_days > 0 ? '+' : ''}{a.delta_days}日
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* 適用ボタン */}
                    {applied ? (
                      <div style={{
                        padding: '14px 18px',
                        background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.25)',
                        borderRadius: 'var(--r-lg)',
                        display: 'flex', alignItems: 'center', gap: 8,
                        fontSize: 12, fontWeight: 600, color: '#16a34a',
                      }}>
                        <CheckCircle size={16} /> {totalAffected}件の期日を更新しました
                      </div>
                    ) : (
                      <button
                        onClick={handleApply}
                        disabled={applying}
                        style={{
                          width: '100%', padding: '12px',
                          fontSize: 13, fontWeight: 700,
                          background: applying ? 'var(--border)' : 'var(--text-1)',
                          color: applying ? 'var(--text-3)' : 'var(--bg)',
                          border: 'none', borderRadius: 'var(--r-lg)',
                          cursor: applying ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                          transition: 'background 0.15s',
                        }}
                      >
                        <Zap size={14} />
                        {applying ? '適用中…' : `${totalAffected}件の期日を一括変更する`}
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
