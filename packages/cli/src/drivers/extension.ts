import type { Graph, Issue } from '@litedesign/core/types'
import { type Bridge, type HubPage, sameUrl } from '../hub.js'
import { AwaitingUserError, MismatchError, ToolError } from '../mcp/errors.js'
import type {
  AnnotateOptions,
  Driver,
  MeasureResult,
  OverlayOptions,
  OverlayResult,
  ShotOptions,
  WaitResult,
} from './types.js'

type ShotPayload = { data: string }

/**
 * Drives the page the user already has open. The extension owns the tab, so
 * this driver never opens, navigates, or closes anything.
 *
 * `open` does not need a click: it asks the connected worker to attach to the
 * tab the human is looking at, then checks that the URL is the expected one.
 */
export class ExtensionDriver implements Driver {
  readonly #hub: Bridge
  #target: string | undefined

  constructor(hub: Bridge) {
    this.#hub = hub
  }

  async open(url: string): Promise<void> {
    this.#target = url

    if (this.#hub.find(url) !== undefined) return

    if (!this.#hub.hasClient()) throw new AwaitingUserError(url)

    const page = await this.#hub.requestAny<HubPage>('attach')

    if (!sameUrl(page.url, url)) throw new MismatchError(url, page.url)

    this.#target = page.url
  }

  async waitForPage(url: string, timeoutMs: number): Promise<WaitResult> {
    const outcome = await this.#hub.waitForPage(url, timeoutMs)

    if (outcome.status === 'timeout') return { status: 'timeout' }
    if (outcome.status === 'mismatch') return { status: 'mismatch', url: outcome.page.url }

    this.#target = outcome.page.url
    return { status: 'ready', url: outcome.page.url }
  }

  async graph(): Promise<Graph> {
    return this.#request<Graph>('graph')
  }

  async issues(rules?: string[]): Promise<Issue[]> {
    const graph = await this.graph()
    if (rules === undefined || rules.length === 0) return graph.issues

    const wanted = new Set(rules)
    return graph.issues.filter((issue) => wanted.has(issue.rule))
  }

  async measure(selector: string): Promise<MeasureResult> {
    return this.#request<MeasureResult>('measure', { selector })
  }

  async screenshot(options: ShotOptions = {}): Promise<Buffer> {
    return decode(await this.#request<ShotPayload>('screenshot', options))
  }

  async annotate(options: AnnotateOptions = {}): Promise<Buffer> {
    return decode(await this.#request<ShotPayload>('annotate', options))
  }

  async overlay(options: OverlayOptions): Promise<OverlayResult> {
    const result = await this.#request<OverlayResult | undefined>('overlay', options)

    // An extension built before the overlay tool reported its result answers
    // `{ ok: true }` with no result. Say what to do instead of crashing on
    // `result.enabled`.
    if (result === undefined) {
      throw new ToolError(
        'the extension did not report the overlay state. Reload the litedesign extension at chrome://extensions, then try again.',
      )
    }

    return result
  }

  async close(): Promise<void> {
    // The page belongs to the user. Closing it would be hostile.
  }

  #request<T>(action: string, payload?: unknown): Promise<T> {
    const page = this.#require()
    return this.#hub.request<T>(page.tabId, action, payload)
  }

  #require(): HubPage {
    if (this.#target === undefined) {
      throw new ToolError('no page is open. Call inspect with a url first')
    }

    const page = this.#hub.find(this.#target)
    if (page === undefined) {
      throw new ToolError('the page is no longer connected. Open it and call inspect again.')
    }

    return page
  }
}

function decode(payload: ShotPayload): Buffer {
  if (typeof payload?.data !== 'string' || payload.data === '') {
    throw new ToolError('the extension returned an empty screenshot')
  }

  return Buffer.from(payload.data, 'base64')
}
