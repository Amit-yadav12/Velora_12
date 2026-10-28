import { useEffect, useState } from 'react';
import { isDemoMode } from '../../lib/supabase';

type Permission = NotificationPermission | 'unavailable';
function permission(): Permission {
  if (!window.isSecureContext || !('Notification' in window)) return 'unavailable';
  return Notification.permission;
}

/** Permission is only requested in direct response to the user's click. */
export default function BrowserAlerts() {
  const [status, setStatus] = useState<Permission>(permission);
  const [error, setError] = useState('');
  useEffect(() => {
    const refresh = () => setStatus(permission());
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  const allow = async () => {
    setError('');
    try { setStatus(await Notification.requestPermission()); }
    catch { setError('Could not request permission. Check your browser settings and try again.'); }
  };
  return <section aria-label="Browser notifications" className="p-4 text-sm">
    <p className="font-medium">Browser notifications</p>
    <p role="status" className="mt-1 text-xs text-dim">
      {status === 'unavailable' ? 'Unavailable in this browser or on an insecure connection. Use HTTPS and a supported browser.' :
        status === 'denied' ? 'Blocked. Allow notifications in your browser site settings, then return here.' :
        status === 'granted' ? 'Permission allowed. Change it in your browser site settings.' : 'Permission not requested yet.'}
    </p>
    <p className="mt-2 text-xs text-dim">{isDemoMode ? 'Sample mode does not send device alerts.' : 'New in-app alerts can appear while this app is open and connected. Background push and guaranteed delivery are not available.'}</p>
    {status === 'default' && <button type="button" onClick={allow} className="mt-3 min-h-11 rounded-lg border border-app px-3 font-medium">Allow browser notifications</button>}
    {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
  </section>;
}
