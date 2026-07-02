import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { categoryColor } from '../../lib/product';
import { Coords } from '../../lib/geo';

interface MapBusiness { id: number; name: string; lat?: number; lng?: number; category: string; rating: number; ai_score?: number; }

// Lightweight, key-free interactive map (Leaflet + OSM tiles) with animated
// pins, a pulsing "you are here" marker, and hover/active sync.
export default function MapView({ origin, businesses, activeId, onSelect, theme }: {
  origin: Coords; businesses: MapBusiness[]; activeId?: number | null; onSelect?: (id: number) => void; theme: 'dark' | 'light';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<number, L.Marker>>({});
  const originRef = useRef<L.Marker | null>(null);
  const tileRef = useRef<L.TileLayer | null>(null);

  // init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: false, attributionControl: false, scrollWheelZoom: true }).setView([origin.lat, origin.lng], 13);
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line
  }, []);

  // tiles (theme-aware)
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (tileRef.current) { map.removeLayer(tileRef.current); }
    const url = theme === 'dark'
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    tileRef.current = L.tileLayer(url, { maxZoom: 19 }).addTo(map);
  }, [theme]);

  // origin marker
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (originRef.current) originRef.current.remove();
    const icon = L.divIcon({ className: '', html: `<div class="relative"><div class="absolute -inset-3 rounded-full" style="background:rgba(99,102,241,0.25);animation:pulse-dot 2s infinite"></div><div class="relative h-4 w-4 rounded-full" style="background:#6366f1;border:2px solid #fff;box-shadow:0 0 0 2px #6366f1"></div></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
    originRef.current = L.marker([origin.lat, origin.lng], { icon, zIndexOffset: 1000 }).addTo(map);
    map.flyTo([origin.lat, origin.lng], 13, { duration: 0.8 });
  }, [origin.lat, origin.lng]);

  // business markers
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    Object.values(markersRef.current).forEach((m) => m.remove());
    markersRef.current = {};
    const pts: L.LatLngExpression[] = [[origin.lat, origin.lng]];
    businesses.forEach((b) => {
      if (b.lat == null || b.lng == null) return;
      const bLat: number = b.lat, bLng: number = b.lng;
      const color = categoryColor(b.category);
      const active = activeId === b.id;
      const icon = L.divIcon({ className: '', html: `<div style="transform:translate(-50%,-100%)"><div style="background:${active ? '#6366f1' : color};color:#fff;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:600;white-space:nowrap;box-shadow:0 4px 12px rgba(0,0,0,0.3);border:2px solid #fff;transition:all .2s;transform:scale(${active ? 1.1 : 1})">${b.rating.toFixed(1)}★</div><div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-top:6px solid #fff;margin:0 auto"></div></div>`, iconSize: [0, 0] });
      const marker = L.marker([bLat, bLng], { icon }).addTo(map);
      marker.on('click', () => onSelect?.(b.id));
      markersRef.current[b.id] = marker;
      pts.push([bLat, bLng]);
    });
    if (pts.length > 1) { try { map.fitBounds(L.latLngBounds(pts as any), { padding: [50, 50], maxZoom: 14 }); } catch { /* non-fatal */ } }
    // eslint-disable-next-line
  }, [businesses, activeId]);

  // pan to active
  useEffect(() => {
    const map = mapRef.current; if (!map || !activeId) return;
    const b = businesses.find((x) => x.id === activeId);
    if (b?.lat != null && b?.lng != null) map.panTo([b.lat, b.lng], { animate: true });
    // eslint-disable-next-line
  }, [activeId]);

  return <div ref={containerRef} className="h-full w-full rounded-2xl overflow-hidden z-0" />;
}
