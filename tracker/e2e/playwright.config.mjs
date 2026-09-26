// Playwright end-to-end suite for the tracker (track.html) as the disposable
// `test` user, answered by the real Worker code in-process (the default) or
// by the deployed Worker (E2E_BACKEND=live). See e2e/README.md.
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

// local (default): the real Worker code runs in-process against a simulated
// gist, so scenarios can run in parallel. live: the deployed Worker and the
// real test gist, one scenario at a time (see support/cloud.mjs).
const backend = String(process.env.E2E_BACKEND || 'local').toLowerCase() === 'live' ? 'live' : 'local';
const port = Number(process.env.E2E_PORT || 4173);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}/`;

export default defineConfig({
  testDir: resolve(e2eRoot, 'specs'),
  // Live runs share ONE cloud gist that the fixtures rewrite before each
  // scenario, so they run strictly one at a time. Local runs give every
  // worker process its own simulated gist, so spec files run in parallel.
  fullyParallel: false,
  workers: backend === 'live' ? 1 : Number(process.env.E2E_WORKERS || 4),
  // Failures are expected (the scenarios are written against intended
  // behaviour); retrying them would only double the GitHub API load.
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: resolve(e2eRoot, 'playwright-report'), open: 'never' }],
    ['json', { outputFile: resolve(e2eRoot, 'results', 'results.json') }],
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