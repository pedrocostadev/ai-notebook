import { defineConfig } from '@playwright/test'
import dotenv from 'dotenv'

dotenv.config()

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  retries: 1,
  workers: 4, // Parallel workers with isolated databases per worker
  reporter: [
    ['list'],
    ['html', { open: 'never' }]
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  expect: {
    timeout: 5000 // Reduced from 10000 - tests typically complete in ~1s
  }
})
