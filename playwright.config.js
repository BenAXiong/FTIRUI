import { defineConfig } from '@playwright/test';

const baseURL = process.env.SMOKE_BASE_URL || '';

export default defineConfig({
  testDir: './tests/smoke',
  timeout: 60_000,
  use: {
    baseURL,
    headless: true
  }
});
