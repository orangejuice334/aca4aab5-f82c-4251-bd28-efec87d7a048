// Playwright end-to-end suite for the tracker (track.html), run against the
// real Cloudflare Worker with the disposable `test` user. See e2e/README.md.
//
// Browser: Brave when installed (E2E_BROWSER=brave, the default), otherwise
// Playwright's bundled Chromium (E2E_BROWSER=chromium, needs
// `npx playwright install chromium` once).

import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eRoot = dirname(fileURLToPath(import.meta.url));

const braveCandidates = [
  process.env.E2E_BRAVE_PATH,
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/BraveSoftware/Brave-Browser/Application/brave.exe`,
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/brave-browser',
].filter(Boolean);
const bravePath = braveCandidates.find(candidate => existsSync(candidate));
const useBrave = (process.env.E2E_BROWSER || 'brave') === 'brave' && Boolean(bravePath);
const browserLaunch = useBrave ? { launchOptions: { executablePath: bravePath } } : {};
const browserName = useBrave ? 'brave' : 'chromium';

const port = Number(process.env.E2E_PORT || 4173);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}/`;

export default defineConfig({
  testDir: resolve(e2eRoot, 'specs'),
  // Every scenario shares ONE cloud user whose gist the fixtures rewrite
  // before each scenario, so scenarios run strictly one at a time.
  fullyParallel: false,
  workers: 1,
  // Failures are expected (the scenarios are written against intended
  // behaviour); retrying them would only double the GitHub API load.
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: resolve(e2eRoot, 'playwright-report'), open: 'never' }],
  ],
  outputDir: resolve(e2eRoot, 'test-results'),
  use: {
    baseURL,
    timezoneId: 'America/New_York',
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: `${browserName}-desktop`,
      use: { ...devices['Desktop Chrome'], ...browserLaunch },
    },
    {
      // Phone-sized run of the scenarios tagged @mobile (the logging flows
      // used on the phone every day).
      name: `${browserName}-phone`,
      use: { ...devices['Pixel 7'], ...browserLaunch },
      grep: /@mobile/,
    },
  ],
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: `node "${resolve(e2eRoot, 'support', 'static-server.mjs')}" ${port}`,
    url: `http://127.0.0.1:${port}/track.html`,
    reuseExistingServer: true,
    timeout: 20_000,
  },
});
