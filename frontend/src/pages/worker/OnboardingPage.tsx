import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { users as usersApi, pieces as pieceApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { Check, ChevronRight, Globe, Copy, ArrowRight } from 'lucide-react';

// ── 今日終わらせられるもの — 例示リスト ───────────────────────────────────
const EXAMPLES = [
  'メールを1通返す',
  '商品ページの画像を差し替える',
  '請求書を1件送る',
  'Slackの未読を片付ける',
  'ミーティングの議事録を書く',
  '資料のタイトルを直す',
  'SNSの投稿を1本作る',
  'データを集計してシートにまとめる',
];

// ── ステップインジケーター ─────────────────────────────────────────────────
function Steps({ current }: { current: number }) {
  const steps = ['最初のピース', 'スキル', 'ポートフォリオ'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32 }}>
      {steps.map((label, i) => {
        const done   = i < current;
        const active = i === current;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'unset' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: done ? '#2DA44E' : active ? '#B46400' : 'var(--surface-sub)',
                border: `2px solid ${done ? '#2DA44E' : active ? '#B46400' : 'var(--border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.3s',
              }}>
                {done
                  ? <Check size={14} color="#fff" strokeWidth={3} />
                  : <span style={{ fontSize: 11, fontWeight: 800, color: active ? '#fff' : 'var(--text-4)' }}>{i + 1}</span>
                }
              </div>
              <span style={{
                fontSize: 10, whiteSpace: 'nowrap',
                fontWeight: active ? 700 : 400,
                color: active ? '#B46400' : done ? '#2DA44E' : 'var(--text-4)',
              }}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: '0 6px', marginBottom: 20,
                background: done ? '#2DA44E' : 'var(--border)',
                transition: 'background 0.4s',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── 達成演出 ───────────────────────────────────────────────────────────────
function PieceCompleteAnimation({ title, onNext }: { title: string; onNext: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{
      textAlign: 'center',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity 0.5s ease, transform 0.5s ease',
    }}>
      {/* ハマった演出 */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'rgba(45,164,78,0.08)',
        border: '2px solid rgba(45,164,78,0.30)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        margin: '0 auto 20px',
      }}>
        <svg width={32} height={32} viewBox="0 0 18 18" fill="none">
          <rect x={1} y={1} width={7} height={7} rx={1.5} fill="#2DA44E" opacity={0.9}/>
          <rect x={10} y={1} width={7} height={7} rx={1.5} fill="#2DA44E" opacity={0.6}/>
          <rect x={1} y={10} width={7} height={7} rx={1.5} fill="#2DA44E" opacity={0.6}/>
          <rect x={10} y={10} width={7} height={7} rx={1.5} fill="#2DA44E" opacity={0.35}/>
        </svg>
      </div>

      <div style={{ fontSize: 20, fontWeight: 900, color: 'var(--text-1)', letterSpacing: '-0.04em', marginBottom: 8 }}>
        最初のピースがハマりました
      </div>
      <div style={{
        fontSize: 12, color: 'var(--text-3)', marginBottom: 6,
        padding: '0 16px', lineHeight: 1.6,
      }}>
        「{title}」
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '4px 12px', borderRadius: 20, marginBottom: 28,
        background: 'rgba(45,164,78,0.06)',
        border: '1px solid rgba(45,164,78,0.20)',
        fontSize: 11, color: '#2DA44E', fontWeight: 700,
      }}>
        <Check size={11} strokeWidth={3} />
        あなたの実績に 1ピース追加されました
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 24px', lineHeight: 1.7 }}>
        これがPuzzleWorkの基本。<br />
        完成させたピースが、あなたの証明になっていきます。
      </p>

      <button
        onClick={onNext}
        style={{
          width: '100%', padding: '13px 0',
          background: '#B46400', color: '#fff',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        次へ — スキルを設定する <ChevronRight size={15} />
      </button>
    </div>
  );
}

// ── Step 0：最初のピース作成＆完了 ─────────────────────────────────────────
function StepFirstPiece({ onComplete }: { onComplete: (title: string) => void }) {
  const [title,     setTitle]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [pieceId,   setPieceId]   = useState('');
  const [created,   setCreated]   = useState(false);
  const [exampleIdx, setExampleIdx] = useState(Math.floor(Math.random() * EXAMPLES.length));

  async function handleCreate() {
    if (!title.trim() || loading) return;
    setLoading(true);
    try {
      const piece = await pieceApi.createPersonal({ title: title.trim() });
      setPieceId(piece.id);
      setCreated(true);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function handleComplete() {
    if (!pieceId || loading) return;
    setLoading(true);
    try {
      await pieceApi.completePersonal(pieceId);
      onComplete(title);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  if (created) {
    return (
      <div>
        <div style={{
          background: 'rgba(45,164,78,0.05)', border: '1px solid rgba(45,164,78,0.20)',
          borderRadius: 10, padding: '14px 16px', marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, color: '#2DA44E', fontWeight: 700, marginBottom: 2 }}>作成しました</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1)' }}>「{title}」</div>
        </div>

        <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 8px', letterSpacing: '-0.03em' }}>
          やり終えたら完了にしよう
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 24px', lineHeight: 1.7 }}>
          完成させると、実績として記録されます。<br />
          これがPuzzleWorkの1サイクルです。
        </p>

        <button
          onClick={handleComplete}
          disabled={loading}
          style={{
            width: '100%', padding: '14px 0',
            background: '#2DA44E', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 800,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            letterSpacing: '-0.01em',
          }}
        >
          <Check size={16} strokeWidth={3} />
          {loading ? '記録中...' : '完了にする'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 8px', letterSpacing: '-0.03em' }}>
        今日終わらせられることを<br />1つ入力してください
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 20px', lineHeight: 1.6 }}>
        5〜30分で終わるもので十分です。
      </p>

      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreate()}
          placeholder={EXAMPLES[exampleIdx]}
          autoFocus
          style={{
            width: '100%', padding: '12px 14px', fontSize: 13,
            border: '1.5px solid var(--border)', borderRadius: 8,
            background: 'var(--surface)', color: 'var(--text-1)',
            outline: 'none', boxSizing: 'border-box',
          }}
          onFocus={e => (e.target.style.borderColor = '#B46400')}
          onBlur={e => (e.target.style.borderColor = 'var(--border)')}
        />
      </div>

      {/* 例示 */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: 'var(--text-4)', marginBottom: 7, letterSpacing: '0.04em' }}>
          例えば…
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {EXAMPLES.filter((_, i) => i !== exampleIdx).slice(0, 5).map(ex => (
            <button
              key={ex}
              onClick={() => setTitle(ex)}
              style={{
                padding: '4px 10px', borderRadius: 20, fontSize: 11,
                border: '1px solid var(--border)', background: 'var(--surface)',
                color: 'var(--text-3)', cursor: 'pointer', transition: 'all 0.1s',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = '#B46400';
                (e.currentTarget as HTMLElement).style.color = '#B46400';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
                (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
              }}
            >
              {ex}
            </button>
          ))}
          <button
            onClick={() => setExampleIdx(i => (i + 1) % EXAMPLES.length)}
            style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, border: '1px solid var(--border)', background: 'none', color: 'var(--text-4)', cursor: 'pointer' }}
          >
            他の例 →
          </button>
        </div>
      </div>

      <button
        onClick={handleCreate}
        disabled={!title.trim() || loading}
        style={{
          width: '100%', padding: '13px 0',
          background: title.trim() ? '#B46400' : 'var(--surface-sub)',
          color: title.trim() ? '#fff' : 'var(--text-3)',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
          cursor: title.trim() && !loading ? 'pointer' : 'not-allowed',
          transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        {loading ? '作成中...' : 'ピースを作成'}
        {!loading && title.trim() && <ArrowRight size={15} />}
      </button>
    </div>
  );
}

// ── Step 1：スキル選択 ────────────────────────────────────────────────────
const SKILL_OPTIONS = [
  'TypeScript', 'React', 'Node.js', 'Python', 'SQL',
  'AWS', 'Docker', 'Figma', 'UI/UX設計',
  'EC運営', 'Shopify', '商品登録', '在庫管理',
  'SNS運用', 'コンテンツ制作', 'ライティング',
  'データ分析', 'Excel/スプレッドシート',
  '写真撮影', 'デザイン', '動画編集',
  '営業', '顧客対応', 'プロジェクト管理',
  'マーケティング', 'SEO', '広告運用',
];

function StepSkills({ onNext }: { onNext: (skills: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(skill: string) {
    setSelected(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 6px', letterSpacing: '-0.03em' }}>
        何ができる人ですか？
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 20px', lineHeight: 1.6 }}>
        あてはまるスキルを選んでください（複数OK・後から変更可）
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 28 }}>
        {SKILL_OPTIONS.map(skill => {
          const active = selected.includes(skill);
          return (
            <button
              key={skill}
              onClick={() => toggle(skill)}
              style={{
                padding: '7px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                border: `1.5px solid ${active ? '#B46400' : 'var(--border)'}`,
                background: active ? 'rgba(180,100,0,0.08)' : 'var(--surface)',
                color: active ? '#B46400' : 'var(--text-2)',
                cursor: 'pointer', transition: 'all 0.12s',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {active && <Check size={11} strokeWidth={3} />}
              {skill}
            </button>
          );
        })}
      </div>

      <button
        onClick={() => onNext(selected)}
        style={{
          width: '100%', padding: '13px 0',
          background: selected.length > 0 ? '#B46400' : 'var(--surface-sub)',
          color: selected.length > 0 ? '#fff' : 'var(--text-3)',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
          cursor: selected.length > 0 ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
        disabled={selected.length === 0}
      >
        {selected.length > 0 ? `${selected.length}件選択 — 次へ` : 'スキルを選んでください'}
        {selected.length > 0 && <ChevronRight size={15} />}
      </button>

      <button
        onClick={() => onNext([])}
        style={{ width: '100%', marginTop: 10, padding: '8px 0', background: 'none', border: 'none', fontSize: 11, color: 'var(--text-4)', cursor: 'pointer' }}
      >
        スキップ（後から設定）
      </button>
    </div>
  );
}

// ── Step 2：ポートフォリオ公開 ────────────────────────────────────────────
function StepPortfolio({ userId, onFinish }: { userId: string; onFinish: () => void }) {
  const [isPublic, setIsPublic] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [copied,   setCopied]   = useState(false);
  const publicUrl = `${window.location.origin}/u/${userId}`;

  async function togglePublic() {
    setLoading(true);
    try {
      await usersApi.setPortfolioVisibility(!isPublic);
      setIsPublic(v => !v);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  function copyUrl() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-1)', margin: '0 0 8px', letterSpacing: '-0.03em' }}>
        あなた専用のURLができました
      </h2>
      <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '0 0 16px', lineHeight: 1.7 }}>
        完成させたピースが増えるほど、<br />
        このページが実績の証明になっていきます。
      </p>

      <div style={{
        background: 'var(--surface-sub)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '12px 14px', marginBottom: 16,
        fontFamily: 'monospace', fontSize: 12, color: 'var(--text-2)',
        wordBreak: 'break-all',
      }}>
        {publicUrl}
      </div>

      <button
        onClick={togglePublic}
        disabled={loading}
        style={{
          width: '100%', padding: '13px 0', marginBottom: 8,
          background: isPublic ? 'rgba(45,164,78,0.08)' : '#B46400',
          color: isPublic ? '#2DA44E' : '#fff',
          border: `1.5px solid ${isPublic ? 'rgba(45,164,78,0.30)' : '#B46400'}`,
          borderRadius: 8, fontSize: 13, fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
          transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        {isPublic ? <><Check size={14} strokeWidth={3} /> 公開中</> : <><Globe size={14} /> 公開する</>}
      </button>

      {isPublic && (
        <button
          onClick={copyUrl}
          style={{
            width: '100%', padding: '10px 0', marginBottom: 8,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, fontSize: 12, fontWeight: 600, color: 'var(--text-2)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}
        >
          {copied ? <><Check size={13} color="#2DA44E" /> コピーしました</> : <><Copy size={13} /> URLをコピー</>}
        </button>
      )}

      <button
        onClick={onFinish}
        style={{
          width: '100%', padding: '13px 0', marginTop: 8,
          background: 'var(--text-1)', color: 'var(--bg)',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        PuzzleWorkをはじめる <ArrowRight size={15} />
      </button>
    </div>
  );
}

// ── メインページ ──────────────────────────────────────────────────────────
type Phase = 'piece' | 'celebrate' | 'skills' | 'portfolio';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, refreshUser } = useAuthStore();
  const [phase,          setPhase]          = useState<Phase>('piece');
  const [completedTitle, setCompletedTitle] = useState('');

  // ステップ番号の対応
  const stepIndex = phase === 'piece' || phase === 'celebrate' ? 0
    : phase === 'skills' ? 1 : 2;

  async function handlePieceComplete(title: string) {
    setCompletedTitle(title);
    setPhase('celebrate');
  }

  async function handleSkillsDone(skills: string[]) {
    try {
      await usersApi.completeOnboarding(skills);
      await refreshUser();
    } catch { /* ignore */ }
    setPhase('portfolio');
  }

  async function handleFinish() {
    try { await refreshUser(); } catch { /* ignore */ }
    navigate('/work');
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      fontFamily: 'var(--font)', paddingTop: '8vh',
    }}>
      <div style={{ width: 'min(480px, 92vw)', paddingBottom: 48 }}>

        {/* ロゴ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 32 }}>
          <svg width={16} height={16} viewBox="0 0 18 18" fill="none">
            <rect x={1} y={1} width={7} height={7} rx={1.5} fill="#B46400" opacity={0.9}/>
            <rect x={10} y={1} width={7} height={7} rx={1.5} fill="#B46400" opacity={0.55}/>
            <rect x={1} y={10} width={7} height={7} rx={1.5} fill="#B46400" opacity={0.55}/>
            <rect x={10} y={10} width={7} height={7} rx={1.5} fill="#B46400" opacity={0.35}/>
          </svg>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--text-1)' }}>
            PuzzleWork
          </span>
          {user?.name && (
            <span style={{ fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>
              ようこそ、{user.name}さん
            </span>
          )}
        </div>

        <Steps current={stepIndex} />

        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '28px 28px 32px',
        }}>
          {phase === 'piece'     && <StepFirstPiece onComplete={handlePieceComplete} />}
          {phase === 'celebrate' && <PieceCompleteAnimation title={completedTitle} onNext={() => setPhase('skills')} />}
          {phase === 'skills'    && <StepSkills onNext={handleSkillsDone} />}
          {phase === 'portfolio' && <StepPortfolio userId={user?.id ?? ''} onFinish={handleFinish} />}
        </div>

        <div style={{ marginTop: 16, fontSize: 11, color: 'var(--text-4)', textAlign: 'center', lineHeight: 1.6 }}>
          企業への接続は後からでもできます。<br />
          まず今日の1ピースから始めましょう。
        </div>
      </div>
    </div>
  );
}
