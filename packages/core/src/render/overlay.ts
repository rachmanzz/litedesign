import { OVERLAY_HOST_ID } from '../constants.js'
import type { Graph } from '../types.js'
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
  const layers = createLayers(shadow)

  document.documentElement.append(host)

  let current = graph
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
  }

  const schedule = (): void => {
    if (frame !== 0) return
    frame = requestAnimationFrame(draw)
  }

  const onScroll = (): void => schedule()
  const onResize = (): void => schedule()

  const onMouseOver = (event: Event): void => {
    const target = event.target
    drawHover(layers.hover, target instanceof Element ? target.getBoundingClientRect() : null)
  }

  const onMouseOut = (event: Event): void => {
    if (event instanceof MouseEvent && event.relatedTarget === null) drawHover(layers.hover, null)
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
      draw()
    },
    setLayers(names: LayerName[]): void {
      visible = new Set(names)
      draw()
    },
    destroy(): void {
      if (frame !== 0) cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('mouseover', onMouseOver)
      document.removeEventListener('mouseout', onMouseOut)
      host.remove()
    },
  }
}
