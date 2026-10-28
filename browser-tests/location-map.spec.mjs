import { test, expect } from '@playwright/test';

test('road map uses selected coordinates and updates when the city changes', async ({ page }) => {
  // External map imagery is not required to test the app's URL contract.
  await page.route('https://maps.google.com/**', route => route.abort());
  await page.goto('/welcome');
  await page.locator('[data-demo-cta="start-journey"]').click();
  await page.goto('/search?view=map');
  const map = page.getByTitle('Google map of selected location');
  await expect(map).toBeVisible();
  const first = new URL(await map.getAttribute('src'));
  expect(first.searchParams.get('q')).toBe('26.9124,75.7873');
  expect(first.searchParams.get('t')).toBe('m');
  await expect(page.getByText(/The Google map shows your selected location/)).toBeVisible();
  await page.getByRole('button', { name: /choose location/i }).click();
  await page.getByRole('button', { name: 'Mumbai', exact: true }).click();
  await expect.poll(async () => new URL(await map.getAttribute('src')).searchParams.get('q')).toBe('19.076,72.8777');
  await expect(page.getByRole('link', { name: 'Open in Google Maps' })).toHaveAttribute('href', /19\.076%2C72\.8777/);
  await expect(page.getByRole('link', { name: 'Directions to selected location' })).toHaveAttribute('href', /destination=19\.076%2C72\.8777/);
});

test('blocked OSM tiles switch to read-only Google map rather than showing error tiles', async ({ page }) => {
  await page.route('https://*.tile.openstreetmap.org/**', route => route.fulfill({ status: 403, body: 'blocked' }));
  await page.route('https://maps.google.com/**', route => route.abort());
  await page.goto('/welcome');
  await page.locator('[data-demo-cta="start-journey"]').click();
  await page.goto('/search?view=map');
  await page.getByRole('button', { name: 'Filtered results' }).click();
  await expect(page.getByText(/Interactive map unavailable\. Google map view is read-only/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByTitle('Google map of selected location')).toBeVisible();
});
