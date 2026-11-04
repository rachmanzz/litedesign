import { randomUUID } from 'node:crypto'
import { WebSocket, WebSocketServer } from 'ws'
import { ToolError } from './mcp/errors.js'

const PING_INTERVAL = 20000

export type HubPage = {
  tabId: number
  url: string
  title: string
  version: string
}

export type WaitOutcome =
  | { status: 'ready'; page: HubPage }
  | { status: 'timeout' }
  | { status: 'mismatch'; page: HubPage }

/**
 * What the tools and drivers need from the bridge. The daemon implements it
 * in-process; the MCP server uses a client that forwards over a socket.
 */
export interface Bridge {
  pages(): HubPage[]
  find(url: string): HubPage | undefined
  request<T>(tabId: number, action: string, payload?: unknown, timeoutMs?: number): Promise<T>
  requestAny<T>(action: string, payload?: unknown, timeoutMs?: number): Promise<T>
  hasClient(): boolean
  clientCount(): number
  waitForPage(url: string, timeoutMs: number): Promise<WaitOutcome>
  close(): Promise<void>
}

type Client = HubPage & { socket: WebSocket }

type Pending = {
  resolve(value: unknown): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
  socket: WebSocket
  action: string
  /** Set when the request came from an MCP client and the answer goes back to it. */
  controller?: WebSocket
  controllerId?: string
}

type Waiter = {
  url: string
  resolve(outcome: WaitOutcome): void
}

/**
 * The bridge daemon. It owns the WebSocket server and outlives any single MCP
 * session: `litedesign ws start` runs it, `litedesign ws stop` ends it, and
 * every MCP server connects to it as a controller.
 */
export class Hub implements Bridge {
  readonly #server: WebSocketServer
  readonly #clients = new Map<number, Client>()
  readonly #socketTab = new Map<WebSocket, number>()
  readonly #sockets = new Set<WebSocket>()
  readonly #controllers = new Set<WebSocket>()
  readonly #pending = new Map<string, Pending>()
  readonly #waiters = new Set<Waiter>()
  #ping: ReturnType<typeof setInterval> | undefined
  #closed = false

  private constructor(server: WebSocketServer) {
    this.#server = server
  }

