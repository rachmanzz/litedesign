import type { Graph } from './types.js'
import { GRID_STEPS, type GridConfig, LAYERS, type LayerName } from './types.js'

const STORAGE_KEY = 'litedesign'

/**
 * Where the pre-reload content signatures live: `sessionStorage` survives a
 * reload inside the same tab and dies with it, exactly the lifetime the
 * reload-path diff needs. Keyed by node id, valued by `tag|text`.
 */
const SNAPSHOT_KEY = 'litedesign-snapshot'

const DEFAULT_LAYERS: LayerName[] = [...LAYERS]

/** What the human chose for the grid: distance between the lines and axis. */
export const DEFAULT_GRID: GridConfig = { step: 8, axis: 'both' }

const AXES = ['vertical', 'horizontal', 'both']

/**
 * What survives a reload: whether the overlay was on, which layers it showed,
 * and which component the agent was focusing. The fixture server reloads the
 * page on every save, so without this the grid disappears each time a file
 * changes — and the focus would vanish exactly while the agent is editing.
 */
export type OverlayState = {
  enabled: boolean
  layers: LayerName[]
  focus: string | null
  grid: GridConfig
}

export function defaultLayers(): LayerName[] {
  return [...DEFAULT_LAYERS]
}

export async function loadState(): Promise<OverlayState> {
  if (!hasStorage())
    return { enabled: false, layers: defaultLayers(), focus: null, grid: DEFAULT_GRID }

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY)
    return parseState(stored[STORAGE_KEY])
  } catch (error) {
    // Preferences are a convenience; a storage failure must not hide the
    // overlay. The user sees defaults instead.
    console.warn('[litedesign] could not read preferences', error)
    return { enabled: false, layers: defaultLayers(), focus: null, grid: DEFAULT_GRID }
  }
}

export async function saveState(state: OverlayState): Promise<void> {
  if (!hasStorage()) return

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: state })
  } catch (error) {
    // The current session keeps working with in-memory state.
    console.warn('[litedesign] could not save preferences', error)
  }
}

function hasStorage(): boolean {
  return typeof chrome !== 'undefined' && chrome.storage?.local !== undefined
}

function parseState(value: unknown): OverlayState {
  if (typeof value !== 'object' || value === null) {
    return { enabled: false, layers: defaultLayers(), focus: null, grid: DEFAULT_GRID }
  }

  const record = value as {
    enabled?: unknown
    layers?: unknown
    focus?: unknown
    grid?: unknown
  }

  return {
    // A value written before this flag existed means "not known to be on".
    enabled: record.enabled === true,
    layers: parseLayers(record.layers),
    focus: typeof record.focus === 'string' && record.focus !== '' ? record.focus : null,
    grid: parseGrid(record.grid),
  }
}

function parseGrid(value: unknown): GridConfig {
  if (typeof value !== 'object' || value === null) return DEFAULT_GRID

  const record = value as { step?: unknown; axis?: unknown }

  return {
    step: GRID_STEPS.includes(record.step as never) ? (record.step as number) : DEFAULT_GRID.step,
    axis: AXES.includes(record.axis as never)
      ? (record.axis as GridConfig['axis'])
      : DEFAULT_GRID.axis,
  }
}

function parseLayers(value: unknown): LayerName[] {
  if (!Array.isArray(value)) return defaultLayers()

  const valid = [...new Set(value.filter(isLayerName))]
  return valid.includes('hover') ? valid : [...valid, 'hover']
}

function isLayerName(value: unknown): value is LayerName {
  return typeof value === 'string' && (LAYERS as readonly string[]).includes(value)
}

export function loadSnapshot(): Map<string, string> | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return new Map(
      parsed.flatMap((entry): Array<[string, string]> => {
        if (!Array.isArray(entry) || entry.length !== 2) return []
        if (typeof entry[0] !== 'string' || typeof entry[1] !== 'string') return []
        return [[entry[0], entry[1]]]
      }),
    )
  } catch {
    // A broken snapshot must never block the overlay; start empty instead.
    return null
  }
}

export function saveSnapshot(graph: Graph): void {
  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify([...signatures(graph)]))
  } catch {
    // Storage can be full or blocked; the overlay keeps working without it —
    // the cost is only that the next reload diff starts from nothing.
  }
}

export function clearSnapshot(): void {
  try {
    sessionStorage.removeItem(SNAPSHOT_KEY)
  } catch {
    // Same reasoning as saveSnapshot: nothing to recover here.
  }
}
