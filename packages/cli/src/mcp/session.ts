import type { Mode } from '../config.js'
import { selectDriver } from '../drivers/index.js'
import type { Driver, Viewport } from '../drivers/types.js'
import { ToolError } from './errors.js'

type Session = {
  driver: Driver
  url: string
}

/**
 * One process serves one agent session, so one open page is enough. Keeping it
 * alive is what lets `measure` run after `inspect` without reopening the URL.
 */
let session: Session | null = null

export async function openPage(
  mode: Mode,
  url: string,
  viewport?: Viewport,
): Promise<Driver | null> {
  if (session === null) {
    const driver = await selectDriver(mode)
    if (driver === null) return null

    session = { driver, url: '' }
  }

  await session.driver.open(url, viewport)
  session.url = url
  return session.driver
}

export function requirePage(): Driver {
  if (session === null || session.url === '') {
    throw new ToolError('no page is open. Call inspect with a url first')
  }

  return session.driver
}

export async function closeSession(): Promise<void> {
  if (session === null) return

  const current = session
  session = null
  await current.driver.close()
}
