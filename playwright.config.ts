import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  testIgnore: '**/dev-smoke.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 8000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:2568',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node --import tsx tests/e2e-server.ts',
    url: 'http://127.0.0.1:2568/health',
    reuseExistingServer: false,
    timeout: 30000,
  },
});
