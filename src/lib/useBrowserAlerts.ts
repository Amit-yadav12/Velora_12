import { useEffect } from 'react';
import { apiGet, hasLiveSession } from './api';
import type { NotificationRow } from './types';

/** Show only newly received, server-authorized alerts while a live app is open.
 * Initial rows are a baseline; polling failures do not invent notifications. */
export function useBrowserAlerts(userId: string | undefined, audience: 'customer' | 'admin') {
  useEffect(() => {
    if (!userId || !hasLiveSession()) return;
    let active = true;
    let running = false;
    let seen: Set<string> | null = null;
    const poll = async () => {
      if (running || !window.isSecureContext || !('Notification' in window) || Notification.permission !== 'granted') { seen = null; return; }
      running = true;
      try {
        const rows = await apiGet<NotificationRow[]>('/api/notifications');
        if (!active || !Array.isArray(rows)) return;
        const scoped = rows.filter(n => audience === 'admin' ? n.audience === 'admin' : n.audience !== 'admin');
        const next = new Set(scoped.map(n => String(n.id)));
        if (seen && Notification.permission === 'granted') {
          for (const row of scoped) {
            if (!row.read && !seen.has(String(row.id))) {
              try { new Notification('Velora', { body: 'You have a new in-app notification. Open Velora to view it.', tag: `velora-${row.id}` }); } catch { /* unsupported platform */ }
            }
          }
        }
        seen = next;
      } catch { /* keep the baseline; never report delivery on API failure */ }
      finally { running = false; }
    };
    void poll();
    const timer = window.setInterval(poll, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [userId, audience]);
}
