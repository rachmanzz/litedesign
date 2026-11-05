import { changedNodes, nodeSignatures } from './diff.js'
import { addLabel, type Label, loadLabels, removeLabel, renameLabel } from './labels.js'
import { type Observer, observeChanges } from './observer.js'
import { clearSnapshot, loadSnapshot, loadState, saveSnapshot, saveState } from './store.js'
import { createToolbar, type Toolbar } from './toolbar.js'
import type { Core, Graph, GridConfig, LayerName, OverlayHandle } from './types.js'

/**
 * The host of the overlay that is on screen. The bridge hides it during a
 * capture instead of tearing it down, so the user's layer selection survives
 * the screenshot.
 */
let mountedHost: HTMLElement | undefined

export function overlayHost(): HTMLElement | undefined {
  return mountedHost
}

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

  const state = await loadState()

  // The user may have clicked again while storage was reading.
  if (window.__litedesign_state__ !== 'starting') return

  try {
    mount(core, state.layers, state.grid)
  } catch (error) {
    window.__litedesign_state__ = undefined
    throw error
  }
}

/**
 * MCP control. `boot` toggles because a click means "flip it"; this sets the
 * state, because the agent says exactly what it wants to see.
 *
 * Returns what the page is actually showing afterwards, so the tool can report
 * a reading instead of echoing the request. `focus` is that kind of reading:
 * a selector that resolves to nothing reports `null` instead of failing the
 * overlay, and omitting `focus` leaves the current one untouched.
 */
export async function applyOverlay(
  core: Core,
  options: { enabled: boolean; layers?: LayerName[]; focus?: string | null },
): Promise<{ enabled: boolean; layers: LayerName[]; focus: string | null }> {
  if (!options.enabled) {
    window.__litedesign_teardown__?.()
    return { enabled: false, layers: [], focus: null }
  }

  const stored = await loadState()
  const layers = options.layers ?? stored.layers

  let autoFocus: string | null = null

  if (window.__litedesign_state__ === 'active') {
    window.__litedesign_layers__?.(layers)
  } else {
    window.__litedesign_state__ = 'starting'

    try {
      autoFocus = mount(core, layers, stored.grid)
    } catch (error) {
      window.__litedesign_state__ = undefined
      throw error
    }
  }

  // A change the page came back with beats the focus the previous session
  // left behind: the user is waiting for the edit, not for a stale pointer.
  // An explicit focus on a later call always wins — the overlay is already
  // active then, so this branch never runs.
  if (options.focus !== undefined && autoFocus === null) {
    window.__litedesign_set_focus__?.(options.focus)
  }

  return {
    enabled: overlayHost() !== undefined,
    layers,
    focus: window.__litedesign_focus_selector__?.() ?? null,
  }
}

