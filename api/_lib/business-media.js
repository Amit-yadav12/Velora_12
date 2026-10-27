import supabase from '../db-client.js';
import { assert } from './security.js';
import { storagePathForUrl } from './business-input.js';

const MAX_BYTES = 5 * 1024 * 1024;
function validSignature(bytes, filename) {
  if (/\.jpe?g$/i.test(filename)) return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (/\.png$/i.test(filename)) return [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v);
  if (/\.webp$/i.test(filename)) return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}

/** Newly referenced objects must exist, belong to the signed-in user and have
 * a supported signature/size. Unchanged historical URLs can be preserved. */
export async function verifyMediaUrls(urls, userId, existingUrls = []) {
  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const legacy = new Set(existingUrls.filter(Boolean));
  const pending = [...new Set(urls.filter(Boolean))].filter((url) => !legacy.has(url));
  // Bound memory and requests: each object may be up to 5 MB.
  for (let i = 0; i < pending.length; i += 4) await Promise.all(pending.slice(i, i + 4).map(async (url) => {
    const path = storagePathForUrl(url, userId, projectUrl);
    assert(path, 'Images must be uploaded to your own Velora storage folder.');
    const bucket = supabase.storage.from('business-media');
    const { data: files, error } = await bucket.list(path.folder, { search: path.filename, limit: 100 });
    if (error) throw error;
    assert(Array.isArray(files) && files.some((f) => f.name === path.filename), 'An image upload is missing. Please upload it again.');
    const { data: blob, error: downloadError } = await bucket.download(`${path.folder}/${path.filename}`);
    if (downloadError) throw downloadError;
    assert(blob && blob.size > 0 && blob.size <= MAX_BYTES, 'The uploaded image is empty or larger than 5 MB.');
    const bytes = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
    assert(validSignature(bytes, path.filename), 'The uploaded file is not a valid JPEG, PNG or WebP image.');
  }));
}
