import os from 'node:os'
import path from 'node:path'

export const HOME = path.join(os.homedir(), '.litedesign')
export const EXT_DIR = path.join(HOME, 'extension')
export const CONFIG = path.join(HOME, 'config.json')
export const DEFAULT_PORT = 8787

/**
 * One state file per port. A single file meant a bridge on a second port (a
 * test run, a second project) overwrote the pid of the first, so `ws stop`
 * reported "not running" while it still ran.
 */
export function wsState(port: number): string {
  return path.join(HOME, `ws-${port}.json`)
}

/** Extension folder bundled inside this package. */
export const BUNDLED_EXTENSION = new URL('./extension/', import.meta.url)
