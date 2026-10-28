import { test, expect } from '@playwright/test';

async function mockPermissions(page, notificationPermission = 'default') {
  await page.addInitScript((permission) => {
    window.__permissionRequests = 0;
    window.__geoRequests = 0;
    class MockNotification {
      static permission = permission;
      static async requestPermission() { window.__permissionRequests++; MockNotification.permission = 'denied'; return 'denied'; }
    }
    window.Notification = MockNotification;
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
      getCurrentPosition(_ok, fail) { window.__geoRequests++; fail({ code: 1, PERMISSION_DENIED: 1 }); },
    } });
  }, notificationPermission);
}

async function customer(page) {
  await page.goto('/welcome');
  await page.locator('[data-demo-cta="start-journey"]').click();
  await expect(page.getByRole('heading', { name: 'Aurora Luxe Salon & Spa' })).toBeVisible();
}

test('customer permissions are requested only on click and denied states explain recovery', async ({ page }) => {
  await mockPermissions(page);
  await customer(page);
  await page.goto('/');
  expect(await page.evaluate(() => [window.__geoRequests, window.__permissionRequests])).toEqual([0, 0]);
  await page.getByRole('button', { name: 'Choose location' }).click();
  await page.getByRole('button', { name: 'Use my current location' }).click();
  await expect(page.getByText(/Location blocked\. Allow it in browser site settings/)).toBeVisible();
  expect(await page.evaluate(() => window.__geoRequests)).toBe(1);
  await page.goto('/settings');
  await expect(page.getByText('Permission not requested yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Allow browser notifications' }).click();
  await expect(page.getByText(/Blocked\. Allow notifications in your browser site settings/)).toBeVisible();
  expect(await page.evaluate(() => window.__permissionRequests)).toBe(1);
  await expect(page.getByText('Sample mode does not send device alerts.')).toBeVisible();
});

test('business notification controls disclose granted permission and sample limitations', async ({ page }) => {
  await mockPermissions(page, 'granted');
  await page.goto('/welcome?role=business');
  await page.getByRole('button', { name: 'Continue as demo business' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('button', { name: /^Notifications/ }).click();
  await expect(page.getByText(/Permission allowed/)).toBeVisible();
  await expect(page.getByText('Sample mode does not send device alerts.')).toBeVisible();
  expect(await page.evaluate(() => window.__permissionRequests)).toBe(0);
});

test('sample location search does not contact live geocoding', async ({ page }) => {
  await customer(page);
  let geocodes = 0;
  page.on('request', request => { if (request.url().includes('/api/geocode')) geocodes++; });
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose location' }).click();
  await page.getByPlaceholder('Search city or address…').fill('Jaipur');
  await expect(page.getByText('Address search is unavailable in sample mode. Choose a city below.')).toBeVisible();
  expect(geocodes).toBe(0);
});
