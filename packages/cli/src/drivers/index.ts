import type { Mode } from '../config.js'
import { ToolError } from '../mcp/errors.js'
import { PlaywrightDriver } from './playwright.js'
import type { Driver } from './types.js'

type Playwright = typeof import('playwright-core')

/** Optional by design: the published package never installs a browser. */
export async function loadPlaywright(): Promise<Playwright | null> {
  try {
    return await import('playwright-core')
  } catch {
    return null
  }
}

export async function detectPlaywright(): Promise<boolean> {
  return (await loadPlaywright()) !== null
}

/**
 * Returns `null` when the extension driver should handle the request. In M3a
 * that only happens without Playwright; M3b adds the WebSocket driver.
 */
export async function selectDriver(mode: Mode): Promise<Driver | null> {
  if (mode === 'extension') return null

  const playwright = await loadPlaywright()
  if (playwright !== null) return new PlaywrightDriver(playwright)

  if (mode === 'playwright') {
    throw new ToolError(
      'Playwright is not installed. Install it with `npm i -D playwright` (or `pnpm add -D playwright`) and restart the MCP server.',
    )
  }

  return null
}
