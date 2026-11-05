import type { Mode } from '../config.js'
import { selectDriver } from '../drivers/index.js'
import type { Driver, Viewport, WaitResult } from '../drivers/types.js'
import { ToolError } from './errors.js'

type Session = {
  driver: Driver
  url: string
  ready: boolean
}

export type SessionWait =
  | { status: 'ready'; url: string; expected: string }
  | { status: 'timeout'; expected: string }
  | { status: 'mismatch'; url: string; expected: string }

/**
 * One process serves one agent session, so one open page is enough. Keeping it
 * alive is what lets `measure` run after `inspect` without reopening the URL.
 */
let session: Session | null = null

export async function openPage(mode: Mode, url: string, viewport?: Viewport): Promise<Driver> {
  if (session === null) {
    session = { driver: await selectDriver(mode), url, ready: false }
  }

  session.url = url
  await session.driver.open(url, viewport)
  session.ready = true

  return session.driver
}

export function requirePage(): Driver {
  if (session === null || !session.ready) {
    throw new ToolError('no page is open. Call inspect with a url first')
  }

  return session.driver
}

export async function waitForPage(timeoutMs: number): Promise<SessionWait> {
  if (session === null || session.url === '') {
    throw new ToolError('no page is requested. Call inspect with a url first')
  }

  const expected = session.url
  const driver = session.driver

  // Every driver implements waitForPage now; the type enforces it. A default
  // "ready" here would let a future driver without the method report a page
  // it never read — the exact lie await_page exists to prevent.
  const result: WaitResult = await driver.waitForPage(expected, timeoutMs)

  if (result.status === 'ready') {
    session.ready = true
    return { status: 'ready', url: result.url, expected }
  }

  if (result.status === 'timeout') return { status: 'timeout', expected }

  return { status: 'mismatch', url: result.url, expected }
}

export async function closeSession(): Promise<void> {
  if (session === null) return

  const current = session
  session = null
  await current.driver.close()
}
