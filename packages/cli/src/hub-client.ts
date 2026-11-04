import { randomUUID } from 'node:crypto'
import { WebSocket } from 'ws'
import type { Bridge, HubPage, WaitOutcome } from './hub.js'
import { sameUrl } from './hub.js'
import { ToolError } from './mcp/errors.js'

type Pending = {
  resolve(value: unknown): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

type Waiter = {
  url: string
  resolve(outcome: WaitOutcome): void
}

const DEFAULT_TIMEOUT = 30000

/**
 * The MCP side of the bridge. It holds one socket to the daemon, keeps a local
 * copy of the page list, and forwards requests. Closing it does not stop the
 * daemon: that belongs to `litedesign ws stop`.
 */
export class HubClient implements Bridge {
  readonly #socket: WebSocket
  readonly #pages = new Map<number, HubPage>()
  readonly #pending = new Map<string, Pending>()
  readonly #waiters = new Set<Waiter>()
  #extensions = 0
  #closed = false

  private constructor(socket: WebSocket) {
    this.#socket = socket
  }

  static connect(port: number, timeoutMs = 2000): Promise<HubClient> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}`)
      const client = new HubClient(socket)

      const timer = setTimeout(() => {
        socket.terminate()
        reject(new ToolError(`the bridge on port ${port} did not answer`))
      }, timeoutMs)

      socket.once('open', () => {
        socket.send(JSON.stringify({ type: 'hello', role: 'mcp' }))
      })

      socket.once('error', (error) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new ToolError(String(error)))
      })

      client.#listen(() => {
        clearTimeout(timer)
        resolve(client)
      })
    })
  }

  pages(): HubPage[] {
    return [...this.#pages.values()]
  }

  find(url: string): HubPage | undefined {
    for (const page of this.#pages.values()) {
      if (sameUrl(page.url, url)) return page
    }

    return undefined
  }

  hasClient(): boolean {
    return this.#extensions > 0
  }

  clientCount(): number {
    return this.#extensions
  }

  async request<T>(
    tabId: number,
    action: string,
    payload?: unknown,
    timeoutMs = DEFAULT_TIMEOUT,
  ): Promise<T> {
    return this.#ask<T>({ tabId, action, payload }, action, timeoutMs)
  }

  async requestAny<T>(action: string, payload?: unknown, timeoutMs = DEFAULT_TIMEOUT): Promise<T> {
    return this.#ask<T>({ action, payload }, action, timeoutMs)
  }

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

    for (const waiter of [...this.#waiters]) waiter.resolve({ status: 'timeout' })
    this.#waiters.clear()

    for (const pending of this.#pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(new ToolError('the bridge client is closing'))
    }
    this.#pending.clear()

    this.#socket.close(1000, 'mcp session ended')
  }

  #ask<T>(
    message: { tabId?: number; action: string; payload?: unknown },
    action: string,
    timeoutMs: number,
  ): Promise<T> {
    if (this.#closed || this.#socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(
        new ToolError('the bridge is not running. Start it with `litedesign ws start`.'),
      )
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
      })

      this.#socket.send(JSON.stringify({ type: 'request', id, ...message }))
    })
  }

  #listen(ready: () => void): void {
    this.#socket.on('message', (data) => {
      let message: Record<string, unknown>

      try {
        const parsed: unknown = JSON.parse(data.toString())
        if (typeof parsed !== 'object' || parsed === null) return
        message = parsed as Record<string, unknown>
      } catch {
        return
      }

      switch (message.type) {
        case 'pages':
          this.#takePages(message)
          ready()
          return
        case 'page':
          this.#takePage(message.page)
          return
        case 'page-gone':
          if (typeof message.tabId === 'number') this.#pages.delete(message.tabId)
          return
        case 'extensions':
          if (typeof message.count === 'number') this.#extensions = message.count
          return
        case 'response':
          this.#response(message)
          return
        default:
          return
      }
    })

    this.#socket.on('close', () => {
      this.#closed = true

      for (const waiter of [...this.#waiters]) waiter.resolve({ status: 'timeout' })
      this.#waiters.clear()

      for (const pending of this.#pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new ToolError('the bridge stopped running'))
      }
      this.#pending.clear()
    })
  }

  #takePages(message: Record<string, unknown>): void {
    if (typeof message.extensions === 'number') this.#extensions = message.extensions
    if (!Array.isArray(message.pages)) return

    this.#pages.clear()
    for (const page of message.pages) this.#takePage(page)
  }

  #takePage(value: unknown): void {
    if (typeof value !== 'object' || value === null) return

    const page = value as HubPage
    if (typeof page.tabId !== 'number' || typeof page.url !== 'string') return

    this.#pages.set(page.tabId, page)

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
          : 'the extension failed to run the request',
      ),
    )
  }
}
