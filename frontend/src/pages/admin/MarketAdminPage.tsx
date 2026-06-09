/**
 * MarketAdminPage — マーケットプレイス出品管理
 * ────────────────────────────────────────────────────────────
 * 管理者が自社ピースの出品・取り消しを管理する画面。
 *
 * 左: 出品中（is_external=true）— 取り消しボタン付き
 * 右: 出品可能（status=ready, is_external=false）— 出品ボタン付き
 */

import { useEffect, useState } from 'react';
import { Store, X, CheckCircle, Clock } from 'lucide-react';
import { pieces as pieceApi } from '../../services/api';
import api from '../../services/api';

interface ListedPiece {
  id:              string;
  title:           string;
  status:          string;
  reward:          number;
  skill_tags:      string[] | null;
  business_impact: number;
  due_date:        string | null;
  assignee_name:   string | null;
  project_name:    string | null;
  accept_count:    number;
}

interface PublishablePiece {
  id:              string;
  title:           string;
  reward:          number;
  skill_tags:      string[] | null;
  business_impact: number;
  assignee_name:   string | null;
  project_name:    string | null;
}

export default function MarketAdminPage() {
  const [listed,      setListed]      = useState<ListedPiece[]>([]);
  const [publishable, setPublishable] = useState<PublishablePiece[]>([]);
  const [loading,     setLoading]     = useState(true);

  // 報酬入力フォーム (pieceId → reward 文字列)
  const [rewards, setRewards] = useState<Record<string, string>>({});
  const [acting,  setActing]  = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [listedRes, pubRes] = await Promise.all([
        api.get('/marketplace/mine'),
        api.get('/marketplace/publishable'),
      ]);
      setListed(listedRes.data);
      setPublishable(pubRes.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handlePublish(id: string) {
    if (acting) return;
    setActing(id);
    try {
      const reward = parseFloat(rewards[id] || '0') || 0;
      await pieceApi.publish(id, reward);
      await load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '出品に失敗しました');
    } finally { setActing(null); }
  }

  async function handleUnpublish(id: string) {
    if (acting) return;
    setActing(id);
    try {
      await pieceApi.unpublish(id);
      await load();
    } catch (e: unknown) {
      alert((e as { response?: { data?: { error?: string } } }).response?.data?.error ?? '取り消しに失敗しました');
    } finally { setActing(null); }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ヘッダー */}
      <div style={{
        height: 48, padding: '0 20px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
      }}>
        <Store size={14} style={{ color: 'var(--text-3)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>
          マーケット出品管理
        </span>
        {!loading && (
          <span style={{ fontSize: 10, color: 'var(--text-3)' }}>
            出品中 {listed.length}件
          </span>
        )}
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>読み込み中…</span>
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

          {/* ── 左: 出品中 ── */}
          <div style={{ borderRight: '1px solid var(--border)', padding: '20px 24px', overflow: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle size={11} style={{ color: '#16a34a' }} />
              出品中 — {listed.length}件
            </div>

            {listed.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>
                出品中のピースはありません
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {listed.map(p => (
                  <div key={p.id} style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)',
                    padding: '10px 14px',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    {/* タイトル行 */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.3 }}>
                        {p.title}
                      </div>
                      {p.accept_count > 0 && (
                        <span style={{ flexShrink: 0, fontSize: 9, fontWeight: 700, background: 'rgba(180,100,0,0.10)', color: '#B46400', border: '1px solid rgba(180,100,0,0.25)', borderRadius: 99, padding: '1px 7px' }}>
                          受注 {p.accept_count}件
                        </span>
                      )}
                    </div>

                    {/* メタ */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {p.reward > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-1)' }}>
                          ¥{p.reward.toLocaleString()}
                        </span>
                      )}
                      {p.project_name && (
                        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{p.project_name}</span>
                      )}
                      {(p.skill_tags ?? []).slice(0, 2).map(tag => (
                        <span key={tag} style={{ fontSize: 8, padding: '1px 6px', background: 'var(--surface-sub)', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 99 }}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* 受注状況 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                      <span style={{
                        fontSize: 9, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 99,
                        background: p.status === 'in_progress' ? 'rgba(180,100,0,0.08)' : 'var(--surface-sub)',
                        color: p.status === 'in_progress' ? '#B46400' : 'var(--text-3)',
                        border: `1px solid ${p.status === 'in_progress' ? 'rgba(180,100,0,0.25)' : 'var(--border)'}`,
                      }}>
                        {p.status === 'in_progress' ? '受注済み・作業中' : '受注待ち'}
                      </span>
                      <button
                        onClick={() => handleUnpublish(p.id)}
                        disabled={acting === p.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 3,
                          padding: '3px 10px', fontSize: 10, fontWeight: 600,
                          background: 'rgba(230,0,18,0.04)', color: '#E60012',
                          border: '1px solid rgba(230,0,18,0.20)', borderRadius: 'var(--r-sm)',
                          cursor: acting === p.id ? 'not-allowed' : 'pointer',
                          opacity: acting === p.id ? 0.5 : 1,
                        }}
                      >
                        <X size={9} />
                        {acting === p.id ? '…' : '取り消す'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── 右: 出品可能 ── */}
          <div style={{ padding: '20px 24px', overflow: 'auto' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clock size={11} style={{ color: 'var(--text-3)' }} />
              出品可能（Ready）— {publishable.length}件
            </div>

            {publishable.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 11 }}>
                <div style={{ marginBottom: 6 }}>Ready 状態のピースがありません</div>
                <div style={{ fontSize: 10 }}>ステータスを Ready にすると出品できます</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {publishable.map(p => (
                  <div key={p.id} style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r-lg)',
                    padding: '10px 14px',
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}>
                    {/* タイトル */}
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)', lineHeight: 1.3 }}>
                      {p.title}
                    </div>

                    {/* メタ */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
                      {p.project_name && (
                        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{p.project_name}</span>
                      )}
                      {p.assignee_name && (
                        <span style={{ fontSize: 9, color: 'var(--text-3)' }}>{p.assignee_name}</span>
                      )}
                      {(p.skill_tags ?? []).slice(0, 2).map(tag => (
                        <span key={tag} style={{ fontSize: 8, padding: '1px 6px', background: 'var(--surface-sub)', color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 99 }}>
                          {tag}
                        </span>
                      ))}
                    </div>

                    {/* 報酬入力 + 出品ボタン */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="number"
                        placeholder="報酬額（任意）"
                        value={rewards[p.id] ?? ''}
                        onChange={e => setRewards(prev => ({ ...prev, [p.id]: e.target.value }))}
                        style={{
                          flex: 1, padding: '4px 8px', fontSize: 11,
                          background: 'var(--bg)', border: '1px solid var(--border)',
                          borderRadius: 'var(--r-sm)', color: 'var(--text-1)', outline: 'none',
                          minWidth: 0,
                        }}
                      />
                      <button
                        onClick={() => handlePublish(p.id)}
                        disabled={acting === p.id}
                        style={{
                          flexShrink: 0,
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '4px 12px', fontSize: 10, fontWeight: 700,
                          background: 'var(--text-1)', color: 'var(--bg)',
                          border: 'none', borderRadius: 'var(--r-sm)',
                          cursor: acting === p.id ? 'not-allowed' : 'pointer',
                          opacity: acting === p.id ? 0.5 : 1,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Store size={10} />
                        {acting === p.id ? '…' : '出品する'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
