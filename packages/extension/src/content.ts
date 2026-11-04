import { applyOverlay } from './boot.js'
import { installBridge } from './bridge.js'
import { loadState } from './store.js'
import type { Core } from './types.js'

const core: Core | undefined = window.__litedesign

if (core === undefined) {
  console.warn('[litedesign] core not found; core.iife.js must be injected first')
} else {
  installBridge(core)
  void restore(core)
}

/**
 * A reload drops the overlay with the rest of the DOM. If it was on when the
 * page went away, put it back, so a hot reload during an edit does not
 * silently clear the grid.
 */
async function restore(core: Core): Promise<void> {
  const state = await loadState()
  if (!state.enabled) return

  await applyOverlay(core, { enabled: true, layers: state.layers, focus: state.focus })
}
