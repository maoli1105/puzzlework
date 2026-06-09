import React from 'react';

interface State { error: Error | null; }

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          minHeight: 240, gap: 12, padding: 32, fontFamily: 'var(--font)',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18,
          }}>!</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-1)' }}>
            表示できませんでした
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', maxWidth: 320, textAlign: 'center' }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '6px 16px', borderRadius: 'var(--r-md)',
              background: 'var(--accent)', color: '#fff',
              border: 'none', cursor: 'pointer', fontSize: 12,
            }}
          >
            再試行
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
