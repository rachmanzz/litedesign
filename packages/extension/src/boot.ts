import { type Observer, observeChanges } from './observer.js'
import { loadLayers, saveLayers } from './store.js'
import { createToolbar, type Toolbar } from './toolbar.js'
import type { Core, Graph, LayerName, OverlayHandle } from './types.js'

/**
 * Idempotent entry point. Chrome may inject the bundle again into the same tab,
 * and a fresh module scope forgets everything, so the state lives on `window`.
 *
 * - idle: mount
 * - starting: ignore the click, storage is still reading
 * - active: tear down
 */
export async function boot(core: Core): Promise<void> {
  if (window.__litedesign_state__ === 'active') {
    window.__litedesign_teardown__?.()
    return
  }

  if (window.__litedesign_state__ === 'starting') return

  window.__litedesign_state__ = 'starting'

  const layers = await loadLayers()

  // The user may have clicked again while storage was reading.
  if (window.__litedesign_state__ !== 'starting') return

  try {
    mount(core, layers)
  } catch (error) {
    window.__litedesign_state__ = undefined
    throw error
  }
}

/**
 * MCP control. `boot` toggles because a click means "flip it"; this sets the
 * state, because the agent says exactly what it wants to see.
 */
export async function applyOverlay(
  core: Core,
  options: { enabled: boolean; layers?: LayerName[] },
): Promise<void> {
  if (!options.enabled) {
    window.__litedesign_teardown__?.()
    return
  }

  const layers = options.layers ?? (await loadLayers())

  if (window.__litedesign_state__ === 'active') {
    window.__litedesign_layers__?.(layers)
    return
  }

  window.__litedesign_state__ = 'starting'

  try {
    mount(core, layers)
  } catch (error) {
    window.__litedesign_state__ = undefined
    throw error
  }
}

function mount(core: Core, initial: LayerName[]): void {
  // `document.body` can be missing if the user clicks before parsing finishes;
  // documentElement is always there and catches the body once it appears.
  const root = document.body ?? document.documentElement

  let layers = initial
  let graph: Graph = core.buildGraph(root)
  let handle: OverlayHandle | undefined
  let observer: Observer | undefined
  let toolbar: Toolbar

  const teardown = (): void => {
    observer?.stop()
    handle?.destroy()
    handle = undefined
    observer = undefined
    window.__litedesign_teardown__ = undefined
    window.__litedesign_layers__ = undefined
    window.__litedesign_state__ = undefined
  }

  const refresh = (): void => {
    graph = core.buildGraph(root)
    handle?.update(graph)
    toolbar.setStats(graph.nodes.length, graph.issues.length, graph.truncated)
  }

  const setLayers = (next: LayerName[]): void => {
    layers = next
    handle?.setLayers(layers)
    toolbar.setLayers(layers)
    void saveLayers(layers)
  }

  toolbar = createToolbar({
    layers,
    onToggle(layer, enabled): void {
      setLayers(
        enabled ? [...new Set([...layers, layer])] : layers.filter((name) => name !== layer),
      )
    },
    onClose: teardown,
  })

  toolbar.setStats(graph.nodes.length, graph.issues.length, graph.truncated)

  handle = core.render(graph, { layers, toolbar: toolbar.element })
  observer = observeChanges({ root, onChange: refresh })

  window.__litedesign_layers__ = setLayers
  window.__litedesign_teardown__ = teardown
  window.__litedesign_state__ = 'active'
}
