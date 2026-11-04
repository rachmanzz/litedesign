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

type Client = HubPage & { socket: WebSocket }

type Pending = {
  resolve(value: unknown): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
  socket: WebSocket
  action: string
}

type Waiter = {
  url: string
  resolve(outcome: WaitOutcome): void
}

/**
 * One WebSocket server per MCP process. The extension connects out to it, so
 * the agent never needs an inbound port, a browser automation library, or a
 * browser profile of its own.
 */
export class Hub {
  readonly #server: WebSocketServer
  readonly #clients = new Map<number, Client>()
  readonly #socketTab = new Map<WebSocket, number>()
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
      throw new ToolError('the page is no longer connected. Click the litedesign icon again.')
    }

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
        socket: client.socket,
        action,
      })

      client.socket.send(JSON.stringify({ type: 'request', id, action, payload }))
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

    const sockets = [...this.#socketTab.keys()]
    for (const socket of sockets) socket.close(1001, 'litedesign server closing')

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
        this.#hello(socket, message)
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

  #drop(socket: WebSocket): void {
    const tabId = this.#socketTab.get(socket)
    this.#socketTab.delete(socket)

    if (tabId !== undefined && this.#clients.get(tabId)?.socket === socket) {
      this.#clients.delete(tabId)
    }

    for (const [id, pending] of this.#pending) {
      if (pending.socket !== socket) continue

      this.#pending.delete(id)
      clearTimeout(pending.timer)
      pending.reject(new ToolError('the page disconnected before it answered'))
    }
  }

  #broadcastPing(): void {
    for (const client of this.#clients.values()) {
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(JSON.stringify({ type: 'ping' }))
      }
    }
  }
}

function sameUrl(a: string, b: string): boolean {
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

let current: Hub | null = null
let currentError: string | null = null

export function setHub(hub: Hub): void {
  current = hub
  currentError = null
}

export function setHubError(message: string): void {
  current = null
  currentError = message
}

export function getHub(): Hub | null {
  return current
}

export function getHubError(): string | null {
  return currentError
}
