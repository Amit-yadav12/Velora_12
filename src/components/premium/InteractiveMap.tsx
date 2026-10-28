import { useEffect, useRef, useState } from 'react';
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

/** Interactive Google map when configured, otherwise a read-only Google map. */
export default function InteractiveMap({ center, markers = [], selected, onPick, onSelect, activeId }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const googleMap = useRef<google.maps.Map | null>(null);
  const [provider, setProvider] = useState<'loading' | 'google' | 'readonly'>('loading');
  const pickerRef = useRef(onPick);
  const selectRef = useRef(onSelect);
  const googleMarkers = useRef<google.maps.Marker[]>([]);
  useEffect(() => { pickerRef.current = onPick; selectRef.current = onSelect; }, [onPick, onSelect]);

  useEffect(() => {
    let alive = true;
    let failed = false;
    const useReadonly = () => {
      if (!alive) return;
      failed = true;
      googleMarkers.current.forEach(m => m.setMap(null)); googleMarkers.current = [];
      googleMap.current = null;
      if (element.current) element.current.replaceChildren();
      setProvider('readonly');
    };
    const unsubscribe = onGoogleMapsAuthFailure(useReadonly);
    loadGoogleMaps().then(g => {
      if (!alive || failed || !element.current) return;
      const map = new g.maps.Map(element.current, { center, zoom: 13, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) pickerRef.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
      googleMap.current = map; setProvider('google');
    }).catch(useReadonly);
    return () => {
      alive = false; unsubscribe();
      googleMarkers.current.forEach(m => m.setMap(null)); googleMarkers.current = [];
      googleMap.current = null;
    };
    // Initial center seeds the map; updates are handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { googleMap.current?.panTo(center); }, [center.lat, center.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (provider !== 'google' || !googleMap.current || !window.google?.maps) return;
    googleMarkers.current.forEach(m => m.setMap(null)); googleMarkers.current = [];
    for (const b of markers) {
      const marker = new window.google.maps.Marker({ map: googleMap.current, position: { lat: b.lat, lng: b.lng }, title: b.name,
        animation: String(activeId) === String(b.id) ? window.google.maps.Animation.DROP : undefined });
      marker.addListener('click', () => selectRef.current?.(b.id)); googleMarkers.current.push(marker);
    }
    if (selected) {
      const marker = new window.google.maps.Marker({ map: googleMap.current, position: selected, draggable: !!pickerRef.current, title: 'Drag to set your business location' });
      marker.addListener('dragend', (e: google.maps.MapMouseEvent) => { if (e.latLng) pickerRef.current?.({ lat: e.latLng.lat(), lng: e.latLng.lng() }); });
      googleMarkers.current.push(marker);
    }
    // Coordinates are the meaningful selected-pin dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, markers, selected?.lat, selected?.lng, activeId]);

  return <div className="relative h-full min-h-[240px] w-full overflow-hidden rounded-2xl border border-app">
    <div ref={element} className={`h-full min-h-[240px] w-full ${provider === 'readonly' ? 'hidden' : ''}`} role="application" aria-label={onPick ? 'Map: click or drag the marker to choose a location' : 'Map of matching businesses; select a marker to open its profile'} />
    {provider === 'readonly' && <>
      <LocationMap center={selected || center} />
      <div role="status" className="absolute left-2 top-2 z-10 max-w-[55%] rounded-lg bg-elev px-2 py-1 text-xs text-muted shadow">{onPick ? 'Interactive Google map unavailable. Enter coordinates below; this map is read-only.' : 'Interactive Google map unavailable. Use the results list.'}</div>
    </>}
    {provider === 'loading' && <div className="absolute inset-0 grid place-items-center bg-elev text-sm text-dim">Loading map…</div>}
  </div>;
}
