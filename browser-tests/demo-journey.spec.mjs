import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeScript = require.resolve('axe-core/axe.min.js');
const sizes = [
  { label: 'mobile-375', width: 375, height: 812 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'desktop-1440', width: 1440, height: 1000 },
];

async function checkNoHorizontalOverflow(page, route) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page, `${route} has page-level horizontal overflow at ${dimensions.viewport}px`).toBeLessThanOrEqual(dimensions.viewport + 1);
}

async function checkA11y(page, route) {
  if (!(await page.evaluate(() => Boolean(window.axe)))) await page.addScriptTag({ path: axeScript });
  const result = await page.evaluate(async () => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  }));
  const summary = result.violations.map((violation) =>
    `${violation.id} (${violation.impact}): ${violation.nodes.map((node) => `${node.target.join(' ')} — ${node.failureSummary || node.html}`).join('; ')}`,
  );
  expect(summary, `axe accessibility violations on ${route}`).toEqual([]);
}

async function screenshot(page, viewport, route) {
  const filename = route.replaceAll('/', '_').replace(/^_/, '') || 'home';
  await page.screenshot({
    path: `test-results/browser/${viewport}/${filename}.png`,
    fullPage: true,
    animations: 'disabled',
  });
}

test('demo OTP can be entered and submitted from the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/welcome?role=customer');
  await page.getByRole('button', { name: 'Continue with Phone' }).click();
  await page.getByLabel('Indian mobile number').fill('+91 98765 43210');
  await page.getByRole('button', { name: 'Request code' }).click();
  const message = page.getByRole('status').filter({ hasText: 'no SMS is sent' });
  await expect(message).toBeVisible();
  const code = (await message.textContent())?.match(/\b(\d{6})\b/)?.[1];
  expect(code).toMatch(/^\d{6}$/);
  const otp = page.getByLabel('6-digit verification code');
  await otp.focus();
  await otp.pressSequentially(code);
  await otp.press('Enter');
  await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
  await expect(page.getByText('What would you like to', { exact: false })).toBeVisible();
});

