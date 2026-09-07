const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests/browser',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:18091',
    viewport: { width: 393, height: 786 },
    permissions: ['camera'],
    launchOptions: {
      channel: process.env.PDA_TEST_BROWSER || 'chrome',
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']
    }
  },
  webServer: { command: 'node tests/test-server.js', url: 'http://127.0.0.1:18091/api/health', reuseExistingServer: false }
});
