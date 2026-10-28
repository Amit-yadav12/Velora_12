import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { loadGoogleMaps, onGoogleMapsAuthFailure } from '../../lib/mapsLoader';
import type { MapBusiness } from '../../lib/mapData';
import LocationMap from './LocationMap';

interface Point { lat: number; lng: number }
interface Props {
  center: Point;
  markers?: MapBusiness[];
  selected?: Point | null;
  onPick?: (point: Point) => void;
  onSelect?: (id: number | string) => void;
  activeId?: number | string | null;
}

/** Google Maps when configured; an attributed OpenStreetMap picker otherwise. */
export default function InteractiveMap({ center, markers = [], selected, onPick, onSelect, activeId }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const googleMap = useRef<google.maps.Map | null>(null);
  const leaflet = useRef<L.Map | null>(null);
  const [provider, setProvider] = useState<'loading' | 'google' | 'osm' | 'roadmap'>('loading');
  const [notice, setNotice] = useState('');
  const pickerRef = useRef(onPick);
  const selectRef = useRef(onSelect);
  useEffect(() => { pickerRef.current = onPick; selectRef.current = onSelect; }, [onPick, onSelect]);
  const googleMarkers = useRef<google.maps.Marker[]>([]);
  const leafMarkers = useRef<L.Marker[]>([]);

  useEffect(() => {
    let alive = true;
    let tilesBlocked = false;
    let fallbackTimer: number | undefined;
    const initFallback = () => {
      if (!alive || !element.current || leaflet.current || tilesBlocked) return;
      const map = L.map(element.current, { zoomControl: true }).setView([center.lat, center.lng], 13);
      const tiles = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      tiles.on('tileerror', () => {
        if (tilesBlocked) return;
        tilesBlocked = true;
        // Stop requests to a blocked tile service, and avoid rendering its error tiles.
        fallbackTimer = window.setTimeout(() => {
          if (!alive) return;
          map.remove(); leaflet.current = null; leafMarkers.current = [];
          setProvider('roadmap');
          setNotice(pickerRef.current ? 'Interactive map unavailable. Google map view is read-only; enter coordinates below.' : 'Interactive map unavailable. Google map view is read-only; use the results list.');
        }, 0);
      });
      map.on('click', (e) => pickerRef.current?.({ lat: e.latlng.lat, lng: e.latlng.lng }));
      leaflet.current = map; setProvider('osm');
      window.setTimeout(() => map.invalidateSize(), 100);
    };
    const unsubscribe = onGoogleMapsAuthFailure(() => {
      if (!alive) return;
      setNotice('Google Maps authorization failed; using OpenStreetMap.');
      googleMarkers.current.forEach((m) => m.setMap(null)); googleMarkers.current = [];
      googleMap.current = null;
      if (element.current && !leaflet.current) element.current.replaceChildren();
      initFallback();
    });
    loadGoogleMaps().then((g) => {
      if (!alive || !element.current || leaflet.current || tilesBlocked) return;
      const map = new g.maps.Map(element.current, { center, zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) pickerRef.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
      googleMap.current = map; setProvider('google');
    }).catch(() => {
      if (import.meta.env.VITE_GOOGLE_MAPS_API_KEY) setNotice('Google Maps unavailable; using OpenStreetMap.');
      initFallback();
    });
    return () => {
      alive = false; unsubscribe(); if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
      googleMarkers.current.forEach((m) => m.setMap(null)); googleMarkers.current = [];
      googleMap.current = null;
      leaflet.current?.remove(); leaflet.current = null;
    };
    // The initial center seeds the map; later changes are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (googleMap.current) googleMap.current.panTo(center);
    if (leaflet.current) leaflet.current.setView([center.lat, center.lng], leaflet.current.getZoom());
  // Center object is derived from these primitives.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng]);

  useEffect(() => {
    if (provider === 'google' && googleMap.current && window.google?.maps) {
      googleMarkers.current.forEach((m) => m.setMap(null));
      googleMarkers.current = [];
      for (const b of markers) {
        const marker = new window.google.maps.Marker({ map: googleMap.current, position: { lat: b.lat, lng: b.lng }, title: b.name,
          animation: String(activeId) === String(b.id) ? window.google.maps.Animation.DROP : undefined });
        marker.addListener('click', () => selectRef.current?.(b.id));
        googleMarkers.current.push(marker);
      }
      if (selected) {
        const marker = new window.google.maps.Marker({ map: googleMap.current, position: selected, draggable: !!pickerRef.current, title: 'Drag to set your business location' });
        marker.addListener('dragend', (e: google.maps.MapMouseEvent) => { if (e.latLng) pickerRef.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng() }); });
        googleMarkers.current.push(marker);
      }
    }
    if (provider === 'osm' && leaflet.current) {
      const map = leaflet.current;
      leafMarkers.current.forEach((m) => m.remove()); leafMarkers.current = [];
      const icon = L.divIcon({ className: '', html: '<span style="display:block;width:20px;height:20px;background:#6366f1;border:3px solid white;border-radius:50%;box-shadow:0 2px 12px #0008"></span>', iconSize: [20, 20], iconAnchor: [10, 10] });
      for (const b of markers) {
        const marker = L.marker([b.lat, b.lng], { icon, title: b.name }).addTo(map);
        marker.on('click', () => selectRef.current?.(b.id)); leafMarkers.current.push(marker);
      }
      if (selected) {
        const marker = L.marker([selected.lat, selected.lng], { icon, draggable: !!pickerRef.current, title: 'Drag to set your business location' }).addTo(map);
        marker.on('dragend', () => { const p = marker.getLatLng(); pickerRef.current?.({ lat: p.lat, lng: p.lng }); });
        leafMarkers.current.push(marker);
      }
    }
  // Coordinates are the meaningful selected-pin dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, markers, selected?.lat, selected?.lng, activeId]);

  return <div className="relative h-full min-h-[240px] w-full overflow-hidden rounded-2xl border border-app">
    <div ref={element} className={`h-full min-h-[240px] w-full ${provider === 'roadmap' ? 'hidden' : ''}`} role="application" aria-label={onPick ? 'Map: click or drag the marker to choose a location' : 'Map of matching businesses; select a marker to open its profile'} />
    {provider === 'roadmap' && <LocationMap center={selected || center} />}
    {provider === 'loading' && <div className="absolute inset-0 grid place-items-center bg-elev text-sm text-dim">Loading map…</div>}
    {notice && <div className="absolute bottom-2 left-2 z-[500] rounded-lg bg-elev px-2 py-1 text-xs text-muted shadow">{notice}</div>}
  </div>;
}
