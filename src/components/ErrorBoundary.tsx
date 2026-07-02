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

  reset = () => {
    // Clear any stale service-worker caches then hard reload.
    if ('caches' in window) caches.keys().then((k) => Promise.all(k.map((c) => caches.delete(c)))).finally(() => location.reload());
    else location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#05060a', color: '#f5f7fb', fontFamily: 'Inter, system-ui, sans-serif', padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, margin: '0 auto 20px', background: 'linear-gradient(100deg,#3b82f6,#6366f1)', display: 'grid', placeItems: 'center', fontSize: 26 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>Something needs a refresh</h1>
          <p style={{ color: '#9aa3b5', fontSize: 14, margin: '0 0 20px' }}>The app hit an unexpected error. Reloading usually fixes it.</p>
          <button onClick={this.reset} style={{ background: 'linear-gradient(100deg,#3b82f6,#6366f1)', color: '#fff', border: 0, borderRadius: 12, padding: '11px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Reload Velora
          </button>
          <pre style={{ marginTop: 20, fontSize: 11, color: '#6b7488', whiteSpace: 'pre-wrap', textAlign: 'left', background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)' }}>{this.state.message}</pre>
        </div>
      </div>
    );
  }
}
