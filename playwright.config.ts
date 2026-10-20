import { defineConfig } from '@playwright/test';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
const testData = mkdtempSync(path.join(tmpdir(),'clicker-browser-'));
export default defineConfig({
  testDir:'./tests/browser', fullyParallel:false, workers:1, retries:0,
  timeout:45000, expect:{timeout:10000}, reporter:'list',
  use:{ baseURL:'http://127.0.0.1:3100', trace:'retain-on-failure', screenshot:'only-on-failure',
    launchOptions:{executablePath:process.env.CLICKER_CHROMIUM_PATH || (existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']}
  },
  webServer:{ command:'npm run start -- --port 3100', url:'http://127.0.0.1:3100/api/catalog', reuseExistingServer:false, timeout:60000, env:{CLICKER_DATA_DIR:testData} }
});
