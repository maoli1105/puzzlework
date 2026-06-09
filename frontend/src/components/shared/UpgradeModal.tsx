/**
 * UpgradeModal — 402 プランゲートに当たったときに表示するアップグレード促進モーダル
 * upgradeStore.show() でトリガー。AdminShell / WorkerShell 両方にマウント。
 */

import { useNavigate } from 'react-router-dom';
import { useUpgradeStore } from '../../store/upgradeStore';

const T = {
  ink900: '#111111', ink600: '#444444', ink400: '#888888',
  ink200: '#CCCCCC', ink100: '#F2F2F2', ink000: '#FFFFFF',
  accent: '#E60012',
} as const;

// プランごとの機能リスト（SettingsPage と対応）
const PLANS = [
  {
    key: 'free',
    label: 'Free',
    color: '#6B6B68',
    limit: '5名まで',
    features: ['ボード・カンバン', '基本ピース管理', '5名のワーカー'],
    cta: null,
  },
  {
    key: 'pro',
    label: 'Pro',
    color: '#1A56DB',
    limit: '50名まで',
    features: ['全機能アクセス', 'ガント・速度分析', 'マーケットプレイス', 'スキルツリー', '50名のワーカー'],
    cta: 'Pro にアップグレード',
  },
  {
    key: 'enterprise',
    label: 'Enterprise',
    color: '#7C3AED',
    limit: '無制限',
    features: ['Pro の全機能', 'SSO・SAML', '専任サポート', 'SLA保証', 'カスタム統合'],
    cta: 'お問い合わせ',
  },
] as const;

export default function UpgradeModal() {
  const { open, message, hide } = useUpgradeStore();
  const navigate = useNavigate();

  if (!open) return null;

  // "pro プラン" or "enterprise プラン" をメッセージから抽出して強調
  const requiredPlan = message.includes('enterprise') ? 'enterprise' : 'pro';

  function handleUpgrade(planKey: string) {
    hide();
    if (planKey === 'enterprise') {
      window.open('mailto:sales@puzzlework.jp?subject=Enterprise%E3%83%97%E3%83%A9%E3%83%B3%E3%81%AE%E3%81%8A%E5%95%8F%E3%81%84%E5%90%88%E3%82%8F%E3%81%9B', '_blank');
    } else {
      navigate('/settings?tab=plan');
    }
  }

  return (
    <>
      {/* Overlay */}
      <div
        onClick={hide}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 9000, backdropFilter: 'blur(2px)',
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9001,
        width: 'min(680px, 94vw)',
        background: T.ink000,
        border: `1px solid ${T.ink200}`,
        borderRadius: 4,
        padding: '32px 28px',
        fontFamily: '-apple-system, "Helvetica Neue", sans-serif',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.ink900, letterSpacing: '-0.02em', marginBottom: 6 }}>
              プランのアップグレードが必要です
            </div>
            <div style={{ fontSize: 12, color: T.ink400, lineHeight: 1.5 }}>
              {message || `この機能を使うには上位プランへの移行が必要です。`}
            </div>
          </div>
          <button
            onClick={hide}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: T.ink400, fontSize: 18, lineHeight: 1, marginLeft: 16, flexShrink: 0 }}
          >
            ✕
          </button>
        </div>

        {/* Plan cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {PLANS.map((plan) => {
            const isRequired = plan.key === requiredPlan;
            const isFree = plan.key === 'free';
            return (
              <div key={plan.key} style={{
                border: `${isRequired ? 2 : 1}px solid ${isRequired ? plan.color : T.ink200}`,
                borderRadius: 3,
                padding: '16px 14px',
                background: isRequired ? `${plan.color}08` : T.ink100,
                position: 'relative',
              }}>
                {isRequired && (
                  <div style={{
                    position: 'absolute', top: -1, left: 14,
                    transform: 'translateY(-50%)',
                    background: plan.color, color: T.ink000,
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                    padding: '2px 8px', borderRadius: 2,
                  }}>
                    必要なプラン
                  </div>
                )}

                <div style={{ fontSize: 14, fontWeight: 700, color: plan.color, marginBottom: 2 }}>
                  {plan.label}
                </div>
                <div style={{ fontSize: 10, color: T.ink400, marginBottom: 10 }}>
                  {plan.limit}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 14 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ fontSize: 10, color: isFree ? T.ink400 : T.ink600, display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                      <span style={{ color: plan.color, fontWeight: 700, flexShrink: 0 }}>✓</span>
                      {f}
                    </div>
                  ))}
                </div>

                {plan.cta && (
                  <button
                    onClick={() => handleUpgrade(plan.key)}
                    style={{
                      width: '100%', padding: '8px 0',
                      background: isRequired ? plan.color : T.ink200,
                      color: isRequired ? T.ink000 : T.ink600,
                      border: 'none', borderRadius: 2,
                      fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {plan.cta}
                  </button>
                )}
                {isFree && (
                  <div style={{ textAlign: 'center', fontSize: 10, color: T.ink400, fontWeight: 600 }}>
                    現在のプラン
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div style={{ fontSize: 10, color: T.ink400, textAlign: 'center', borderTop: `1px solid ${T.ink200}`, paddingTop: 14 }}>
          プランの詳細は{' '}
          <button
            onClick={() => { hide(); navigate('/settings?tab=plan'); }}
            style={{ background: 'none', border: 'none', color: T.ink600, fontWeight: 600, fontSize: 10, cursor: 'pointer', textDecoration: 'underline' }}
          >
            設定 › プラン
          </button>
          {' '}でご確認いただけます
        </div>
      </div>
    </>
  );
}
