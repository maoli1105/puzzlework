import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Lock, Zap, CheckCircle2, CircleCheck } from 'lucide-react';

interface SharedPiece {
  id: string;
  title: string;
  objective: string;
  status: string;
  priority: number;
  due_date: string | null;
  progress: number;
  business_impact: number;
  skill_tags: string[];
  project_id: string | null;
  assignee_name: string | null;
  project_name: string | null;
  project_color: string | null;
}

interface ShareData {
  company_name: string;
  label: string;
  pieces: SharedPiece[];
  projects: { id: string; name: string; color: string; status: string }[];
  generated_at: string;
}

const STATUS_INFO: Record<string, { label: string; color: string; Icon: React.ElementType }> = {
  locked:      { label: 'ロック中',   color: '#A8A8A4', Icon: Lock },
  ready:       { label: '着手可能',   color: '#4A9B6F', Icon: CheckCircle2 },
  in_progress: { label: '進行中',     color: '#1A56DB', Icon: Zap },
  done:        { label: '完了',       color: '#8C8C88', Icon: CircleCheck },
};

export default function ShareViewPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterProject, setFilterProject] = useState('');

  useEffect(() => {
    axios.get(`/api/share/${token}`)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.error ?? '読み込みに失敗しました'));
  }, [token]);

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F8F7' }}>
      <div style={{ textAlign: 'center', color: '#6B6B68' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: '#111110', marginBottom: 6 }}>リンクが無効です</div>
        <div style={{ fontSize: 13 }}>{error}</div>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8F8F7' }}>
      <div style={{ fontSize: 13, color: '#A8A8A4' }}>読み込み中...</div>
    </div>
  );

  const filtered = data.pieces.filter(p => {
    if (filterStatus && p.status !== filterStatus) return false;
    if (filterProject && p.project_id !== filterProject) return false;
    return true;
  });

  const statusCounts = Object.keys(STATUS_INFO).reduce((acc, s) => {
    acc[s] = data.pieces.filter(p => p.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const doneRate = data.pieces.length > 0
    ? Math.round((statusCounts.done / data.pieces.length) * 100)
    : 0;

  return (
    <div style={{ minHeight: '100vh', background: '#F8F8F7', fontFamily: '-apple-system, "Inter", sans-serif', color: '#111110' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E4E4E0', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 11, color: '#A8A8A4', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>
            PuzzleWork — 読み取り専用
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>{data.company_name}</div>
          {data.label && <div style={{ fontSize: 12, color: '#6B6B68', marginTop: 2 }}>{data.label}</div>}
        </div>
        <div style={{ fontSize: 10, color: '#A8A8A4' }}>
          {new Date(data.generated_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 時点
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 24 }}>
          <KpiCard label="全ピース" value={data.pieces.length} />
          <KpiCard label="完了率" value={`${doneRate}%`} />
          {Object.entries(STATUS_INFO).map(([s, info]) => (
            <KpiCard key={s} label={info.label} value={statusCounts[s]} color={info.color} />
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            style={selectSt}
          >
            <option value="">全ステータス</option>
            {Object.entries(STATUS_INFO).map(([s, info]) => (
              <option key={s} value={s}>{info.label}</option>
            ))}
          </select>
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            style={selectSt}
          >
            <option value="">全プロジェクト</option>
            {data.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span style={{ fontSize: 11, color: '#A8A8A4', alignSelf: 'center', marginLeft: 'auto' }}>
            {filtered.length} / {data.pieces.length} 件
          </span>
        </div>

        {/* Kanban columns */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {Object.entries(STATUS_INFO).map(([status, info]) => {
            const ColIcon = info.Icon;
            const colPieces = filtered.filter(p => p.status === status);
            return (
              <div key={status} style={{ background: '#fff', border: '1px solid #E4E4E0', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '10px 12px', borderBottom: '1px solid #F4F4F2', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ColIcon size={12} color={info.color} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#111110' }}>{info.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 600, color: info.color, background: `${info.color}18`, borderRadius: 4, padding: '1px 7px' }}>
                    {colPieces.length}
                  </span>
                </div>
                <div style={{ padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 600, overflowY: 'auto' }}>
                  {colPieces.map(p => (
                    <PieceCard key={p.id} piece={p} />
                  ))}
                  {colPieces.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '24px 0', fontSize: 11, color: '#A8A8A4' }}>なし</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #E4E4E0', borderRadius: 6, padding: '10px 14px' }}>
      <div style={{ fontSize: 10, color: '#A8A8A4', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: color ?? '#111110' }}>{value}</div>
    </div>
  );
}

function PieceCard({ piece }: { piece: SharedPiece }) {
  const isOverdue = piece.due_date && new Date(piece.due_date) < new Date() && piece.status !== 'done';
  return (
    <div style={{
      background: '#F8F8F7', border: `1px solid ${isOverdue ? '#FECACA' : '#E4E4E0'}`,
      borderRadius: 5, padding: '8px 10px',
    }}>
      {piece.project_name && (
        <div style={{ fontSize: 9, fontWeight: 600, color: piece.project_color ?? '#6B6B68', marginBottom: 4, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          {piece.project_name}
        </div>
      )}
      <div style={{ fontSize: 11, fontWeight: 500, color: '#111110', lineHeight: 1.4, marginBottom: 5 }}>{piece.title}</div>
      {piece.progress > 0 && (
        <div style={{ marginBottom: 5 }}>
          <div style={{ background: '#E4E4E0', borderRadius: 99, height: 3 }}>
            <div style={{ background: '#1A56DB', borderRadius: 99, height: '100%', width: `${piece.progress}%` }} />
          </div>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        {piece.assignee_name ? (
          <span style={{ fontSize: 10, color: '#6B6B68' }}>{piece.assignee_name}</span>
        ) : (
          <span style={{ fontSize: 10, color: '#A8A8A4' }}>未割当</span>
        )}
        {piece.due_date && (
          <span style={{ fontSize: 10, color: isOverdue ? '#DC2626' : '#A8A8A4' }}>
            {new Date(piece.due_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}
            {isOverdue && ' 超過'}
          </span>
        )}
      </div>
    </div>
  );
}

const selectSt: React.CSSProperties = {
  border: '1px solid #E4E4E0', borderRadius: 5, padding: '5px 10px',
  fontSize: 11, background: '#fff', color: '#6B6B68', cursor: 'pointer', outline: 'none',
};
