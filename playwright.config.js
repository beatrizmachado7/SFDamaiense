import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:8888', launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}, locale: 'pt-PT', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node tests/serve.mjs', url: 'http://127.0.0.1:8888/admin/', reuseExistingServer: true },
  projects: [
    { name: 'computador', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'telemovel', use: { ...devices['Pixel 7'] } }
  ]
});