function mount(core: Core, initial: LayerName[], initialGrid: GridConfig): string | null {
  // `document.body` can be missing if the user clicks before parsing finishes;
  // documentElement is always there and catches the body once it appears.
  const root = document.body ?? document.documentElement

  let layers = initial
  let grid = initialGrid
  let graph: Graph = core.buildGraph(root)
  let handle: OverlayHandle | undefined
  let observer: Observer | undefined
  let focusSelector: string | null = null
  let focusId: string | null = null
  let labels: Label[] = []
  let labelMode = false
  let marksInteractive = false
  let toolbar: Toolbar

  const teardown = (): void => {
    observer?.stop()
    handle?.destroy()
    handle = undefined
    observer = undefined
    mountedHost = undefined
    focusSelector = null
    focusId = null
    if (labelMode) document.removeEventListener('click', onLabelClick, true)
    labelMode = false
    window.__litedesign_teardown__ = undefined
    window.__litedesign_layers__ = undefined
    window.__litedesign_set_focus__ = undefined
    window.__litedesign_focus_selector__ = undefined
    window.__litedesign_state__ = undefined
    // While the overlay is off nothing is measured, so a kept snapshot would
    // manufacture a fake "change" the next time the overlay comes back.
    clearSnapshot()
    void saveState({ enabled: false, layers, focus: null, grid })
  }

  const refresh = (): void => {
    const before = nodeSignatures(graph)
    graph = core.buildGraph(root)

    // The edit that triggered this refresh may have removed the focused node.
    if (focusId !== null && !graph.nodes.some((node) => node.id === focusId)) {
      focusSelector = null
      focusId = null
      handle?.setFocus(null)
    }

    // Live mutation (HMR, in-page edits): spotlight what changed, so the
    // human sees the edit without the agent sending an explicit focus.
    const [firstChanged] = changedNodes(before, graph)
    if (firstChanged !== undefined) setFocus(firstChanged.selector)

    handle?.update(graph)
    toolbar.setStats(graph.nodes.length, graph.issues.length, graph.truncated)
    saveSnapshot(graph)
  }

  const setLayers = (next: LayerName[]): void => {
    layers = next
    handle?.setLayers(layers)
    toolbar.setLayers(layers)
    void saveState({ enabled: true, layers, focus: focusSelector, grid })
  }

  const setGrid = (next: GridConfig): void => {
    grid = next
    handle?.setGrid(grid)
    toolbar.setGrid(grid)
    void saveState({ enabled: true, layers, focus: focusSelector, grid })
  }

  /**
   * Spotlight one component: dim the rest, outline the target, scroll it into
   * view. A focus that cannot resolve is never fatal — the overlay stays up
   * and the tool reports `focus: null` as the reading.
   */
  const setFocus = (selector: string | null): void => {
    if (selector === null) {
      focusSelector = null
      focusId = null
      handle?.setFocus(null)
      void saveState({ enabled: true, layers, focus: null, grid })
      return
    }

    const node = core.resolveNode(graph, selector)
    if (node === null) {
      focusSelector = null
      focusId = null
      handle?.setFocus(null)
      void saveState({ enabled: true, layers, focus: null, grid })
      return
    }

    focusSelector = node.selector
    focusId = node.id
    handle?.setFocus(node.id)

    let element: Element | null = null
    try {
      element = document.querySelector(node.selector)
    } catch {
      element = null
    }
    // Shadow-root targets still get their spotlight drawn from the graph; only
    // the scroll is skipped, because querySelector cannot reach inside.
    element?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })

    void saveState({ enabled: true, layers, focus: focusSelector, grid })
  }

  const applyMarks = (): void => {
    handle?.setMarks(
      labels.map((label) => ({ selector: label.selector, text: label.text })),
      marksInteractive,
    )
  }

  /** Rename or remove one label; the popup anchors to the badge or element. */
  const editLabel = (existing: Label, rect: DOMRect): void => {
    toolbar.askLabel(
      rect,
      existing.text,
      (text) => {
        const trimmed = text.trim()
        if (trimmed === '' || trimmed === existing.text) return

        void renameLabel(existing.id, trimmed).then((next) => {
          labels = next
          applyMarks()
        })
      },
      () => {
        void removeLabel(existing.id).then((next) => {
          labels = next
          applyMarks()
        })
      },
    )
  }

  /**
   * While marking, one click on the page is captured: a labeled element loses
   * its label, an unlabeled one asks for a name. Clicks on the overlay itself
   * (toolbar included) arrive retargeted to the closed host and pass through.
   */
  const onLabelClick = (event: MouseEvent): void => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target === handle?.host) return

    event.preventDefault()
    event.stopPropagation()

    const selector = core.pathOf(target)
    const existing = labels.find((label) => label.selector === selector)

    if (existing !== undefined) {
      // A labeled element opens the popup in rename mode: Enter renames, ×
      // removes — instant deletion on a stray click is too easy to trigger.
      editLabel(existing, target.getBoundingClientRect())
      return
    }

    toolbar.askLabel(target.getBoundingClientRect(), '', (text) => {
      const trimmed = text.trim()
      if (trimmed === '') return

      void addLabel(trimmed, selector).then((next) => {
        labels = next
        applyMarks()
      })
    })
  }

  const toggleLabelMode = (): void => {
    labelMode = !labelMode
    toolbar.setLabelMode(labelMode)

    if (labelMode) {
      document.addEventListener('click', onLabelClick, true)
    } else {
      document.removeEventListener('click', onLabelClick, true)
    }

    // Badges answer clicks only while marking: outside the mode they stay
    // click-transparent so they never steal a click meant for the page.
    marksInteractive = labelMode
    applyMarks()
  }

  toolbar = createToolbar({
    layers,
    grid,
    onToggle(layer, enabled): void {
      setLayers(
        enabled ? [...new Set([...layers, layer])] : layers.filter((name) => name !== layer),
      )
    },
    onLabelToggle: toggleLabelMode,
    onGrid: setGrid,
    onClose: teardown,
  })

  toolbar.setStats(graph.nodes.length, graph.issues.length, graph.truncated)

  handle = core.render(graph, {
    layers,
    toolbar: toolbar.element,
    grid,
    onMarkClick: (mark, anchor) => {
      const existing = labels.find((label) => label.selector === mark.selector)
      if (existing !== undefined) editLabel(existing, anchor)
    },
  })
  observer = observeChanges({ root, onChange: refresh })

  // Labels survive a reload in storage; the badges come back with the overlay.
  void loadLabels().then((next) => {
    labels = next
    applyMarks()
  })

  // Reload path of auto-focus: diff the fresh graph against the content
  // signatures the page had before it went away, and put the spotlight on the
  // first change — that is what the user is waiting to see. Runs before the
  // final saveState so the auto-focused selector is what gets persisted.
  const before = loadSnapshot()
  const changed = before !== null ? changedNodes(before, graph) : []
  let autoFocus: string | null = null
  const [firstChanged] = changed
  if (firstChanged !== undefined) {
    autoFocus = firstChanged.selector
    setFocus(firstChanged.selector)
  }
  saveSnapshot(graph)

  mountedHost = handle.host
  window.__litedesign_layers__ = setLayers
  window.__litedesign_set_focus__ = setFocus
  window.__litedesign_focus_selector__ = () => focusSelector
  window.__litedesign_teardown__ = teardown
  window.__litedesign_state__ = 'active'

  // A reload has to know the overlay was on, otherwise the next page load
  // starts clean and the grid vanishes on every save.
  void saveState({ enabled: true, layers, focus: focusSelector, grid })

  return autoFocus
}
