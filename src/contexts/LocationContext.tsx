import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { Coords, saveLocation, loadLocation } from '../lib/geo';
import { CITIES, getCity, cityFromLabel, DEFAULT_CITY_NAME, type City } from '../lib/cities';

type Status = 'idle' | 'prompting' | 'granted' | 'denied' | 'unavailable';
interface Ctx {
  location: Coords | null;
  status: Status;
  requestLocation: () => void;
  setManual: (c: Coords) => void;
  // City-first context: the selected city pins data across every page.
  city: City;
  setCity: (name: string) => void;
  /** Live GPS fix (when permission granted) — maps center here, data stays city-scoped. */
  live: Coords | null;
  /** Effective map center: live GPS when available, else the selected city. */
  mapCenter: Coords;
  isLive: boolean;
}
const LocationContext = createContext<Ctx>({
  location: null, status: 'idle', requestLocation: () => {}, setManual: () => {},
  city: CITIES[0], setCity: () => {}, live: null,
  mapCenter: { lat: CITIES[0].lat, lng: CITIES[0].lng, label: CITIES[0].name }, isLive: false,
});

// Default fallback center (Jaipur — India-first) so the map always renders
// and nearby results are populated even before the user grants location.
export const DEFAULT_CENTER: Coords = { lat: 26.9124, lng: 75.7873, label: 'Jaipur' };

// Popular Indian cities for quick manual selection.
export const POPULAR_CITIES: Coords[] = CITIES.map((c) => ({ lat: c.lat, lng: c.lng, label: c.name }));

const ASKED_KEY = 'velora-loc-asked';
const CITY_KEY = 'velora-city';

function loadCity(): City {
  try {
    const saved = localStorage.getItem(CITY_KEY);
    if (saved) {
      const hit = getCity(saved);
      if (hit) return hit;
    }
    const loc = loadLocation();
    if (loc?.label) return cityFromLabel(loc.label);
  } catch { /* storage unavailable */ }
  return getCity(DEFAULT_CITY_NAME)!;
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useState<Coords | null>(() => loadLocation());
  const [status, setStatus] = useState<Status>('idle');
  const [city, setCityState] = useState<City>(() => loadCity());
  const [live, setLive] = useState<Coords | null>(null);

  // Core fetch. `silent` avoids setting the "prompting" UI state when we already
  // know permission is granted (no visible prompt will appear).
  const doFetch = useCallback((silent = false) => {
    if (!('geolocation' in navigator)) { setStatus('unavailable'); return; }
    if (!silent) setStatus('prompting');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: Coords = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Current location' };
        setLocation(c); setLive(c); saveLocation(c); setStatus('granted');
        try { localStorage.setItem(ASKED_KEY, 'granted'); } catch { /* non-fatal */ }
      },
      (err) => {
        const denied = err.code === err.PERMISSION_DENIED;
        setStatus(denied ? 'denied' : 'unavailable');
        try { localStorage.setItem(ASKED_KEY, denied ? 'denied' : 'unavailable'); } catch { /* non-fatal */ }
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 1000 * 60 * 30 }
    );
  }, []);

  // Explicit, user-initiated request (button tap). Won't nag if already denied.
  const requestLocation = useCallback(() => {
    try {
      if (localStorage.getItem(ASKED_KEY) === 'denied') { setStatus('denied'); return; }
    } catch { /* storage unavailable */ }
    doFetch(false);
  }, [doFetch]);

  const setCity = useCallback((name: string) => {
    const c = getCity(name);
    if (!c) return;
    setCityState(c);
    try { localStorage.setItem(CITY_KEY, c.name); } catch { /* non-fatal */ }
    // Keep the legacy `location` in sync so existing pages keep working.
    const coords: Coords = { lat: c.lat, lng: c.lng, label: c.name };
    setLocation(coords);
    saveLocation(coords);
  }, []);

  const setManual = useCallback((c: Coords) => {
    setLocation(c); saveLocation(c); setStatus('granted');
    try { localStorage.setItem(ASKED_KEY, 'granted'); } catch { /* non-fatal */ }
    // If the manual pick matches a known city, pin it as the active city.
    const match = cityFromLabel(c.label);
    if (match && c.label && match.name.toLowerCase() === c.label.split(',')[0].trim().toLowerCase()) {
      setCityState(match);
      try { localStorage.setItem(CITY_KEY, match.name); } catch { /* non-fatal */ }
    }
  }, []);

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

  const mapCenter: Coords = useMemo(() => {
    if (live) return live;
    return { lat: city.lat, lng: city.lng, label: city.name };
  }, [live, city]);

  const value = useMemo(() => ({
    location: location || { lat: city.lat, lng: city.lng, label: city.name },
    status, requestLocation, setManual, city, setCity, live,
    mapCenter, isLive: !!live,
  }), [location, status, requestLocation, setManual, city, setCity, live, mapCenter]);

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}
export const useLocation = () => useContext(LocationContext);
