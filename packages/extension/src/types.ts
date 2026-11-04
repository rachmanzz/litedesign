import type { Graph, LayerName, OverlayHandle, OverlayOptions } from '@litedesign/core'

export type { Graph, LayerName, OverlayHandle }

/**
 * The injected core is a global, not an import. This interface is the only
 * thing the extension knows about it; everything else comes from `core/` types
 * so there is no second source of truth.
 */
export type Core = {
  buildGraph(root?: Element | null): Graph
  render(graph: Graph, options?: OverlayOptions): OverlayHandle
  VERSION: string
}

/** Exhaustive by construction: adding a layer to core breaks this object. */
const LAYER_NAMES: Record<LayerName, true> = {
  grid: true,
  guide: true,
  gap: true,
  issue: true,
  hover: true,
}

export const LAYERS = Object.keys(LAYER_NAMES) as LayerName[]

/** Layers the toolbar can switch. Hover inspection stays on. */
export const TOGGLE_LAYERS = [
  'grid',
  'guide',
  'gap',
  'issue',
] as const satisfies readonly LayerName[]
export type ToggleLayer = (typeof TOGGLE_LAYERS)[number]

declare global {
  interface Window {
    __litedesign?: Core
    __litedesign_state__?: 'starting' | 'active'
    __litedesign_teardown__?: () => void
  }
}
