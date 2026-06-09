/**
 * WorkerRegisterPage — 個人（ワーカー）アカウント登録
 * 会社との接続は招待リンク経由で後から行う。
 */
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { UserCircle, Building2, ArrowRight } from 'lucide-react';

const T = {
  ink900: '#111111', ink600: '#444444', ink400: '#888888',
  ink200: '#CCCCCC', ink100: '#F2F2F2', ink000: '#FFFFFF',
  amber:  '#B46400', danger: '#E60012',
} as const;

const inputStyle: React.CSSProperties = {
  width: '100%', border: `1px solid ${T.ink200}`, borderRadius: 3,
  padding: '10px 12px', fontSize: 13, boxSizing: 'border-box',
  outline: 'none', color: T.ink900, background: T.ink000,
};

export default function WorkerRegisterPage() {
  const navigate = useNavigate();
  const setAuth  = useAuthStore(s => s.setAuth);

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('パスワードは8文字以上にしてください'); return; }
    setLoading(true);
    setError('');
    try {
      const { user, token } = await auth.registerWorker({ name, email, password });
      setAuth(user, token, '');
      navigate('/onboarding');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? '登録に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: T.ink100, fontFamily: '-apple-system, "Helvetica Neue", sans-serif',
    }}>
      <div style={{ width: 400 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 3, background: T.danger,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <span style={{ color: T.ink000, fontWeight: 900, fontSize: 24, lineHeight: 1 }}>P</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.ink900, letterSpacing: '-0.03em' }}>
            PuzzleWork
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink400, letterSpacing: '0.09em', marginTop: 4 }}>
            PERSONAL ACCOUNT
          </div>
        </div>

        {/* 個人 vs 企業 説明カード */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16,
        }}>
          {/* 個人（選択中） */}
          <div style={{
            padding: '14px 16px',
            background: T.ink000,
            border: `2px solid ${T.amber}`,
            borderRadius: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <UserCircle size={16} color={T.amber} />
              <span style={{ fontSize: 12, fontWeight: 700, color: T.amber }}>個人として登録</span>
            </div>
            <div style={{ fontSize: 11, color: T.ink600, lineHeight: 1.5 }}>
              個人メールで登録。複数の企業から招待を受けて接続できます。
            </div>
          </div>
          {/* 企業 */}
          <Link to="/register" style={{ textDecoration: 'none' }}>
            <div style={{
              padding: '14px 16px',
              background: T.ink100,
              border: `1px solid ${T.ink200}`,
              borderRadius: 6,
              height: '100%', boxSizing: 'border-box',
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = T.ink400)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = T.ink200)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <Building2 size={16} color={T.ink400} />
                <span style={{ fontSize: 12, fontWeight: 700, color: T.ink600 }}>企業として登録</span>
              </div>
              <div style={{ fontSize: 11, color: T.ink400, lineHeight: 1.5 }}>
                会社のワークスペースを作成し、メンバーを招待します。
              </div>
            </div>
          </Link>
        </div>

        {/* フォーム */}
        <form onSubmit={handleSubmit} style={{
          background: T.ink000, border: `1px solid ${T.ink200}`,
          borderRadius: 6, padding: '28px 28px 32px',
        }}>
          {error && (
            <div style={{
              fontSize: 12, color: T.danger, background: T.ink100,
              border: `1px solid ${T.danger}`, borderRadius: 3,
              padding: '10px 14px', marginBottom: 16, fontWeight: 600,
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink400, letterSpacing: '0.09em', marginBottom: 6 }}>
              名前
            </label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              required placeholder="山田 太郎" style={inputStyle} autoFocus
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink400, letterSpacing: '0.09em', marginBottom: 6 }}>
              メールアドレス（個人）
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="taro@gmail.com" style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink400, letterSpacing: '0.09em', marginBottom: 6 }}>
              パスワード（8文字以上）
            </label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              required placeholder="••••••••" style={inputStyle}
            />
          </div>

          <button
            type="submit" disabled={loading}
            style={{
              width: '100%', padding: '13px 0', background: T.amber, color: T.ink000,
              border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 700,
              opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '登録中…' : '個人アカウントを作成'}
          </button>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 11, color: T.ink400 }}>
            既にアカウントをお持ちの方は{' '}
            <Link to="/login" style={{ color: T.ink600, fontWeight: 600 }}>ログイン</Link>
          </div>
        </form>

        {/* 登録後のフロー説明 */}
        <div style={{
          marginTop: 16, padding: '14px 16px',
          background: T.ink000, border: `1px solid ${T.ink200}`,
          borderRadius: 6, fontSize: 11, color: T.ink600,
        }}>
          <div style={{ fontWeight: 700, color: T.ink900, marginBottom: 8, fontSize: 12 }}>
            登録後のながれ
          </div>
          {[
            '個人アカウントを作成',
            '企業から招待リンクを受け取る',
            '招待を承諾して企業と接続',
            '複数企業と同時に接続OK（副業・掛け持ち）',
          ].map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: i < 3 ? 6 : 0 }}>
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                background: i === 0 ? T.amber : T.ink200,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, color: i === 0 ? T.ink000 : T.ink400,
              }}>{i + 1}</div>
              {i < 3 && <ArrowRight size={10} color={T.ink200} style={{ flexShrink: 0 }} />}
              <span style={{ color: i === 0 ? T.amber : T.ink600, fontWeight: i === 0 ? 700 : 400 }}>
                {step}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
