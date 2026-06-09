// ============================================================
// SinglePieceUI — ワーカー向けピース詳細
// 「今やるべき1つのピース」を丁寧に表示する
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Piece, WSEvent } from '../../types';
import { pieces as pieceApi } from '../../services/api';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useAuthStore } from '../../store/authStore';
import {
  ArrowLeft, Lock, Play, CheckCircle2, ChevronRight,
  Clock, Tag, Building2, Calendar, MessageSquare, ChevronDown,
} from 'lucide-react';

// ── ユーティリティ ─────────────────────────────────────────────────────────
function fmtDate(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const diff = Math.ceil((d.getTime() - Date.now()) / 86400000);
  const label = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric' }).format(d);
  const urgency = diff < 0 ? 'overdue' : diff <= 3 ? 'soon' : 'ok';
  return { label, diff, urgency };
}

type DepPiece = { id: string; title: string; status: string; assignee_name: string | null };

// ── ステータスバッジ ───────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string; dot?: boolean }> = {
    locked:      { label: 'ロック中',  color: '#888',    bg: '#F4F4F2' },
    ready:       { label: '着手可能',  color: '#2E7D4F', bg: '#F0FBF4', dot: true },
    in_progress: { label: '進行中',    color: '#B46400', bg: 'rgba(180,100,0,0.08)', dot: true },
    done:        { label: '完了',      color: '#888',    bg: '#F4F4F2' },
  };
  const s = map[status] ?? map.locked;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 12px', borderRadius: 99,
      background: s.bg, color: s.color,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
    }}>
      {s.dot && (
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: s.color,
          animation: status === 'in_progress' ? 'piece-pulse 2s infinite' : 'none',
        }} />
      )}
      {s.label}
    </span>
  );
}

