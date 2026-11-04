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

function mount(core: Core, initial: LayerName[]): void {
  let layers = initial
  let graph: Graph = core.buildGraph(document.body)
  let handle: OverlayHandle | undefined
  let observer: Observer | undefined
  let toolbar: Toolbar

  const teardown = (): void => {
    observer?.stop()
    handle?.destroy()
    handle = undefined
    observer = undefined
    window.__litedesign_teardown__ = undefined
    window.__litedesign_state__ = undefined
  }

  const refresh = (): void => {
    graph = core.buildGraph(document.body)
    handle?.update(graph)
    toolbar.setStats(graph.nodes.length, graph.issues.length, graph.truncated)
  }

  toolbar = createToolbar({
    layers,
    onToggle(layer, enabled): void {
      layers = enabled ? [...new Set([...layers, layer])] : layers.filter((name) => name !== layer)

      handle?.setLayers(layers)
      toolbar.setLayers(layers)
      void saveLayers(layers)
    },
    onClose: teardown,
  })

  toolbar.setStats(graph.nodes.length, graph.issues.length, graph.truncated)

  handle = core.render(graph, { layers, toolbar: toolbar.element })
  observer = observeChanges({ root: document.body, onChange: refresh })

  window.__litedesign_teardown__ = teardown
  window.__litedesign_state__ = 'active'
}
