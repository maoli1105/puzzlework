/**
 * ErrorBoundary — 未捕捉の例外で画面が真っ白になるのを防ぐ
 * App ルートと各 Shell に設置する。
 */

import React from 'react';

interface Props {
  children: React.ReactNode;
  /** エラー発生時に表示するフォールバック。省略時はデフォルト UI */
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 将来的に Sentry 等に送れる場所
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
    window.location.href = '/';
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    const msg = this.state.error.message ?? '不明なエラー';

    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#F2F2F2', fontFamily: '-apple-system, "Helvetica Neue", sans-serif',
        padding: 24,
      }}>
        <div style={{ maxWidth: 480, width: '100%' }}>

          {/* Icon */}
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 8, background: '#111',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 22, lineHeight: 1 }}>P</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111', letterSpacing: '-0.02em' }}>
              予期しないエラーが発生しました
            </div>
          </div>

          {/* Error box */}
          <div style={{
            background: '#fff', border: '1px solid #CCCCCC', borderRadius: 4,
            padding: '16px 18px', marginBottom: 16,
          }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#888', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
              エラー詳細
            </div>
            <code style={{ fontSize: 11, color: '#E60012', display: 'block', wordBreak: 'break-all', lineHeight: 1.6 }}>
              {msg}
            </code>
          </div>

          <button
            onClick={this.handleReset}
            style={{
              width: '100%', padding: '13px 0',
              background: '#111', color: '#fff',
              border: 'none', borderRadius: 4,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            トップページに戻る
          </button>

          <div style={{ marginTop: 12, textAlign: 'center', fontSize: 10, color: '#888' }}>
            問題が続く場合はページをリロードしてください
          </div>
        </div>
      </div>
    );
  }
}
