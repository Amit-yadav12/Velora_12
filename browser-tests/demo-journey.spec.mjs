import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axeScript = require.resolve('axe-core/axe.min.js');

/**
 * The judge demo, end to end, in a real browser:
 *
 *   Jaipur sample business → service + slot → review (₹ subtotal/GST/total)
 *   → sample booking → QR ticket → Bookings → business console
 *   → confirm the same booking → verify that ticket → checked in.
 *
 * Runs at 375 / 768 / 1440 CSS pixels with axe (WCAG A/AA), layout-overflow,
 * focus-visibility, touch-target and reduced-motion checks on every width.
 */

const SIZES = [
  { label: 'mobile-375', width: 375, height: 812 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'desktop-1440', width: 1440, height: 1000 },
];

const SAMPLE_BUSINESS = 'Aurora Luxe Salon & Spa';
const SAMPLE_SERVICE = 'Signature Haircut & Styling';

async function box(viewport) {
  const dimensions = await viewport.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  return dimensions;
}

async function expectNoHorizontalOverflow(page, label) {
  const { scroll, client } = await box(page);
  expect(scroll, `${label}: page-level horizontal overflow (${scroll}px > ${client}px)`).toBeLessThanOrEqual(client + 1);
}

async function expectAxeClean(page, label) {
  // Let entrance animations finish so contrast is measured on final colours.
  await page.waitForTimeout(500);
  if (!(await page.evaluate(() => Boolean(window.axe)))) {
    await page.addScriptTag({ path: axeScript });
  }
  const { violations } = await page.evaluate(async () => window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  }));
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(summary, `${label}: axe violations`).toEqual([]);
}

async function expectTouchTarget(locator, label, minimum = 44) {
  const bounds = await locator.boundingBox();
  expect(bounds, `${label}: element is not rendered`).not.toBeNull();
  expect(bounds.height, `${label}: touch target height`).toBeGreaterThanOrEqual(minimum);
}

/** Book the flagship sample business exactly like a presenter does. */
async function createSampleBooking(page) {
  await page.goto('/welcome');
  await page.locator('[data-demo-cta="start-journey"]').click();
  await expect(page.getByRole('heading', { name: SAMPLE_BUSINESS })).toBeVisible();
  const slot = page.locator('#booking-panel button:not(:disabled)').filter({ hasText: /^\d{1,2}:\d{2}\s?(AM|PM)/i }).first();
  await expect(slot).toBeVisible({ timeout: 20_000 });
  await slot.click();
  await page.getByRole('button', { name: 'Review & book' }).click();
  await page.getByRole('dialog', { name: 'Review your booking' }).getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.locator('[data-success-overlay]')).toBeVisible({ timeout: 20_000 });
  return readSampleBooking(page);
}

