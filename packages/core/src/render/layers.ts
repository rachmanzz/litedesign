import { GRID_STEP, MAX_MARKERS } from '../constants.js'
import { bottom, right, round } from '../geometry.js'
import type { Graph, GraphNode, Severity } from '../types.js'

export const LAYERS = ['grid', 'guide', 'gap', 'issue', 'hover'] as const
export type LayerName = (typeof LAYERS)[number]

const GUIDE_COLOR = {
  left: 'rgba(236, 72, 153, 0.55)',
  right: 'rgba(236, 72, 153, 0.55)',
  center: 'rgba(168, 85, 247, 0.55)',
  top: 'rgba(236, 72, 153, 0.55)',
  bottom: 'rgba(236, 72, 153, 0.55)',
} as const

const GAP_COLOR = 'rgba(14, 165, 233, 0.9)'

const GUIDE_PADDING = 8

/** Above this many gaps, labels are unreadable and expensive. */
const LABEL_LIMIT = 100

const SEVERITY_COLOR: Record<Severity, string> = {
  P0: '#dc2626',
  P1: '#f97316',
  P2: '#eab308',
  P3: '#3b82f6',
}

const BASE = 'position:absolute;pointer-events:none'

export function createLayers(shadow: ShadowRoot): Record<LayerName, HTMLDivElement> {
  const layers = {} as Record<LayerName, HTMLDivElement>

  for (const name of LAYERS) {
    const layer = document.createElement('div')
    layer.dataset.layer = name
    layer.style.cssText = `${BASE};inset:0`
    shadow.append(layer)
    layers[name] = layer
  }

  return layers
}

export function drawGrid(layer: HTMLElement): void {
  layer.replaceChildren()
  layer.style.backgroundImage = `repeating-linear-gradient(to right, rgba(59, 130, 246, 0.16) 0 1px, transparent 1px ${GRID_STEP}px)`
}

export function drawGuides(layer: HTMLElement, graph: Graph): void {
  layer.replaceChildren()

  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  for (const guide of graph.guides.slice(0, MAX_MARKERS)) {
    const span = spanOf(guide, byId)
    if (span === null) continue

    const color = GUIDE_COLOR[guide.edge]
    const [start, end] = span

    if (guide.axis === 'x') {
      box(
        layer,
        `left:${guide.value - scrollX}px;top:${start - scrollY}px;width:1px;height:${end - start}px;background:${color}`,
      )
    } else {
      box(
        layer,
        `top:${guide.value - scrollY}px;left:${start - scrollX}px;height:1px;width:${end - start}px;background:${color}`,
      )
    }
  }
}

/** Vertical or horizontal extent covered by a guide's members, with padding. */
function spanOf(
  guide: Graph['guides'][number],
  byId: Map<string, GraphNode>,
): [number, number] | null {
  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY

  for (const id of guide.members) {
    const node = byId.get(id)
    if (node === undefined) continue

    const from = guide.axis === 'x' ? node.rect.y : node.rect.x
    const to = guide.axis === 'x' ? bottom(node.rect) : right(node.rect)

    start = Math.min(start, from)
    end = Math.max(end, to)
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null

  return [start - GUIDE_PADDING, end + GUIDE_PADDING]
}

export function drawGaps(layer: HTMLElement, graph: Graph): void {
  layer.replaceChildren()

  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  // On a dense page the labels overlap into noise and double the element count.
  const showLabels = graph.gaps.length <= LABEL_LIMIT

  for (const gap of graph.gaps.slice(0, MAX_MARKERS)) {
    const a = byId.get(gap.a)
    const b = byId.get(gap.b)
    if (a === undefined || b === undefined) continue

    if (gap.axis === 'x') {
      const start = right(a.rect)
      const middle = (Math.max(a.rect.y, b.rect.y) + Math.min(bottom(a.rect), bottom(b.rect))) / 2

      box(
        layer,
        `left:${start - scrollX}px;top:${middle - scrollY}px;width:${gap.distance}px;height:1px;background:${GAP_COLOR}`,
      )
      if (showLabels) {
        label(
          layer,
          `${round(gap.distance, 1)}`,
          start + gap.distance / 2 - scrollX,
          middle - scrollY,
        )
      }
      continue
    }

    const start = bottom(a.rect)
    const middle = (Math.max(a.rect.x, b.rect.x) + Math.min(right(a.rect), right(b.rect))) / 2

    box(
      layer,
      `left:${middle - scrollX}px;top:${start - scrollY}px;width:1px;height:${gap.distance}px;background:${GAP_COLOR}`,
    )
    if (showLabels) {
      label(
        layer,
        `${round(gap.distance, 1)}`,
        middle - scrollX,
        start + gap.distance / 2 - scrollY,
      )
    }
  }
}

export function drawIssues(layer: HTMLElement, graph: Graph): void {
  layer.replaceChildren()

  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  for (const item of graph.issues.slice(0, MAX_MARKERS)) {
    const node = byId.get(item.selector)
    if (node === undefined) continue

    const color = SEVERITY_COLOR[item.severity]

    box(
      layer,
      `left:${node.rect.x - scrollX}px;top:${node.rect.y - scrollY}px;width:${node.rect.w}px;height:${node.rect.h}px;border:1px solid ${color};border-radius:2px`,
    )
  }
}

const HOVER_BORDER = 'rgba(59, 130, 246, 0.9)'
const HOVER_FILL = 'rgba(59, 130, 246, 0.08)'

/**
 * Outline plus box-model card for the hovered node. The node rect is in
 * document space, so scrolling can redraw the hover from the last graph.
 */
export function drawHover(layer: HTMLElement, node: GraphNode | null): void {
  layer.replaceChildren()
  if (node === null) return

  const left = node.rect.x - window.scrollX
  const top = node.rect.y - window.scrollY

  box(
    layer,
    `left:${left}px;top:${top}px;width:${node.rect.w}px;height:${node.rect.h}px;border:1px solid ${HOVER_BORDER};background:${HOVER_FILL}`,
  )

  const lines = [
    `${node.tag}  ${round(node.rect.w, 0)} × ${round(node.rect.h, 0)}`,
    `padding  ${node.styles.padding}`,
    `margin   ${node.styles.margin}`,
  ]

  if (node.styles.gap !== 'normal' && node.styles.gap !== '0px') {
    lines.push(`gap      ${node.styles.gap}`)
  }

  // Below the top edge the card would leave the viewport; put it inside.
  const above = top > 72

  card(
    layer,
    lines.join('\n'),
    left,
    above ? top - 6 : top + 6,
    above ? 'translateY(-100%)' : 'none',
  )
}

function card(layer: HTMLElement, text: string, x: number, y: number, transform: string): void {
  const element = box(
    layer,
    `left:${x}px;top:${y}px;transform:${transform};padding:6px 8px;border-radius:6px;background:rgba(17, 17, 17, 0.92);color:#fff;font:11px/1.5 ui-monospace,monospace;white-space:pre`,
  )

  element.textContent = text
}

function box(layer: HTMLElement, css: string): HTMLDivElement {
  const element = document.createElement('div')
  element.style.cssText = `${BASE};${css}`
  layer.append(element)
  return element
}

function label(layer: HTMLElement, text: string, x: number, y: number): void {
  const element = box(
    layer,
    `left:${x}px;top:${y}px;transform:translate(-50%,-50%);padding:1px 3px;border-radius:3px;background:#111;color:#fff;font:10px/1.2 ui-monospace,monospace;white-space:nowrap`,
  )

  element.textContent = text
}
