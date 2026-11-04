import { existsSync, readdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type Browser,
  type BrowserContext,
  type CDPSession,
  chromium,
  type Page,
} from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import '../src/types.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const coreDist = path.join(root, 'packages/core/dist/core.iife.js')
const contentDist = path.join(root, 'packages/extension/dist/content.js')
const extensionDir = path.join(root, 'packages/extension/dist')
const fixture = path.join(root, 'fixtures/three-column.html')

const candidates = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((value): value is string => Boolean(value))

const executable = candidates.find((candidate) => existsSync(candidate))
const available = executable !== undefined && existsSync(coreDist) && existsSync(contentDist)

const suite = available ? describe : describe.skip

type CdpNode = {
  nodeId: number
  nodeName: string
  nodeType: number
  nodeValue?: string
  attributes?: string[]
}

function attribute(node: CdpNode, name: string): string | undefined {
  const attributes = node.attributes ?? []

  for (let i = 0; i < attributes.length; i += 2) {
    if (attributes[i] === name) return attributes[i + 1]
  }

  return undefined
}

async function snapshot(client: CDPSession): Promise<CdpNode[]> {
  const { nodes } = await client.send('DOM.getFlattenedDocument', { depth: -1, pierce: true })
  return nodes as CdpNode[]
}

/** Text nodes in the page and its closed shadow roots, minus long CSS blobs. */
function texts(nodes: CdpNode[]): string[] {
  return nodes
    .filter(
      (node) => node.nodeType === 3 && node.nodeValue !== undefined && node.nodeValue.length < 200,
    )
    .map((node) => node.nodeValue ?? '')
}

async function findButton(
  client: CDPSession,
  key: 'data-layer' | 'data-action',
  value: string,
): Promise<CdpNode> {
  const nodes = await snapshot(client)
  const match = nodes.find((node) => node.nodeName === 'BUTTON' && attribute(node, key) === value)

  if (match === undefined) throw new Error(`button not found: ${key}=${value}`)
  return match
}

async function click(client: CDPSession, node: CdpNode): Promise<void> {
  const { object } = await client.send('DOM.resolveNode', { nodeId: node.nodeId })
  if (object.objectId === undefined) throw new Error('could not resolve node')

  await client.send('Runtime.callFunctionOn', {
    objectId: object.objectId,
    functionDeclaration: 'function () { this.click() }',
  })
}

/**
 * The overlay lives in a closed shadow root, so the page cannot inspect it.
 * CDP pierces the root and lets the test assert what the user actually sees.
 */
async function shadowClient(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page)
  await client.send('DOM.enable')
  await client.send('Runtime.enable')
  return client
}

