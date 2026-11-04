import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { Hub, type HubPage } from './hub.js'
import { HubClient } from './hub-client.js'
import { ToolError } from './mcp/errors.js'
import { wsState } from './paths.js'

export type WsState = { pid: number; port: number }

export type WsStatus = {
  running: boolean
  port: number
  pid?: number
  extensions?: number
  pages?: HubPage[]
}

const START_TIMEOUT = 5000

/** True when something is listening on the port. */
export function portOpen(port: number, timeoutMs = 400): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port })
    const done = (value: boolean): void => {
      socket.destroy()
      resolve(value)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

export async function readState(port: number): Promise<WsState | undefined> {
  const file = wsState(port)
  if (!existsSync(file)) return undefined

  try {
    const raw = JSON.parse(await readFile(file, 'utf8')) as { pid?: unknown; port?: unknown }
    if (typeof raw.pid !== 'number' || typeof raw.port !== 'number') return undefined
    return { pid: raw.pid, port: raw.port }
  } catch {
    return undefined
  }
}

async function writeState(state: WsState): Promise<void> {
  await writeFile(wsState(state.port), `${JSON.stringify(state, null, 2)}\n`)
}

async function clearState(port: number): Promise<void> {
  await rm(wsState(port), { force: true })
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Runs the bridge in the foreground. `ws start` launches this detached; the
 * pid file is how `ws stop` and `ws status` find it again.
 */
export async function runDaemon(port: number): Promise<void> {
  let hub: Hub

  try {
    hub = await Hub.start(port)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new ToolError(`could not listen on port ${port}: ${detail}`)
  }

  await writeState({ pid: process.pid, port: hub.port })

  console.log(`  bridge ws://127.0.0.1:${hub.port} · pid ${process.pid} · Ctrl+C to stop`)

  const stop = (): void => {
    void (async () => {
      await clearState(port)
      await hub.close()
      process.exit(0)
    })()
  }

  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
}

/**
 * Starts the bridge in the background unless something already listens on the
 * port. The child writes the pid file itself, so the pid is never guessed.
 */
export async function startDaemon(port: number): Promise<WsState> {
  if (await portOpen(port)) {
    const state = await readState(port)
    return state ?? { pid: 0, port }
  }

  const script = process.argv[1]
  if (script === undefined) {
    throw new ToolError('could not find the litedesign entry point to start the bridge')
  }

  const child = spawn(process.execPath, [script, 'ws', 'run', '--port', String(port)], {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  })
  child.unref()

  const started = await waitFor(async () => portOpen(port), START_TIMEOUT)

  if (!started) {
    throw new ToolError(
      `the bridge did not start on port ${port}. Run "litedesign ws run" to see the error.`,
    )
  }

  const state = await waitForValue(() => readState(port), 2000)
  return state ?? { pid: 0, port }
}

/** Connects to the running bridge, starting it first when necessary. */
export async function ensureBridge(port: number): Promise<HubClient> {
  try {
    return await HubClient.connect(port, 500)
  } catch {
    // Nothing listening yet; start it and try once more.
  }

  await startDaemon(port)

  try {
    return await HubClient.connect(port, 3000)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new ToolError(`the bridge started but did not accept a connection: ${detail}`)
  }
}

export async function stopDaemon(port: number): Promise<boolean> {
  const state = await readState(port)

  if (state === undefined) {
    await clearState(port)
    return false
  }

  if (isAlive(state.pid)) {
    process.kill(state.pid, 'SIGTERM')

    const stopped = await waitFor(async () => !isAlive(state.pid), 3000)
    if (!stopped) throw new ToolError(`the bridge (pid ${state.pid}) did not stop`)
  }

  await clearState(port)
  return true
}

export async function wsStatus(port: number): Promise<WsStatus> {
  const state = await readState(port)
  const listening = await portOpen(port)

  if (!listening) {
    if (state !== undefined) await clearState(port)
    return { running: false, port }
  }

  let extensions: number | undefined
  let pages: HubPage[] | undefined

  try {
    const client = await HubClient.connect(port, 1000)
    extensions = client.clientCount()
    pages = client.pages()
    await client.close()
  } catch {
    // Listening, but not answering as a bridge; still report it as running.
  }

  return {
    running: true,
    port,
    ...(state !== undefined ? { pid: state.pid } : {}),
    ...(extensions !== undefined ? { extensions } : {}),
    ...(pages !== undefined ? { pages } : {}),
  }
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    if (await check()) return true
    await delay(100)
  }

  return check()
}

async function waitForValue<T>(
  read: () => Promise<T | undefined>,
  timeoutMs: number,
): Promise<T | undefined> {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const value = await read()
    if (value !== undefined) return value
    await delay(100)
  }

  return read()
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
