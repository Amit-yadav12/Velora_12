import { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { uploadBusinessImage } from '../../lib/businessMedia';
import { errMsg } from '../../lib/types';

export default function ImageUploader({ label, images, onChange, userId, max = 8, onBusy }: {
  label: string; images: string[]; onChange: (v: string[]) => void; userId: string; max?: number; onBusy?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    if (files.length + images.length > max) { setError(`You can add up to ${max} image${max === 1 ? '' : 's'}.`); return; }
    setBusy(true); onBusy?.(true);
    const next = [...images];
    try {
      for (const file of Array.from(files)) {
        const tmp = URL.createObjectURL(file); setPreview(tmp);
        try {
          const url = await uploadBusinessImage(file, userId);
          next.push(url); onChange([...next]);
        } finally { URL.revokeObjectURL(tmp); setPreview(''); }
      }
    } catch (e: unknown) { setError(errMsg(e)); }
    finally { setBusy(false); onBusy?.(false); if (input.current) input.current.value = ''; }
  };
  const swap = (i: number, j: number) => { const next = [...images]; [next[i], next[j]] = [next[j], next[i]]; onChange(next); };
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-semibold">{label}</p><p className="text-xs text-dim mt-1">JPEG, PNG or WebP · up to 5 MB each{max > 1 ? ' · first image is your cover' : ''}</p></div><span className="text-xs text-dim">{images.length}/{max}</span></div>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {images.map((url, i) => <div className="relative group overflow-hidden rounded-2xl border border-app bg-surface" key={url}>
        <img src={url} alt={`${label} ${i + 1}`} className="h-32 w-full object-cover" loading="lazy" />
        {i === 0 && max > 1 && <span className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white">COVER</span>}
        <div className="flex items-center justify-end gap-1 p-1.5">
          {max > 1 && <><button type="button" disabled={busy || i === 0} aria-label={`Move image ${i + 1} left`} onClick={() => swap(i, i - 1)} className="image-action"><ArrowLeft className="h-3.5 w-3.5" /></button><button type="button" disabled={busy || i === images.length - 1} aria-label={`Move image ${i + 1} right`} onClick={() => swap(i, i + 1)} className="image-action"><ArrowRight className="h-3.5 w-3.5" /></button></>}
          <button type="button" disabled={busy} aria-label={`Remove image ${i + 1}`} onClick={() => onChange(images.filter((_, x) => x !== i))} className="image-action text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </div>)}
      {preview && <div className="relative rounded-2xl overflow-hidden border border-app"><img src={preview} alt="Uploading preview" className="h-32 w-full object-cover opacity-50" /><span className="absolute inset-0 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin" /></span></div>}
      {images.length < max && <button type="button" disabled={busy} onClick={() => input.current?.click()} className="min-h-32 rounded-2xl border border-dashed border-[var(--color-brand-indigo)]/40 bg-[var(--color-brand-indigo)]/5 hover:bg-[var(--color-brand-indigo)]/10 transition flex flex-col items-center justify-center gap-2 text-sm text-muted disabled:opacity-50"><ImagePlus className="h-6 w-6 text-[var(--color-brand-indigo)]" />{busy ? 'Uploading…' : 'Add a photo'}</button>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple={max > 1} className="sr-only" aria-label={`Upload ${label}`} onChange={(e) => void add(e.target.files)} />
    </div>
    {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
  </div>;
}
