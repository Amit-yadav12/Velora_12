import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Coords, saveLocation, loadLocation } from '../lib/geo';

type Status = 'idle' | 'prompting' | 'granted' | 'denied' | 'unavailable';
interface Ctx {
  location: Coords | null;
  status: Status;
  requestLocation: () => void;
  setManual: (c: Coords) => void;
}
const LocationContext = createContext<Ctx>({ location: null, status: 'idle', requestLocation: () => {}, setManual: () => {} });

// Default fallback center (Jaipur — India-first) so the map always renders
// and nearby results are populated even before the user grants location.
export const DEFAULT_CENTER: Coords = { lat: 26.9124, lng: 75.7873, label: 'Jaipur' };

// Popular Indian cities for quick manual selection.
export const POPULAR_CITIES: Coords[] = [
  { lat: 26.9124, lng: 75.7873, label: 'Jaipur' },
  { lat: 28.6139, lng: 77.209, label: 'Delhi' },
  { lat: 19.076, lng: 72.8777, label: 'Mumbai' },
  { lat: 12.9716, lng: 77.5946, label: 'Bengaluru' },
  { lat: 17.385, lng: 78.4867, label: 'Hyderabad' },
  { lat: 13.0827, lng: 80.2707, label: 'Chennai' },
  { lat: 18.5204, lng: 73.8567, label: 'Pune' },
  { lat: 23.0225, lng: 72.5714, label: 'Ahmedabad' },
  { lat: 22.5726, lng: 88.3639, label: 'Kolkata' },
  { lat: 26.8467, lng: 80.9462, label: 'Lucknow' },
  { lat: 30.7333, lng: 76.7794, label: 'Chandigarh' },
  { lat: 22.7196, lng: 75.8577, label: 'Indore' },
  { lat: 25.3176, lng: 82.9739, label: 'Varanasi' },
];

const ASKED_KEY = 'velora-loc-asked';

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<Coords | null>(() => loadLocation());
  const [status, setStatus] = useState<Status>('idle');

  // Core fetch. `silent` avoids setting the "prompting" UI state when we already
  // know permission is granted (no visible prompt will appear).
  const doFetch = useCallback((silent = false) => {
    if (!('geolocation' in navigator)) { setStatus('unavailable'); return; }
    if (!silent) setStatus('prompting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: Coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Current location' };
        setLocation(c); saveLocation(c); setStatus('granted');
        try { localStorage.setItem(ASKED_KEY, 'granted'); } catch {}
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        setStatus(denied ? 'denied' : 'unavailable');
        try { localStorage.setItem(ASKED_KEY, denied ? 'denied' : 'unavailable'); } catch {}
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 1000 * 60 * 30 }
    );
  }, []);

  // Explicit, user-initiated request (button tap). Won't nag if already denied.
  const requestLocation = useCallback(() => {
    if (localStorage.getItem(ASKED_KEY) === 'denied') { setStatus('denied'); return; }
    doFetch(false);
  }, [doFetch]);

  const setManual = useCallback((c: Coords) => { setLocation(c); saveLocation(c); setStatus('granted'); try { localStorage.setItem(ASKED_KEY, 'granted'); } catch {} }, []);

  // ONE-TIME permission handling: check the Permissions API WITHOUT prompting.
  // - already granted  -> silently refresh coords (no popup)
  // - denied/prompt    -> do nothing; user taps the location button to allow.
  // This prevents the browser from re-asking on every screen.
  useEffect(() => {
    if (location) { setStatus('granted'); return; }
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((res) => {
        if (res.state === 'granted') doFetch(true);
        else setStatus(res.state === 'denied' ? 'denied' : 'idle');
      }).catch(() => setStatus('idle'));
    }
    // eslint-disable-next-line
  }, []);

  return <LocationContext.Provider value={{ location, status, requestLocation, setManual }}>{children}</LocationContext.Provider>;
}
export const useLocation = () => useContext(LocationContext);
