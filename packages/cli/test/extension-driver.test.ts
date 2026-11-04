import type { Graph } from '@litedesign/core/types'
import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'
import { ExtensionDriver } from '../src/drivers/extension.js'
import { Hub } from '../src/hub.js'
import { AwaitingUserError, MismatchError } from '../src/mcp/errors.js'

const URL = 'http://example.test/'

const graph: Graph = {
  url: URL,
  viewport: { w: 1280, h: 800 },
  nodes: [],
  gaps: [],
  guides: [],
  issues: [
    {
      id: 'spacing-scale:body:nth-child(1)',
      selector: 'body:nth-child(1)',
      rule: 'spacing-scale',
      severity: 'P2',
      actual: '10px',
      expected: '12px',
      autoFix: true,
    },
  ],
  truncated: false,
}

const measured = {
  id: 'body:nth-child(1)',
  selector: 'body:nth-child(1)',
  tag: 'body',
  rect: { x: 0, y: 0, w: 1280, h: 800 },
  styles: {
    display: 'block',
    borderRadius: '0px',
    color: 'rgb(0, 0, 0)',
    backgroundColor: 'rgb(255, 255, 255)',
    fontSize: '16px',
    fontWeight: '400',
    padding: '0px',
    margin: '0px',
    gap: 'normal',
  },
  gaps: [],
}

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64')

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

async function setup(
  options: { attachUrl?: string; announce?: boolean; connect?: boolean } = {},
): Promise<{ hub: Hub; driver: ExtensionDriver }> {
  const hub = await Hub.start(0)
  hubs.push(hub)

  if (options.connect === false) {
    return { hub, driver: new ExtensionDriver(hub) }
  }

  const socket = await open(`ws://127.0.0.1:${hub.port}`)
  const page = { tabId: 11, url: options.attachUrl ?? URL, title: 'Test' }

  socket.on('message', (data) => {
    const message = JSON.parse(data.toString()) as {
      type?: string
      id?: string
      action?: string
      payload?: { enabled?: boolean; layers?: string[] }
    }

    if (message.type !== 'request') return

    if (message.action === 'attach') {
      socket.send(JSON.stringify({ type: 'response', id: message.id, ok: true, result: page }))
      socket.send(JSON.stringify({ type: 'hello', ...page, version: '0.1.0' }))
      return
    }

    const result =
      message.action === 'graph'
        ? graph
        : message.action === 'measure'
          ? measured
          : message.action === 'overlay'
            ? { enabled: message.payload?.enabled !== false, layers: message.payload?.layers ?? [] }
            : { data: png }

    socket.send(JSON.stringify({ type: 'response', id: message.id, ok: true, result }))
  })

  if (options.announce !== false) {
    socket.send(
      JSON.stringify({ type: 'hello', tabId: 11, url: URL, title: 'Test', version: '0.1.0' }),
    )
    await hub.waitForPage(URL, 1000)
  }

  return { hub, driver: new ExtensionDriver(hub) }
}

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate()
  for (const hub of hubs.splice(0)) await hub.close()
})

describe('ExtensionDriver', () => {
  it('reads the graph and filters issues', async () => {
    const { driver } = await setup()
    await driver.open(URL)

    expect(await driver.graph()).toEqual(graph)
    expect(await driver.issues(['spacing-scale'])).toHaveLength(1)
    expect(await driver.issues(['contrast'])).toEqual([])
  })

  it('measures, decodes screenshots, and controls the overlay', async () => {
    const { driver } = await setup()
    await driver.open(URL)

    expect(await driver.measure('.card')).toEqual(measured)
    expect((await driver.screenshot()).subarray(0, 4).toString('hex')).toBe('89504e47')
    expect((await driver.annotate()).subarray(0, 4).toString('hex')).toBe('89504e47')

    await expect(driver.overlay({ enabled: true, layers: ['grid'] })).resolves.toEqual({
      enabled: true,
      layers: ['grid'],
    })
    await expect(driver.overlay({ enabled: false })).resolves.toEqual({
      enabled: false,
      layers: [],
    })
  })

  it('attaches to the active tab without a click', async () => {
    const { driver } = await setup({ announce: false })
    await driver.open(URL)

    expect(await driver.graph()).toEqual(graph)
  })

  it('reports a mismatch when the active tab is another page', async () => {
    const { driver } = await setup({ announce: false, attachUrl: 'http://other.test/' })

    await expect(driver.open(URL)).rejects.toBeInstanceOf(MismatchError)
  })

  it('asks the human when no extension is connected', async () => {
    const { driver } = await setup({ connect: false })

    await expect(driver.open(URL)).rejects.toBeInstanceOf(AwaitingUserError)
  })
})
