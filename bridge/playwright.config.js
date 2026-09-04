import { defineConfig, devices } from '@playwright/test';

const emCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './test-e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: emCI,
  retries: emCI ? 1 : 0,
  workers: emCI ? 2 : undefined,
  reporter: [
    ['list'],
    ['junit', { outputFile: '../docs/relatorios/interface-junit.xml' }],
    ['html', { outputFolder: '../docs/relatorios/interface-html', open: 'never' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:8791',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'node test-e2e/harness.mjs',
    url: 'http://127.0.0.1:8791/api/saude',
    reuseExistingServer: !emCI,
    timeout: 60000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
