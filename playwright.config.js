// Playwright configuration for the Endurance clock.
//
// The site is static; tools/serve.js serves it. Chromium runs with software
// WebGL so the suite works on machines and CI runners without a GPU, which
// is slow, so timeouts are generous. Service workers are blocked so the
// page's worker cannot intercept the test server or stubbed requests.
//
// THREE_LOCAL=/path/to/node_modules/three serves Three.js (and the Draco
// decoder) from disk instead of the CDN, for machines without internet.
const { defineConfig, devices } = require('@playwright/test');

const PORT = 4173;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 180000,
  expect: { timeout: 30000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
    }
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }
  ],
  webServer: {
    command: `node tools/serve.js ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 20000
  }
});