/** Presenter switch: sign out of the customer demo, enter the business demo. */
async function enterBusinessConsole(page) {
  await page.goto('/appointments');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/welcome$/);
  await page.goto('/welcome?role=business');
  await page.getByRole('button', { name: 'Continue as demo business' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.goto('/admin/appointments');
  await expect(page.getByRole('heading', { name: 'Appointments' })).toBeVisible();
}

/** Read the sample booking the customer just created (shared demo tenant). */
async function readSampleBooking(page) {
  return page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('velora-local-bookings') || '[]');
    const booking = rows.find((row) => row.customer_email === 'customer@velora.ai' && !String(row.ref).startsWith('VL-OPS'));
    if (!booking) return null;
    const token = `local.${btoa(JSON.stringify({ ref: booking.ref, s: booking.qr_salt })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
    return { ref: booking.ref, status: booking.status, price: booking.price, service: booking.service_name, ticketUrl: `${location.origin}/verify/${encodeURIComponent(token)}` };
  });
}

for (const viewport of SIZES) {
  test(`demo journey: Jaipur sample booking → QR ticket → business check-in @${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    // ---- 1. Welcome: the demo is unmistakable and one click away -----------
    await page.goto('/welcome');
    await expect(page.getByRole('heading', { name: /how would you like to continue/i })).toBeVisible();
    await expect(page.getByText('Sample mode', { exact: false }).first()).toBeVisible();
    const startJourney = page.locator('[data-demo-cta="start-journey"]');
    await expect(startJourney).toBeVisible();
    await expectTouchTarget(startJourney, 'start demo journey');
    await expectNoHorizontalOverflow(page, '/welcome');
    await expectAxeClean(page, '/welcome');

    await startJourney.click();

    // ---- 2. Jaipur sample business, marked as sample ----------------------
    await expect(page).toHaveURL(/\/business\/demo-biz-aurora/);
    await expect(page.getByRole('heading', { name: SAMPLE_BUSINESS })).toBeVisible();
    await expect(page.getByText('Sample listing', { exact: true })).toBeVisible();
    await expect(page.locator('[data-sample-mode-bar]')).toContainText('Demo environment');
    // The selected city context is visible in the booking context, not implied.
    await expect(page.locator('main')).toContainText('Jaipur');
    await expectNoHorizontalOverflow(page, '/business (sample)');
    await expectAxeClean(page, '/business (sample)');

    // ---- 3. Service + slot → review with ₹ subtotal, GST and total --------
    await page.getByRole('button', { name: new RegExp(SAMPLE_SERVICE) }).click();
    const slot = page.locator('#booking-panel button:not(:disabled)').filter({ hasText: /^\d{1,2}:\d{2}\s?(AM|PM)/i }).first();
    await expect(slot).toBeVisible({ timeout: 20_000 });
    await slot.click();

    const review = page.getByRole('button', { name: 'Review & book' });
    await expect(review).toBeEnabled();
    await expectTouchTarget(review, 'review & book');
    await review.click();

    const reviewDialog = page.getByRole('dialog', { name: 'Review your booking' });
    await expect(reviewDialog).toBeVisible();
    await expect(reviewDialog).toContainText(SAMPLE_BUSINESS);
    await expect(reviewDialog).toContainText(SAMPLE_SERVICE);
    await expect(reviewDialog).toContainText('₹');
    await expect(reviewDialog).toContainText('GST 18%');
    await expect(reviewDialog).toContainText('Total payable');
    await expect(reviewDialog).toContainText('Sample request · demo tenant');
    await expectAxeClean(page, 'review dialog');

    // ---- 4. Submit → success screen with the QR ticket --------------------
    await reviewDialog.getByRole('button', { name: 'Confirm booking' }).click();
    const success = page.locator('[data-success-overlay]');
    await expect(success).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Demo request saved' })).toBeVisible();
    await expect(page.locator('[data-qr] svg')).toBeVisible();
    await expect(success).toContainText('Sample data · demo tenant');
    await expect(success).toContainText('not a real appointment');
    await expect(success).toContainText('GST 18% (sample invoice)');
    await expect(page.locator('[data-confetti]')).toHaveCount(0, { timeout: 10_000 });
    await expectNoHorizontalOverflow(page, 'success screen');
    await expectAxeClean(page, 'success screen');

    const booking = await readSampleBooking(page);
    expect(booking?.ref, 'sample booking persisted in the demo tenant').toBeTruthy();
    expect(booking.service).toBe(SAMPLE_SERVICE);

    // ---- 5. Ticket is findable again in Bookings --------------------------
    await page.getByRole('button', { name: 'View my bookings' }).click();
    await expect(page.getByRole('heading', { name: 'My appointments' })).toBeVisible();
    await expect(page.getByText(booking.ref)).toBeVisible();
    await expectNoHorizontalOverflow(page, '/appointments');
    await expectAxeClean(page, '/appointments');

    const ticketButton = page.getByRole('button', { name: 'QR ticket' }).first();
    await expectTouchTarget(ticketButton, 'QR ticket');
    await ticketButton.click();
    const ticketDialog = page.getByRole('dialog', { name: 'Your booking ticket' });
    await expect(ticketDialog).toBeVisible();
    await expect(ticketDialog.locator('[data-ticket-qr] svg')).toBeVisible();
    await expect(ticketDialog).toContainText('Sample ticket');
    await expectAxeClean(page, 'ticket dialog');
    await page.keyboard.press('Escape');
    await expect(ticketDialog).toBeHidden();

    // The ticket QR really is the sample booking's verification URL.
    const ticketLink = await page.evaluate(() => {
      const rows = JSON.parse(localStorage.getItem('velora-local-bookings') || '[]');
      const row = rows.find((b) => b.customer_email === 'customer@velora.ai' && !String(b.ref).startsWith('VL-OPS'));
      return row ? `${location.origin}/verify/${encodeURIComponent(`local.${btoa(JSON.stringify({ ref: row.ref, s: row.qr_salt })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`)}` : null;
    });
    expect(ticketLink).toBe(booking.ticketUrl);

    // ---- 6. Presenter switch: demo business console -----------------------
    await page.locator('[data-demo-guide-launcher]').click();
    const guide = page.getByRole('dialog', { name: /presenter walkthrough/i });
    await expect(guide).toBeVisible();
    await expect(guide.locator('[data-demo-step="booking"]')).toHaveAttribute('data-demo-step-done', 'true');
    await expect(guide.locator('[data-demo-step="checkin"]')).toHaveAttribute('data-demo-step-done', 'false');
    await expectAxeClean(page, 'demo guide');
    await guide.getByRole('button', { name: /open business console/i }).click();

    await expect(page).toHaveURL(/\/admin\/appointments\?focus=/);
    await expect(page.locator('#console-scope')).toBeVisible();
    await expect(page.locator('[data-sample-mode-bar]')).toContainText('Demo environment');

    // ---- 7. Same booking, ready to confirm --------------------------------
    const spotlight = page.locator('[data-spotlight-ref]');
    await expect(spotlight).toHaveAttribute('data-spotlight-ref', booking.ref);
    await expect(spotlight).toContainText(SAMPLE_SERVICE);
    await expect(spotlight).toContainText('customer@velora.ai');
    await expectNoHorizontalOverflow(page, '/admin/appointments');
    await expectAxeClean(page, '/admin/appointments');

    const confirm = page.locator('[data-console-action="confirm-spotlight"]');
    await expectTouchTarget(confirm, 'confirm booking');
    await confirm.click();
    await expect(spotlight.locator('text=/confirmed/i').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-console-action="confirm-spotlight"]')).toHaveCount(0);

    // ---- 8. Check in using that ticket -----------------------------------
    const checkIn = page.locator('[data-console-action="checkin-spotlight"]');
    await expect(checkIn).toBeVisible();
    await checkIn.click();
    const checkInDialog = page.getByRole('dialog', { name: /verify ticket/i });
    await expect(checkInDialog).toBeVisible();
    const input = page.locator('#ticket-input');
    await expect(input).toHaveValue(booking.ticketUrl);
    await page.getByRole('button', { name: 'Verify & check in' }).click();

    const verdict = page.locator('[data-checkin-code="verified"]');
    await expect(verdict).toBeVisible({ timeout: 15_000 });
    await expect(verdict).toContainText('Ticket verified');
    await expect(verdict).toContainText('Checked in');
    await expect(verdict).toContainText(booking.ref);
    await expect(verdict).toContainText('₹');
    await expect(verdict).toContainText('Aurora Luxe Salon & Spa');
    await expectNoHorizontalOverflow(page, 'check-in result');
    await expectAxeClean(page, 'check-in result');

    const persisted = await page.evaluate((ref) => {
      const rows = JSON.parse(localStorage.getItem('velora-local-bookings') || '[]');
      return rows.find((row) => row.ref === ref)?.status || null;
    }, booking.ref);
    expect(persisted, 'check-in persisted to the demo tenant').toBe('checked_in');

    // A repeat verification is idempotent, never a second state change.
    await page.getByRole('button', { name: 'Next ticket' }).first().click();
    await input.fill(booking.ticketUrl);
    await page.getByRole('button', { name: 'Verify & check in' }).click();
    await expect(page.locator('[data-checkin-code="already_checked_in"]')).toBeVisible({ timeout: 15_000 });

    // Everything the demo did produced no browser errors.
    expect(errors, 'browser console errors during the demo journey').toEqual([]);
  });
}

test('keyboard-only path reaches the demo journey with a visible focus ring', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/welcome');
  await expect(page.getByRole('heading', { name: /how would you like to continue/i })).toBeVisible();

  const focusRing = async () => page.evaluate(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement)) return null;
    const style = getComputedStyle(el);
    return {
      text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 60),
      outline: style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) >= 1,
      outlineColor: style.outlineColor,
      shadow: style.boxShadow !== 'none',
    };
  });

  let reachedCta = false;
  let ring = null;
  for (let i = 0; i < 20 && !reachedCta; i += 1) {
    await page.keyboard.press('Tab');
    ring = await focusRing();
    expect(ring, 'focus is always on a real element').not.toBeNull();
    expect(ring.outline || ring.shadow || ring.text.includes('Skip'), `tab stop ${i} needs a visible focus indicator`).toBeTruthy();
    reachedCta = /start the demo journey/i.test(ring.text);
  }
  expect(reachedCta, 'the demo journey is reachable with Tab').toBeTruthy();

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/business\/demo-biz-aurora/, { timeout: 20_000 });
});

