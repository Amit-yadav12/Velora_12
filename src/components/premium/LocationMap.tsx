import { ExternalLink, Navigation } from 'lucide-react';
import { googleLocationEmbedUrl, googleLocationOpenUrl, googleLocationDirectionsUrl } from '../../lib/googleMaps';

/** View-only Google road map; unlike a Maps JS map it has no app pins. */
export default function LocationMap({ center }: { center: { lat: number; lng: number } }) {
  return <div className="relative h-full min-h-[240px] w-full bg-elev">
    <iframe
      title="Google map of selected location"
      src={googleLocationEmbedUrl(center)}
      className="h-full min-h-[240px] w-full border-0"
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    />
    <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-2">
    <a href={googleLocationOpenUrl(center)} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-elev px-3 py-2 text-xs font-medium text-[var(--text)] shadow"
    >Open in Google Maps <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a>
    <a href={googleLocationDirectionsUrl(center)} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-app bg-elev px-3 py-2 text-xs font-medium text-[var(--text)] shadow"
    ><Navigation className="h-3.5 w-3.5" aria-hidden="true" /> Directions to selected location</a>
    </div>
  </div>;
}
