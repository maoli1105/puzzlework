/**
 * RegisterPage — 新規会社登録
 * 会社名 + admin ユーザーを同時作成して JWT を取得する。
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../services/api';
import { useAuthStore } from '../store/authStore';

const T = {
  ink900: '#111111', ink600: '#444444', ink400: '#888888',
  ink200: '#CCCCCC', ink100: '#F2F2F2', ink000: '#FFFFFF',
  accent: '#E60012', ready: '#3A6B4E',
} as const;

const inputStyle: React.CSSProperties = {
  width: '100%', border: `1px solid ${T.ink200}`, borderRadius: 2,
  padding: '10px 12px', fontSize: 13, boxSizing: 'border-box',
  outline: 'none', color: T.ink900, background: T.ink000,
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const setAuth  = useAuthStore(s => s.setAuth);

  const [companyName, setCompanyName] = useState('');
  const [name,        setName]        = useState('');
  const [email,       setEmail]       = useState('');
  const [password,    setPassword]    = useState('');
  const [error,       setError]       = useState('');
  const [loading,     setLoading]     = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError('パスワードは8文字以上にしてください'); return; }
    setLoading(true);
    setError('');
    try {
      const { user, token } = await auth.register({ companyName, name, email, password });
      setAuth(user, token, '');
      navigate('/overview');
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
      <div style={{ width: 380 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 2, background: T.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <span style={{ color: T.ink000, fontWeight: 900, fontSize: 24, lineHeight: 1 }}>P</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.ink900, letterSpacing: '-0.03em' }}>
            PuzzleWork
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink400, letterSpacing: '0.09em', marginTop: 4 }}>
            NEW WORKSPACE
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{
          background: T.ink000, border: `1px solid ${T.ink200}`,
          borderRadius: 2, padding: '36px 28px',
        }}>
          {error && (
            <div style={{
              fontSize: 12, color: T.accent, background: T.ink100,
              border: `1px solid ${T.accent}`, borderRadius: 2,
              padding: '10px 14px', marginBottom: 16, fontWeight: 600,
            }}>
              {error}
            </div>
          )}

          {/* 会社名 */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink400, letterSpacing: '0.09em', marginBottom: 6 }}>
              会社名
            </label>
            <input
              type="text" value={companyName} onChange={e => setCompanyName(e.target.value)}
              required placeholder="株式会社パズルワーク" style={inputStyle}
            />
          </div>

          {/* 担当者名 */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink400, letterSpacing: '0.09em', marginBottom: 6 }}>
              担当者名
            </label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              required placeholder="山田 太郎" style={inputStyle}
            />
          </div>

          {/* メール */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink400, letterSpacing: '0.09em', marginBottom: 6 }}>
              メールアドレス
            </label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              required placeholder="you@company.com" style={inputStyle}
            />
          </div>

          {/* パスワード */}
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
              width: '100%', padding: '14px 0', background: T.ink900, color: T.ink000,
              border: 'none', borderRadius: 2, fontSize: 13, fontWeight: 700,
              opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? '登録中…' : 'ワークスペースを作成'}
          </button>

          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: T.ink400 }}>
            既にアカウントをお持ちの方は{' '}
            <Link to="/login" style={{ color: T.ink600, fontWeight: 600 }}>ログイン</Link>
          </div>
        </form>

        {/* plan 説明 */}
        <div style={{ marginTop: 16, padding: '12px 16px', background: T.ink000, border: `1px solid ${T.ink200}`, borderRadius: 2 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: T.ink400, letterSpacing: '0.08em', marginBottom: 8 }}>
            FREE プランで開始
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['ピース管理・依存関係', 'Worker 工房', 'Cascade 自動昇格'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: T.ink600 }}>
                <span style={{ color: T.ready, fontWeight: 700 }}>✓</span> {f}
              </div>
            ))}
            <div style={{ fontSize: 10, color: T.ink400, marginTop: 4 }}>
              企業間 Marketplace は Pro プランで利用可能
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
