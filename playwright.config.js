import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:4173/',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    serviceWorkers: 'block',
  },
  webServer: process.env.BASE_URL ? undefined : { command: 'python3 -m http.server 4173', port: 4173, reuseExistingServer: true },
});
