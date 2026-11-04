import { LAYERS, type LayerName } from './types.js'

const STORAGE_KEY = 'litedesign'

const DEFAULT_LAYERS: LayerName[] = [...LAYERS]

/**
 * What survives a reload: whether the overlay was on, and which layers it
 * showed. The fixture server reloads the page on every save, so without this
 * the grid disappears each time a file changes.
 */
export type OverlayState = {
  enabled: boolean
  layers: LayerName[]
}

export function defaultLayers(): LayerName[] {
  return [...DEFAULT_LAYERS]
}

export async function loadState(): Promise<OverlayState> {
  if (!hasStorage()) return { enabled: false, layers: defaultLayers() }

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY)
    return parseState(stored[STORAGE_KEY])
  } catch (error) {
    // Preferences are a convenience; a storage failure must not hide the
    // overlay. The user sees defaults instead.
    console.warn('[litedesign] could not read preferences', error)
    return { enabled: false, layers: defaultLayers() }
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
    return { enabled: false, layers: defaultLayers() }
  }

  const record = value as { enabled?: unknown; layers?: unknown }

  return {
    // A value written before this flag existed means "not known to be on".
    enabled: record.enabled === true,
    layers: parseLayers(record.layers),
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
