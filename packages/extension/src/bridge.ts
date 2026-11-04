import { applyOverlay, boot, overlayHost } from './boot.js'
import type { Core, Graph, LayerName, OverlayHandle } from './types.js'

type Payload = {
  selector?: string
  rules?: string[]
  layers?: LayerName[]
  fullPage?: boolean
  enabled?: boolean
}

type Rect = { x: number; y: number; w: number; h: number }

type Prepared = { rect?: Rect; dpr: number }

type Response = { ok: true; result?: unknown } | { ok: false; error: string }

const TEMP_LAYERS: LayerName[] = ['grid', 'guide', 'gap', 'issue']

const FULL_PAGE =
  'full-page screenshots need the Playwright driver. The extension can only capture the visible viewport.'

type Hidden = { element: HTMLElement; display: string }

/**
 * While a capture is running the user's overlay is hidden. `handle` is the
 * temporary overlay for an annotated capture; `hidden` is the user's overlay
 * with the display value it had before the capture.
 */
let suspended: { handle?: OverlayHandle; hidden?: Hidden } | undefined

/**
 * Installs the content-script side of the bridge. Safe to call on every
 * injection: Chrome may inject the bundle more than once into the same tab.
 */
export function installBridge(core: Core): void {
  window.__litedesign_toggle__ = () => void boot(core)

  if (window.__litedesign_bridge__ === true) return
  window.__litedesign_bridge__ = true

  // Tests inject this bundle into a normal page, where `chrome` does not exist.
  if (typeof chrome === 'undefined' || chrome.runtime?.onMessage === undefined) return

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    void respond(core, message).then(sendResponse, (error: unknown) => {
      sendResponse({ ok: false, error: messageOf(error) })
    })

    // Keep the channel open for the async response.
    return true
  })
}

async function respond(core: Core, raw: unknown): Promise<Response> {
  if (typeof raw !== 'object' || raw === null) throw new Error('invalid message')

  const message = raw as { action?: unknown; payload?: unknown }
  const action = typeof message.action === 'string' ? message.action : ''
  const payload = (message.payload ?? {}) as Payload

  switch (action) {
    case 'ping':
      return { ok: true, result: true }
    case 'toggle':
      await boot(core)
      return { ok: true }
    case 'overlay':
      return {
        ok: true,
        result: await applyOverlay(core, {
          enabled: payload.enabled !== false,
          layers: payload.layers,
        }),
      }
    case 'graph':
      return { ok: true, result: core.buildGraph(root()) }
    case 'measure':
      return { ok: true, result: measure(core, payload.selector) }
    case 'screenshot_prepare':
      return { ok: true, result: await prepareScreenshot(core, payload) }
    case 'annotate_prepare':
      return { ok: true, result: await prepareAnnotation(core, payload) }
    case 'capture_cleanup':
      await cleanup()
      return { ok: true }
    default:
      throw new Error(`unknown action: ${action || '(none)'}`)
  }
}

function measure(core: Core, selector: string | undefined): unknown {
  if (selector === undefined || selector === '') throw new Error('measure needs a selector')

  const graph = core.buildGraph(root())
  const node = core.resolveNode(graph, selector)
  if (node === null) throw new Error(`selector "${selector}" did not match any element on the page`)

  const gaps = graph.gaps
    .filter((gap) => gap.a === node.id || gap.b === node.id)
    .map((gap) => ({
      to: gap.a === node.id ? gap.b : gap.a,
      axis: gap.axis,
      distance: gap.distance,
      kind: gap.kind,
    }))

  return {
    id: node.id,
    selector: node.selector,
    tag: node.tag,
    rect: node.rect,
    styles: node.styles,
    gaps,
  }
}

async function prepareScreenshot(core: Core, payload: Payload): Promise<Prepared> {
  if (payload.fullPage === true) throw new Error(FULL_PAGE)

  const dpr = window.devicePixelRatio || 1
  const rect = await prepareElement(core, payload.selector)
  suspend()

  return { rect, dpr }
}

async function prepareAnnotation(core: Core, payload: Payload): Promise<Prepared> {
  if (payload.fullPage === true) throw new Error(FULL_PAGE)

  const dpr = window.devicePixelRatio || 1
  const rect = await prepareElement(core, payload.selector)

  let graph: Graph = core.buildGraph(root())
  if (payload.rules !== undefined && payload.rules.length > 0) {
    const wanted = new Set(payload.rules)
    graph = { ...graph, issues: graph.issues.filter((issue) => wanted.has(issue.rule)) }
  }

  const handle = core.render(graph, { layers: payload.layers ?? TEMP_LAYERS })
  suspend(handle)
  await frames(2)

  return { rect, dpr }
}

async function cleanup(): Promise<void> {
  const current = suspended
  if (current === undefined) return

  suspended = undefined
  current.handle?.destroy()
  showUserOverlay(current.hidden)
}

/**
 * Hides the user's overlay for the duration of a capture. It used to tear the
 * overlay down and remount it afterwards from storage, which meant a capture
 * could bring back a different layer selection than the one on screen. A
 * previous capture's overlay is replaced, not stacked.
 */
function suspend(handle?: OverlayHandle): void {
  const previous = suspended
  previous?.handle?.destroy()
  showUserOverlay(previous?.hidden)

  suspended =
    handle === undefined ? { hidden: hideUserOverlay() } : { handle, hidden: hideUserOverlay() }
}

function hideUserOverlay(): Hidden | undefined {
  const element = overlayHost()
  if (element === undefined) return undefined

  const display = element.style.display
  element.style.display = 'none'

  return { element, display }
}

function showUserOverlay(hidden: Hidden | undefined): void {
  if (hidden !== undefined) hidden.element.style.display = hidden.display
}

async function prepareElement(core: Core, selector: string | undefined): Promise<Rect | undefined> {
  if (selector === undefined || selector === '') return undefined

  const graph = core.buildGraph(root())
  const node = core.resolveNode(graph, selector)
  if (node === null) throw new Error(`selector "${selector}" did not match any element on the page`)

  let element: Element | null = null

  try {
    element = document.querySelector(node.selector)
  } catch {
    element = null
  }

  if (element === null) {
    throw new Error(
      `selector "${selector}" is inside a shadow root. Measure it, but capture the whole viewport instead.`,
    )
  }

  element.scrollIntoView({ block: 'center', inline: 'center' })
  await frames(1)

  const rect = element.getBoundingClientRect()
  return { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
}

function root(): Element {
  return document.body ?? document.documentElement
}

function frames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let left = count

    const tick = (): void => {
      left -= 1
      if (left <= 0) resolve()
      else requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  })
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  if (typeof error === 'string' && error !== '') return error
  return 'unexpected error'
}
