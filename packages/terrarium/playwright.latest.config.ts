import { defineConfig } from '@playwright/test';
import config from './playwright.formicarium.config.ts';
export default defineConfig({
  ...config,
  testMatch: ['latest-tools.spec.ts'],
  outputDir: 'test-results/latest',
});
