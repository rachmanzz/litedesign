import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { LAYERS, OVERLAY_HOST_ID } from '@litedesign/core'
import type { Graph, GraphNode, Issue } from '@litedesign/core/types'
import type { Browser, BrowserContext, LaunchOptions, Page } from 'playwright-core'
import { sameUrl } from '../hub.js'
import { ToolError } from '../mcp/errors.js'
import type {
  AnnotateOptions,
  Driver,
  LabelMark,
  MeasureResult,
  OverlayOptions,
  OverlayResult,
  ShotOptions,
  Viewport,
  WaitResult,
} from './types.js'

type Playwright = typeof import('playwright-core')

const DEFAULT_VIEWPORT = { width: 1280, height: 800 }
const POLL_MS = 150

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export type PlaywrightDriverOptions = {
  /** Override the injected measurement core. Used by tests and the CLI bundle. */
  corePath?: string
}

export class PlaywrightDriver implements Driver {
  readonly #playwright: Playwright
  readonly #corePath: string
  #browser: Browser | undefined
  #context: BrowserContext | undefined
  #page: Page | undefined

  constructor(playwright: Playwright, options: PlaywrightDriverOptions = {}) {
    this.#playwright = playwright
    this.#corePath = resolveCorePath(options.corePath)
  }

  async open(url: string, viewport?: Viewport): Promise<void> {
    const page = await this.#ensurePage()

    await page.setViewportSize(
      viewport === undefined ? DEFAULT_VIEWPORT : { width: viewport.w, height: viewport.h },
    )
    await page.goto(url, { waitUntil: 'load' })
    await this.#inject(page)
  }

  /**
   * "Ready" means the page was read, not that `open` once succeeded: the tab
   * can be closed or navigated away after that. The loop checks liveness and
   * the URL the session asked for.
   */
  async waitForPage(url: string, timeoutMs: number): Promise<WaitResult> {
    for (let waited = 0; waited < timeoutMs; waited += POLL_MS) {
      const page = this.#page

      if (page !== undefined && !page.isClosed() && sameUrl(page.url(), url)) {
        return { status: 'ready', url: page.url() }
      }

      const current = this.#page
      if (current !== undefined && !current.isClosed()) {
        // A live tab on a different URL is a mismatch the caller reports; no
        // point filling the timeout with it.
        return { status: 'mismatch', url: current.url() }
      }

      await sleep(POLL_MS)
    }

    return { status: 'timeout' }
  }

  async graph(): Promise<Graph> {
    const page = await this.#requirePage()
    await this.#inject(page)

    return page.evaluate(() => {
      const core = (
        window as unknown as {
          __litedesign: { buildGraph: (root: Element) => Graph }
        }
      ).__litedesign

      return core.buildGraph(document.body)
    })
  }

  async issues(rules?: string[]): Promise<Issue[]> {
    const graph = await this.graph()
    if (rules === undefined || rules.length === 0) return graph.issues

    const wanted = new Set(rules)
    return graph.issues.filter((issue) => wanted.has(issue.rule))
  }

  async measure(selector: string): Promise<MeasureResult> {
    const page = await this.#requirePage()
    await this.#inject(page)

    const found = await page.evaluate((target) => {
      const core = (
        window as unknown as {
          __litedesign: {
            buildGraph: (root: Element) => Graph
            resolveNode: (graph: Graph, selector: string) => GraphNode | null
          }
        }
      ).__litedesign

      const graph = core.buildGraph(document.body)
      const node = core.resolveNode(graph, target)

      if (node === null) return null

      const id = node.id
      const gaps = graph.gaps
        .filter((gap) => gap.a === id || gap.b === id)
        .map((gap) => ({
          to: gap.a === id ? gap.b : gap.a,
          axis: gap.axis,
          distance: gap.distance,
          kind: gap.kind,
        }))

      return { node, gaps }
    }, selector)

    if (found === null) {
      throw new ToolError(`selector "${selector}" did not match any element on the page`)
    }

    return {
      id: found.node.id,
      selector: found.node.selector,
      tag: found.node.tag,
      rect: found.node.rect,
      styles: found.node.styles,
      gaps: found.gaps,
    }
  }

