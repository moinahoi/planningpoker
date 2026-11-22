import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // client's vite proxy points at :8000
      command: 'npm --prefix server start',
      url: 'http://localhost:8000/health',
      env: { PORT: '8000' },
      reuseExistingServer: !process.env.CI,
    },
    {
      // test the production bundle, like the Docker image serves it
      command: 'npm --prefix client run build && npm --prefix client run preview -- --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