// ── 上流（ロック原因）カード ──────────────────────────────────────────────
function UpstreamCard({ pieces }: { pieces: DepPiece[] }) {
  const blocking = pieces.filter(p => p.status !== 'done');
  if (blocking.length === 0) return null;
  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10,
      background: 'rgba(100,100,100,0.05)',
      border: '1px solid rgba(100,100,100,0.15)',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Lock size={12} color="#888" />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: '0.03em' }}>
          以下が完了するまで着手できません
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {blocking.map(p => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 7,
            background: 'var(--surface)', border: '1px solid var(--border)',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: p.status === 'in_progress' ? '#B46400' : '#CCC',
            }} />
            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>
              {p.title}
            </span>
            {p.assignee_name && (
              <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{p.assignee_name}</span>
            )}
            <span style={{
              fontSize: 9, padding: '2px 7px', borderRadius: 10, fontWeight: 700,
              background: p.status === 'in_progress' ? 'rgba(180,100,0,0.1)' : 'var(--surface-sub)',
              color: p.status === 'in_progress' ? '#B46400' : '#AAA',
            }}>
              {p.status === 'in_progress' ? '進行中' : '未着手'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 下流（完了後に動くピース）カード ─────────────────────────────────────
function DownstreamCard({ pieces }: { pieces: DepPiece[] }) {
  if (pieces.length === 0) return null;
  return (
    <div style={{
      padding: '12px 16px', borderRadius: 10,
      background: 'rgba(45,164,78,0.05)',
      border: '1px solid rgba(45,164,78,0.15)',
      marginBottom: 20,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <ChevronRight size={12} color="#2DA44E" />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#2DA44E', letterSpacing: '0.03em' }}>
          完了すると次が動き出します
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {pieces.map(p => (
          <div key={p.id} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px', borderRadius: 7,
            background: 'var(--surface)', border: '1px solid var(--border)',
          }}>
            <span style={{ flex: 1, fontSize: 12, color: 'var(--text-2)' }}>{p.title}</span>
            {p.assignee_name && (
              <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{p.assignee_name}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 進捗スライダー ────────────────────────────────────────────────────────
function ProgressSlider({ pieceId, initial }: { pieceId: string; initial: number }) {
  const [val, setVal] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function handleChange(v: number) {
    setVal(v);
    setSaving(true);
    try {
      await pieceApi.update(pieceId, { progress: v });
    } catch { /* ignore */ }
    finally { setSaving(false); }
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
          進捗
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#B46400' }}>
          {val}%{saving && <span style={{ fontSize: 10, color: 'var(--text-4)', marginLeft: 4 }}>保存中…</span>}
        </span>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'var(--border)', borderRadius: 3 }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${val}%`, background: '#B46400', borderRadius: 3, transition: 'width 0.2s' }} />
      </div>
      <input
        type="range" min={0} max={100} step={5} value={val}
        onChange={e => handleChange(Number(e.target.value))}
        style={{ width: '100%', marginTop: 6, accentColor: '#B46400', cursor: 'pointer' }}
      />
    </div>
  );
}

// ── コメント欄（折りたたみ）──────────────────────────────────────────────
function CommentsSection({ pieceId }: { pieceId: string }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<{ id: string; content: string; user_name: string; created_at: string }[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const { user } = useAuthStore();

  async function load() {
    try {
      const data = await pieceApi.getComments(pieceId);
      setComments(data ?? []);
    } catch { /* ignore */ }
  }

  useEffect(() => { if (open) load(); }, [open]);

  async function submit() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await pieceApi.addComment(pieceId, text.trim());
      setText('');
      await load();
    } catch { /* ignore */ }
    finally { setSending(false); }
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 8px', width: '100%', textAlign: 'left' }}
      >
        <MessageSquare size={13} color="var(--text-3)" />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
          コメント{comments.length > 0 && ` (${comments.length})`}
        </span>
        <ChevronDown size={11} color="var(--text-4)" style={{ marginLeft: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: '0.15s' }} />
      </button>

      {open && (
        <div>
          {comments.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--text-4)', padding: '8px 0 12px' }}>まだコメントはありません</div>
          )}
          {comments.map(c => (
            <div key={c.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-sub)' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-1)' }}>{c.user_name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-4)' }}>{new Date(c.created_at).toLocaleDateString('ja-JP')}</span>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5 }}>{c.content}</div>
            </div>
          ))}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <input
              value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && submit()}
              placeholder={`${user?.name ?? 'あなた'}のコメント…`}
              style={{
                flex: 1, fontSize: 12, padding: '8px 10px',
                border: '1px solid var(--border)', borderRadius: 7,
                background: 'var(--surface)', color: 'var(--text-1)', outline: 'none',
              }}
              onFocus={e => (e.target.style.borderColor = '#B46400')}
              onBlur={e => (e.target.style.borderColor = 'var(--border)')}
            />
            <button
              onClick={submit} disabled={!text.trim() || sending}
              style={{
                padding: '8px 14px', background: text.trim() ? '#B46400' : 'var(--surface-sub)',
                color: text.trim() ? '#fff' : 'var(--text-3)',
                border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: text.trim() ? 'pointer' : 'not-allowed',
                transition: 'all 0.12s',
              }}
            >
              送信
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── メインコンポーネント ──────────────────────────────────────────────────
export default function SinglePieceUI() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  useAuthStore();
  const [piece, setPiece] = useState<Piece | null | undefined>(undefined);
  const [upstream,   setUpstream]   = useState<DepPiece[]>([]);
  const [downstream, setDownstream] = useState<DepPiece[]>([]);
  const [acting, setActing] = useState(false);
  const [toast,  setToast]  = useState<{ text: string; ok: boolean } | null>(null);

  const showToast = useCallback((text: string, ok = true) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    if (!id) { setPiece(null); return; }
    try {
      const [p, deps] = await Promise.all([
        pieceApi.get(id),
        pieceApi.getDeps(id).catch(() => ({ upstream: [], downstream: [] })),
      ]);
      setPiece(p ?? null);
      setUpstream((deps as any).upstream ?? []);
      setDownstream((deps as any).downstream ?? []);
    } catch {
      setPiece(null);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useWebSocket(useCallback((event: WSEvent) => {
    if (event.type === 'piece_ready') {
      showToast((event.payload.message as string) ?? '着手できるようになりました');
      load();
    }
    if (event.type === 'skill_levelup') {
      showToast(`スキルが上がりました：${event.payload.category}`);
    }
  }, [showToast, load]));

  async function handleStart() {
    if (!piece || acting) return;
    setActing(true);
    try {
      await pieceApi.updateStatus(piece.id, 'in_progress');
      setPiece({ ...piece, status: 'in_progress' });
      showToast('開始しました');
    } finally { setActing(false); }
  }

  async function handleDone() {
    if (!piece || acting) return;
    setActing(true);
    try {
      await pieceApi.updateStatus(piece.id, 'done');
      showToast('完了しました。次のピースを確認中…');
      setTimeout(async () => {
        await load();
        setActing(false);
      }, 800);
    } catch { setActing(false); }
  }

  const due = piece ? fmtDate(piece.due_date) : null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      <style>{`
        @keyframes piece-pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes toast-in { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>

      {/* ヘッダー */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        height: 52, padding: '0 20px',
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '4px 6px', borderRadius: 6 }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <ArrowLeft size={15} />
          <span style={{ fontSize: 12 }}>戻る</span>
        </button>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {piece && (
            <div style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {piece.company_id && <span style={{ marginRight: 6, color: 'var(--text-4)' }}>{(piece as any).company_name ?? ''}</span>}
              {piece.title}
            </div>
          )}
        </div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.01em' }}>PuzzleWork</span>
      </header>

      {/* トースト通知 */}
      {toast && (
        <div style={{
          position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)',
          background: toast.ok ? 'var(--text-1)' : '#DC2626', color: '#FAFAF8',
          padding: '10px 22px', borderRadius: 8, fontSize: 13, fontWeight: 500,
          zIndex: 100, whiteSpace: 'nowrap', boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          animation: 'toast-in 0.2s ease',
        }}>
          {toast.text}
        </div>
      )}

      {/* メインコンテンツ */}
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '28px 16px 80px' }}>
        {piece === undefined ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)', fontSize: 13 }}>読み込み中…</div>
        ) : piece === null ? (
          <NoPieceState />
        ) : (
          <>
            {/* ステータス + 基本情報 */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '28px 28px 24px', marginBottom: 16,
            }}>
              <div style={{ marginBottom: 20 }}>
                <StatusBadge status={piece.status} />
              </div>

              {/* タイトル */}
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.03em', lineHeight: 1.3, marginBottom: 12 }}>
                {piece.title}
              </h1>

              {/* 目的 */}
              {piece.objective && (
                <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 16 }}>
                  {piece.objective}
                </p>
              )}

              {/* メタ情報 */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: piece.status === 'in_progress' ? 20 : 0 }}>
                {due && (
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 11, padding: '3px 10px', borderRadius: 6,
                    background: due.urgency === 'overdue' ? 'rgba(230,0,18,0.08)' : due.urgency === 'soon' ? 'rgba(180,100,0,0.08)' : 'var(--surface-sub)',
                    color: due.urgency === 'overdue' ? '#E60012' : due.urgency === 'soon' ? '#B46400' : 'var(--text-3)',
                    border: `1px solid ${due.urgency === 'overdue' ? 'rgba(230,0,18,0.2)' : 'var(--border)'}`,
                    fontWeight: due.urgency !== 'ok' ? 700 : 400,
                  }}>
                    <Calendar size={10} />
                    {due.urgency === 'overdue' ? `${Math.abs(due.diff)}日超過` : due.urgency === 'soon' ? `残${due.diff}日` : due.label}
                  </span>
                )}
                {piece.skill_tags?.map(tag => (
                  <span key={tag} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 11, padding: '3px 10px', borderRadius: 6,
                    background: 'rgba(180,100,0,0.07)', color: '#B46400',
                    border: '1px solid rgba(180,100,0,0.2)', fontWeight: 600,
                  }}>
                    <Tag size={9} />{tag}
                  </span>
                ))}
                {(piece as any).company_name && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)', padding: '3px 10px', borderRadius: 6, background: 'var(--surface-sub)', border: '1px solid var(--border)' }}>
                    <Building2 size={9} />{(piece as any).company_name}
                  </span>
                )}
                {(piece as any).estimated_minutes && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-3)', padding: '3px 10px', borderRadius: 6, background: 'var(--surface-sub)', border: '1px solid var(--border)' }}>
                    <Clock size={9} />見積 {Math.round((piece as any).estimated_minutes / 60 * 10) / 10}h
                  </span>
                )}
              </div>

              {/* 進捗スライダー（進行中のみ） */}
              {piece.status === 'in_progress' && (
                <ProgressSlider pieceId={piece.id} initial={piece.progress ?? 0} />
              )}
            </div>

            {/* ロック原因 */}
            {piece.status === 'locked' && (
              <UpstreamCard pieces={upstream} />
            )}

            {/* 下流（完了後に動く） */}
            {(piece.status === 'ready' || piece.status === 'in_progress') && downstream.length > 0 && (
              <DownstreamCard pieces={downstream} />
            )}

            {/* アクションボタン */}
            {piece.status === 'ready' && (
              <button
                onClick={handleStart} disabled={acting}
                style={{
                  width: '100%', padding: '15px 0', marginBottom: 16,
                  background: acting ? 'var(--text-3)' : 'var(--text-1)',
                  color: '#FAFAF8', border: 'none', borderRadius: 10,
                  fontSize: 15, fontWeight: 700, cursor: acting ? 'not-allowed' : 'pointer',
                  letterSpacing: '-0.01em', transition: 'background 0.1s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <Play size={16} fill="#FAFAF8" />
                {acting ? '...' : '開始する'}
              </button>
            )}

            {piece.status === 'in_progress' && (
              <button
                onClick={handleDone} disabled={acting}
                style={{
                  width: '100%', padding: '15px 0', marginBottom: 16,
                  background: acting ? 'var(--text-3)' : '#2DA44E',
                  color: '#FAFAF8', border: 'none', borderRadius: 10,
                  fontSize: 15, fontWeight: 700, cursor: acting ? 'not-allowed' : 'pointer',
                  letterSpacing: '-0.01em', transition: 'background 0.1s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <CheckCircle2 size={16} />
                {acting ? '...' : '完了にする'}
              </button>
            )}

            {/* コメント欄 */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
              <CommentsSection pieceId={piece.id} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── ピースなし ──────────────────────────────────────────────────────────
function NoPieceState() {
  const navigate = useNavigate();
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-3)' }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface)', border: '1px solid var(--border)', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CheckCircle2 size={22} color="var(--text-4)" />
      </div>
      <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 }}>ピースが見つかりません</p>
      <p style={{ fontSize: 13, marginBottom: 20 }}>削除されたか、URLが間違っている可能性があります</p>
      <button onClick={() => navigate('/work')} style={{ padding: '10px 20px', background: 'var(--text-1)', color: 'var(--bg)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
        ピース一覧へ
      </button>
    </div>
  );
}
