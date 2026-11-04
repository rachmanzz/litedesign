import { backoffDelay, OFFLINE_AFTER } from './backoff.js'
import type { BridgeStatus } from './types.js'

/**
 * The service worker owns the WebSocket to the MCP hub, forwards measurement
 * requests to the content script, and captures the visible tab.
 *
 * MV3 kills the worker when it goes idle. A WebSocket with traffic every 20s
 * keeps it alive; if Chrome still stops it, module init reconnects and restores
 * the last page from `chrome.storage.session`.
 *
 * The socket is also the control channel. The MCP server asks the worker to
 * attach to whatever tab the human is looking at, so nobody has to click the
 * icon before an agent can measure. That is why the worker keeps retrying: a
 * stopped socket would make the extension unreachable until a click.
 */

const DEFAULT_PORT = 8787
const PING_INTERVAL = 20000
const SESSION_KEY = 'page'
const ONLINE_TITLE = 'litedesign: watch this tab'

type Page = { tabId: number; url: string; title: string }

type BridgeResult = { ok: true; result?: unknown } | { ok: false; error: string }

type Prepared = { rect?: Rect; dpr?: number }

type Rect = { x: number; y: number; w: number; h: number }

let socket: WebSocket | undefined
let current: Page | undefined
let port = DEFAULT_PORT
let failures = 0
let offline = false
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
let pingTimer: ReturnType<typeof setInterval> | undefined

const ready = start()

async function start(): Promise<void> {
  port = await readPort()
  current = await readPage()

  connect()
}

/**
 * The human is looking at a tab, which is the moment the hub may want to
 * attach. Retrying here means the first `inspect` after starting the server
 * does not wait for the backoff timer.
 */
function wake(): void {
  retry()
}

chrome.tabs.onActivated.addListener(wake)
chrome.windows.onFocusChanged.addListener(wake)

/**
 * The popup asks the worker what it holds and for explicit actions. The icon
 * opens that menu instead of toggling the overlay, so binding a tab is the
 * human's decision rather than a side effect of a click.
 */
chrome.runtime.onMessage.addListener((message, _sender, respond) => {
  void answer(message).then(respond, (error: unknown) => {
    respond({ ok: false, error: messageOf(error) })
  })

  // Keeps the channel open for the async answer.
  return true
})

async function answer(message: unknown): Promise<BridgeResult> {
  await ready

  if (typeof message !== 'object' || message === null) throw new Error('invalid message')

  const request = message as { type?: unknown; tabId?: unknown }

  switch (request.type) {
    case 'status':
      return { ok: true, result: status() }
    case 'watch':
      if (typeof request.tabId !== 'number') throw new Error('watch needs a tab id')
      return { ok: true, result: await watch(request.tabId) }
    case 'overlay':
      if (typeof request.tabId !== 'number') throw new Error('overlay needs a tab id')
      return { ok: true, result: await toggleOverlay(request.tabId) }
    default:
      throw new Error(`unknown message: ${String(request.type)}`)
  }
}

function status(): BridgeStatus {
  return {
    bridge: socket?.readyState === WebSocket.OPEN,
    port,
    page: current ?? null,
  }
}

/**
 * Binds the worker to one tab on purpose. This is the same state `attach`
 * produces for the agent, but started by the human from the popup.
 */
async function watch(tabId: number): Promise<Page> {
  const tab = await chrome.tabs.get(tabId)

  if (!isSupported(tab.url)) {
    throw new Error('this tab is not an http(s) page. Open the page you want to measure.')
  }

  const page: Page = { tabId, url: tab.url ?? '', title: tab.title ?? '' }

  await ensureContent(tabId)

  current = page
  await savePage(page)
  send({ type: 'hello', ...page, version: chrome.runtime.getManifest().version })
  retry()
  await applyStatus(tabId)

  return page
}

/** The overlay belongs to the watched tab, so watch it first when needed. */
async function toggleOverlay(tabId: number): Promise<unknown> {
  if (current?.tabId !== tabId) await watch(tabId)
  return toTab('toggle')
}

chrome.tabs.onRemoved.addListener((tabId) => {
  if (current?.tabId !== tabId) return

  current = undefined
  void savePage(undefined)
  send({ type: 'bye' })

  // Keep the socket: the hub may still ask this worker to attach to another tab.
})

/**
 * A reload drops the content script, and with it the overlay. Re-inject once
 * the watched tab has finished loading; the content script restores the
 * overlay from storage, so saving a file during an edit keeps the grid up.
 */
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status !== 'complete' || current?.tabId !== tabId) return

  void ensureContent(tabId).catch(() => undefined)
})

