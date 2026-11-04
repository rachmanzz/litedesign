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
  placeInput(
    rect: { left: number; top: number; right: number; bottom: number },
    viewport: { width: number; height: number },
  ): { left: number; top: number; above: boolean }
  createToolbar(options: {
    layers: string[]
    grid: { step: number; axis: 'vertical' | 'horizontal' | 'both' }
    onToggle(layer: string, enabled: boolean): void
    onGrid(config: { step: number; axis: 'vertical' | 'horizontal' | 'both' }): void
    onClose(): void
  }): {
    element: HTMLElement
    setStats(nodes: number, issues: number, truncated: boolean): void
    setLayers(layers: string[]): void
    setGrid(config: { step: number; axis: 'vertical' | 'horizontal' | 'both' }): void
    askLabel(
      rect: { left: number; top: number; right: number; bottom: number },
      initial: string,
      commit: (text: string) => void,
      remove?: () => void,
    ): void
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
        grid: { step: 8, axis: 'both' },
        onToggle: (layer, enabled) => calls.push({ layer, enabled }),
        onGrid: () => undefined,
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
    expect(result.buttons).toBe(6)
  })

  it('places the label popup beside its element, flipping at the screen edges', async () => {
    if (browser === undefined) throw new Error('browser not started')

    const page = await browser.newPage()
    await page.goto('about:blank')
    await page.addScriptTag({ path: path.join(dir, 'toolbar.js') })

    const placements = await page.evaluate(() => {
      const api = (window as unknown as { __toolbar: ToolbarApi }).__toolbar
      const viewport = { width: 1000, height: 800 }

      return {
        // Middle of the screen: above, aligned with the element's left edge.
        center: api.placeInput({ left: 400, top: 400, right: 500, bottom: 450 }, viewport),
        // Near the right edge: the popup slides left so it stays on screen.
        right: api.placeInput({ left: 950, top: 400, right: 1000, bottom: 450 }, viewport),
        // Near the top edge: no room above, so it opens below.
        top: api.placeInput({ left: 400, top: 10, right: 500, bottom: 60 }, viewport),
        // Near the left edge: clamped to the margin, never off-screen.
        left: api.placeInput({ left: 0, top: 400, right: 60, bottom: 450 }, viewport),
      }
    })

    await page.close()

    expect(placements.center).toEqual({ left: 400, top: 392, above: true })
    expect(placements.right.left).toBe(1000 - 164 - 8)
    expect(placements.top).toEqual({ left: 400, top: 68, above: false })
    expect(placements.left.left).toBe(8)
  })

  it('cycles the grid axis and step from the toolbar icons', async () => {
    if (browser === undefined) throw new Error('browser not started')

    const page = await browser.newPage()
    await page.goto('about:blank')
    await page.addScriptTag({ path: path.join(dir, 'toolbar.js') })

    const result = await page.evaluate(() => {
      const api = (window as unknown as { __toolbar: ToolbarApi }).__toolbar
      const changes: Array<{ step: number; axis: string }> = []

      const toolbar = api.createToolbar({
        layers: ['grid', 'guide', 'gap', 'issue', 'hover'],
        grid: { step: 8, axis: 'both' },
        onToggle: () => undefined,
        onGrid: (config) => changes.push({ ...config }),
        onClose: () => undefined,
      })

      document.body.append(toolbar.element)
      const axis = (name: string) =>
        toolbar.element.querySelector<HTMLButtonElement>(`button[data-axis="${name}"]`)

      axis('step-up')?.click()
      axis('step-up')?.click()
      axis('step-down')?.click()
      axis('horizontal')?.click()
      toolbar.setGrid({ step: 64, axis: 'vertical' })
      axis('step-up')?.click()

      return {
        changes,
        // From 64 the next preset is 96; from an unknown step the +/- do nothing.
        step: toolbar.element.querySelector('.grid-step')?.textContent,
        pressed: {
          vertical: axis('vertical')?.getAttribute('aria-pressed'),
          horizontal: axis('horizontal')?.getAttribute('aria-pressed'),
          both: axis('both')?.getAttribute('aria-pressed'),
        },
      }
    })

    await page.close()

    expect(result.changes).toEqual([
      { step: 12, axis: 'both' },
      { step: 16, axis: 'both' },
      { step: 12, axis: 'both' },
      { step: 12, axis: 'horizontal' },
      { step: 96, axis: 'vertical' },
    ])
    expect(result.step).toBe('96')
    expect(result.pressed).toEqual({ vertical: 'true', horizontal: 'false', both: 'false' })
  })

  it('opens the label popup empty for a new label and prefilled with × for a rename', async () => {
    if (browser === undefined) throw new Error('browser not started')

    const page = await browser.newPage()
    await page.goto('about:blank')
    await page.addScriptTag({ path: path.join(dir, 'toolbar.js') })

    const result = await page.evaluate(() => {
      const api = (window as unknown as { __toolbar: ToolbarApi }).__toolbar
      const removed: string[] = []
      let renamed = ''

      const toolbar = api.createToolbar({
        layers: ['grid', 'guide', 'gap', 'issue', 'hover'],
        grid: { step: 8, axis: 'both' },
        onToggle: () => undefined,
        onGrid: () => undefined,
        onClose: () => undefined,
      })

      document.body.append(toolbar.element)
      const rect = { left: 100, top: 200, right: 300, bottom: 240 }

      // New label: empty input, no ×.
      toolbar.askLabel(rect, '', () => undefined)
      const fresh = {
        value: toolbar.element.querySelector<HTMLInputElement>('.label-popup input')?.value,
        remove: toolbar.element.querySelector<HTMLButtonElement>('.label-popup button')?.hidden,
      }

      // Rename: prefilled and selected, × visible, click removes.
      const popup = toolbar.element.querySelector<HTMLDivElement>('.label-popup')
      toolbar.askLabel(
        rect,
        'login',
        (text) => {
          renamed = text
        },
        () => {
          removed.push('yes')
        },
      )
      const edit = {
        value: popup?.querySelector<HTMLInputElement>('input')?.value,
        remove: popup?.querySelector<HTMLButtonElement>('button')?.hidden,
        selected: popup?.querySelector<HTMLInputElement>('input')?.selectionStart,
      }
      popup?.querySelector<HTMLButtonElement>('button')?.click()

      return { fresh, edit, renamed, removed }
    })

    await page.close()

    expect(result.fresh).toEqual({ value: '', remove: true })
    expect(result.edit).toEqual({ value: 'login', remove: false, selected: 0 })
    expect(result.renamed).toBe('')
    expect(result.removed).toEqual(['yes'])
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
