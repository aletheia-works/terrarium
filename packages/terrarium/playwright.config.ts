// Browser tests against same-run latest tool builds on two origins.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

export const SITE = 'http://localhost:8780';
export const HOST = 'http://localhost:8781';

const bun = process.env.TERRARIUM_BUN;
const site = process.env.TERRARIUM_SITE_DIR;
if (!bun || !site)
  throw new Error('set TERRARIUM_BUN and TERRARIUM_SITE_DIR explicitly');

const manifest = JSON.parse(
  readFileSync(path.join(site, 'web/dist/builds.json'), 'utf8'),
);
const aubeRef =
  process.env.TERRARIUM_AUBE_REF ?? Object.keys(manifest.builds.aube)[0];
if (typeof aubeRef !== 'string' || !/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(aubeRef))
  throw new Error('resolved aube E2E ref is missing or invalid');
const aubeCommit =
  process.env.TERRARIUM_AUBE_COMMIT ??
  manifest.builds.aube[aubeRef]?.source.commit;
if (
  typeof aubeCommit !== 'string' ||
  !/^[0-9a-f]{40}$/.test(aubeCommit) ||
  manifest.builds.aube[aubeRef]?.source.commit !== aubeCommit
)
  throw new Error('resolved aube E2E identity does not match the staged build');
export const AUBE_REF = aubeRef;
export const AUBE_COMMIT = aubeCommit;
export const AUBE_VERSION = aubeRef.slice(1);

export default defineConfig({
  outputDir: 'test-results/legacy',
  testMatch: ['terminal.spec.ts', 'pitchfork.spec.ts'],
  testDir: 'e2e',
  timeout: 180_000,
  expect: { timeout: 120_000 },
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: `"${bun}" e2e/serve.ts "${site}" 8780`,
      url: `${SITE}/web/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `"${bun}" e2e/serve.ts e2e/host 8781`,
      env: { TERRARIUM_AUBE_REF: AUBE_REF },
      url: `${HOST}/element.html`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
