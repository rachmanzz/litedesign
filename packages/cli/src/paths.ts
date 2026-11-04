import os from 'node:os'
import path from 'node:path'

export const HOME = path.join(os.homedir(), '.litedesign')
export const EXT_DIR = path.join(HOME, 'extension')
export const CONFIG = path.join(HOME, 'config.json')
export const DEFAULT_PORT = 8787

/** Extension folder bundled inside this package. */
export const BUNDLED_EXTENSION = new URL('./extension/', import.meta.url)
