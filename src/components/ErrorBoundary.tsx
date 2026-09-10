import { Component, type ReactNode } from 'react';

interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || 'Something went wrong' };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[Velora ErrorBoundary]', error, info);
  }

  continueAnyway = () => {
    this.setState({ hasError: false, message: '' });
  };

  reset = () => {
    this.setState({ hasError: false, message: '' });
    try { sessionStorage.removeItem('__velora_sw_recovered'); } catch { /* ignore */ }
    const goHome = () => { globalThis.location.assign('/'); };
    if (typeof caches !== 'undefined') {
      caches.keys().then((k) => Promise.all(k.map((c) => caches.delete(c)))).finally(goHome);
    } else {
      goHome();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#05060a', color: '#f5f7fb', fontFamily: 'Inter, system-ui, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 20px', background: 'linear-gradient(100deg,#3b82f6,#6366f1)', display: 'grid', placeItems: 'center', fontSize: 26 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>That screen hit a snag</h1>
          <p style={{ color: '#9aa3b5', fontSize: 14, margin: '0 0 20px' }}>You can keep going without a full reload — your demo bookings stay saved.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={this.continueAnyway} style={{ background: 'linear-gradient(100deg,#3b82f6,#6366f1)', color: '#fff', border: 0, borderRadius: 12, padding: '11px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Continue
            </button>
            <button onClick={this.reset} style={{ background: 'transparent', color: '#c2c9d6', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: '11px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              Go home
            </button>
          </div>
          <pre style={{ marginTop: 20, fontSize: 11, color: '#6b7488', whiteSpace: 'pre-wrap', textAlign: 'left', background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>{this.state.message}</pre>
        </div>
      </div>
    );
  }
}
