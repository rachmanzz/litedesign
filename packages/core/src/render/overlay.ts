import { GRID_STEP, OVERLAY_HOST_ID } from '../constants.js'
import type { Graph, GraphNode } from '../types.js'
import { pathOf } from '../walk.js'
import {
  createLayers,
  createSubLayer,
  drawDim,
  drawFocus,
  drawGaps,
  drawGrid,
  drawGuides,
  drawHover,
  drawIssues,
  drawMarks,
  drawRadius,
  type GridConfig,
  LAYERS,
  type LayerName,
  type MarkInput,
} from './layers.js'

export type { GridConfig, MarkInput } from './layers.js'

export type OverlayOptions = {
  layers?: LayerName[]
  /** Extension UI, appended above the layers inside the same shadow root. */
  toolbar?: HTMLElement
  /** Badges the human pinned onto parts of the page; drawn above the dim. */
  marks?: MarkInput[]
  /**
   * Called when the human clicks a pinned badge while badges are interactive.
   * Core reports which mark and where; what happens next is the caller's call.
   */
  onMarkClick?: (mark: MarkInput, anchor: DOMRect) => void
  /** How the grid layer draws itself. Default: 8px, both axes. */
  grid?: GridConfig
}

export type OverlayHandle = {
  host: HTMLElement
  update(graph: Graph): void
  setLayers(names: LayerName[]): void
  /** Spotlight one node (structural id) or clear the spotlight with null. */
  setFocus(id: string | null): void
  /** Replaces the pinned badges without remounting; badges take clicks only
   *  while `interactive` (label mode). */
  setMarks(marks: MarkInput[], interactive?: boolean): void
  /** Replaces the grid configuration without remounting. */
  setGrid(grid: GridConfig): void
  destroy(): void
}

/**
 * Mounts a fixed, pointer-transparent overlay in a closed shadow root.
 *
 * The host is appended to `documentElement`, never to `body`, so it cannot
 * affect the page's flow. Coordinates are document-space; scroll and resize
 * redraw from the last graph instead of re-measuring.
 */
export function render(graph: Graph, options: OverlayOptions = {}): OverlayHandle {
  const host = document.createElement('div')
  host.id = OVERLAY_HOST_ID
  host.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:2147483647;contain:strict'

  const shadow = host.attachShadow({ mode: 'closed' })

  // The overlay is viewport chrome, not page content; never print it.
  const printStyle = document.createElement('style')
  printStyle.textContent = '@media print { :host { display: none !important } }'
  shadow.append(printStyle)

  const layers = createLayers(shadow)
  const radiusLayer = createSubLayer('radius', layers.hover)
  const marksLayer = createSubLayer('marks', layers.hover)

  // A badge click is overlay chrome: core resolves which mark was clicked and
  // keeps the event off the page; the caller decides what happens next.
  if (options.onMarkClick !== undefined) {
    const onMarkClick = options.onMarkClick
    marksLayer.addEventListener('click', (event) => {
      if (!marksInteractive) return
      const badge = event.target
      if (!(badge instanceof HTMLDivElement)) return
      const mark = badgeMarks.get(badge)
      if (mark === undefined) return

      event.preventDefault()
      event.stopPropagation()
      onMarkClick(mark, badge.getBoundingClientRect())
    })
  }

  if (options.toolbar !== undefined) shadow.append(options.toolbar)

  document.documentElement.append(host)

  let current = graph
  let byId = indexNodes(graph)
  let hovered: string | null = null
  let hoverTarget: Element | null = null
  let hoverFrame = 0
  let focusId: string | null = null
  let visible = new Set<LayerName>(options.layers ?? LAYERS)
  let marks: MarkInput[] = options.marks ?? []
  let marksInteractive = false
  let badgeMarks = new Map<HTMLDivElement, MarkInput>()
  let grid: GridConfig = options.grid ?? { step: GRID_STEP, axis: 'both' }
  let frame = 0

  const draw = (): void => {
    frame = 0

    for (const name of LAYERS) {
      layers[name].style.display = visible.has(name) ? 'block' : 'none'
    }

    drawGrid(layers.grid, grid)
    drawGaps(layers.gap, current)
    drawIssues(layers.issue, current)
    // Guide focus follows the focus state, not the layer toggles: where the
    // guides point is about what is being edited, independent of how it looks.
    const focused = focusId === null ? null : (byId.get(focusId) ?? null)
    drawGuides(layers.guide, current, focused)
    // Two display decisions over that one state: outline and radius follow
    // the focus toggle, the darkness follows the dim toggle.
    const outlineNode = visible.has('focus') ? focused : null
    const dimNode = visible.has('dim') ? focused : null
    drawDim(layers.dim, dimNode)
    drawFocus(layers.focus, outlineNode)
    drawRadius(radiusLayer, outlineNode)
    badgeMarks = drawMarks(
      marksLayer,
      marks,
      new Map(current.nodes.map((node) => [node.selector, node])),
      marksInteractive,
    )
    drawHover(layers.hover, hovered === null ? null : (byId.get(hovered) ?? null))
  }

  const schedule = (): void => {
    if (frame !== 0) return
    frame = requestAnimationFrame(draw)
  }

  const onScroll = (): void => schedule()
  const onResize = (): void => schedule()

  const applyHover = (): void => {
    hoverFrame = 0
    const target = hoverTarget

    if (target === null) {
      hovered = null
      drawHover(layers.hover, null)
      return
    }

    const id = pathOf(target)
    const node = byId.get(id) ?? null

    hovered = node === null ? null : id
    drawHover(layers.hover, node)
  }

  const scheduleHover = (target: Element | null): void => {
    hoverTarget = target
    if (hoverFrame !== 0) return
    hoverFrame = requestAnimationFrame(applyHover)
  }

  const onMouseOver = (event: Event): void => {
    const target = event.target
    const outside = target instanceof Element && target.id === OVERLAY_HOST_ID

    scheduleHover(target instanceof Element && !outside ? target : null)
  }

  const onMouseOut = (event: Event): void => {
    if (event instanceof MouseEvent && event.relatedTarget === null) scheduleHover(null)
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', onResize)
  document.addEventListener('mouseover', onMouseOver, { passive: true })
  document.addEventListener('mouseout', onMouseOut, { passive: true })

  draw()

  return {
    host,
    update(next: Graph): void {
      current = next
      byId = indexNodes(next)
      // The edit that refreshed this graph may have removed the focused node.
      // A stale focus must never leave a dim with no hole in it.
      if (focusId !== null && !byId.has(focusId)) focusId = null
      draw()
    },
    setLayers(names: LayerName[]): void {
      visible = new Set(names)
      draw()
    },
    setFocus(id: string | null): void {
      focusId = id
      draw()
    },
    setMarks(next: MarkInput[], interactive = false): void {
      marks = next
      marksInteractive = interactive
      draw()
    },
    setGrid(next: GridConfig): void {
      grid = next
      draw()
    },
    destroy(): void {
      if (frame !== 0) cancelAnimationFrame(frame)
      if (hoverFrame !== 0) cancelAnimationFrame(hoverFrame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      host.remove()
    },
  }
}

function indexNodes(graph: Graph): Map<string, GraphNode> {
  return new Map(graph.nodes.map((node) => [node.id, node]))
}
