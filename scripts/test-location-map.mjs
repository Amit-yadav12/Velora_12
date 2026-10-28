import assert from 'node:assert/strict';
import { googleLocationEmbedUrl, googleLocationOpenUrl, googleLocationDirectionsUrl } from '../src/lib/googleMaps.ts';
for (const [lat, lng] of [[26.9124, 75.7873], [19.076, 72.8777], [-33.8, 151.2]]) {
  const embed = new URL(googleLocationEmbedUrl({ lat, lng }));
  assert.equal(embed.hostname, 'maps.google.com');
  assert.equal(embed.searchParams.get('q'), `${lat},${lng}`);
  assert.equal(embed.searchParams.get('t'), 'm');
  assert.equal(embed.searchParams.get('z'), '16');
  assert.equal(embed.searchParams.get('output'), 'embed');
  assert.equal(new URL(googleLocationOpenUrl({ lat, lng })).searchParams.get('query'), `${lat},${lng}`);
  assert.equal(new URL(googleLocationDirectionsUrl({ lat, lng })).searchParams.get('destination'), `${lat},${lng}`);
}
for (const lat of [NaN, Infinity, 91]) assert.throws(() => googleLocationEmbedUrl({ lat, lng: 0 }));
assert.throws(() => googleLocationEmbedUrl({ lat: 0, lng: -181 }));
console.log('Google road map URL: selected coordinates, directions and invalid-coordinate rejection passed (no provider contacted).');
