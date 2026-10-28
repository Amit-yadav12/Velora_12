import assert from 'node:assert/strict';
import { createServer } from 'vite';
process.env.VITE_GOOGLE_MAPS_API_KEY = 'public-test-key';
const server = await createServer({ logLevel: 'silent', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
try {
  const { googleLocationEmbedUrl } = await server.ssrLoadModule('/src/lib/googleMaps.ts');
  const url = new URL(googleLocationEmbedUrl({ lat: 26.9124, lng: 75.7873 }));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/maps/embed/v1/view');
  assert.equal(url.searchParams.get('center'), '26.9124,75.7873');
  assert.equal(url.searchParams.get('maptype'), 'roadmap');
  assert.equal(url.searchParams.get('key'), 'public-test-key');
  console.log('Configured Maps Embed URL: road map and selected coordinates passed (Google mocked).');
} finally { await server.close(); }