function connect(): void {
  if (socket !== undefined && socket.readyState <= WebSocket.OPEN) return

  const next = new WebSocket(`ws://127.0.0.1:${port}`)
  socket = next

  next.addEventListener('open', () => {
    failures = 0
    void setOnline()

    if (current !== undefined) {
      send({ type: 'hello', ...current, version: chrome.runtime.getManifest().version })
    }

    startPing()
  })

  next.addEventListener('message', (event) => {
    void onMessage(event.data)
  })

  next.addEventListener('close', () => {
    if (socket === next) socket = undefined

    stopPing()
    failures += 1

    // Only complain when there is a page waiting on the bridge.
    if (current !== undefined && failures >= OFFLINE_AFTER) void setOffline()

    scheduleReconnect()
  })

  next.addEventListener('error', () => {
    // `close` follows; reconnection is handled there.
  })
}

/** The icon click means the user expects a server now, so start a fresh run. */
function retry(): void {
  failures = 0

  if (reconnectTimer !== undefined) {
    clearTimeout(reconnectTimer)
    reconnectTimer = undefined
  }

  connect()
}

function scheduleReconnect(): void {
  if (reconnectTimer !== undefined) return

  const delay = backoffDelay(failures) + Math.round(Math.random() * 250)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined
    connect()
  }, delay)
}

/**
 * Says the bridge is down once, then keeps retrying quietly. The browser logs
 * each failed attempt itself, so one clear line beats one per attempt.
 */
async function setOffline(): Promise<void> {
  const first = !offline
  offline = true

  if (first) {
    console.info(
      `[litedesign] no MCP server on ws://127.0.0.1:${port} after ${OFFLINE_AFTER} attempts. ` +
        'Start "litedesign mcp"; the bridge reconnects by itself.',
    )
  }

  await applyStatus()
}

async function setOnline(): Promise<void> {
  if (!offline) return

  offline = false
  await applyStatus()
}

function offlineTitle(): string {
  return `litedesign: no MCP server on port ${port} — start "litedesign mcp"`
}

/** Global for new tabs, per-tab for the tab we care about. */
async function applyStatus(tabId: number | undefined = current?.tabId): Promise<void> {
  const badge = offline ? '!' : ''
  const title = offline ? offlineTitle() : ONLINE_TITLE

  try {
    await chrome.action.setBadgeText({ text: badge })
    await chrome.action.setBadgeBackgroundColor({ color: '#dc2626' })
    await chrome.action.setTitle({ title })

    if (tabId !== undefined) {
      await chrome.action.setBadgeText({ tabId, text: badge })
      await chrome.action.setTitle({ tabId, title })
    }
  } catch {
    // The action API is unavailable while Chrome shuts down.
  }
}

function startPing(): void {
  stopPing()
  pingTimer = setInterval(() => send({ type: 'ping' }), PING_INTERVAL)
}

function stopPing(): void {
  if (pingTimer !== undefined) clearInterval(pingTimer)
  pingTimer = undefined
}

function send(message: unknown): void {
  if (socket?.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify(message))
}

async function onMessage(raw: unknown): Promise<void> {
  let message: Record<string, unknown>

  try {
    const parsed: unknown = JSON.parse(String(raw))
    if (typeof parsed !== 'object' || parsed === null) return
    message = parsed as Record<string, unknown>
  } catch {
    return
  }

  if (message.type === 'ping') {
    send({ type: 'pong' })
    return
  }

  if (
    message.type === 'request' &&
    typeof message.id === 'string' &&
    typeof message.action === 'string'
  ) {
    await handleRequest(message.id, message.action, message.payload)
  }
}

async function handleRequest(id: string, action: string, payload: unknown): Promise<void> {
  try {
    const result = await route(action, payload)
    send({ type: 'response', id, ok: true, result })
  } catch (error) {
    send({ type: 'response', id, ok: false, error: messageOf(error) })
  }
}

async function route(action: string, payload: unknown): Promise<unknown> {
  switch (action) {
    case 'attach':
      return attach()
    case 'graph':
    case 'measure':
    case 'overlay':
      return toTab(action, payload)
    case 'screenshot':
      return capture('screenshot_prepare', payload)
    case 'annotate':
      return capture('annotate_prepare', payload)
    default:
      throw new Error(`unknown action: ${action}`)
  }
}

/**
 * Binds to the tab the human is looking at. This is what removes the click:
 * the server asks for a page, the worker picks the active one and announces it.
 */