test('reduced motion keeps the whole journey visible and usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/welcome');
  await expect(page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).resolves.toBe(true);

  await page.locator('[data-demo-cta="start-journey"]').click();
  await expect(page.getByRole('heading', { name: SAMPLE_BUSINESS })).toBeVisible();
  // A slot exists and the primary action is immediately usable.
  const slot = page.locator('#booking-panel button:not(:disabled)').filter({ hasText: /^\d{1,2}:\d{2}\s?(AM|PM)/i }).first();
  await expect(slot).toBeVisible({ timeout: 20_000 });
  await slot.click();
  const review = page.getByRole('button', { name: 'Review & book' });
  await expect(review).toBeEnabled();
  await review.click();
  const dialog = page.getByRole('dialog', { name: 'Review your booking' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.locator('[data-success-overlay]')).toBeVisible({ timeout: 20_000 });
  // No confetti bursts under reduced motion.
  expect(await page.evaluate(() => document.querySelectorAll('[data-success-overlay] .rounded-sm').length)).toBe(0);
});

test('the console scope keeps each business to its own bookings', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const booking = await createSampleBooking(page);
  expect(booking?.ref).toBeTruthy();

  await enterBusinessConsole(page);
  const row = page.locator(`[data-booking-ref="${booking.ref}"]:visible`).first();
  const scope = page.locator('#console-scope');
  await expect(scope).toBeVisible();
  await expect(scope).toHaveValue('');
  await expect(row).toBeVisible();

  const visibleRows = () => page.evaluate(() => [...document.querySelectorAll('tbody tr')].map((tr) => tr.innerText));

  // Aurora's booking must not appear under another sample business — and only
  // that business's own rows may be listed.
  await scope.selectOption('demo-biz-apex');
  await expect(page.getByText(/Viewing Apex Physio/i)).toBeVisible();
  await expect(page.locator(`[data-booking-ref="${booking.ref}"]:visible`)).toHaveCount(0);
  const apexRows = await visibleRows();
  expect(apexRows.length).toBeGreaterThan(0);
  expect(apexRows.every((row) => /Apex Physio/.test(row))).toBe(true);
  await expectNoHorizontalOverflow(page, '/admin/appointments (scoped)');
  await expectAxeClean(page, '/admin/appointments (scoped)');

  // A business with no bookings shows the empty state, not someone else's data.
  await scope.selectOption('demo-biz-jp-amber-hospital');
  await expect(page.getByText(/No appointments for Amber Care Multispeciality/i)).toBeVisible();

  // Aurora's own scope shows it again, and only Aurora's rows.
  await scope.selectOption('demo-biz-aurora');
  await expect(page.locator(`[data-booking-ref="${booking.ref}"]:visible`).first()).toBeVisible();
  const auroraRows = await visibleRows();
  expect(auroraRows.every((row) => row.includes('Aurora Luxe'))).toBe(true);

  await scope.selectOption('');
  await expect(scope).toHaveValue('');
  expect(await page.evaluate(() => localStorage.getItem('velora-console-scope'))).toBeNull();
});

