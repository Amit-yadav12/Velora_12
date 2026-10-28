import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { registerPWA } from './lib/pwa'
import { pinDemoWindow, supabaseConfigError } from './lib/supabase'

registerPWA();

// `?demoRole=customer|business` opens this tab as a separate demo identity so a
// presenter can keep the business console signed in elsewhere and still book as
// a customer in a second window. Demo mode only; the parameter is stripped
// immediately so it never leaks into routes or shared links.
const demoRoleParam = new URLSearchParams(window.location.search).get('demoRole');
if (demoRoleParam === 'customer' || demoRoleParam === 'business') {
  pinDemoWindow(demoRoleParam === 'business' ? 'admin' : 'customer');
  const params = new URLSearchParams(window.location.search);
  params.delete('demoRole');
  const rest = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {supabaseConfigError ? (
        <main role="alert" className="min-h-screen grid place-items-center p-6">
          <div className="card max-w-lg p-8">
            <h1 className="text-xl font-semibold">Velora is not configured</h1>
            <p className="mt-3 text-sm text-muted">{supabaseConfigError}</p>
            <p className="mt-3 text-sm text-muted">No demo session or booking has been created.</p>
          </div>
        </main>
      ) : <App />}
    </ErrorBoundary>
  </StrictMode>,
)