  async screenshot(options: ShotOptions = {}): Promise<Buffer> {
    const page = await this.#requirePage()

    if (options.selector !== undefined) {
      const locator = page.locator(options.selector).first()
      if ((await locator.count()) === 0) {
        throw new ToolError(`selector "${options.selector}" did not match any element on the page`)
      }

      return locator.screenshot({ type: 'png' })
    }

    return page.screenshot({ type: 'png', fullPage: options.fullPage ?? false })
  }

  async annotate(options: AnnotateOptions = {}): Promise<Buffer> {
    const page = await this.#requirePage()
    await this.#inject(page)

    if (options.selector !== undefined) {
      const locator = page.locator(options.selector).first()
      if ((await locator.count()) === 0) {
        throw new ToolError(`selector "${options.selector}" did not match any element on the page`)
      }

      await locator.scrollIntoViewIfNeeded()
    }

    await page.evaluate(
      (input) => {
        const target = window as unknown as {
          __litedesign: {
            buildGraph: (root: Element) => Graph
            render: (graph: Graph, options: { layers: string[] }) => { destroy(): void }
          }
          __litedesign_handle__?: { destroy(): void }
        }

        target.__litedesign_handle__?.destroy()

        let graph = target.__litedesign.buildGraph(document.body)

        if (input.rules !== undefined && input.rules.length > 0) {
          const wanted = new Set(input.rules)
          graph = {
            ...graph,
            issues: graph.issues.filter((issue) => wanted.has(issue.rule)),
          }
        }

        target.__litedesign_handle__ = target.__litedesign.render(graph, { layers: input.layers })
      },
      { layers: ['grid', 'guide', 'gap', 'issue'], rules: options.rules },
    )

    // The overlay draws synchronously; two frames guarantee it is painted
    // before the screenshot is taken.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        }),
    )

