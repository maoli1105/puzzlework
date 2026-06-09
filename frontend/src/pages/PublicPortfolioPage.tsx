import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { users as usersApi, PortfolioPiece, ConfidentialSummary } from '../services/api';
import { Building2, Clock, Calendar, Lock, EyeOff, Mail, X, Check, Send, ChevronDown, ChevronUp } from 'lucide-react';

// ── ユーティリティ ─────────────────────────────────────────────────────────
function fmtDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function fmtYearMonth(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
}
function fmtMinutes(min: number | null) {
  if (!min) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}
function initials(name: string) {
  return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function avatarHue(name: string) {
  return [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
}

// ── 連絡モーダル ──────────────────────────────────────────────────────────
function ContactModal({ userId, targetName, onClose }: { userId: string; targetName: string; onClose: () => void }) {
  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await usersApi.sendContact(userId, { sender_name: name, sender_email: email, message });
      setSent(true);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? '送信に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, backdropFilter: 'blur(3px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 1001, width: 'min(440px, 92vw)',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '28px 26px', fontFamily: 'var(--font)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.18)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-1)', letterSpacing: '-0.02em' }}>
              {targetName} さんに相談する
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              あなたのメールアドレスは相手に直接公開されません
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {sent ? (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(45,164,78,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Check size={24} color="#2DA44E" strokeWidth={2.5} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 6 }}>送信しました</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
              {targetName} さんに届きました。<br />返信があればあなたのメールに届きます。
            </div>
            <button onClick={onClose} style={{ marginTop: 20, padding: '10px 24px', background: 'var(--text-1)', color: 'var(--bg)', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              閉じる
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {error && (
              <div style={{ fontSize: 11, color: '#E60012', background: 'rgba(230,0,18,0.05)', border: '1px solid rgba(230,0,18,0.2)', borderRadius: 6, padding: '8px 12px' }}>
                {error}
              </div>
            )}
            {[
              { label: 'お名前', value: name, set: setName, type: 'text', ph: '山田 太郎' },
              { label: 'メールアドレス', value: email, set: setEmail, type: 'email', ph: 'taro@example.com' },
            ].map(({ label, value, set, type, ph }) => (
              <div key={label}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
                <input
                  type={type} value={value} onChange={e => set(e.target.value)}
                  placeholder={ph} required
                  style={{ width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => (e.target.style.borderColor = '#B46400')}
                  onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                />
              </div>
            ))}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 5 }}>
                メッセージ
              </div>
              <textarea
                value={message} onChange={e => setMessage(e.target.value)}
                placeholder={`${targetName} さんのポートフォリオを拝見しました。\nぜひご相談させてください。`}
                required rows={4}
                style={{ width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text-1)', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'var(--font)' }}
                onFocus={e => (e.target.style.borderColor = '#B46400')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
              />
              <div style={{ fontSize: 10, color: 'var(--text-4)', textAlign: 'right', marginTop: 3 }}>{message.length}/2000</div>
            </div>
            <button
              type="submit" disabled={loading}
              style={{ padding: '12px 0', background: '#B46400', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7 }}
            >
              <Send size={14} />
              {loading ? '送信中...' : '送信する'}
            </button>
          </form>
        )}
      </div>
    </>
  );
}

// ── ピースカード ──────────────────────────────────────────────────────────
function PieceCard({ piece }: { piece: PortfolioPiece }) {
  const act = fmtMinutes(piece.actual_minutes);
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: piece.objective ? 6 : 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-1)', lineHeight: 1.35 }}>{piece.title}</div>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Calendar size={9} />{fmtDate(piece.completed_at)}</span>
            {piece.company_name && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Building2 size={9} />{piece.company_name}</span>}
            {act && <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#B46400', fontWeight: 600 }}><Clock size={9} />{act}</span>}
          </div>
        </div>
      </div>
      {piece.objective && (
        <p style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.55, margin: '0 0 8px' }}>
          {piece.objective}
        </p>
      )}
      {piece.skill_tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {piece.skill_tags.map(t => (
            <span key={t} style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(180,100,0,0.08)', color: '#B46400', border: '1px solid rgba(180,100,0,0.20)' }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 機密カード ────────────────────────────────────────────────────────────
function ConfidentialCard({ item }: { item: ConfidentialSummary }) {
  const y1 = new Date(item.earliest).getFullYear();
  const y2 = new Date(item.latest).getFullYear();
  const period = y1 === y2 ? `${y1}年` : `${y1}〜${y2}年`;
  return (
    <div style={{ background: 'var(--surface-sub)', border: '1px dashed var(--border)', borderRadius: 10, padding: '12px 16px', display: 'flex', gap: 10 }}>
      <div style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, background: 'rgba(100,100,100,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <EyeOff size={11} color="var(--text-4)" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)' }}>機密プロジェクト（{item.count}件）</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{item.company_name && `${item.company_name} · `}{period}</div>
        {item.tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {item.tags.map(t => <span key={t} style={{ padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 600, background: 'rgba(180,100,0,0.06)', color: '#B46400', border: '1px solid rgba(180,100,0,0.15)' }}>{t}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── スキル行 ─────────────────────────────────────────────────────────────
function SkillBar({ tag, count, minutes, max }: { tag: string; count: number; minutes: number; max: number }) {
  const h = Math.round(minutes / 60);
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text-1)', fontWeight: 600 }}>{tag}</span>
        <span style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', gap: 8 }}>
          <span>{count}件</span>
          {h > 0 && <span>{h}h</span>}
        </span>
      </div>
      <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.round((count / max) * 100)}%`, background: '#B46400', borderRadius: 3, transition: 'width 0.7s ease' }} />
      </div>
    </div>
  );
}

// ── PuzzleWork バッジ ─────────────────────────────────────────────────────
function PuzzleWorkBadge() {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <svg width={14} height={14} viewBox="0 0 18 18" fill="none">
        <rect x={1} y={1} width={7} height={7} rx={1.5} fill="var(--accent)" opacity={0.9}/>
        <rect x={10} y={1} width={7} height={7} rx={1.5} fill="var(--accent)" opacity={0.55}/>
        <rect x={1} y={10} width={7} height={7} rx={1.5} fill="var(--accent)" opacity={0.55}/>
        <rect x={10} y={10} width={7} height={7} rx={1.5} fill="var(--accent)" opacity={0.35}/>
      </svg>
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-2)' }}>PuzzleWork</span>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────
export default function PublicPortfolioPage() {
  const { userId } = useParams<{ userId: string }>();
  const [data, setData] = useState<Awaited<ReturnType<typeof usersApi.getPublicPortfolio>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [privateName, setPrivateName] = useState<string | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [showAllPieces, setShowAllPieces] = useState(false);

  useEffect(() => {
    if (!userId) return;
    usersApi.getPublicPortfolio(userId)
      .then(setData)
      .catch((err) => { if (err.response?.status === 403) setPrivateName(err.response.data?.name ?? ''); })
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-3)', fontSize: 13, fontFamily: 'var(--font)' }}>読み込み中...</div>
  );

  if (privateName !== null) return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', fontFamily: 'var(--font)', gap: 12 }}>
      <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface-sub)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Lock size={22} color="var(--text-4)" />
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>非公開のポートフォリオ</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{privateName ? `${privateName} さんのポートフォリオは非公開です` : 'このポートフォリオは非公開です'}</div>
      <div style={{ marginTop: 8 }}><PuzzleWorkBadge /></div>
    </div>
  );

  if (!data) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-3)', fontSize: 13, fontFamily: 'var(--font)' }}>ユーザーが見つかりません</div>
  );

  const { user, pieces, confidential_summary, skill_breakdown, summary } = data;
  const hue = avatarHue(user.name);
  const maxSkill = Math.max(...skill_breakdown.map(s => s.count), 1);
  const topSkills = skill_breakdown.slice(0, 3);
  const recentPieces = pieces.slice(0, 3);
  const olderPieces = pieces.slice(3);

  const grouped = new Map<string, PortfolioPiece[]>();
  olderPieces.forEach(p => {
    const key = fmtYearMonth(p.completed_at);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(p);
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>

      {/* ── ヘッダー ── */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <PuzzleWorkBadge />
        <button
          onClick={() => setContactOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#B46400', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.15s' }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          <Mail size={13} />
          {user.name} さんに相談する
        </button>
      </header>

      <div style={{ maxWidth: 840, margin: '0 auto', padding: '36px 16px 72px' }}>

        {/* ── プロフィールヒーロー ── */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 32, flexWrap: 'wrap' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: `hsl(${hue},55%,52%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
            {initials(user.name)}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <h1 style={{ fontSize: 26, fontWeight: 900, color: 'var(--text-1)', margin: '0 0 4px', letterSpacing: '-0.04em' }}>{user.name}</h1>

            {/* 得意領域チップ */}
            {topSkills.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {topSkills.map((s, i) => (
                  <span key={s.tag} style={{
                    padding: '4px 12px', borderRadius: 20, fontSize: i === 0 ? 13 : 11, fontWeight: 700,
                    background: i === 0 ? 'rgba(180,100,0,0.10)' : 'var(--surface-sub)',
                    color: i === 0 ? '#B46400' : 'var(--text-2)',
                    border: `1.5px solid ${i === 0 ? 'rgba(180,100,0,0.28)' : 'var(--border)'}`,
                  }}>
                    {s.tag}
                    <span style={{ fontSize: 10, fontWeight: 500, opacity: 0.7, marginLeft: 5 }}>{s.count}件</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-4)' }}>PuzzleWork メンバー</div>
          </div>

          {/* CTA ボタン（モバイル向けにも） */}
          <button
            onClick={() => setContactOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 20px', background: '#B46400', color: '#fff', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, transition: 'opacity 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Mail size={14} />
            相談する
          </button>
        </div>

        {/* ── 実績サマリー ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 32 }}>
          {[
            { label: '完成ピース', value: summary.total_pieces, unit: '件', color: '#B46400' },
            { label: '参加企業',   value: summary.total_companies, unit: '社', color: '#4A6FA5' },
            { label: '総作業時間', value: summary.total_hours, unit: 'h', color: '#2DA44E' },
          ].map(({ label, value, unit, color }) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 30, fontWeight: 900, color, letterSpacing: '-0.05em', lineHeight: 1 }}>
                {value}<span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-3)', marginLeft: 2 }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* ── 2カラム ── */}
        <div style={{ display: 'grid', gridTemplateColumns: skill_breakdown.length > 0 ? '1fr 220px' : '1fr', gap: 28, alignItems: 'start' }}>

          {/* 左：ピース */}
          <div>
            {/* 最近のピース */}
            {recentPieces.length > 0 && (
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>
                  最近完成させた仕事
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {recentPieces.map(p => <PieceCard key={p.id} piece={p} />)}
                </div>
              </div>
            )}

            {/* 過去の実績（折りたたみ） */}
            {olderPieces.length > 0 && (
              <div>
                <button
                  onClick={() => setShowAllPieces(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '10px 14px', background: 'var(--surface-sub)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-2)', cursor: 'pointer', marginBottom: 12, justifyContent: 'center' }}
                >
                  {showAllPieces ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  {showAllPieces ? '折りたたむ' : `過去の実績をすべて見る（+${olderPieces.length}件）`}
                </button>
                {showAllPieces && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    {[...grouped.entries()].map(([yearMonth, items]) => (
                      <div key={yearMonth}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{yearMonth}</div>
                          <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                          <div style={{ fontSize: 10, color: 'var(--text-4)', whiteSpace: 'nowrap' }}>{items.length}件</div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {items.map(p => <PieceCard key={p.id} piece={p} />)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 機密 */}
            {confidential_summary?.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-4)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 10 }}>機密プロジェクト</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {confidential_summary.map((item, i) => <ConfidentialCard key={i} item={item} />)}
                </div>
              </div>
            )}

            {pieces.length === 0 && !confidential_summary?.length && (
              <div style={{ padding: '8px 0' }}>
                {/* できること宣言（ピースがまだない場合に表示） */}
                {user.user_skills?.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 12 }}>
                      できること
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {user.user_skills.map(skill => (
                        <span key={skill} style={{
                          padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                          background: 'rgba(180,100,0,0.08)', color: '#B46400',
                          border: '1px solid rgba(180,100,0,0.22)',
                        }}>{skill}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)', fontSize: 13 }}>
                  完成ピースはまだありません
                </div>
              </div>
            )}
          </div>

          {/* 右：スキル */}
          {skill_breakdown.length > 0 && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', position: 'sticky', top: 68 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 16, letterSpacing: '-0.01em' }}>スキル別実績</div>
              {skill_breakdown.slice(0, 12).map(s => (
                <SkillBar key={s.tag} tag={s.tag} count={s.count} minutes={s.minutes} max={maxSkill} />
              ))}

              {/* 相談ボタン（右サイドバーにも） */}
              <button
                onClick={() => setContactOpen(true)}
                style={{ width: '100%', marginTop: 20, padding: '10px 0', background: '#B46400', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Mail size={13} />
                {user.name} さんに相談する
              </button>
            </div>
          )}
        </div>

        {/* フッター */}
        <div style={{ marginTop: 56, textAlign: 'center', borderTop: '1px solid var(--border)', paddingTop: 28 }}>
          <PuzzleWorkBadge />
          <div style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 6 }}>仕事の実績は個人に帰属する</div>
        </div>
      </div>

      {contactOpen && (
        <ContactModal userId={userId!} targetName={user.name} onClose={() => setContactOpen(false)} />
      )}
    </div>
  );
}
