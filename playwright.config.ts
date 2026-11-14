import { defineConfig } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dataDir = mkdtempSync(join(tmpdir(), 'trama-e2e-'));
process.on('exit', () => {
  try {
    rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* A later OS cleanup can remove an open temporary database. */
  }
});

export default defineConfig({
  testDir: './tests',
  testMatch: '**/ui.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4893',
    viewport: { width: 1365, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:4893',
    reuseExistingServer: false,
    env: { PORT: '4893', TRAMA_DATA_DIR: dataDir },
    timeout: 30_000,
  },
});