suite('extension lifecycle', () => {
  let browser: Browser | undefined

  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: executable, args: ['--no-sandbox'] })
  })

  afterAll(async () => {
    await browser?.close()
  })

  async function open(
    seed: Record<string, unknown> = {},
  ): Promise<{ page: Page; errors: string[] }> {
    if (browser === undefined) throw new Error('browser not started')

    const page = await browser.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    // Stands in for the extension APIs the bundle expects: `chrome.storage`
    // for the preferences, and `chrome.runtime.onMessage` so the bridge
    // registers its listener and the test can send real messages to it.
    await page.addInitScript((seed) => {
      const scope = globalThis as unknown as Record<string, unknown>
      const storage: Record<string, unknown> = { ...seed }
      const listeners: Array<(...args: unknown[]) => unknown> = []

      scope.__litedesign_storage__ = storage
      scope.__litedesign_messages__ = listeners
      scope.chrome = {
        storage: {
          local: {
            async get(key: string) {
              return { [key]: storage[key] }
            },
            async set(items: Record<string, unknown>) {
              Object.assign(storage, items)
            },
          },
        },
        runtime: {
          onMessage: {
            addListener(listener: (...args: unknown[]) => unknown) {
              listeners.push(listener)
            },
          },
        },
      }
    }, seed)

    await page.goto(`file://${fixture}`)

    return { page, errors }
  }

  async function send(page: Page, action: string, payload?: unknown): Promise<unknown> {
    return page.evaluate(
      ({ action, payload }) =>
        new Promise((resolve) => {
          const scope = globalThis as unknown as Record<string, unknown>
          const listeners = scope.__litedesign_messages__ as Array<
            (message: unknown, sender: unknown, respond: (value: unknown) => void) => unknown
          >

          for (const listener of listeners) listener({ action, payload }, {}, resolve)
        }),
      { action, payload },
    )
  }

  async function overlayState(page: Page): Promise<{
    exists: boolean
    display: string
    state: string | null
  }> {
    return page.evaluate(() => {
      const host = document.getElementById('__litedesign_overlay__')
      return {
        exists: host !== null,
        display: host?.style.display ?? '',
        state: window.__litedesign_state__ ?? null,
      }
    })
  }

  async function mount(page: Page): Promise<void> {
    await page.addScriptTag({ path: coreDist })
    await page.addScriptTag({ path: contentDist })
    // The service worker sends `toggle` after injecting; the test does the same.
    await page.evaluate(() => window.__litedesign_toggle__?.())
    await page.waitForFunction(() => window.__litedesign_state__ === 'active')
  }

  it('mounts, inspects hover, toggles a layer, and closes without shifting layout', async () => {
    const { page, errors } = await open()

    const size = () =>
      page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }))

    const before = await size()
    await mount(page)
    const after = await size()

    const client = await shadowClient(page)
    const initial = texts(await snapshot(client))

    expect(after).toEqual(before)
    expect(initial).toContain('litedesign')
    expect(initial).toContain('5 nodes · 0 issues')
    expect(initial).toEqual(expect.arrayContaining(['grid', 'guide', 'gap', 'issue', '×']))

    await page.evaluate(() => {
      const card = document.querySelector('.row > div')
      card?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })

    // Hover is painted on the next animation frame.
    await page.waitForTimeout(50)

    const hovered = texts(await snapshot(client))
    expect(
      hovered.some((text) => text.includes('padding  16px') && text.includes('margin   0px')),
    ).toBe(true)

    const grid = await findButton(client, 'data-layer', 'grid')
    expect(attribute(grid, 'aria-pressed')).toBe('true')

    await click(client, grid)
    const gridAfter = await findButton(client, 'data-layer', 'grid')
    expect(attribute(gridAfter, 'aria-pressed')).toBe('false')

    await page.evaluate(() => {
      const added = document.createElement('div')
      added.textContent = 'late content'
      added.style.padding = '12px'
      document.body.append(added)
    })

    await page.waitForTimeout(300)
    expect(texts(await snapshot(client))).toContain('6 nodes · 0 issues')

    await click(client, await findButton(client, 'data-action', 'close'))

    const removed = await page.evaluate(() => ({
      host: document.getElementById('__litedesign_overlay__') !== null,
      state: window.__litedesign_state__ ?? null,
    }))

    expect(removed).toEqual({ host: false, state: null })
    expect(errors).toEqual([])

    await page.close()
  })

  it('toggles on reinjection instead of stacking overlays', async () => {
    const { page, errors } = await open()

    await mount(page)

    // Re-injection alone does not toggle; the service worker sends `toggle`.
    await page.addScriptTag({ path: contentDist })
    await page.evaluate(() => window.__litedesign_toggle__?.())
    await page.waitForFunction(() => window.__litedesign_state__ === undefined)
    expect(await page.locator('#__litedesign_overlay__').count()).toBe(0)

    await page.addScriptTag({ path: contentDist })
    await page.evaluate(() => window.__litedesign_toggle__?.())
    await page.waitForFunction(() => window.__litedesign_state__ === 'active')
    expect(await page.locator('#__litedesign_overlay__').count()).toBe(1)

    expect(errors).toEqual([])
    await page.close()
  })

  it('hides the user overlay for a capture and restores it unchanged', async () => {
    const { page, errors } = await open()

    await mount(page)
    expect(await overlayState(page)).toEqual({ exists: true, display: '', state: 'active' })

    // Turn one layer off so the capture has something to lose.
    const client = await shadowClient(page)
    await click(client, await findButton(client, 'data-layer', 'grid'))

    await send(page, 'screenshot_prepare', {})
    expect(await overlayState(page)).toEqual({ exists: true, display: 'none', state: 'active' })

    await send(page, 'capture_cleanup')
    expect(await overlayState(page)).toEqual({ exists: true, display: '', state: 'active' })

    const grid = await findButton(client, 'data-layer', 'grid')
    expect(attribute(grid, 'aria-pressed')).toBe('false')
    expect(errors).toEqual([])

    await page.close()
  })

  it('restores the overlay on injection when the stored state says it was on', async () => {
    const { page, errors } = await open({ litedesign: { enabled: true, layers: ['grid'] } })

    // A reload re-injects the bundle; nothing else runs before it.
    await page.addScriptTag({ path: coreDist })
    await page.addScriptTag({ path: contentDist })
    await page.waitForFunction(() => window.__litedesign_state__ === 'active')

    expect(await overlayState(page)).toEqual({ exists: true, display: '', state: 'active' })

    const client = await shadowClient(page)
    const grid = await findButton(client, 'data-layer', 'grid')
    expect(attribute(grid, 'aria-pressed')).toBe('true')

    const stored = await page.evaluate(() => {
      const scope = globalThis as unknown as Record<string, unknown>
      return scope.__litedesign_storage__
    })
    expect(stored).toEqual({ litedesign: { enabled: true, layers: ['grid', 'hover'] } })
    expect(errors).toEqual([])

    await page.close()
  })

  it('stays off on injection when the stored state says it was off', async () => {
    const { page, errors } = await open({ litedesign: { enabled: false, layers: ['grid'] } })

    await page.addScriptTag({ path: coreDist })
    await page.addScriptTag({ path: contentDist })
    await page.waitForTimeout(100)

    expect(await overlayState(page)).toEqual({ exists: false, display: '', state: null })
    expect(errors).toEqual([])

    await page.close()
  })
})

