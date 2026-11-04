import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { Hub } from '../src/hub.js'
import { HubClient } from '../src/hub-client.js'

type Message = Record<string, unknown>

const URL = 'http://example.test/page'

const sockets: WebSocket[] = []
const hubs: Hub[] = []
const clients: HubClient[] = []

function open(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    sockets.push(socket)
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })
}

function hello(socket: WebSocket, tabId: number, url: string): void {
  socket.send(JSON.stringify({ type: 'hello', tabId, url, title: 'Test', version: '0.1.0' }))
}

async function start(): Promise<{ port: number; client: HubClient }> {
  const hub = await Hub.start(0)
  hubs.push(hub)

  const client = await HubClient.connect(hub.port)
  clients.push(client)

  return { port: hub.port, client }
}

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close()
  for (const socket of sockets.splice(0)) socket.terminate()
  for (const hub of hubs.splice(0)) await hub.close()
})

describe('HubClient', () => {
  it('sees the extension and the pages the daemon knows', async () => {
    const { port, client } = await start()
    expect(client.hasClient()).toBe(false)

    const socket = await open(`ws://127.0.0.1:${port}`)
    hello(socket, 7, URL)

    await waitFor(() => client.pages().length === 1)

    expect(client.hasClient()).toBe(true)
    expect(client.clientCount()).toBe(1)
    expect(client.find(URL)?.tabId).toBe(7)
  })

  it('forwards a request to the tab and returns its answer', async () => {
    const { port, client } = await start()
    const socket = await open(`ws://127.0.0.1:${port}`)

    socket.on('message', (data) => {
      const message = JSON.parse(data.toString()) as Message
      if (message.type !== 'request') return

      socket.send(
        JSON.stringify({ type: 'response', id: message.id, ok: true, result: message.action }),
      )
    })

    hello(socket, 7, URL)
    await waitFor(() => client.pages().length === 1)

    expect(await client.request(7, 'graph')).toBe('graph')
    expect(await client.requestAny('attach')).toBe('attach')
  })

  it('resolves waitForPage when a matching page connects', async () => {
    const { port, client } = await start()
    const socket = await open(`ws://127.0.0.1:${port}`)

    const waiting = client.waitForPage(URL, 1000)
    hello(socket, 7, URL)

    expect((await waiting).status).toBe('ready')
  })

  it('forgets a page when the extension says bye', async () => {
    const { port, client } = await start()
    const socket = await open(`ws://127.0.0.1:${port}`)

    hello(socket, 7, URL)
    await waitFor(() => client.pages().length === 1)

    socket.send(JSON.stringify({ type: 'bye' }))

    await waitFor(() => client.pages().length === 0)
    expect(client.hasClient()).toBe(false)
  })
})

async function waitFor(check: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (check()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }

  throw new Error('condition was not met in time')
}
