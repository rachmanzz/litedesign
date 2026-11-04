import { OVERLAY_HOST_ID } from '../constants.js'
import type { Graph, GraphNode } from '../types.js'
import { pathOf } from '../walk.js'
import {
  createLayers,
  drawGaps,
  drawGrid,
  drawGuides,
  drawHover,
  drawIssues,
  LAYERS,
  type LayerName,
} from './layers.js'

export type OverlayOptions = {
  layers?: LayerName[]
  /** Extension UI, appended above the layers inside the same shadow root. */
  toolbar?: HTMLElement
}

export type OverlayHandle = {
  host: HTMLElement
  update(graph: Graph): void
  setLayers(names: LayerName[]): void
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

  if (options.toolbar !== undefined) shadow.append(options.toolbar)

  document.documentElement.append(host)

  let current = graph
  let byId = indexNodes(graph)
  let hovered: string | null = null
  let hoverTarget: Element | null = null
  let hoverFrame = 0
  let visible = new Set<LayerName>(options.layers ?? LAYERS)
  let frame = 0

  const draw = (): void => {
    frame = 0

    for (const name of LAYERS) {
      layers[name].style.display = visible.has(name) ? 'block' : 'none'
    }

    drawGrid(layers.grid)
    drawGuides(layers.guide, current)
    drawGaps(layers.gap, current)
    drawIssues(layers.issue, current)
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
      draw()
    },
    setLayers(names: LayerName[]): void {
      visible = new Set(names)
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
