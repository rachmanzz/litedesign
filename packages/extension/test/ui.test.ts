import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { type Browser, chromium } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const src = path.join(root, 'packages/extension/src')

const candidates = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((value): value is string => Boolean(value))

const executable = candidates.find((candidate) => existsSync(candidate))
const suite = executable !== undefined ? describe : describe.skip

type ToolbarButton = HTMLButtonElement | null

type ToolbarApi = {
  createToolbar(options: {
    layers: string[]
    onToggle(layer: string, enabled: boolean): void
    onClose(): void
  }): {
    element: HTMLElement
    setStats(nodes: number, issues: number, truncated: boolean): void
    setLayers(layers: string[]): void
  }
}

type ObserverApi = {
  observeChanges(options: { root: Element; debounceMs: number; onChange(): void }): { stop(): void }
}

suite('extension ui', () => {
  let browser: Browser | undefined
  let dir = ''

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'litedesign-ui-'))

    await build({
      entryPoints: [path.join(src, 'toolbar.ts')],
      bundle: true,
      format: 'iife',
      globalName: '__toolbar',
      platform: 'browser',
      target: 'chrome120',
      outfile: path.join(dir, 'toolbar.js'),
    })

    await build({
      entryPoints: [path.join(src, 'observer.ts')],
      bundle: true,
      format: 'iife',
      globalName: '__observer',
      platform: 'browser',
      target: 'chrome120',
      outfile: path.join(dir, 'observer.js'),
    })

    browser = await chromium.launch({ executablePath: executable, args: ['--no-sandbox'] })
  })

  afterAll(async () => {
    await browser?.close()
    if (dir !== '') await rm(dir, { recursive: true, force: true })
  })

  it('reports stats, toggles a layer, and closes', async () => {
    if (browser === undefined) throw new Error('browser not started')

    const page = await browser.newPage()
    await page.goto('about:blank')
    await page.addScriptTag({ path: path.join(dir, 'toolbar.js') })

    const result = await page.evaluate(() => {
      const api = (window as unknown as { __toolbar: ToolbarApi }).__toolbar
      const calls: Array<{ layer: string; enabled: boolean }> = []
      let closed = 0

      const toolbar = api.createToolbar({
        layers: ['grid', 'guide', 'gap', 'issue', 'hover'],
        onToggle: (layer, enabled) => calls.push({ layer, enabled }),
        onClose: () => {
          closed += 1
        },
      })

      document.body.append(toolbar.element)
      toolbar.setStats(42, 3, false)

      const button = (layer: string): ToolbarButton =>
        toolbar.element.querySelector<HTMLButtonElement>(`button[data-layer="${layer}"]`)

      button('grid')?.click()
      const beforeSet = button('grid')?.getAttribute('aria-pressed')

      toolbar.setLayers(['guide', 'gap', 'issue', 'hover'])
      const afterSet = button('grid')?.getAttribute('aria-pressed')

      toolbar.element.querySelector<HTMLButtonElement>('button[data-action="close"]')?.click()

      return {
        calls,
        closed,
        beforeSet,
        afterSet,
        stats: toolbar.element.querySelector('.stats')?.textContent,
        buttons: toolbar.element.querySelectorAll('button[data-layer]').length,
      }
    })

    await page.close()

    expect(result.calls).toEqual([{ layer: 'grid', enabled: false }])
    expect(result.closed).toBe(1)
    expect(result.beforeSet).toBe('true')
    expect(result.afterSet).toBe('false')
    expect(result.stats).toBe('42 nodes · 3 issues')
    expect(result.buttons).toBe(4)
  })

  it('debounces a burst of mutations into one rebuild and stops cleanly', async () => {
    if (browser === undefined) throw new Error('browser not started')

    const page = await browser.newPage()
    await page.goto('about:blank')
    await page.addScriptTag({ path: path.join(dir, 'observer.js') })

    await page.evaluate(() => {
      const api = (window as unknown as { __observer: ObserverApi }).__observer
      const state: { calls: number; observer: { stop(): void } | undefined } = {
        calls: 0,
        observer: undefined,
      }

      ;(window as unknown as { __observerState: typeof state }).__observerState = state
      state.observer = api.observeChanges({
        root: document.body,
        debounceMs: 30,
        onChange: () => {
          state.calls += 1
        },
      })
    })

    // ResizeObserver reports the initial size once; let that settle.
    await page.waitForFunction(
      () =>
        (window as unknown as { __observerState: { calls: number } }).__observerState.calls >= 1,
    )
    await page.evaluate(() => {
      ;(window as unknown as { __observerState: { calls: number } }).__observerState.calls = 0
    })

    await page.evaluate(() => {
      const fragment = document.createDocumentFragment()
      for (let i = 0; i < 5; i++) fragment.append(document.createElement('div'))
      document.body.append(fragment)
    })

    await page.waitForFunction(
      () =>
        (window as unknown as { __observerState: { calls: number } }).__observerState.calls === 1,
    )

    await page.evaluate(() => {
      const state = (
        window as unknown as {
          __observerState: { calls: number; observer: { stop(): void } | undefined }
        }
      ).__observerState

      state.observer?.stop()
      document.body.append(document.createElement('span'))
    })

    await page.waitForTimeout(100)

    const calls = await page.evaluate(
      () => (window as unknown as { __observerState: { calls: number } }).__observerState.calls,
    )

    await page.close()
    expect(calls).toBe(1)
  })
})
