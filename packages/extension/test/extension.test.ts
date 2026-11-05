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

  it('reports the layers the page is actually showing', async () => {
    const { page, errors } = await open()
    await mount(page)

    const shown = await send(page, 'overlay', { enabled: true, layers: ['grid', 'gap'] })
    expect(shown).toEqual({
      ok: true,
      result: { enabled: true, layers: ['grid', 'gap'], focus: null },
    })

    // The answer is the page's own state, so the toolbar has to agree with it.
    const client = await shadowClient(page)
    const issue = await findButton(client, 'data-layer', 'issue')
    expect(attribute(issue, 'aria-pressed')).toBe('false')

    const hidden = await send(page, 'overlay', { enabled: false })
    expect(hidden).toEqual({
      ok: true,
      result: { enabled: false, layers: [], focus: null },
    })
    expect(await overlayState(page)).toEqual({ exists: false, display: '', state: null })

    expect(errors).toEqual([])
    await page.close()
  })

  it('toggles the dim and the spotlight independently from the toolbar', async () => {
    const { page, errors } = await open()
    await mount(page)

    const client = await shadowClient(page)

    // Spotlight something so the layers have content to lose.
    const focused = await send(page, 'overlay', { enabled: true, focus: '.row > div' })
    expect(focused).toEqual({
      ok: true,
      result: {
        enabled: true,
        layers: expect.any(Array),
        focus: expect.any(String),
      },
    })

    const layerStyle = (name: string): Promise<string> =>
      snapshot(client).then((nodes) => {
        const layer = nodes.find(
          (node) => node.nodeName === 'DIV' && attribute(node, 'data-layer') === name,
        )
        if (layer === undefined) return ''
        return attribute(layer, 'style') ?? ''
      })
    const dim = (): Promise<CdpNode | undefined> =>
      snapshot(client).then((nodes) =>
        nodes.find((node) => (attribute(node, 'style') ?? '').includes('box-shadow')),
      )
    const outline = (): Promise<CdpNode | undefined> =>
      snapshot(client).then((nodes) =>
        nodes.find((node) => (attribute(node, 'style') ?? '').includes('2px solid')),
      )

    expect(await dim()).toBeDefined()
    expect(await outline()).toBeDefined()

    // Dim off: the page goes bright, the spotlight stays.
    await click(client, await findButton(client, 'data-layer', 'dim'))

    expect(attribute(await findButton(client, 'data-layer', 'dim'), 'aria-pressed')).toBe('false')
    expect(await layerStyle('dim')).toContain('display: none')
    expect(await dim()).toBeUndefined()
    expect(await outline()).toBeDefined()

    // Focus off: the spotlight goes, the page stays bright.
    await click(client, await findButton(client, 'data-layer', 'focus'))

    expect(await layerStyle('focus')).toContain('display: none')
    expect(await outline()).toBeUndefined()
    expect(await dim()).toBeUndefined()

    // The focus state itself is untouched: toggling back on restores it.
    const after = await send(page, 'overlay', { enabled: true })
    const layers = (after as { result: { layers: string[] } }).result.layers
    expect(layers).not.toContain('dim')
    expect(layers).not.toContain('focus')
    expect(await overlayState(page)).toEqual({ exists: true, display: '', state: 'active' })

    await click(client, await findButton(client, 'data-layer', 'focus'))

    expect(await outline()).toBeDefined()

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
    expect(stored).toEqual({
      litedesign: {
        enabled: true,
        layers: ['grid', 'hover'],
        focus: null,
        grid: { step: 8, axis: 'both' },
      },
    })
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

  it('spotlights a live text change without an explicit focus', async () => {
    const { page, errors } = await open()
    await mount(page)

    expect(await page.evaluate(() => window.__litedesign_focus_selector__?.() ?? null)).toBeNull()

    await page.evaluate(() => {
      const card = document.querySelector('.row > div:nth-child(2)')
      if (card !== null) card.textContent = 'Beta edited'
    })
    // One observer debounce plus the rebuild.
    await page.waitForTimeout(300)

    const focus = await page.evaluate(() => window.__litedesign_focus_selector__?.() ?? null)
    expect(focus).not.toBeNull()
    expect(
      await page.evaluate((selector) => document.querySelector(selector)?.textContent ?? '', focus),
    ).toBe('Beta edited')
    expect(errors).toEqual([])

    await page.close()
  })

  it('comes back from a reload focused on what changed, not on the old focus', async () => {
    const { page, errors } = await open({
      litedesign: {
        enabled: true,
        layers: ['grid', 'hover'],
        focus: null,
        grid: { step: 8, axis: 'both' },
      },
    })

    // Stand in for "the file changed while the page was away": a snapshot the
    // previous session took, with one text signature that no longer matches.
    await page.evaluate(() => {
      sessionStorage.setItem(
        'litedesign-snapshot',
        JSON.stringify([
          ['body:nth-child(2)', 'body|'],
          ['body:nth-child(2) > div:nth-child(1)', 'div|'],
          ['body:nth-child(2) > div:nth-child(1) > div:nth-child(1)', 'div|stale'],
          ['body:nth-child(2) > div:nth-child(1) > div:nth-child(2)', 'div|Beta'],
          ['body:nth-child(2) > div:nth-child(1) > div:nth-child(3)', 'div|Gamma'],
        ]),
      )
    })

    await page.addScriptTag({ path: coreDist })
    await page.addScriptTag({ path: contentDist })
    await page.waitForFunction(() => window.__litedesign_state__ === 'active')

    const focus = await page.evaluate(() => window.__litedesign_focus_selector__?.() ?? null)
    expect(focus).not.toBeNull()
    expect(
      await page.evaluate((selector) => document.querySelector(selector)?.textContent ?? '', focus),
    ).toBe('Alpha')
    expect(errors).toEqual([])

    await page.close()
  })

  it('draws the labels the human pinned and reports them to the bridge', async () => {
    const { page, errors } = await open()
    await mount(page)

    const client = await shadowClient(page)

    // Turn the overlay off, then seed a label as if the human had pinned it.
    await send(page, 'overlay', { enabled: false })
    await page.evaluate(() => {
      const scope = globalThis as unknown as {
        __litedesign: { buildGraph(root: Element): { nodes: { tag: string; selector: string }[] } }
        __litedesign_storage__: Record<string, unknown>
      }
      const node = scope.__litedesign.buildGraph(document.body).nodes.find((n) => n.tag === 'div')
      if (node === undefined) throw new Error('no div in the graph')

      scope.__litedesign_storage__['litedesign-labels'] = {
        [`${location.origin}${location.pathname}`]: [
          { id: 'seed-1', text: 'login', selector: node.selector },
        ],
      }
    })

    // Remount: the badge comes back from storage with the overlay.
    await send(page, 'overlay', { enabled: true })
    await page.waitForFunction(() => window.__litedesign_state__ === 'active')
    await page.waitForTimeout(100)

    expect(texts(await snapshot(client))).toContain('login')

    const reported = await send(page, 'labels')
    expect(reported).toEqual({
      ok: true,
      result: {
        labels: [{ id: 'seed-1', text: 'login', selector: expect.any(String) }],
      },
    })

    expect(errors).toEqual([])
    await page.close()
  })

  it('opens the rename popup from a badge click and removes the label', async () => {
    const { page, errors } = await open()
    await mount(page)

    const client = await shadowClient(page)

    await send(page, 'overlay', { enabled: false })
    const selector = await page.evaluate(() => {
      const scope = globalThis as unknown as {
        __litedesign: { buildGraph(root: Element): { nodes: { tag: string; selector: string }[] } }
        __litedesign_storage__: Record<string, unknown>
      }
      const node = scope.__litedesign.buildGraph(document.body).nodes.find((n) => n.tag === 'div')
      if (node === undefined) throw new Error('no div in the graph')

      scope.__litedesign_storage__['litedesign-labels'] = {
        [`${location.origin}${location.pathname}`]: [
          { id: 'seed-1', text: 'login', selector: node.selector },
        ],
      }
      return node.selector
    })

    await send(page, 'overlay', { enabled: true })
    await page.waitForFunction(() => window.__litedesign_state__ === 'active')
    await page.waitForTimeout(100)

    // Label mode on: the badges become clickable overlay chrome.
    await click(client, await findButton(client, 'data-action', 'label'))
    await page.waitForTimeout(50)

    // The badge floats above the element's top edge; click it there.
    const point = await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (el === null) throw new Error('seeded element not found')
      const rect = el.getBoundingClientRect()
      return { x: rect.left + 6, y: rect.top - 6 }
    }, selector)
    await page.mouse.click(point.x, point.y)
    await page.waitForTimeout(50)

    // Rename mode: the input comes prefilled with the pinned name.
    const input = (await snapshot(client)).find((node) => node.nodeName === 'INPUT')
    if (input === undefined) throw new Error('popup input not found')
    const resolved = await client.send('DOM.resolveNode', { nodeId: input.nodeId })
    const value = await client.send('Runtime.callFunctionOn', {
      objectId: resolved.object.objectId,
      functionDeclaration: 'function () { return this.value }',
      returnByValue: true,
    })
    expect(value.result.value).toBe('login')

    // × in the popup removes the label the agent reads through the bridge.
    const cross = (await snapshot(client)).find(
      (node) => node.nodeName === 'BUTTON' && attribute(node, 'title') === 'Remove this label',
    )
    if (cross === undefined) throw new Error('remove button not found')
    await click(client, cross)
    await page.waitForTimeout(50)

    expect(await send(page, 'labels')).toEqual({ ok: true, result: { labels: [] } })

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
