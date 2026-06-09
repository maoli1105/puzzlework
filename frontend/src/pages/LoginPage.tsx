import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { UserCircle, Building2 } from 'lucide-react';

// ─── デザイントークン ────────────────────────────────────────────────
const T = {
  // カラー
  ink900:   '#111111',  // 見出し・主要テキスト
  ink600:   '#444444',  // 本文
  ink400:   '#888888',  // サブテキスト・補足情報
  ink200:   '#CCCCCC',  // 区切り・薄いボーダー
  ink100:   '#F2F2F2',  // カード背景・入力背景
  ink000:   '#FFFFFF',  // ページ背景
  accent:   '#E60012',  // 唯一の有彩色（ログインボタンのアクセント赤）

  // タイポグラフィ
  textLabel: { fontSize: 10, fontWeight: 700 as const, letterSpacing: '0.09em' } as React.CSSProperties,
  textMeta:  { fontSize: 12, fontWeight: 400 as const } as React.CSSProperties,
  textBody:  { fontSize: 14, fontWeight: 500 as const } as React.CSSProperties,
  textTitle: { fontSize: 20, fontWeight: 800 as const, letterSpacing: '-0.035em', lineHeight: 1.2 } as React.CSSProperties,
  textHero:  { fontSize: 28, fontWeight: 800 as const, letterSpacing: '-0.04em',  lineHeight: 1.1 } as React.CSSProperties,

  // 余白（8px基準グリッド）
  s4:  4,
  s8:  8,
  s16: 16,
  s24: 24,
  s40: 40,
  s64: 64,
} as const;

// 開発用クイックログインアカウント（開発環境のみ表示）
const IS_DEV = import.meta.env.DEV;
const DEV_ACCOUNTS = [
  { label: 'Admin（管理者）',  email: 'admin@puzzle.co.jp',  password: 'admin123',  role: 'admin'  },
  { label: 'Worker（花子）',   email: 'hanako@puzzle.co.jp', password: 'hanako123', role: 'worker' },
] as const;

export default function LoginPage() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const navigate = useNavigate();
  const setAuth  = useAuthStore((s) => s.setAuth);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { user, token, refresh_token } = await auth.login(email, password);
      setAuth(user, token, refresh_token);
      navigate(user.role === 'admin' ? '/overview' : '/work');
    } catch {
      setError('メールアドレスまたはパスワードが違います');
    } finally {
      setLoading(false);
    }
  }

  async function quickLogin(acc: typeof DEV_ACCOUNTS[number]) {
    setLoading(true);
    setError('');
    try {
      const { user, token, refresh_token } = await auth.login(acc.email, acc.password);
      setAuth(user, token, refresh_token);
      navigate(user.role === 'admin' ? '/overview' : '/work');
    } catch {
      setError('ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: T.ink100,
      fontFamily: '-apple-system, "Helvetica Neue", sans-serif',
    }}>
      <div style={{ width: 360 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: T.s40 }}>
          {/* Icon mark */}
          <div style={{
            width: 48, height: 48, borderRadius: 2,
            background: T.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: `0 auto ${T.s16}px`,
          }}>
            <span style={{ color: T.ink000, fontWeight: 900, fontSize: 24, letterSpacing: '-0.05em', lineHeight: 1 }}>P</span>
          </div>
          <div style={{
            ...T.textTitle,
            color: T.ink900,
            fontSize: 22,
            marginBottom: T.s4,
          }}>
            PuzzleWork
          </div>
          <div style={{ ...T.textLabel, color: T.ink400, textTransform: 'uppercase' }}>
            Workspace
          </div>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          style={{
            background: T.ink000,
            border: `1px solid ${T.ink200}`,
            borderRadius: 2,
            padding: `${T.s40}px ${T.s24}px`,
          }}
        >
          {error && (
            <div style={{
              ...T.textMeta,
              color: T.accent,
              background: T.ink100,
              border: `1px solid ${T.accent}`,
              borderRadius: 2,
              padding: '10px 14px',
              marginBottom: T.s16,
              fontWeight: 600,
            }}>
              {error}
            </div>
          )}

          <div style={{ marginBottom: T.s16 }}>
            <label style={{ display: 'block', ...T.textLabel, color: T.ink400, textTransform: 'uppercase', marginBottom: T.s8 }}>
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              placeholder="メールアドレス"
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: T.s24 }}>
            <label style={{ display: 'block', ...T.textLabel, color: T.ink400, textTransform: 'uppercase', marginBottom: T.s8 }}>
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>

          {/* ログインボタン */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '16px 0',
              background: T.accent,
              color: T.ink000,
              border: 'none',
              borderRadius: 2,
              ...T.textBody,
              fontWeight: 700,
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.01em',
              transition: 'opacity 0.15s',
            }}
          >
            {loading ? '認証中...' : 'ログイン'}
          </button>

          {/* 新規登録リンク — 個人 / 企業 に分離 */}
          <div style={{ marginTop: T.s16, borderTop: `1px solid ${T.ink200}`, paddingTop: T.s16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.ink400, textAlign: 'center', letterSpacing: '0.07em', marginBottom: 10 }}>
              NEW ACCOUNT
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Link to="/register-worker" style={{ flex: 1, textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px 0', background: T.ink100, border: `1px solid ${T.ink200}`,
                  borderRadius: 2, fontSize: 11, fontWeight: 700, color: T.ink600, cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#B46400'; e.currentTarget.style.color = '#B46400'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.ink200; e.currentTarget.style.color = T.ink600; }}
                >
                  <UserCircle size={13} />
                  個人として登録
                </div>
              </Link>
              <Link to="/register" style={{ flex: 1, textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: '9px 0', background: T.ink100, border: `1px solid ${T.ink200}`,
                  borderRadius: 2, fontSize: 11, fontWeight: 700, color: T.ink600, cursor: 'pointer',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.ink600; e.currentTarget.style.color = T.ink900; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.ink200; e.currentTarget.style.color = T.ink600; }}
                >
                  <Building2 size={13} />
                  企業として登録
                </div>
              </Link>
            </div>
          </div>

          {/* 開発用クイックログイン（開発環境のみ） */}
          {IS_DEV && (
          <div style={{ marginTop: T.s24, borderTop: `1px solid ${T.ink200}`, paddingTop: T.s16 }}>
            <div style={{ ...T.textLabel, color: T.ink400, textTransform: 'uppercase', textAlign: 'center', marginBottom: T.s8 }}>
              Dev Quick Login
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {DEV_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  type="button"
                  disabled={loading}
                  onClick={() => quickLogin(acc)}
                  style={{
                    flex: 1,
                    padding: '9px 0',
                    background: T.ink100,
                    color: T.ink600,
                    border: `1px solid ${T.ink200}`,
                    borderRadius: 2,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: loading ? 'not-allowed' : 'pointer',
                    letterSpacing: '-0.01em',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = T.ink200)}
                  onMouseLeave={e => (e.currentTarget.style.background = T.ink100)}
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
          )}
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${T.ink200}`,
  borderRadius: 2,
  padding: '10px 12px',
  fontSize: 13,
  boxSizing: 'border-box',
  outline: 'none',
  color: T.ink900,
  background: T.ink000,
  transition: 'border-color 0.15s',
};
