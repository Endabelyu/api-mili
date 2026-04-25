import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';
import 'dotenv/config';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false, // run serially so auth state is ready before specs
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // single worker ensures sequential execution
  reporter: 'html',

  globalSetup: './tests/setup/global-setup.ts',

  use: {
    actionTimeout: 0,
    baseURL: 'http://localhost:4016',
    trace: 'on-first-retry',
  },

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:4016',
    reuseExistingServer: true,
  },

  projects: [
    // 1. Login once and save session state
    {
      name: 'setup',
      testDir: './tests/setup',
      testMatch: '**/*.setup.ts',
    },

    // 2. Run all E2E specs using saved session state
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: resolve('tests/setup/.auth/user.json'),
      },
      dependencies: ['setup'],
    },
  ],
});
