import { cors, enforceRateLimit } from './_lib/security.js';
export default async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!enforceRateLimit(req, res, 'place-photo', { limit: 120, windowMs: 60000 })) return;
  const ref = String(req.query.ref || '');
  if (!/^[A-Za-z0-9_-]{1,1200}$/.test(ref)) return res.status(400).json({ error: 'Invalid photo reference' });
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: 'Places is not configured' });
  try {
    const width = Math.min(1200, Math.max(100, Number(req.query.maxwidth) || 640));
    const r = await fetch(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=${width}&photo_reference=${encodeURIComponent(ref)}&key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(8000) });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !/^image\/(jpeg|png|webp)/i.test(type)) return res.status(502).json({ error: 'Photo unavailable' });
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length > 8 * 1024 * 1024) return res.status(502).json({ error: 'Photo too large' });
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(bytes);
  } catch { return res.status(502).json({ error: 'Photo unavailable' }); }
}