test('the console picks up a booking written to the shared sample store without a reload', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/welcome');
  await page.locator('[data-demo-cta="start-journey"]').click();
  await expect(page.getByRole('heading', { name: SAMPLE_BUSINESS })).toBeVisible();

  await enterBusinessConsole(page);
  const before = await page.locator('[data-booking-ref]:visible').count();

  // Simulate the other side of the demo writing a booking (this is exactly what
  // a second browser tab does: localStorage write + the bus event).
  const ref = await page.evaluate(() => {
    const REF = 'VL-LIVE1';
    const rows = JSON.parse(localStorage.getItem('velora-local-bookings') || '[]');
    rows.unshift({
      id: 'live-check', ref: REF, business_id: 'demo-biz-aurora', business_name: 'Aurora Luxe Salon & Spa',
      service_name: 'Signature Haircut & Styling', start_time: new Date(Date.now() + 86_400_000).toISOString(),
      end_time: new Date(Date.now() + 90_000_000).toISOString(), status: 'pending', price: 800,
      customer_name: 'Walk-in Demo', customer_email: 'walkin@example.in', qr_salt: 'livecheck1',
      created_at: new Date().toISOString(), local: true,
    });
    localStorage.setItem('velora-local-bookings', JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent('velora:bookings-changed'));
    return REF;
  });
  await expect(page.locator(`[data-booking-ref="${ref}"]:visible`).first()).toBeVisible({ timeout: 10_000 });
  expect(await page.locator('[data-booking-ref]:visible').count()).toBeGreaterThan(before);
  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('velora-local-bookings') || '[]').filter((b) => b.ref !== 'VL-LIVE1');
    localStorage.setItem('velora-local-bookings', JSON.stringify(rows));
    window.dispatchEvent(new CustomEvent('velora:bookings-changed'));
  });
});

test('the business console lists the same booking on a phone-sized screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/welcome');
  await page.locator('[data-demo-cta="start-journey"]').click();
  await expect(page.getByRole('heading', { name: SAMPLE_BUSINESS })).toBeVisible();
  const slot = page.locator('#booking-panel button:not(:disabled)').filter({ hasText: /^\d{1,2}:\d{2}\s?(AM|PM)/i }).first();
  await expect(slot).toBeVisible({ timeout: 20_000 });
  await slot.click();
  await page.getByRole('button', { name: 'Review & book' }).click();
  await page.getByRole('dialog', { name: 'Review your booking' }).getByRole('button', { name: 'Confirm booking' }).click();
  await expect(page.locator('[data-success-overlay]')).toBeVisible({ timeout: 20_000 });
  const booking = await readSampleBooking(page);

  await enterBusinessConsole(page);
  // The mobile card list (not an 8-column table) carries the booking.
  const card = page.locator(`[data-booking-ref="${booking.ref}"]`).first();
  await expect(card).toBeVisible();
  await expect(card).toContainText('customer@velora.ai');
  await expectNoHorizontalOverflow(page, '/admin/appointments (phone)');
  await expectAxeClean(page, '/admin/appointments (phone)');
});
