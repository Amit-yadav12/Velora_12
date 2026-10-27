import supabase, { isDemoMode } from './supabase';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
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

export async function uploadBusinessImage(file: File, userId: string): Promise<string> {
  await validateImage(file);
  if (isDemoMode) throw new Error('Connect Supabase Storage to upload real images. Nothing was uploaded.');
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
