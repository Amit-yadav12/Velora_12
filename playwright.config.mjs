import { defineConfig, devices } from '@playwright/test';

/**
 * Real-browser checks for the judge demo. The dev server is the same one a
 * presenter runs (`npm run dev`), so the suite exercises the shipped app and
 * the real /api middleware — only the browser is automated.
 */
export default defineConfig({
  testDir: './browser-tests',
  testMatch: '**/*.spec.mjs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]] : 'list',
  outputDir: 'test-results/browser',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    // CI installs Chromium via `npx playwright install chromium`. A sandbox
    // without Playwright's browser cache can point at its own binary instead.
    launchOptions: process.env.VELORA_CHROMIUM_PATH ? { executablePath: process.env.VELORA_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npm run dev -- --host 0.0.0.0 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