async function attach(): Promise<Page> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })

  if (tab?.id === undefined || !isSupported(tab.url)) {
    throw new Error(
      'the active tab is not an http(s) page. Switch to the page you want to measure.',
    )
  }

  const page: Page = { tabId: tab.id, url: tab.url ?? '', title: tab.title ?? '' }

  await ensureContent(page.tabId)

  current = page
  await savePage(page)
  send({ type: 'hello', ...page, version: chrome.runtime.getManifest().version })

  return page
}

async function capture(
  action: 'screenshot_prepare' | 'annotate_prepare',
  payload: unknown,
): Promise<{ data: string }> {
  const page = requirePage()
  const tab = await chrome.tabs.get(page.tabId)

  if (tab.active !== true) {
    throw new Error('the page is not the active tab. Switch to it and try again.')
  }

  if (tab.windowId === undefined) throw new Error('the page has no window.')

  const prepared = await toTabRaw(action, payload)
  if (!prepared.ok) throw new Error(prepared.error)

  const prep = (prepared.result ?? {}) as Prepared

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' })
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)

    return {
      data: prep.rect === undefined ? base64 : await crop(base64, prep.rect, prep.dpr ?? 1),
    }
  } finally {
    await toTabRaw('capture_cleanup').catch(() => undefined)
  }
}

async function toTab(action: string, payload?: unknown): Promise<unknown> {
  const response = await toTabRaw(action, payload)
  if (!response.ok) throw new Error(response.error)
  return response.result
}

async function toTabRaw(action: string, payload?: unknown): Promise<BridgeResult> {
  const page = requirePage()
  await ensureContent(page.tabId)

  const response = (await chrome.tabs.sendMessage(page.tabId, { action, payload })) as
    | BridgeResult
    | undefined

  if (response === undefined) throw new Error('the content script did not respond')
  return response
}

/**
 * Injects on demand. The icon click is the usual path, but a reconnecting
 * service worker may ask for a measurement after the content script is gone.
 */
async function ensureContent(tabId: number): Promise<void> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, { action: 'ping' })) as
      | BridgeResult
      | undefined

    if (response?.ok === true) return
  } catch {
    // No receiver yet; fall through to injection.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['core.iife.js', 'content.js'],
  })
}

async function crop(base64: string, rect: Rect, dpr: number): Promise<string> {
  const bitmap = await createImageBitmap(toBlob(base64))
  const x = clamp(Math.round(rect.x * dpr), 0, bitmap.width)
  const y = clamp(Math.round(rect.y * dpr), 0, bitmap.height)
  const w = clamp(Math.round(rect.w * dpr), 1, bitmap.width - x)
  const h = clamp(Math.round(rect.h * dpr), 1, bitmap.height - y)

  if (w <= 0 || h <= 0) throw new Error('the element is outside the visible viewport.')

  const canvas = new OffscreenCanvas(w, h)
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('could not create an offscreen canvas.')

  context.drawImage(bitmap, x, y, w, h, 0, 0, w, h)
  bitmap.close()

  const blob = await canvas.convertToBlob({ type: 'png' })
  return toBase64(await blob.arrayBuffer())
}

function toBlob(base64: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)

  return new Blob([bytes], { type: 'image/png' })
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''

  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }

  return btoa(binary)
}

function requirePage(): Page {
  if (current === undefined) {
    throw new Error('no page is attached. Call inspect first so the extension can attach to it.')
  }

  return current
}

function isSupported(url: string | undefined): boolean {
  return url !== undefined && /^(https?|file):/.test(url)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function messageOf(error: unknown): string {
  if (error instanceof Error && error.message !== '') return error.message
  if (typeof error === 'string' && error !== '') return error
  return 'unexpected error'
}

async function readPort(): Promise<number> {
  try {
    const response = await fetch(chrome.runtime.getURL('config.json'), { cache: 'no-store' })
    if (!response.ok) return DEFAULT_PORT

    const config = (await response.json()) as { port?: unknown }
    const value = config.port

    return typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 65536
      ? value
      : DEFAULT_PORT
  } catch {
    return DEFAULT_PORT
  }
}

async function readPage(): Promise<Page | undefined> {
  try {
    const stored = await chrome.storage.session.get(SESSION_KEY)
    const value = stored[SESSION_KEY] as Page | undefined

    return value !== undefined && typeof value.tabId === 'number' && typeof value.url === 'string'
      ? value
      : undefined
  } catch {
    return undefined
  }
}

async function savePage(page: Page | undefined): Promise<void> {
  try {
    if (page === undefined) await chrome.storage.session.remove(SESSION_KEY)
    else await chrome.storage.session.set({ [SESSION_KEY]: page })
  } catch {
    // The connection still works without the restore hint.
  }
}
