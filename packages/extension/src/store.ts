import { LAYERS, type LayerName } from './types.js'

const STORAGE_KEY = 'litedesign'

const DEFAULT_LAYERS: LayerName[] = [...LAYERS]

export function defaultLayers(): LayerName[] {
  return [...DEFAULT_LAYERS]
}

export async function loadLayers(): Promise<LayerName[]> {
  if (!hasStorage()) return defaultLayers()

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY)
    return parseLayers(stored[STORAGE_KEY])
  } catch (error) {
    // Preferences are a convenience; a storage failure must not hide the
    // overlay. The user sees defaults instead.
    console.warn('[litedesign] could not read preferences', error)
    return defaultLayers()
  }
}

export async function saveLayers(layers: LayerName[]): Promise<void> {
  if (!hasStorage()) return

  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: { layers } })
  } catch (error) {
    // The current session keeps working with in-memory state.
    console.warn('[litedesign] could not save preferences', error)
  }
}

function hasStorage(): boolean {
  return typeof chrome !== 'undefined' && chrome.storage?.local !== undefined
}

function parseLayers(value: unknown): LayerName[] {
  if (typeof value !== 'object' || value === null) return defaultLayers()

  const layers = (value as { layers?: unknown }).layers
  if (!Array.isArray(layers)) return defaultLayers()

  const valid = [...new Set(layers.filter(isLayerName))]
  return valid.includes('hover') ? valid : [...valid, 'hover']
}

function isLayerName(value: unknown): value is LayerName {
  return typeof value === 'string' && (LAYERS as readonly string[]).includes(value)
}
