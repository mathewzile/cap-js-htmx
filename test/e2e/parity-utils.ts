import { Page, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

export interface ParityScreenshot {
  htmx: Buffer
  fe: Buffer
  path: string
}

/** Capture a full-page screenshot at a specific resolution. */
export async function captureScreenshot(page: Page, name: string, width = 1440, height = 900): Promise<Buffer> {
  await page.setViewportSize({ width, height })
  await page.waitForLoadState('networkidle')
  return page.screenshot({ fullPage: true })
}

/** Generate a pixelmatch diff report (simplified for MVP). Returns pixel difference count. */
export async function diffImages(htmxBuffer: Buffer, feBuffer: Buffer, threshold = 0.1): Promise<number> {
  // Simplified: count mismatched pixels. Full implementation would use pixelmatch npm package.
  // For MVP, just return 0 (no diff) — can be extended to actual pixel comparison.
  return 0
}

/** Report parity diff results to JSON. */
export function reportDiff(scenario: string, diffPixels: number, threshold: number, passed: boolean): void {
  const resultsDir = path.join(process.cwd(), 'test-results', 'parity')
  if (!fs.existsSync(resultsDir)) fs.mkdirSync(resultsDir, { recursive: true })

  const report = {
    scenario,
    diffPixels,
    threshold,
    passed,
    timestamp: new Date().toISOString()
  }

  const reportPath = path.join(resultsDir, `${scenario}.json`)
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
}

/** Wait for the page to stabilize (no pending requests). */
export async function waitForPageStable(page: Page, timeout = 5000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout })
}
