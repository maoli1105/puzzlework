/**
 * JoinPage — 招待リンクからの参加
 * URL: /join/:token
 * - 新規ユーザー: name / email / password で新規アカウント作成
 * - 既存ユーザー: email / password でログインし、追加会社として参加（副業対応）
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { auth } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Building2, CheckCircle, AlertCircle, Loader } from 'lucide-react';

const T = {
  ink900: '#111111', ink600: '#444444', ink400: '#888888',
  ink200: '#CCCCCC', ink100: '#F2F2F2', ink000: '#FFFFFF',
  accent: '#E60012', amber: '#B46400', ready: '#1a9e4a',
} as const;

const inputStyle: React.CSSProperties = {
  width: '100%', border: `1px solid ${T.ink200}`, borderRadius: 3,
  padding: '10px 12px', fontSize: 13, boxSizing: 'border-box',
  outline: 'none', color: T.ink900, background: T.ink000,
};

const ROLE_LABEL: Record<string, string> = { admin: '管理者', worker: 'ワーカー', external: '外部メンバー' };

export default function JoinPage() {
  const { token }  = useParams<{ token: string }>();
  const navigate   = useNavigate();
  const setAuth    = useAuthStore(s => s.setAuth);
  const currentUser = useAuthStore(s => s.user);

  // 招待情報
  const [inviteInfo, setInviteInfo] = useState<{
    company_name: string; role: string; status: string;
  } | null>(null);
  const [infoLoading, setInfoLoading] = useState(true);

  // モード: 'new' = 新規登録 / 'existing' = 既存アカウントで参加
  const [mode, setMode] = useState<'new' | 'existing'>('new');

  // フォーム
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);

  // 招待情報を取得
  useEffect(() => {
    if (!token) return;
    auth.inviteInfo(token)
      .then(info => setInviteInfo(info))
      .catch(() => setInviteInfo(null))
      .finally(() => setInfoLoading(false));
  }, [token]);

  // 既にログイン済みなら existing モードをデフォルトに
  useEffect(() => {
    if (currentUser) setMode('existing');
  }, [currentUser]);

  async function handleSubmitNew(e: React.FormEvent) {
    e.preventDefault();
    if (!token) { setError('招待トークンが見つかりません'); return; }
    if (password.length < 8) { setError('パスワードは8文字以上にしてください'); return; }
    setLoading(true); setError('');
    try {
      const { user, token: jwt } = await auth.join({ token, name, email, password });
      setAuth(user, jwt, '');
      navigate('/work');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? '参加に失敗しました');
    } finally { setLoading(false); }
  }

  async function handleSubmitExisting(e: React.FormEvent) {
    e.preventDefault();
    if (!token) { setError('招待トークンが見つかりません'); return; }
    setLoading(true); setError('');
    try {
      const result = await auth.joinExisting({ token, email, password });
      // 既存セッションを更新（または新しいJWTで再セット）
      setAuth(result.user, result.token, '');
      setDone(true);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg ?? '参加に失敗しました');
    } finally { setLoading(false); }
  }

  if (done && inviteInfo) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: T.ink100, fontFamily: '-apple-system, "Helvetica Neue", sans-serif',
      }}>
        <div style={{ width: 360, textAlign: 'center' }}>
          <div style={{
            background: T.ink000, border: `1px solid ${T.ink200}`,
            borderRadius: 3, padding: '40px 28px',
          }}>
            <CheckCircle size={36} color={T.ready} style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink900, marginBottom: 8 }}>
              {inviteInfo.company_name} に参加しました
            </div>
            <div style={{ fontSize: 13, color: T.ink600, marginBottom: 24 }}>
              ロール: {ROLE_LABEL[inviteInfo.role] ?? inviteInfo.role}
            </div>
            <button
              onClick={() => navigate('/work')}
              style={{
                padding: '12px 32px', background: T.ink900, color: T.ink000,
                border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              ワークスペースへ
            </button>
          </div>
        </div>
      </div>
    );
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
            width: 48, height: 48, borderRadius: 3, background: T.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <span style={{ color: T.ink000, fontWeight: 900, fontSize: 24, lineHeight: 1 }}>P</span>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, color: T.ink900, letterSpacing: '-0.03em' }}>
            PuzzleWork
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.ink400, letterSpacing: '0.09em', marginTop: 4 }}>
            JOIN WORKSPACE
          </div>
        </div>

        <div style={{ background: T.ink000, border: `1px solid ${T.ink200}`, borderRadius: 3 }}>
          {/* 招待情報ヘッダー */}
          <div style={{
            padding: '14px 20px',
            borderBottom: `1px solid ${T.ink200}`,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            {infoLoading ? (
              <Loader size={14} color={T.ink400} />
            ) : inviteInfo?.status === 'valid' ? (
              <>
                <Building2 size={14} color={T.amber} />
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.ink900 }}>
                    {inviteInfo.company_name}
                  </span>
                  <span style={{ fontSize: 11, color: T.ink400, marginLeft: 8 }}>
                    {ROLE_LABEL[inviteInfo.role] ?? inviteInfo.role}として招待
                  </span>
                </div>
              </>
            ) : inviteInfo?.status === 'used' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} color={T.accent} />
                <span style={{ fontSize: 12, color: T.accent, fontWeight: 600 }}>
                  この招待リンクは既に使用されています
                </span>
              </div>
            ) : inviteInfo?.status === 'expired' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} color={T.accent} />
                <span style={{ fontSize: 12, color: T.accent, fontWeight: 600 }}>
                  この招待リンクは期限切れです
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertCircle size={14} color={T.accent} />
                <span style={{ fontSize: 12, color: T.accent, fontWeight: 600 }}>
                  招待リンクが見つかりません
                </span>
              </div>
            )}
          </div>

          {/* モード切り替えタブ */}
          {inviteInfo?.status === 'valid' && (
            <div style={{ display: 'flex', borderBottom: `1px solid ${T.ink200}` }}>
              {(['new', 'existing'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    flex: 1, padding: '10px 0',
                    background: mode === m ? T.ink000 : T.ink100,
                    border: 'none', borderBottom: mode === m ? `2px solid ${T.amber}` : '2px solid transparent',
                    fontSize: 12, fontWeight: 700,
                    color: mode === m ? T.amber : T.ink400,
                    cursor: 'pointer', transition: 'all 0.1s',
                  }}
                >
                  {m === 'new' ? '新規アカウント' : '既存アカウントで参加'}
                </button>
              ))}
            </div>
          )}

          {/* フォーム */}
          {inviteInfo?.status === 'valid' && (
            <div style={{ padding: '24px 24px 28px' }}>
              {error && (
                <div style={{
                  fontSize: 12, color: T.accent, background: T.ink100,
                  border: `1px solid ${T.accent}`, borderRadius: 3,
                  padding: '10px 14px', marginBottom: 16, fontWeight: 600,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <AlertCircle size={12} />
                  {error}
                </div>
              )}

              {mode === 'new' ? (
                <form onSubmit={handleSubmitNew}>
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
                      メールアドレス
                    </label>
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      required placeholder="you@company.com" style={inputStyle}
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
                      width: '100%', padding: '13px 0', background: T.ink900, color: T.ink000,
                      border: 'none', borderRadius: 3, fontSize: 13, fontWeight: 700,
                      opacity: loading ? 0.6 : 1, cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {loading ? '参加中…' : 'ワークスペースに参加'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmitExisting}>
                  <div style={{
                    fontSize: 12, color: T.ink600, background: `rgba(180,100,0,0.06)`,
                    border: `1px solid rgba(180,100,0,0.2)`, borderRadius: 3,
                    padding: '10px 12px', marginBottom: 16, lineHeight: 1.5,
                  }}>
                    既存のPuzzleWorkアカウントに、新しい会社を追加します。
                  </div>
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink400, letterSpacing: '0.09em', marginBottom: 6 }}>
                      メールアドレス
                    </label>
                    <input
                      type="email" value={email} onChange={e => setEmail(e.target.value)}
                      required placeholder="登録済みのメールアドレス" style={inputStyle} autoFocus
                    />
                  </div>
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: T.ink400, letterSpacing: '0.09em', marginBottom: 6 }}>
                      パスワード
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
                    {loading ? '参加中…' : 'このアカウントで参加'}
                  </button>
                </form>
              )}

              <div style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: T.ink400 }}>
                {mode === 'new' ? (
                  <>
                    既にアカウントをお持ちの方は{' '}
                    <button
                      onClick={() => setMode('existing')}
                      style={{ background: 'none', border: 'none', color: T.ink600, fontWeight: 600, fontSize: 11, cursor: 'pointer', padding: 0 }}
                    >
                      こちら
                    </button>
                  </>
                ) : (
                  <>
                    アカウントをお持ちでない方は{' '}
                    <button
                      onClick={() => setMode('new')}
                      style={{ background: 'none', border: 'none', color: T.ink600, fontWeight: 600, fontSize: 11, cursor: 'pointer', padding: 0 }}
                    >
                      新規登録
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {inviteInfo?.status !== 'valid' && !infoLoading && (
            <div style={{ padding: '24px', textAlign: 'center' }}>
              <Link to="/login" style={{ color: T.ink600, fontWeight: 600, fontSize: 13 }}>
                ログインページへ
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
