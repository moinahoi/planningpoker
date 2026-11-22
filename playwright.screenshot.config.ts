// Generates docs/header.png for the README: npm run screenshot
import { defineConfig } from '@playwright/test'
import base from './playwright.config'

export default defineConfig({ ...base, testDir: './scripts', retries: 0, reporter: 'list' })