for (const viewport of sizes) {
  test(`sample booking → customer QR → business check-in at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    await page.goto('/welcome');
    await expect(page.getByRole('heading', { name: /how would you like to continue/i })).toBeVisible();
    await checkNoHorizontalOverflow(page, '/welcome');
    await checkA11y(page, '/welcome');
    await screenshot(page, viewport.label, '/welcome');

    // Verify keyboard focus is visible on a real browser, not inferred from DOM classes.
    await page.goto('/onboard');
    await checkNoHorizontalOverflow(page, '/onboard');
    await checkA11y(page, '/onboard');
    await screenshot(page, viewport.label, '/onboard');

    await page.goto('/welcome');
    await page.keyboard.press('Tab');
    const focusStyle = await page.evaluate(() => {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) return null;
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
    });
    expect(focusStyle).not.toBeNull();
    expect(focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) >= 1 || focusStyle.boxShadow !== 'none')
      .toBeTruthy();
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBeTruthy();

    await page.goto('/welcome?role=customer');
    const customerDemo = page.getByRole('button', { name: 'Continue as demo customer' });
    await expect(customerDemo).toBeVisible();
    expect((await customerDemo.boundingBox())?.height || 0).toBeGreaterThanOrEqual(44);
    await customerDemo.click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText('What would you like to', { exact: false })).toBeVisible();
    await checkNoHorizontalOverflow(page, '/');
    await checkA11y(page, '/');
    await screenshot(page, viewport.label, '/');

    await page.goto('/explore');
    await expect(page.getByRole('group', { name: 'Categories' })).toBeVisible();
    await checkNoHorizontalOverflow(page, '/explore');
    await checkA11y(page, '/explore');
    await screenshot(page, viewport.label, '/explore');

    await page.goto('/business/demo-biz-aurora');
    await expect(page.getByText('Choose a service')).toBeVisible();
    await page.getByRole('button', { name: /Signature Haircut/ }).click();
    const availableSlot = page.locator('button:not(:disabled)').filter({ hasText: /^\d{1,2}:\d{2}\s?(AM|PM)$/i }).first();
    await expect(availableSlot).toBeVisible({ timeout: 15_000 });
    await availableSlot.click();
    const reviewButton = page.getByRole('button', { name: 'Review & book' });
    await expect(reviewButton).toBeVisible();
    expect((await reviewButton.boundingBox())?.height || 0).toBeGreaterThanOrEqual(44);
    await reviewButton.click();
    await expect(page.getByText('Review your booking')).toBeVisible();
    const nameInput = page.getByPlaceholder('Full name');
    if (await nameInput.count()) await nameInput.fill('Demo Customer');
    const emailInput = page.getByPlaceholder('you@email.com');
    if (await emailInput.count()) await emailInput.fill('customer@velora.ai');
    await page.getByRole('button', { name: 'Confirm booking' }).click();
    await expect(page.getByRole('heading', { name: 'Demo request saved', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-qr] svg')).toBeVisible();
    const appointment = await page.evaluate(() => {
      const list = JSON.parse(localStorage.getItem('velora-local-bookings') || '[]');
      return list.find((booking) => booking.customer_email === 'customer@velora.ai' && booking.qr_payload);
    });
    expect(appointment?.ref).toBeTruthy();
    expect(appointment?.qr_payload).toBeTruthy();

    await page.goto('/appointments');
    await expect(page.getByRole('heading', { name: 'My appointments' })).toBeVisible();
    await expect(page.getByText(appointment.ref)).toBeVisible();
    await checkNoHorizontalOverflow(page, '/appointments');
    await checkA11y(page, '/appointments');
    await screenshot(page, viewport.label, '/appointments');
    await page.locator('.card').filter({ hasText: appointment.ref }).getByRole('button', { name: 'Ticket' }).click();
    await expect(page.locator('[data-ticket-qr] svg')).toBeVisible();
    await checkA11y(page, '/appointments ticket');

    // Switch demo identities without clearing the shared demo tenant.
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/welcome$/);
    await page.goto('/welcome?role=business');
    const businessDemo = page.getByRole('button', { name: 'Continue as demo business' });
    await expect(businessDemo).toBeVisible();
    await businessDemo.click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText('Business Console')).toBeVisible();
    await checkNoHorizontalOverflow(page, '/admin');
    await checkA11y(page, '/admin');
    await screenshot(page, viewport.label, '/admin');

    await page.goto('/admin/appointments');
    await expect(page.getByRole('heading', { name: 'Appointments' })).toBeVisible();
    const row = page.locator('tr').filter({ hasText: appointment.ref });
    await expect(row).toBeVisible();
    const confirm = row.locator('button[title="Confirm"]');
    if (await confirm.count()) await confirm.click();
    await expect(row).toContainText('confirmed', { timeout: 10_000 });
    await checkNoHorizontalOverflow(page, '/admin/appointments');
    await checkA11y(page, '/admin/appointments');
    await screenshot(page, viewport.label, '/admin/appointments');

    const verifyButton = page.getByRole('button', { name: 'Verify ticket' });
    await verifyButton.click();
    const ticketInput = page.getByLabel('Ticket link or token');
    await ticketInput.fill(appointment.qr_payload);
    const verifyAndCheckIn = page.getByRole('button', { name: 'Verify & check in' });
    expect((await verifyAndCheckIn.boundingBox())?.height || 0).toBeGreaterThanOrEqual(44);
    await verifyAndCheckIn.click();
    await expect(page.locator('[data-checkin-code="verified"]')).toBeVisible({ timeout: 10_000 });
    const verdict = page.locator('[data-checkin-code="verified"]');
    await expect(verdict).toContainText('Demo Customer');
    await expect(verdict).toContainText('Signature Haircut');
    await expect(verdict).toContainText('₹');
    await checkNoHorizontalOverflow(page, '/admin/appointments check-in');
    await checkA11y(page, '/admin/appointments check-in');
    await screenshot(page, viewport.label, '/qr-check-in');
  });
}
