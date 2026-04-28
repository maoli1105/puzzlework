// ============================================================
// SprintPlannerPanel — スプリント計画パネル
// 優先度+依存関係順でピースを提示、担当割り当て、一括着手
// ============================================================

import React, { useMemo, useState } from 'react';
import { Piece, PieceStatus, Connection } from '../../types';
import { pieces as pieceApi, ai as aiApi } from '../../services/api';

interface Worker { id: string; name: string }
interface Props {
  open:        boolean;
  onClose:     () => void;
  pieces:      Piece[];
  connections: Connection[];
  workers:     Worker[];
  onUpdated:   () => void;
}

const STATUS_COLOR: Record<PieceStatus, string> = {
  locked: '#9CA3AF', ready: '#059669', in_progress: '#2563EB', done: '#8B5CF6',
};
const STATUS_LABEL: Record<PieceStatus, string> = {
  locked: 'ロック', ready: '着手可', in_progress: '進行中', done: '完了',
};

export default function SprintPlannerPanel({ open, onClose, pieces, connections, workers, onUpdated }: Props) {
  const [selected,  setSelected]  = useState<Set<string>>(new Set());
  const [sprintEnd, setSprintEnd] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [assignMap, setAssignMap] = useState<Record<string, string>>({});
  const [loading,   setLoading]   = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [toast,     setToast]     = useState('');

  // 候補ピース: locked/ready を 優先度→ビジネスインパクト降順
  const candidates = useMemo(() => {
    const depOrder: Record<string, number> = {};
    pieces.forEach(p => { depOrder[p.id] = 0; });
    const inDeg: Record<string, number> = {};
    pieces.forEach(p => { inDeg[p.id] = 0; });
    connections.forEach(c => { inDeg[c.to_piece_id] = (inDeg[c.to_piece_id] ?? 0) + 1; });
    const q = pieces.filter(p => inDeg[p.id] === 0).map(p => p.id);
    while (q.length) {
      const id = q.shift()!;
      for (const c of connections) {
        if (c.from_piece_id === id) {
          depOrder[c.to_piece_id] = Math.max(depOrder[c.to_piece_id] ?? 0, (depOrder[id] ?? 0) + 1);
          if (--inDeg[c.to_piece_id] === 0) q.push(c.to_piece_id);
        }
      }
    }
    return pieces
      .filter(p => p.status === 'ready' || p.status === 'locked')
      .sort((a, b) =>
        (depOrder[a.id] ?? 0) - (depOrder[b.id] ?? 0) ||
        b.priority - a.priority ||
        (b.business_impact ?? 0) - (a.business_impact ?? 0)
      );
  }, [pieces, connections]);

  // 担当者ごとの現在の作業数
  const workload = useMemo(() => {
    const w: Record<string, number> = {};
    for (const p of pieces) {
      if (p.status === 'in_progress' && p.assignee_id) {
        w[p.assignee_id] = (w[p.assignee_id] ?? 0) + 1;
      }
    }
    return w;
  }, [pieces]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(candidates.map(p => p.id)));
  }

  // 均等割り当て
  function autoAssign() {
    if (!workers.length) return;
    const sorted = [...workers].sort((a, b) => (workload[a.id] ?? 0) - (workload[b.id] ?? 0));
    const map: Record<string, string> = { ...assignMap };
    let i = 0;
    for (const id of selected) {
      map[id] = sorted[i % sorted.length].id;
      i++;
    }
    setAssignMap(map);
  }

  // AI割り当て
  async function aiAssign() {
    if (!selected.size || !workers.length) return;
    setAiLoading(true);
    try {
      const selectedPieces = candidates
        .filter(p => selected.has(p.id))
        .map(p => ({
          id: p.id,
          title: p.title,
          skill_tags: p.skill_tags,
          priority: p.priority,
        }));
      const workersPayload = workers.map(w => ({
        id: w.id,
        name: w.name,
        active_count: workload[w.id] ?? 0,
      }));
      const result = await aiApi.suggestSprint(selectedPieces, workersPayload);
      const map: Record<string, string> = { ...assignMap };
      for (const a of result.assignments) {
        if (a.piece_id && a.worker_id) map[a.piece_id] = a.worker_id;
      }
      setAssignMap(map);
      setToast(`AI提案完了（${result.source === 'ai' ? 'AI' : 'ルール'}ベース）`);
      setTimeout(() => setToast(''), 2500);
    } catch {
      setToast('AI提案に失敗しました');
      setTimeout(() => setToast(''), 2000);
    }
    setAiLoading(false);
  }

  async function startSprint() {
    if (!selected.size) return;
    setLoading(true);
    try {
      for (const id of selected) {
        await pieceApi.updateStatus(id, 'ready');
        if (assignMap[id]) await pieceApi.assign(id, assignMap[id]);
        if (sprintEnd)     await pieceApi.update(id, { due_date: sprintEnd });
      }
      onUpdated();
      setToast(`${selected.size} 件をスプリントに追加しました`);
      setTimeout(() => { setToast(''); onClose(); }, 1500);
    } catch { setToast('エラーが発生しました'); }
    setLoading(false);
  }

  const maxWorkload = Math.max(...workers.map(w => workload[w.id] ?? 0), 1);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{ position: 'fixed', inset: 0, zIndex: 98, background: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(2px)' }}
        />
      )}

      {/* Panel */}
      <div style={{
        position: 'fixed', right: open ? 0 : -440,
        top: 0, bottom: 0, width: 420,
        background: 'var(--surface)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.14)',
        transition: 'right 0.3s cubic-bezier(0.4,0,0.2,1)',
        zIndex: 99, display: 'flex', flexDirection: 'column',
        fontFamily: '"Inter","Outfit",sans-serif',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 18px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
              スプリントプランナー
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
              依存順・優先度順に候補を提示します
            </div>
          </div>
          <button onClick={onClose} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: 'var(--text-3)', lineHeight: 1 }}>×</button>
        </div>

        {/* Sprint end date */}
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>期限</span>
          <input type="date" value={sprintEnd} onChange={e => setSprintEnd(e.target.value)}
            style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, background: 'var(--bg)', color: 'var(--text-1)', outline: 'none' }} />
          <button onClick={selectAll} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 10, background: 'transparent', color: 'var(--text-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            全選択
          </button>
          <button onClick={autoAssign} disabled={!selected.size || !workers.length}
            style={{ padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 10, background: selected.size ? 'var(--accent)' : 'var(--border)', color: selected.size ? '#fff' : 'var(--text-3)', cursor: selected.size ? 'pointer' : 'default', whiteSpace: 'nowrap' }}>
            均等割当
          </button>
          <button onClick={aiAssign} disabled={!selected.size || !workers.length || aiLoading}
            style={{
              padding: '5px 10px', borderRadius: 6, border: 'none', fontSize: 10,
              background: selected.size && !aiLoading ? '#7C3AED' : 'var(--border)',
              color: selected.size && !aiLoading ? '#fff' : 'var(--text-3)',
              cursor: selected.size && !aiLoading ? 'pointer' : 'default', whiteSpace: 'nowrap',
            }}>
            {aiLoading ? '...' : '✦ AI'}
          </button>
        </div>

        {/* Workload bars */}
        {workers.length > 0 && (
          <div style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 7 }}>
              現在の作業負荷
            </div>
            {workers.map(w => {
              const count = workload[w.id] ?? 0;
              const pct   = count / maxWorkload * 100;
              return (
                <div key={w.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-2)', width: 80, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: pct > 70 ? '#EF4444' : pct > 40 ? '#F59E0B' : '#10B981', transition: 'width 0.3s' }} />
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-3)', width: 24, textAlign: 'right' }}>{count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Candidate list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {candidates.length === 0 ? (
            <div style={{ padding: '40px 18px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
              候補ピースがありません
            </div>
          ) : candidates.map((piece, i) => {
            const isSel = selected.has(piece.id);
            const assigned = assignMap[piece.id];
            const worker   = assigned ? workers.find(w => w.id === assigned) : null;
            return (
              <div
                key={piece.id}
                onClick={() => toggle(piece.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '9px 18px',
                  background: isSel ? 'var(--accent-sub)' : 'transparent',
                  borderLeft: isSel ? '3px solid var(--accent)' : '3px solid transparent',
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                }}>
                {/* Order number */}
                <span style={{ width: 18, fontSize: 9, fontWeight: 700, color: 'var(--text-3)', flexShrink: 0, textAlign: 'center' }}>{i + 1}</span>

                {/* Checkbox */}
                <div style={{
                  width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                  border: `2px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`,
                  background: isSel ? 'var(--accent)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSel && <span style={{ color: '#fff', fontSize: 10, lineHeight: 1 }}>✓</span>}
                </div>

                {/* Status dot */}
                <span style={{ width: 7, height: 7, borderRadius: 2, background: STATUS_COLOR[piece.status], flexShrink: 0 }} />

                {/* Title */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {piece.title}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-3)', display: 'flex', gap: 5, marginTop: 2 }}>
                    <span>{STATUS_LABEL[piece.status]}</span>
                    {piece.priority > 0 && <span>P{piece.priority}</span>}
                    {(piece.business_impact ?? 0) > 0 && <span>¥{(piece.business_impact ?? 0).toLocaleString()}</span>}
                  </div>
                </div>

                {/* Assignee selector (only when selected) */}
                {isSel && (
                  <select
                    value={assignMap[piece.id] ?? ''}
                    onChange={e => { e.stopPropagation(); setAssignMap(m => ({ ...m, [piece.id]: e.target.value })); }}
                    onClick={e => e.stopPropagation()}
                    style={{ fontSize: 10, padding: '3px 5px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-1)', maxWidth: 90, outline: 'none' }}>
                    <option value="">担当者</option>
                    {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}

                {/* Worker avatar (when assigned) */}
                {!isSel && worker && (
                  <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7.5, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                    {worker.name.slice(0,2).toUpperCase()}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
          {toast && (
            <div style={{ marginBottom: 8, padding: '6px 10px', background: 'var(--accent-sub)', borderRadius: 6, fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>
              {toast}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
              {selected.size} 件選択中
            </span>
            <button
              onClick={startSprint}
              disabled={!selected.size || loading}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                background: selected.size && !loading ? 'var(--accent)' : 'var(--border)',
                color: selected.size && !loading ? '#fff' : 'var(--text-3)',
                cursor: selected.size && !loading ? 'pointer' : 'default',
                fontWeight: 700, fontSize: 13,
                transition: 'background 0.15s',
              }}>
              {loading ? '処理中...' : '🚀 スプリント開始'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