function playwrightChromium(): string | undefined {
  const explicit = [process.env.LITEDESIGN_CHROMIUM, chromium.executablePath()].filter(
    (value): value is string => value !== undefined && existsSync(value),
  )

  if (explicit.length > 0) return explicit[0]

  const cache = path.join(os.homedir(), '.cache', 'ms-playwright')
  if (!existsSync(cache)) return undefined

  for (const name of readdirSync(cache).sort().reverse()) {
    if (!name.startsWith('chromium-')) continue

    for (const layout of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
      const file = path.join(cache, name, layout)
      if (existsSync(file)) return file
    }
  }

  return undefined
}

const bundledChromium = playwrightChromium()
const loadSuite = available && bundledChromium !== undefined ? describe : describe.skip

loadSuite('unpacked extension', () => {
  it('loads the MV3 manifest and registers the service worker', async () => {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'litedesign-profile-'))
    let context: BrowserContext | undefined

    try {
      context = await chromium.launchPersistentContext(profile, {
        executablePath: bundledChromium,
        headless: true,
        args: [
          '--no-sandbox',
          `--disable-extensions-except=${extensionDir}`,
          `--load-extension=${extensionDir}`,
        ],
      })

      const worker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker', { timeout: 10000 }))
      const manifest = await worker.evaluate(() => chrome.runtime.getManifest())

      expect(manifest.manifest_version).toBe(3)
      expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'storage'])
      // The service worker attaches to the active tab on its own; that needs a
      // standing host permission, because there is no click to grant activeTab.
      expect(manifest.host_permissions).toEqual(['http://*/*', 'https://*/*'])

      const background = manifest.background
      const serviceWorker =
        background !== undefined && 'service_worker' in background
          ? background.service_worker
          : undefined

      expect(serviceWorker).toBe('sw.js')

      // The icon opens a menu so "watch this tab" is a choice, not a toggle.
      const action = manifest.action
      expect(action?.default_popup).toBe('popup.html')
    } finally {
      await context?.close()
      await rm(profile, { recursive: true, force: true })
    }
  }, 20000)
})
