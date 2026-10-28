import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { registerPWA } from './lib/pwa'
import { pinDemoWindow } from './lib/supabase'

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
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
