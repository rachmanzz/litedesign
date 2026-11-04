import type { Mode } from '../config.js'
import { getHub, getHubError } from '../hub.js'
import { ToolError } from '../mcp/errors.js'
import { ExtensionDriver } from './extension.js'
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
 * Picks the driver once per session. Playwright wins in `auto` because it can
 * open a page without asking the human; the extension is the fallback when no
 * browser automation library is installed.
 */
export async function selectDriver(mode: Mode): Promise<Driver> {
  if (mode === 'extension') return extensionDriver()

  const playwright = await loadPlaywright()
  if (playwright !== null) return new PlaywrightDriver(playwright)

  if (mode === 'playwright') {
    throw new ToolError(
      'Playwright is not installed. Install it with `npm i -D playwright` (or `pnpm add -D playwright`) and restart the MCP server.',
    )
  }

  return extensionDriver()
}

function extensionDriver(): Driver {
  const hub = getHub()

  if (hub === null) {
    const reason = getHubError() ?? 'the WebSocket hub is not running'
    throw new ToolError(
      `the extension bridge is unavailable: ${reason}. Free the port, or install Playwright.`,
    )
  }

  return new ExtensionDriver(hub)
}