    // The overlay is fixed to the viewport, so a full-page capture would only
    // annotate the first screen. Keep annotated captures viewport-only.
    return page.screenshot({ type: 'png' })
  }

  /**
   * Labels are marks the human makes through the toolbar; a headless page has
   * no human in it. `null` says "cannot know", so `inspect` can report the
   * truth instead of a `count: 0` that reads as "no labels pinned".
   */
  async labels(): Promise<LabelMark[] | null> {
    return null
  }

  async overlay(options: OverlayOptions): Promise<OverlayResult> {
    const page = await this.#requirePage()
    await this.#inject(page)

    const layers = options.enabled ? (options.layers ?? [...LAYERS]) : []

    const result = await page.evaluate(
      (input) => {
        type Handle = { destroy(): void; setFocus(id: string | null): void }
        type Node = { id: string; selector: string }
        const target = window as unknown as {
          __litedesign: {
            buildGraph: (root: Element) => Graph
            resolveNode: (graph: Graph, selector: string) => Node | null
            render: (graph: Graph, options: { layers: string[] }) => Handle
          }
          __litedesign_handle__?: Handle
          __litedesign_focus__?: string | null
        }

        target.__litedesign_handle__?.destroy()
        target.__litedesign_handle__ = undefined

        if (!input.enabled) {
          target.__litedesign_focus__ = null
          return { applied: false, focus: null }
        }

        const graph = target.__litedesign.buildGraph(document.body)
        const handle = target.__litedesign.render(graph, { layers: input.layers })
        target.__litedesign_handle__ = handle

        // The handle is remounted on every call, so the focus the agent left
        // set is remembered here and re-applied to the fresh handle.
        if (input.focus !== undefined) target.__litedesign_focus__ = input.focus

        let focus: string | null = null
        const wanted =
          input.focus !== undefined ? input.focus : (target.__litedesign_focus__ ?? null)

        if (wanted !== null) {
          const node = target.__litedesign.resolveNode(graph, wanted)
          if (node !== null) {
            handle.setFocus(node.id)
            focus = node.selector

            const element = document.querySelector(node.selector)
            element?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
          }
        }

        return { applied: true, focus }
      },
      { enabled: options.enabled, layers, focus: options.focus },
    )

    // The answer is a reading, not an echo: what the page actually carries
    // decides what gets reported. If the overlay is not attached (a page that
    // blocks it, an error mid-injection), `enabled` says so.
    const attached = await page.evaluate(
      (hostId) => document.getElementById(hostId) !== null,
      OVERLAY_HOST_ID,
    )

    return {
      enabled: attached,
      layers: attached ? layers : [],
      focus: attached ? result.focus : null,
    }
  }

  async close(): Promise<void> {
    await this.#context?.close().catch(() => undefined)
    await this.#browser?.close().catch(() => undefined)

    this.#context = undefined
    this.#browser = undefined
    this.#page = undefined
  }

  async #ensurePage(): Promise<Page> {
    if (this.#page !== undefined && !this.#page.isClosed()) return this.#page

    const browser = await this.#ensureBrowser()
    const context = await browser.newContext({
      viewport: DEFAULT_VIEWPORT,
      // Injected measurement code must run even on pages with a strict CSP.
      bypassCSP: true,
    })
    const page = await context.newPage()

    this.#context = context
    this.#page = page
    return page
  }

  async #ensureBrowser(): Promise<Browser> {
    if (this.#browser?.isConnected() === true) return this.#browser

    let last: unknown

    for (const options of launchCandidates(this.#playwright)) {
      try {
        this.#browser = await this.#playwright.chromium.launch({
          ...options,
          args: ['--no-sandbox'],
        })
        return this.#browser
      } catch (error) {
        last = error
      }
    }

    const detail = last instanceof Error ? `: ${last.message}` : ''
    throw new ToolError(`could not launch Chrome for Playwright${detail}`)
  }

  async #requirePage(): Promise<Page> {
    if (this.#page === undefined || this.#page.isClosed()) {
      throw new ToolError('no page is open. Call inspect with a url first')
    }

    return this.#page
  }

  async #inject(page: Page): Promise<void> {
    const ready = await page.evaluate(
      () => typeof (window as unknown as { __litedesign?: unknown }).__litedesign !== 'undefined',
    )

    if (ready) return

    try {
      await page.addScriptTag({ path: this.#corePath })
    } catch (error) {
      const detail = error instanceof Error ? `: ${error.message}` : ''
      throw new ToolError(`could not inject the measurement core${detail}`)
    }
  }
}

function launchCandidates(playwright: Playwright): LaunchOptions[] {
  const candidates: LaunchOptions[] = []

  if (process.env.CHROME_PATH !== undefined) {
    candidates.push({ executablePath: process.env.CHROME_PATH })
  }

  // Installed Chrome first: it is the browser the user actually designs in.
  candidates.push({ channel: 'chrome' })

  const bundled = playwright.chromium.executablePath()
  if (existsSync(bundled)) candidates.push({ executablePath: bundled })

  for (const candidate of [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]) {
    if (existsSync(candidate)) candidates.push({ executablePath: candidate })
  }

  return candidates
}

/**
 * Resolves the IIFE bundle injected into the page. The first candidate is the
 * built CLI layout, the second is the source layout used by tests.
 */
export function resolveCorePath(explicit?: string): string {
  const candidates = [
    explicit,
    process.env.LITEDESIGN_CORE,
    fileURLToPath(new URL('./extension/core.iife.js', import.meta.url)),
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../../../../core/dist/core.iife.js',
    ),
  ].filter((value): value is string => value !== undefined)

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new ToolError(
    'measurement core not found. Run `litedesign setup` or set LITEDESIGN_CORE to core.iife.js',
  )
}
