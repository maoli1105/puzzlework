import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { Settings, Users, CreditCard, Shield, Copy, Check, Plus, Trash2, Link2, Zap } from 'lucide-react';
import { auth as authApi, users } from '../../services/api';
import api from '../../services/api';

type Tab = 'company' | 'members' | 'plan' | 'integrations' | 'security';

interface Member {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'worker' | 'external';
  created_at: string;
  total_pieces_done: number;
}

const PLAN_FEATURES: Record<string, { label: string; color: string; limit: string; features: string[] }> = {
  free:       { label: 'Free',       color: '#888888', limit: '5名まで',   features: ['ボード・カンバン', '基本ピース管理', '5名のワーカー'] },
  pro:        { label: 'Pro',        color: '#B46400', limit: '50名まで',  features: ['全機能アクセス', 'ガント・速度分析', 'AI文章解析', 'マーケットプレイス', 'スキルツリー', '50名のワーカー'] },
  enterprise: { label: 'Enterprise', color: '#111111', limit: '無制限',   features: ['Proの全機能', 'SSO・SAML', '専任サポート', 'SLA保証', 'カスタム統合'] },
};

export default function SettingsPage() {
  const { user, refreshUser } = useAuthStore();
  const [searchParams] = useSearchParams();

  // plan / company_name を常に最新にする
  useEffect(() => { refreshUser(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab');
    return (t === 'plan' || t === 'members' || t === 'security') ? t : 'company';
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);

  // Company form
  const [companyName, setCompanyName] = useState(() =>
    useAuthStore.getState().user?.company_name ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Invite history
  type InviteRow = { id: string; token: string; role: string; expires_at: string; used_at: string | null; used_by_name: string | null };
  const [inviteHistory, setInviteHistory] = useState<InviteRow[]>([]);

  // Invite form
  const [inviteRole, setInviteRole] = useState<'admin' | 'worker'>('worker');
  const [inviteEmailInput, setInviteEmailInput] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState(false);
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false);

  // Password change form
  const [pwCurrent, setPwCurrent]   = useState('');
  const [pwNew,     setPwNew]       = useState('');
  const [pwConfirm, setPwConfirm]   = useState('');
  const [pwSaving,  setPwSaving]    = useState(false);
  const [pwError,   setPwError]     = useState('');
  const [pwSuccess, setPwSuccess]   = useState(false);

  // API key copy
  const [copied, setCopied] = useState(false);
  const apiKey = user ? `pwk_${btoa(user.id).replace(/=/g, '').slice(0, 32)}` : '';

  useEffect(() => {
    if (tab === 'members') {
      setLoading(true);
      Promise.all([
        api.get('/users/company/workers'),
        authApi.invites(),
      ]).then(([membersRes, invites]) => {
        setMembers(membersRes.data);
        setInviteHistory(invites);
      }).catch(() => {}).finally(() => setLoading(false));
    }
  }, [tab]);

  async function handleSaveCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!companyName.trim()) return;
    setSaving(true);
    try {
      await users.updateCompany(companyName.trim());
      await refreshUser();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      alert(msg ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(id: string, role: 'admin' | 'worker') {
    try {
      await users.updateRole(id, role);
      setMembers(prev => prev.map(m => m.id === id ? { ...m, role } : m));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      alert(msg ?? 'ロールの変更に失敗しました');
    }
  }

  async function handleRemoveMember(id: string, name: string) {
    if (!window.confirm(`${name} をワークスペースから削除しますか？\nこの操作は取り消せません。`)) return;
    try {
      await users.remove(id);
      setMembers(prev => prev.filter(m => m.id !== id));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      alert(msg ?? '削除に失敗しました');
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);
    setInviteLink(null);
    setInviteEmailSent(false);
    try {
      const emailVal = inviteEmailInput.trim() || undefined;
      const { token, email_sent } = await authApi.invite(inviteRole, emailVal);
      setInviteLink(`${window.location.origin}/join/${token}`);
      setInviteEmailSent(!!email_sent);
      authApi.invites().then(setInviteHistory).catch(() => {});
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      alert(msg ?? '招待リンクの生成に失敗しました');
    } finally { setInviting(false); }
  }

  function handleCopyInviteLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setInviteLinkCopied(true);
    setTimeout(() => setInviteLinkCopied(false), 2500);
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError('');
    if (pwNew !== pwConfirm) { setPwError('新しいパスワードが一致しません'); return; }
    if (pwNew.length < 8)    { setPwError('パスワードは8文字以上にしてください'); return; }
    setPwSaving(true);
    try {
      await users.changePassword(pwCurrent, pwNew);
      setPwSuccess(true);
      setPwCurrent(''); setPwNew(''); setPwConfirm('');
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setPwError(msg ?? 'パスワードの変更に失敗しました');
    } finally { setPwSaving(false); }
  }

  function handleCopyApiKey() {
    navigator.clipboard.writeText(apiKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Slack 連携
  const [slackWebhook, setSlackWebhook] = useState('');
  const [slackSaving, setSlackSaving] = useState(false);
  const [slackSaved, setSlackSaved] = useState(false);
  const [slackError, setSlackError] = useState('');
  const [slackTesting, setSlackTesting] = useState(false);
  const [slackTestResult, setSlackTestResult] = useState<'ok' | 'error' | null>(null);

  useEffect(() => {
    if (tab === 'integrations') {
      api.get('/notifications/settings').then(r => {
        setSlackWebhook(r.data.slack_webhook_url ?? '');
      }).catch(() => {});
    }
  }, [tab]);

  async function handleSaveSlack(e: React.FormEvent) {
    e.preventDefault();
    setSlackSaving(true);
    setSlackError('');
    setSlackSaved(false);
    try {
      await api.put('/notifications/settings', { slack_webhook_url: slackWebhook });
      setSlackSaved(true);
      setTimeout(() => setSlackSaved(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setSlackError(msg ?? '保存に失敗しました');
    } finally { setSlackSaving(false); }
  }

  async function handleTestSlack() {
    setSlackTesting(true);
    setSlackTestResult(null);
    try {
      await api.post('/notifications/test');
      setSlackTestResult('ok');
    } catch {
      setSlackTestResult('error');
    } finally { setSlackTesting(false); }
  }

  const [planChanging, setPlanChanging] = useState(false);
  async function handleUpgrade(key: string) {
    setPlanChanging(true);
    try {
      await users.updatePlan(key as 'free' | 'pro' | 'enterprise');
      await refreshUser();
    } catch { /* ignore */ }
    finally { setPlanChanging(false); }
  }

  const plan = user?.plan ?? 'free';
  const planInfo = PLAN_FEATURES[plan] ?? PLAN_FEATURES.pro;

  const TABS: { key: Tab; label: string; Icon: React.ElementType }[] = [
    { key: 'company',      label: '会社設定',     Icon: Settings },
    { key: 'members',      label: 'メンバー管理', Icon: Users },
    { key: 'plan',         label: 'プラン',       Icon: CreditCard },
    { key: 'integrations', label: '連携',         Icon: Zap },
    { key: 'security',     label: 'セキュリティ', Icon: Shield },
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '20px 24px 0', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em', marginBottom: 16 }}>設定</div>
        <div style={{ display: 'flex', gap: 0 }}>
          {TABS.map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setTab(key)} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', fontSize: 12, fontWeight: tab === key ? 600 : 400,
              color: tab === key ? 'var(--accent)' : 'var(--text-2)',
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: -1,
            }}>
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {/* ── Company ── */}
        {tab === 'company' && (
          <div style={{ maxWidth: 480 }}>
            <SectionTitle>基本情報</SectionTitle>
            <form onSubmit={handleSaveCompany} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <FieldRow label="会社名">
                <input
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder={user?.company_name ?? '会社名を入力'}
                  style={inputSt}
                />
              </FieldRow>
              <FieldRow label="管理者メール">
                <input value={user?.email ?? ''} readOnly style={{ ...inputSt, background: 'var(--surface-sub)', color: 'var(--text-3)', cursor: 'default' }} />
              </FieldRow>
              <FieldRow label="ロール">
                <div style={{ fontSize: 12, color: 'var(--text-2)', padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface-sub)' }}>
                  管理者（Admin）
                </div>
              </FieldRow>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" disabled={saving} style={primaryBtnSt}>
                  {saved ? <><Check size={12} /> 保存しました</> : saving ? '保存中...' : '変更を保存'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Members ── */}
        {tab === 'members' && (
          <div style={{ maxWidth: 640 }}>
            <SectionTitle>メンバーを招待</SectionTitle>
            <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: inviteLink ? 12 : 24 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="email"
                  value={inviteEmailInput}
                  onChange={e => setInviteEmailInput(e.target.value)}
                  placeholder="招待先のメールアドレス（任意）"
                  style={{ ...inputSt, flex: 1 }}
                />
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as 'admin' | 'worker')} style={{ ...inputSt, width: 'auto' }}>
                  <option value="worker">ワーカー</option>
                  <option value="admin">管理者</option>
                </select>
              </div>
              <button type="submit" disabled={inviting} style={{ ...primaryBtnSt, alignSelf: 'flex-start' }}>
                <Plus size={12} />
                {inviting ? '生成中...' : '招待リンクを発行'}
              </button>
            </form>
            {inviteLink && (
              <div style={{ marginBottom: 24, padding: '12px 14px', background: 'rgba(180,100,0,0.04)', border: '1px solid rgba(180,100,0,0.25)', borderRadius: 'var(--r-sm)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#B46400', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    招待リンク（7日間有効）
                  </div>
                  {inviteEmailSent && (
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#16a34a', background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.25)', borderRadius: 99, padding: '1px 8px' }}>
                      ✓ メール送信済み
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code style={{ flex: 1, fontSize: 11, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                    {inviteLink}
                  </code>
                  <button onClick={handleCopyInviteLink} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#B46400', color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                    {inviteLinkCopied ? <><Check size={11} /> コピー済み</> : <><Link2 size={11} /> コピー</>}
                  </button>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
                  {inviteEmailSent
                    ? `${inviteEmailInput} にメールを送信しました。`
                    : 'このURLをメンバーに共有してください。'}
                </div>
              </div>
            )}

            <SectionTitle>現在のメンバー</SectionTitle>
            {loading ? (
              <div style={{ color: 'var(--text-3)', fontSize: 12, padding: '12px 0' }}>読み込み中...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Current user */}
                <MemberRow
                  id={user?.id ?? ''}
                  name={user?.name ?? ''}
                  email={user?.email ?? ''}
                  role={user?.role ?? 'admin'}
                  piecesDone={0}
                  isSelf
                />
                {members.map(m => (
                  <MemberRow
                    key={m.id}
                    id={m.id}
                    name={m.name}
                    email={m.email}
                    role={m.role}
                    piecesDone={m.total_pieces_done ?? 0}
                    onRoleChange={handleRoleChange}
                    onRemove={handleRemoveMember}
                  />
                ))}
              </div>
            )}

            {inviteHistory.length > 0 && (
              <>
                <SectionTitle style={{ marginTop: 24 }}>招待履歴（直近20件）</SectionTitle>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {inviteHistory.map(inv => {
                    const expired = new Date(inv.expires_at) < new Date();
                    const used = !!inv.used_at;
                    const pending = !used && !expired;
                    return (
                      <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 11 }}>
                        <span style={{ width: 52, flexShrink: 0, fontWeight: 700, fontSize: 10, padding: '2px 7px', borderRadius: 'var(--r-sm)', textAlign: 'center', background: used ? 'rgba(0,0,0,0.06)' : pending ? 'rgba(180,100,0,0.08)' : 'var(--surface-sub)', color: used ? 'var(--text-2)' : pending ? '#B46400' : 'var(--text-3)' }}>
                          {used ? '使用済' : pending ? '有効' : '期限切'}
                        </span>
                        <span style={{ color: 'var(--text-3)', fontSize: 10, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                          /join/{inv.token.slice(0, 12)}…
                        </span>
                        <span style={{ color: 'var(--text-3)', flexShrink: 0, fontSize: 10 }}>{inv.role === 'admin' ? '管理者' : 'ワーカー'}</span>
                        {used && inv.used_by_name && (
                          <span style={{ color: 'var(--text-2)', flexShrink: 0, fontSize: 10 }}>{inv.used_by_name}</span>
                        )}
                        {!used && pending && (
                          <button
                            onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/join/${inv.token}`); }}
                            style={{ flexShrink: 0, padding: '2px 8px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 10, cursor: 'pointer', color: 'var(--text-2)' }}
                          >
                            再コピー
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Plan ── */}
        {tab === 'plan' && (
          <div style={{ maxWidth: 600 }}>
            <SectionTitle>現在のプラン</SectionTitle>
            <div style={{ background: 'var(--accent-sub)', border: `2px solid ${planInfo.color}`, borderRadius: 'var(--r-lg)', padding: '20px 24px', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: planInfo.color, letterSpacing: '-0.02em' }}>{planInfo.label}</span>
                <span style={{ fontSize: 11, padding: '2px 8px', background: planInfo.color, color: '#fff', borderRadius: 'var(--r-sm)', fontWeight: 600 }}>現在のプラン</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>ワーカー上限: <strong>{planInfo.limit}</strong></div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {planInfo.features.map(f => (
                  <span key={f} style={{ fontSize: 11, padding: '3px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--text-2)' }}>
                    ✓ {f}
                  </span>
                ))}
              </div>
            </div>

            <SectionTitle>プランを変更</SectionTitle>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              {Object.entries(PLAN_FEATURES).map(([key, info]) => (
                <div key={key} style={{ border: `1.5px solid ${key === plan ? info.color : 'var(--border)'}`, borderRadius: 'var(--r-lg)', padding: '16px', background: key === plan ? 'var(--accent-sub)' : 'var(--surface)' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: info.color, marginBottom: 4 }}>{info.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 12 }}>{info.limit}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                    {info.features.map(f => <div key={f} style={{ fontSize: 10, color: 'var(--text-2)' }}>✓ {f}</div>)}
                  </div>
                  {key !== plan ? (
                    <button
                      onClick={() => handleUpgrade(key)}
                      disabled={planChanging}
                      style={{ width: '100%', padding: '6px 0', background: info.color, color: '#fff', border: 'none', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, cursor: planChanging ? 'not-allowed' : 'pointer', opacity: planChanging ? 0.6 : 1 }}
                    >
                      {key === 'enterprise' ? 'お問い合わせ' : planChanging ? '変更中…' : plan === 'pro' && key === 'free' ? 'ダウングレード' : 'アップグレード'}
                    </button>
                  ) : (
                    <div style={{ textAlign: 'center', fontSize: 10, color: info.color, fontWeight: 600 }}>現在のプラン</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Integrations ── */}
        {tab === 'integrations' && (
          <div style={{ maxWidth: 520 }}>

            {/* Slack */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: '#4A154B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {/* Slack ロゴ （簡易） */}
                <svg width="18" height="18" viewBox="0 0 54 54" fill="none">
                  <path d="M19.7 31.9a4.5 4.5 0 1 1-4.5-4.5H19.7v4.5zm2.3 0a4.5 4.5 0 0 1 9 0v11.3a4.5 4.5 0 1 1-9 0V31.9z" fill="#E01E5A"/>
                  <path d="M22 19.7a4.5 4.5 0 1 1 4.5-4.5V19.7H22zm0 2.3a4.5 4.5 0 0 1 0 9H10.7a4.5 4.5 0 1 1 0-9H22z" fill="#36C5F0"/>
                  <path d="M34.3 22a4.5 4.5 0 1 1 4.5 4.5H34.3V22zm-2.3 0a4.5 4.5 0 0 1-9 0V10.7a4.5 4.5 0 1 1 9 0V22z" fill="#2EB67D"/>
                  <path d="M32 34.3a4.5 4.5 0 1 1-4.5 4.5V34.3H32zm0-2.3a4.5 4.5 0 0 1 0-9h11.3a4.5 4.5 0 1 1 0 9H32z" fill="#ECB22E"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>Slack 通知</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>
                  期限超過・当日締め切りのピースを毎朝 9:00 に通知
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveSlack} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <FieldRow label="Incoming Webhook URL">
                <input
                  type="url"
                  value={slackWebhook}
                  onChange={e => { setSlackWebhook(e.target.value); setSlackError(''); }}
                  placeholder="https://hooks.slack.com/services/..."
                  style={inputSt}
                />
              </FieldRow>

              {slackError && (
                <div style={{ fontSize: 11, color: '#E60012', background: 'rgba(230,0,18,0.05)', border: '1px solid rgba(230,0,18,0.2)', borderRadius: 'var(--r-sm)', padding: '8px 12px' }}>
                  {slackError}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button type="submit" disabled={slackSaving} style={{ ...primaryBtnSt, opacity: slackSaving ? 0.6 : 1 }}>
                  {slackSaving ? '保存中...' : slackSaved ? <><Check size={12} /> 保存済み</> : '保存'}
                </button>
                {slackWebhook && (
                  <button
                    type="button"
                    onClick={handleTestSlack}
                    disabled={slackTesting}
                    style={{ padding: '6px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 500, cursor: slackTesting ? 'not-allowed' : 'pointer', color: 'var(--text-2)', opacity: slackTesting ? 0.6 : 1 }}
                  >
                    {slackTesting ? 'テスト送信中...' : 'テスト送信'}
                  </button>
                )}
                {slackTestResult === 'ok' && (
                  <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 600 }}>✓ 送信成功</span>
                )}
                {slackTestResult === 'error' && (
                  <span style={{ fontSize: 11, color: '#E60012', fontWeight: 600 }}>✗ 送信失敗</span>
                )}
              </div>
            </form>

            {/* 設定方法の案内 */}
            <div style={{ marginTop: 28, padding: '14px 16px', background: 'var(--surface-sub)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
                設定方法
              </div>
              <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  'Slack の「App ディレクトリ」から「Incoming Webhooks」を検索',
                  '「Slackに追加」をクリックして通知先チャンネルを選択',
                  '発行された Webhook URL を上のフォームに貼り付けて保存',
                  '「テスト送信」でメッセージが届けば設定完了',
                ].map((step, i) => (
                  <li key={i} style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {/* ── Security ── */}
        {tab === 'security' && (
          <div style={{ maxWidth: 480 }}>
            <SectionTitle>APIキー</SectionTitle>
            <div style={{ background: 'var(--surface-sub)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '12px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                エージェント連携用APIキー
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code style={{ flex: 1, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {apiKey}
                </code>
                <button onClick={handleCopyApiKey} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', fontSize: 11, cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0 }}>
                  {copied ? <><Check size={11} /> コピー済み</> : <><Copy size={11} /> コピー</>}
                </button>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
                このキーはAIエージェントがPuzzleWork APIに接続する際に使用します。
                第三者に共有しないでください。
              </div>
            </div>

            <SectionTitle>パスワード変更</SectionTitle>
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              {pwError && (
                <div style={{ fontSize: 11, color: '#E60012', background: 'rgba(230,0,18,0.05)', border: '1px solid rgba(230,0,18,0.20)', borderRadius: 'var(--r-sm)', padding: '8px 12px' }}>
                  {pwError}
                </div>
              )}
              {pwSuccess && (
                <div style={{ fontSize: 11, color: 'var(--text-1)', background: 'rgba(0,0,0,0.04)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Check size={12} /> パスワードを変更しました
                </div>
              )}
              <FieldRow label="現在のパスワード">
                <input
                  type="password" value={pwCurrent}
                  onChange={e => setPwCurrent(e.target.value)}
                  placeholder="••••••••" style={inputSt} required
                />
              </FieldRow>
              <FieldRow label="新しいパスワード">
                <input
                  type="password" value={pwNew}
                  onChange={e => setPwNew(e.target.value)}
                  placeholder="8文字以上" style={inputSt} required
                />
              </FieldRow>
              <FieldRow label="確認">
                <input
                  type="password" value={pwConfirm}
                  onChange={e => setPwConfirm(e.target.value)}
                  placeholder="再入力" style={inputSt} required
                />
              </FieldRow>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="submit" disabled={pwSaving} style={{ ...primaryBtnSt, opacity: pwSaving ? 0.6 : 1, cursor: pwSaving ? 'not-allowed' : 'pointer' }}>
                  {pwSaving ? '変更中...' : 'パスワードを変更'}
                </button>
              </div>
            </form>

            <SectionTitle>危険な操作</SectionTitle>
            <div style={{ border: '1px solid rgba(230,0,18,0.25)', borderRadius: 'var(--r-sm)', padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#E60012', marginBottom: 2 }}>会社データを削除</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>全てのピース・プロジェクト・履歴が削除されます。この操作は取り消せません。</div>
              </div>
              <button
                onClick={() => alert('本番環境では追加確認ステップがあります。')}
                style={{ padding: '6px 14px', background: 'rgba(230,0,18,0.05)', color: '#E60012', border: '1px solid rgba(230,0,18,0.25)', borderRadius: 'var(--r-sm)', fontSize: 11, fontWeight: 600, cursor: 'pointer', flexShrink: 0, marginLeft: 16 }}>
                <Trash2 size={11} style={{ display: 'inline', marginRight: 4 }} />
                削除
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 12, marginTop: 4, ...style }}>
      {children}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>{label}</div>
      {children}
    </div>
  );
}

function MemberRow({
  id, name, email, role, piecesDone, isSelf,
  onRoleChange, onRemove,
}: {
  id: string; name: string; email: string; role: string;
  piecesDone: number; isSelf?: boolean;
  onRoleChange?: (id: string, role: 'admin' | 'worker') => void;
  onRemove?: (id: string, name: string) => void;
}) {
  const roleLabel: Record<string, string> = { admin: '管理者', worker: 'ワーカー', external: '外部' };
  const roleColor: Record<string, string> = { admin: '#4F46E5', worker: '#059669', external: '#D97706' };
  const [menuOpen, setMenuOpen] = React.useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)' }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', background: isSelf ? 'var(--accent)' : 'var(--zinc-600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
        {name[0]}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-1)' }}>
          {name}{isSelf && <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--text-3)' }}>（あなた）</span>}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</div>
      </div>
      <div style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--r-sm)', background: `${roleColor[role] ?? '#6B6B68'}15`, color: roleColor[role] ?? '#6B6B68', flexShrink: 0 }}>
        {roleLabel[role] ?? role}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{piecesDone}件完了</div>

      {/* 管理メニュー（自分自身には表示しない） */}
      {!isSelf && onRoleChange && onRemove && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 6px', borderRadius: 4, fontSize: 16, lineHeight: 1 }}
          >⋯</button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
              <div style={{ position: 'absolute', right: 0, top: 24, width: 160, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow-lg)', zIndex: 11, padding: '4px 0' }}>
                <button
                  onClick={() => { setMenuOpen(false); onRoleChange(id, role === 'admin' ? 'worker' : 'admin'); }}
                  style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text-2)', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-sub)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {role === 'admin' ? 'ワーカーに変更' : '管理者に変更'}
                </button>
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                <button
                  onClick={() => { setMenuOpen(false); onRemove(id, name); }}
                  style={{ width: '100%', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#E60012', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(230,0,18,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  メンバーを削除
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const inputSt: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
  padding: '7px 10px', fontSize: 12, background: 'var(--surface)',
  color: 'var(--text-1)', outline: 'none', boxSizing: 'border-box',
};

const primaryBtnSt: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 5,
  padding: '7px 16px', background: 'var(--text-1)', color: '#FAFAF8',
  border: 'none', borderRadius: 'var(--r-sm)', fontSize: 12,
  fontWeight: 600, cursor: 'pointer',
};
