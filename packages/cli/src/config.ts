import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { CONFIG, DEFAULT_PORT } from './paths.js'

export type Mode = 'auto' | 'playwright' | 'extension'

export type Config = {
  port: number
  mode: Mode
}

const MODES: readonly Mode[] = ['auto', 'playwright', 'extension']

const FALLBACK: Config = { port: DEFAULT_PORT, mode: 'auto' }

/**
 * Reads `~/.litedesign/config.json` and falls back to defaults for every value
 * that is missing or malformed. A broken config should never stop the server.
 */
export async function readConfig(): Promise<Config> {
  if (!existsSync(CONFIG)) return { ...FALLBACK }

  try {
    const raw = JSON.parse(await readFile(CONFIG, 'utf8')) as {
      port?: unknown
      mode?: unknown
    }

    return {
      port: isPort(raw.port) ? raw.port : FALLBACK.port,
      mode: typeof raw.mode === 'string' && isMode(raw.mode) ? raw.mode : FALLBACK.mode,
    }
  } catch {
    return { ...FALLBACK }
  }
}

function isPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 65536
}

function isMode(value: string): value is Mode {
  return (MODES as readonly string[]).includes(value)
}
