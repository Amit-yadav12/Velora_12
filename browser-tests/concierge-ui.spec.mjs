import { test, expect } from '@playwright/test';

test('demo concierge suggests a sample and opens the follow-up booking without live API calls', async ({ page }) => {
  let calls = 0;
  page.on('request', req => { if (req.url().includes('/api/concierge')) calls++; });
  await page.goto('/welcome');
  await page.locator('[data-demo-cta="start-journey"]').click();
  await expect(page).toHaveURL(/\/business\/demo-biz-aurora/);
  await page.getByRole('button', { name: 'Open Velora Concierge' }).click();
  await expect(page.getByText('Sample mode · local assistant')).toBeVisible();
  await page.getByRole('button', { name: 'Find the nearest salon' }).click();
  await expect(page.getByText(/Here's a sample suggestion/)).toBeVisible();
  await expect(page.getByText(/can't verify which is nearest/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Message concierge' }).fill('ok book an appointment');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText(/no appointment has been made/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue booking' }).click();
  await expect(page).toHaveURL(/\/business\/demo-biz-/);
  expect(calls).toBe(0);
});

test('business scope options use solid matching theme colors', async ({ page }) => {
  await page.goto('/welcome?role=business');
  await page.getByRole('button', { name: 'Continue as demo business' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const option = page.locator('#console-scope option').nth(1);
  await expect(option).toHaveCSS('background-color', 'rgb(11, 13, 22)');
  await expect(option).toHaveCSS('color', 'rgb(247, 249, 252)');
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(option).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(option).toHaveCSS('color', 'rgb(10, 14, 26)');
});
