import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { Hub } from '../src/hub.js'

type Message = Record<string, unknown>

const sockets: WebSocket[] = []
const hubs: Hub[] = []

function open(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    sockets.push(socket)
    socket.once('open', () => resolve(socket))
    socket.once('error', reject)
  })
}

function next(socket: WebSocket): Promise<Message> {
  return new Promise((resolve) => {
    socket.once('message', (data) => resolve(JSON.parse(data.toString()) as Message))
  })
}

function hello(socket: WebSocket, tabId: number, url: string): void {
  socket.send(JSON.stringify({ type: 'hello', tabId, url, title: 'Test', version: '0.1.0' }))
}

async function start(): Promise<Hub> {
  const hub = await Hub.start(0)
  hubs.push(hub)
  return hub
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate()
  for (const hub of hubs.splice(0)) await hub.close()
})

describe('Hub', () => {
  it('tracks a page and answers requests', async () => {
    const hub = await start()
    const socket = await open(`ws://127.0.0.1:${hub.port}`)

    const reply = next(socket).then((message) => {
      socket.send(
        JSON.stringify({
          type: 'response',
          id: message.id,
          ok: true,
          result: { action: message.action },
        }),
      )
    })

    hello(socket, 7, 'http://example.test/page')

    const outcome = await hub.waitForPage('http://example.test/page', 1000)
    expect(outcome.status).toBe('ready')

    const result = await hub.request(7, 'graph')
    expect(result).toEqual({ action: 'graph' })

    await reply
  })

  it('treats a hash change as the same page', async () => {
    const hub = await start()
    const socket = await open(`ws://127.0.0.1:${hub.port}`)

    hello(socket, 2, 'http://example.test/page#section')

    const outcome = await hub.waitForPage('http://example.test/page', 500)
    expect(outcome.status).toBe('ready')
  })

  it('times out when no page connects', async () => {
    const hub = await start()

    expect(await hub.waitForPage('http://example.test/', 50)).toEqual({ status: 'timeout' })
  })

  it('reports a page that does not match the expected URL', async () => {
    const hub = await start()
    const socket = await open(`ws://127.0.0.1:${hub.port}`)

    const waiting = hub.waitForPage('http://expected.test/', 1000)
    hello(socket, 3, 'http://actual.test/')

    const outcome = await waiting
    expect(outcome.status).toBe('mismatch')
    if (outcome.status === 'mismatch') expect(outcome.page.url).toBe('http://actual.test/')
  })

  it('rejects a request for an unknown tab', async () => {
    const hub = await start()
    await expect(hub.request(99, 'graph')).rejects.toThrow(/no longer connected/)
  })

  it('answers any request before a page is announced', async () => {
    const hub = await start()
    const socket = await open(`ws://127.0.0.1:${hub.port}`)

    expect(hub.hasClient()).toBe(true)

    const reply = next(socket).then((message) => {
      expect(message.action).toBe('attach')
      socket.send(
        JSON.stringify({
          type: 'response',
          id: message.id,
          ok: true,
          result: { tabId: 4, url: 'http://example.test/', title: 'Test' },
        }),
      )
    })

    expect(await hub.requestAny('attach')).toEqual({
      tabId: 4,
      url: 'http://example.test/',
      title: 'Test',
    })

    await reply
  })

  it('has no client before the extension connects', async () => {
    const hub = await start()

    expect(hub.hasClient()).toBe(false)
    await expect(hub.requestAny('attach')).rejects.toThrow(/not connected/)
  })
})
