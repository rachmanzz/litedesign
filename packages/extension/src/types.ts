import type {
  Graph,
  GraphNode,
  GridConfig,
  LayerName,
  OverlayHandle,
  OverlayOptions,
} from '@litedesign/core'

export type { Graph, GraphNode, GridConfig, LayerName, OverlayHandle }

/**
 * The injected core is a global, not an import. This interface is the only
 * thing the extension knows about it; everything else comes from `core/` types
 * so there is no second source of truth.
 */
export type Core = {
  buildGraph(root?: Element | null): Graph
  resolveNode(graph: Graph, selector: string): GraphNode | null
  render(graph: Graph, options?: OverlayOptions): OverlayHandle
  /** Structural selector of an element — the format every tool speaks. */
  pathOf(element: Element): string
  VERSION: string
}

/** Exhaustive by construction: adding a layer to core breaks this object. */
const LAYER_NAMES: Record<LayerName, true> = {
  grid: true,
  guide: true,
  gap: true,
  issue: true,
  dim: true,
  focus: true,
  hover: true,
}

export const LAYERS = Object.keys(LAYER_NAMES) as LayerName[]

/**
 * What the popup shows: whether the worker holds a socket to the bridge, on
 * which port, and which tab it currently measures.
 */
export type BridgeStatus = {
  bridge: boolean
  port: number
  page: { tabId: number; url: string; title: string } | null
}

/** Layers the toolbar can switch. Hover inspection stays on. */
export const TOGGLE_LAYERS = [
  'grid',
  'guide',
  'gap',
  'issue',
  'dim',
  'focus',
] as const satisfies readonly LayerName[]
export type ToggleLayer = (typeof TOGGLE_LAYERS)[number]

/** Distances the grid step control cycles through, smallest to largest. */
export const GRID_STEPS = [8, 12, 16, 24, 32, 48, 64, 96, 128]

declare global {
  interface Window {
    __litedesign?: Core
    __litedesign_state__?: 'starting' | 'active'
    __litedesign_teardown__?: () => void
    /** Replaces the visible layers without remounting. */
    __litedesign_layers__?: (layers: LayerName[]) => void
    /** Sets or clears the focused component (its resolved selector). */
    __litedesign_set_focus__?: (selector: string | null) => void
    /** The resolved selector of the focused component, or null. */
    __litedesign_focus_selector__?: () => string | null
    /** True once the content-script bridge is listening. */
    __litedesign_bridge__?: boolean
    /** Toggle the user overlay. The service worker sends `toggle` here. */
    __litedesign_toggle__?: () => void
  }
}
