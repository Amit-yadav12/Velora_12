import supabase, { isDemoMode } from './supabase';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Demo tenant: images live in localStorage, which is small. Compress hard. */
const DEMO_MAX_EDGE = 900;
const DEMO_MAX_DATA_URL = 320_000; // ≈ 240 KB of image data
/** True when an image URL is browser-stored (demo tenant) rather than uploaded. */
export const isBrowserStoredImage = (url: string | null | undefined): boolean =>
  !!url && url.startsWith('data:image/');
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Reject spoofed extensions/MIME types as well as oversized files. */
export async function validateImage(file: File): Promise<void> {
  if (!TYPES.includes(file.type)) throw new Error('Use a JPEG, PNG or WebP image.');
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('Each image must be under 5 MB.');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  if ((file.type === 'image/jpeg' && !jpeg) || (file.type === 'image/png' && !png) || (file.type === 'image/webp' && !webp)) throw new Error('That file is not a valid image.');
}

/** Resize large images in the browser when possible, preserving the actual photo. */
async function optimize(file: File): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file;
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This image could not be decoded.'); });
  try {
    if (bitmap.width * bitmap.height > 60_000_000) throw new Error('Image dimensions are too large.');
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 800_000) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.84));
    return blob?.type === 'image/webp' && blob.size < file.size ? blob : file;
  } finally { bitmap.close(); }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('This file could not be read.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Demo tenant only: shrink the image in the browser and return a data URL.
 * The photo is genuinely the one the owner picked — it is not a placeholder —
 * but it is stored in this browser, which the UI says out loud.
 * Returns null when the browser cannot decode/canvas (the caller falls back to
 * the original bytes, still validated).
 */
async function toCompressedDataUrl(file: File): Promise<string | null> {
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return null;
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, DEMO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx || typeof canvas.toBlob !== 'function') return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const [type, quality] of [['image/webp', 0.72], ['image/jpeg', 0.65], ['image/jpeg', 0.5]] as const) {
      const blob = await new Promise<Blob | null>((resolve) => {
        try { canvas.toBlob(resolve, type, quality); } catch { resolve(null); }
      });
      if (!blob) continue;
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('This file could not be read.'));
        reader.readAsDataURL(blob);
      });
      if (url.length <= DEMO_MAX_DATA_URL) return url;
    }
    return null;
  } finally { bitmap.close(); }
}

export async function uploadBusinessImage(file: File, userId: string): Promise<string> {
  await validateImage(file);
  if (isDemoMode) {
    // No Supabase project in the local preview. Rather than refuse (which made
    // the whole launch flow undemonstrable) or fake an upload, keep the real
    // photo in the demo tenant and label it as browser storage everywhere.
    const compressed = await toCompressedDataUrl(file).catch(() => null);
    if (compressed) return compressed;
    const raw = await readAsDataUrl(file);
    if (raw.length > DEMO_MAX_DATA_URL) {
      throw new Error('That photo is too large for demo storage. Use one under about 200 KB, or connect Supabase Storage.');
    }
    return raw;
  }
  if (!userId || !/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Sign in before uploading images.');
  const image = await optimize(file);
  const ext = image.type === 'image/webp' ? 'webp' : image.type === 'image/png' ? 'png' : 'jpg';
  const id = crypto.randomUUID();
  const path = `${userId}/${id}.${ext}`;
  const { error } = await supabase.storage.from('business-media').upload(path, image, { contentType: image.type, cacheControl: '3600', upsert: false });
  if (error) throw new Error(`Image upload failed: ${error.message}`);
  const { data } = supabase.storage.from('business-media').getPublicUrl(path);
  if (!data?.publicUrl) throw new Error('The uploaded image URL could not be retrieved.');
  return data.publicUrl;
}