  static start(port: number): Promise<Hub> {
    return new Promise((resolve, reject) => {
      const server = new WebSocketServer({ host: '127.0.0.1', port })
      const hub = new Hub(server)

      const onError = (error: Error): void => {
        server.off('listening', onListening)
        reject(error)
      }

      const onListening = (): void => {
        server.off('error', onError)
        server.on('connection', (socket) => hub.#accept(socket))
        hub.#ping = setInterval(() => hub.#broadcastPing(), PING_INTERVAL)
        resolve(hub)
      }

      server.once('error', onError)
      server.once('listening', onListening)
    })
  }

  /** Bound port. Useful for tests, which start the hub on port 0. */
  get port(): number {
    const address = this.#server.address()
    return typeof address === 'object' && address !== null ? address.port : 0
  }

  pages(): HubPage[] {
    return [...this.#clients.values()].map(({ socket: _socket, ...page }) => page)
  }

  find(url: string): HubPage | undefined {
    for (const client of this.#clients.values()) {
      if (sameUrl(client.url, url)) return client
    }

    return undefined
  }

  async request<T>(
    tabId: number,
    action: string,
    payload?: unknown,
    timeoutMs = 30000,
  ): Promise<T> {
    const client = this.#clients.get(tabId)
    if (client === undefined) {
      throw new ToolError('the page is no longer connected. Call inspect again.')
    }

    return this.#ask<T>(client.socket, action, payload, timeoutMs)
  }

  /**
   * Asks any connected worker, not a specific tab. This is how the server
   * attaches to a page: the worker picks the tab the human is looking at.
   */
  async requestAny<T>(action: string, payload?: unknown, timeoutMs = 30000): Promise<T> {
    const socket = this.#firstSocket()

    if (socket === undefined) {
      throw new ToolError(
        'the extension is not connected. Is Chrome open with the extension loaded?',
      )
    }

    return this.#ask<T>(socket, action, payload, timeoutMs)
  }

  /** True when at least one extension worker is connected. */
  hasClient(): boolean {
    return this.#firstSocket() !== undefined
  }

  /** Number of connected extension workers, with or without an attached page. */
  clientCount(): number {
    let count = 0

    for (const socket of this.#sockets) {
      if (socket.readyState === WebSocket.OPEN) count += 1
    }

    return count
  }

  #firstSocket(): WebSocket | undefined {
    for (const socket of this.#sockets) {
      if (socket.readyState === WebSocket.OPEN) return socket
    }

    return undefined
  }

  #ask<T>(socket: WebSocket, action: string, payload: unknown, timeoutMs: number): Promise<T> {
    const id = randomUUID()

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#pending.delete(id)
        reject(
          new ToolError(
            `the extension did not answer "${action}" within ${Math.round(timeoutMs / 1000)}s`,
          ),
        )
      }, timeoutMs)

      this.#pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
        socket,
        action,
      })

      socket.send(JSON.stringify({ type: 'request', id, action, payload }))
    })
  }

  /**
   * Resolves on the next `hello`, or immediately when a matching page is
   * already connected. A page that connects with another URL resolves as
   * `mismatch` so the agent can tell the user exactly what is wrong.
   */
  waitForPage(url: string, timeoutMs: number): Promise<WaitOutcome> {
    const existing = this.find(url)
    if (existing !== undefined) return Promise.resolve({ status: 'ready', page: existing })

    return new Promise((resolve) => {
      const waiter: Waiter = {
        url,
        resolve: (outcome) => {
          clearTimeout(timer)
          resolve(outcome)
        },
      }

      const timer = setTimeout(() => {
        this.#waiters.delete(waiter)
        resolve({ status: 'timeout' })
      }, timeoutMs)

      this.#waiters.add(waiter)
    })
  }

  async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true

    if (this.#ping !== undefined) clearInterval(this.#ping)
    this.#ping = undefined

    for (const waiter of [...this.#waiters]) waiter.resolve({ status: 'timeout' })
    this.#waiters.clear()

    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new ToolError('the extension bridge is shutting down'))
    }
    this.#pending.clear()

    const sockets = [...this.#sockets]
    for (const socket of sockets) socket.close(1001, 'litedesign server closing')

    for (const socket of this.#controllers) socket.close(1001, 'litedesign server closing')

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        for (const socket of sockets) socket.terminate()
        resolve()
      }, 500)

      this.#server.close(() => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  #accept(socket: WebSocket): void {
    this.#sockets.add(socket)
    // An extension connects before it has a page to announce. Tell controllers
    // right away, otherwise `hasClient` stays false until the first attach.
    this.#broadcast({ type: 'extensions', count: this.clientCount() })

    socket.on('message', (data) => this.#receive(socket, data.toString()))
    socket.on('close', () => this.#drop(socket))
    socket.on('error', () => this.#drop(socket))
  }

  #receive(socket: WebSocket, raw: string): void {
    let message: Record<string, unknown>

    try {
      const parsed: unknown = JSON.parse(raw)
      if (typeof parsed !== 'object' || parsed === null) return
      message = parsed as Record<string, unknown>
    } catch {
      return
    }

    switch (message.type) {
      case 'hello':
        if (message.role === 'mcp') this.#controllerHello(socket)
        else this.#hello(socket, message)
        return
      case 'request':
        this.#controllerRequest(socket, message)
        return
      case 'response':
        this.#response(message)
        return
      case 'bye':
        this.#drop(socket)
        socket.close()
        return
      default:
        return
    }
  }

  #controllerHello(socket: WebSocket): void {
    this.#sockets.delete(socket)
    this.#controllers.add(socket)
    this.#broadcast({ type: 'extensions', count: this.clientCount() })

    socket.send(
      JSON.stringify({ type: 'pages', pages: this.pages(), extensions: this.clientCount() }),
    )
  }

  /**
   * An MCP client asks the daemon to run something. The daemon forwards to the
   * right extension socket and routes the answer back.
   */
  #controllerRequest(socket: WebSocket, message: Record<string, unknown>): void {
    const { id, action } = message
    if (typeof id !== 'string' || typeof action !== 'string') return

    if (action === 'pages') {
      this.#reply(socket, id, true, this.pages())
      return
    }

    if (action === 'has-client') {
      this.#reply(socket, id, true, this.hasClient())
      return
    }

    const tabId = typeof message.tabId === 'number' ? message.tabId : undefined
    const target = tabId === undefined ? this.#firstSocket() : this.#clients.get(tabId)?.socket

    if (target === undefined || target.readyState !== WebSocket.OPEN) {
      this.#reply(
        socket,
        id,
        false,
        undefined,
        tabId === undefined
          ? 'the extension is not connected. Is Chrome open with the extension loaded?'
          : 'the page is no longer connected. Call inspect again.',
      )
      return
    }

    const forwardId = randomUUID()

    const timer = setTimeout(() => {
      this.#pending.delete(forwardId)
      this.#reply(
        socket,
        id,
        false,
        undefined,
        `the extension did not answer "${action}" within 30s`,
      )
    }, 30000)

    this.#pending.set(forwardId, {
      resolve: () => undefined,
      reject: () => undefined,
      timer,
      socket: target,
      action,
      controller: socket,
      controllerId: id,
    })

    target.send(
      JSON.stringify({ type: 'request', id: forwardId, action, payload: message.payload }),
    )
  }

  #reply(socket: WebSocket, id: string, ok: boolean, result?: unknown, error?: string): void {
    if (socket.readyState !== WebSocket.OPEN) return

    socket.send(JSON.stringify({ type: 'response', id, ok, result, error }))
  }

  #hello(socket: WebSocket, message: Record<string, unknown>): void {
    const { tabId, url } = message

    if (
      typeof tabId !== 'number' ||
      !Number.isInteger(tabId) ||
      typeof url !== 'string' ||
      url === ''
    ) {
      return
    }

    const page: HubPage = {
      tabId,
      url,
      title: typeof message.title === 'string' ? message.title : '',
      version: typeof message.version === 'string' ? message.version : '',
    }

    const previous = this.#socketTab.get(socket)
    if (previous !== undefined && previous !== tabId) {
      const old = this.#clients.get(previous)
      if (old?.socket === socket) this.#clients.delete(previous)
    }

    this.#clients.set(tabId, { ...page, socket })
    this.#socketTab.set(socket, tabId)

    this.#broadcast({ type: 'page', page })
    this.#broadcast({ type: 'extensions', count: this.clientCount() })

    for (const waiter of [...this.#waiters]) {
      this.#waiters.delete(waiter)
      waiter.resolve(
        sameUrl(page.url, waiter.url) ? { status: 'ready', page } : { status: 'mismatch', page },
      )
    }
  }

  #response(message: Record<string, unknown>): void {
    const { id } = message
    if (typeof id !== 'string') return

    const pending = this.#pending.get(id)
    if (pending === undefined) return

    this.#pending.delete(id)
    clearTimeout(pending.timer)

    if (pending.controller !== undefined) {
      const ok = message.ok === true
      this.#reply(
        pending.controller,
        pending.controllerId ?? '',
        ok,
        message.result,
        typeof message.error === 'string' && message.error !== ''
          ? message.error
          : `the extension failed to run "${pending.action}"`,
      )
      return
    }

    if (message.ok === true) {
      pending.resolve(message.result)
      return
    }

    pending.reject(
      new ToolError(
        typeof message.error === 'string' && message.error !== ''
          ? message.error
          : `the extension failed to run "${pending.action}"`,
      ),
    )
  }

  #broadcast(message: unknown): void {
    const raw = JSON.stringify(message)

    for (const socket of this.#controllers) {
      if (socket.readyState === WebSocket.OPEN) socket.send(raw)
    }
  }

  #drop(socket: WebSocket): void {
    const tabId = this.#socketTab.get(socket)
    this.#socketTab.delete(socket)
    this.#sockets.delete(socket)
    this.#controllers.delete(socket)

    if (tabId !== undefined && this.#clients.get(tabId)?.socket === socket) {
      this.#clients.delete(tabId)
      this.#broadcast({ type: 'page-gone', tabId })
    }

    this.#broadcast({ type: 'extensions', count: this.clientCount() })

    for (const [id, pending] of this.#pending) {
      if (pending.socket !== socket) continue

      this.#pending.delete(id)
      clearTimeout(pending.timer)

      if (pending.controller !== undefined) {
        this.#reply(
          pending.controller,
          pending.controllerId ?? '',
          false,
          undefined,
          'the page disconnected before it answered',
        )
      } else {
        pending.reject(new ToolError('the page disconnected before it answered'))
      }
    }
  }

  #broadcastPing(): void {
    for (const socket of this.#sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }))
      }
    }
  }
}

export function sameUrl(a: string, b: string): boolean {
  return normalize(a) === normalize(b)
}

/** Hash changes do not change layout, so they do not change the page identity. */
function normalize(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.hash = ''
    return parsed.href
  } catch {
    return url
  }
}

let current: Bridge | null = null
let currentError: string | null = null

export function setHub(hub: Bridge): void {
  current = hub
  currentError = null
}

export function setHubError(message: string): void {
  current = null
  currentError = message
}

export function getHub(): Bridge | null {
  return current
}

export function getHubError(): string | null {
  return currentError
}
