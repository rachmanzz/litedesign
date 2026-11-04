import { MAX_MARKERS } from '../constants.js'
import { bottom, right, round } from '../geometry.js'
import type { Graph, GraphNode, Severity } from '../types.js'

export const LAYERS = ['grid', 'guide', 'gap', 'issue', 'dim', 'focus', 'hover'] as const
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

/** What the human chooses for the grid layer: which lines and how far apart. */
export type GridAxis = 'vertical' | 'horizontal' | 'both'

export type GridConfig = { step: number; axis: GridAxis }

/**
 * Pure CSS for the grid layer, so the gradient strings are testable without a
 * DOM. Vertical lines come from a left-to-right gradient, horizontal lines
 * from top-to-bottom; "both" is the two layered on top of each other.
 */
export function gridBackground(step: number, axis: GridAxis): string {
  const line = 'rgba(59, 130, 246, 0.16)'
  const vertical = `repeating-linear-gradient(to right, ${line} 0 1px, transparent 1px ${step}px)`
  const horizontal = `repeating-linear-gradient(to bottom, ${line} 0 1px, transparent 1px ${step}px)`

  if (axis === 'vertical') return vertical
  if (axis === 'horizontal') return horizontal
  return `${vertical}, ${horizontal}`
}

export function drawGrid(layer: HTMLElement, grid: GridConfig): void {
  layer.replaceChildren()
  layer.style.backgroundImage = gridBackground(grid.step, grid.axis)
}

/**
 * When something is focused, the guide layer only draws the alignment lines
 * that involve it — every other line on the page is noise while editing.
 * Filtering, not new geometry: the groups are already computed in the graph.
 */
export function focusedGuides(graph: Graph, focus: GraphNode | null): Graph['guides'] {
  if (focus === null) return graph.guides
  return graph.guides.filter((guide) => guide.members.includes(focus.id))
}

export function drawGuides(layer: HTMLElement, graph: Graph, focus: GraphNode | null = null): void {
  layer.replaceChildren()

  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const scrollX = window.scrollX
  const scrollY = window.scrollY

  for (const guide of focusedGuides(graph, focus).slice(0, MAX_MARKERS)) {
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
  // On a dense page the labels overlap into noise and double the element count.
  const showLabels = graph.issues.length <= LABEL_LIMIT

  for (const item of graph.issues.slice(0, MAX_MARKERS)) {
    const node = byId.get(item.selector)
    if (node === undefined) continue

    const color = SEVERITY_COLOR[item.severity]
    const left = node.rect.x - scrollX
    const top = node.rect.y - scrollY

    box(
      layer,
      `left:${left}px;top:${top}px;width:${node.rect.w}px;height:${node.rect.h}px;border:1px solid ${color};border-radius:2px`,
    )

    if (!showLabels || !onScreen(left, top, node.rect.w, node.rect.h)) continue

    tag(layer, `${item.severity} · ${item.actual} → ${item.expected}`, left + 2, top + 2, color)
  }
}

/** Viewport-space check: labels for boxes scrolled out of view are wasted DOM. */
function onScreen(x: number, y: number, w: number, h: number): boolean {
  return x + w > 0 && y + h > 0 && x < window.innerWidth && y < window.innerHeight
}

function tag(layer: HTMLElement, text: string, x: number, y: number, color: string): void {
  const element = box(
    layer,
    `left:${x}px;top:${y}px;padding:1px 4px;border-radius:3px;background:${color};color:#fff;font:10px/1.3 ui-monospace,monospace;white-space:nowrap`,
  )

  element.textContent = text
}

const HOVER_BORDER = 'rgba(59, 130, 246, 0.9)'
const HOVER_FILL = 'rgba(59, 130, 246, 0.08)'

const FOCUS_DIM = 'rgba(15, 23, 42, 0.55)'
const FOCUS_BORDER = '#3b82f6'

const SVG_NS = 'http://www.w3.org/2000/svg'
/** Below this the arc is smaller than its own stroke — a blot, not a curve. */
const MIN_RADIUS = 4
const TANGENT_COLOR = 'rgba(148, 163, 184, 0.9)'

export type CornerRadii = { tl: number; tr: number; br: number; bl: number }

/**
 * CSS `border-radius` to effective per-corner pixels. Percentages resolve from
 * the box; the browser clamps oversized radii, so the geometry clamps too.
 * Elliptical values (`8px / 16px`) are rejected: an empty annotation is more
 * honest than a circular arc drawn for an elliptical corner.
 */
export function parseRadius(css: string, rect: { w: number; h: number }): CornerRadii | null {
  const text = css.trim()
  if (text === '' || text.includes('/')) return null

  const parts = text.split(/\s+/)
  if (parts.length > 4) return null

  const values: number[] = []
  for (const part of parts) {
    const resolved = part.endsWith('%')
      ? Math.min(rect.w, rect.h) * (Number.parseFloat(part) / 100)
      : Number.parseFloat(part)

    if (!Number.isFinite(resolved) || resolved < 0) return null
    values.push(resolved)
  }

  const [first = 0, second = first, third = first, fourth = second] = values
  const clamp = (radius: number) => Math.min(radius, rect.w / 2, rect.h / 2)

  return {
    tl: clamp(first),
    tr: clamp(second),
    br: clamp(third),
    bl: clamp(fourth),
  }
}

export type RadiusMark = {
  corner: 'tl' | 'tr' | 'br' | 'bl'
  radius: number
  /** Quarter-circle path in the given coordinate space. */
  arc: string
  /** Dashed helpers: from the sharp corner to each tangent point. */
  tangents: Array<[number, number, number, number]>
}

/**
 * One quarter arc per rounded corner, with the dashed straight edge it
 * replaces. Pure geometry — string output is testable without a DOM.
 */
export function radiusGeometry(
  rect: { x: number; y: number; w: number; h: number },
  radii: CornerRadii,
): RadiusMark[] {
  const specs = [
    { corner: 'tl' as const, r: radii.tl, x: rect.x, y: rect.y, sx: 1, sy: 1 },
    { corner: 'tr' as const, r: radii.tr, x: rect.x + rect.w, y: rect.y, sx: -1, sy: 1 },
    { corner: 'br' as const, r: radii.br, x: rect.x + rect.w, y: rect.y + rect.h, sx: -1, sy: -1 },
    { corner: 'bl' as const, r: radii.bl, x: rect.x, y: rect.y + rect.h, sx: 1, sy: -1 },
  ]

  const marks: RadiusMark[] = []

  for (const spec of specs) {
    if (spec.r < MIN_RADIUS) continue

    const hx = spec.x + spec.sx * spec.r
    const hy = spec.y
    const vx = spec.x
    const vy = spec.y + spec.sy * spec.r
    // Short way around, passing through the corner direction.
    const sweep = spec.sx * spec.sy === 1 ? 0 : 1

    marks.push({
      corner: spec.corner,
      radius: spec.r,
      arc: `M ${hx} ${hy} A ${spec.r} ${spec.r} 0 0 ${sweep} ${vx} ${vy}`,
      tangents: [
        [spec.x, spec.y, hx, hy],
        [spec.x, spec.y, vx, vy],
      ],
    })
  }

  return marks
}

/**
 * A sub layer between the measurement layers and hover. Not part of LAYERS:
 * sub layers are driven by their own feature (radius by the focus, marks by
 * the extension), not by the toolbar.
 */
export function createSubLayer(name: string, before: HTMLElement): HTMLElement {
  const layer = document.createElement('div')
  layer.dataset.layer = name
  layer.style.cssText = `${BASE};inset:0`
  before.before(layer)
  return layer
}

const MARK_COLOR = 'rgba(217, 119, 6, 0.95)'

export type MarkInput = { selector: string; text: string }

/**
 * Badges the human pinned onto parts of the page. Stale selectors are skipped
 * — an empty spot is more honest than a badge floating on the wrong element;
 * the label stays in storage and reappears when the part comes back.
 */
export function drawMarks(
  layer: HTMLElement,
  marks: MarkInput[],
  bySelector: Map<string, GraphNode>,
): void {
  layer.replaceChildren()
  if (marks.length === 0) return

  const scrollX = window.scrollX
  const scrollY = window.scrollY

  for (const mark of marks) {
    const node = bySelector.get(mark.selector)
    if (node === undefined) continue

    const badge = box(
      layer,
      `left:${node.rect.x - scrollX}px;top:${node.rect.y - scrollY}px;` +
        `transform:translateY(-100%);padding:2px 6px;border-radius:4px;` +
        `background:${MARK_COLOR};color:#fff;font:10px/1.4 ui-monospace,monospace;white-space:nowrap`,
    )
    badge.textContent = mark.text
  }
}

export function drawRadius(layer: HTMLElement, node: GraphNode | null): void {
  layer.replaceChildren()
  if (node === null) return

  const radii = parseRadius(node.styles.borderRadius, node.rect)
  if (radii === null) return

  const view = {
    x: node.rect.x - window.scrollX,
    y: node.rect.y - window.scrollY,
    w: node.rect.w,
    h: node.rect.h,
  }

  const marks = radiusGeometry(view, radii)
  if (marks.length === 0) return

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.style.cssText = `${BASE};inset:0;width:100%;height:100%`

  for (const mark of marks) {
    const arc = document.createElementNS(SVG_NS, 'path')
    arc.setAttribute('d', mark.arc)
    arc.setAttribute('fill', 'none')
    arc.setAttribute('stroke', GAP_COLOR)
    arc.setAttribute('stroke-width', '2')
    svg.append(arc)

    for (const [x1, y1, x2, y2] of mark.tangents) {
      const line = document.createElementNS(SVG_NS, 'line')
      line.setAttribute('x1', String(x1))
      line.setAttribute('y1', String(y1))
      line.setAttribute('x2', String(x2))
      line.setAttribute('y2', String(y2))
      line.setAttribute('stroke', TANGENT_COLOR)
      line.setAttribute('stroke-width', '1')
      line.setAttribute('stroke-dasharray', '3 3')
      svg.append(line)
    }
  }

  layer.append(svg)

  // Four identical numbers are noise; label one corner, and the rest only
  // where the radius actually differs.
  const labeled = marks.every((mark) => mark.radius === marks[0]?.radius)
    ? marks.slice(0, 1)
    : marks

  for (const mark of labeled) {
    const inset = mark.radius * 0.55
    const x =
      mark.corner === 'tr' || mark.corner === 'br' ? view.x + view.w - inset : view.x + inset
    const y =
      mark.corner === 'br' || mark.corner === 'bl' ? view.y + view.h - inset : view.y + inset

    label(layer, `${round(mark.radius, 1)}px`, x, y)
  }
}

/**
 * CSS for the dimming layer: one huge box-shadow darkens everything except
 * the box itself, which stays clear as the hole. Pure math on purpose — the
 * hole position is testable without a DOM.
 */
export function dimStyle(
  rect: { x: number; y: number; w: number; h: number },
  scroll: { x: number; y: number },
): string {
  const left = rect.x - scroll.x
  const top = rect.y - scroll.y

  return (
    `left:${left}px;top:${top}px;width:${rect.w}px;height:${rect.h}px;` +
    `box-shadow:0 0 0 9999px ${FOCUS_DIM}`
  )
}

/**
 * CSS for the outline layer: same hole position as the dim, but only the
 * border. The two layers are toggled independently, so their holes must
 * never drift apart.
 */
export function outlineStyle(
  rect: { x: number; y: number; w: number; h: number },
  scroll: { x: number; y: number },
): string {
  const left = rect.x - scroll.x
  const top = rect.y - scroll.y

  return (
    `left:${left}px;top:${top}px;width:${rect.w}px;height:${rect.h}px;` +
    `border:2px solid ${FOCUS_BORDER};border-radius:2px`
  )
}

export function drawDim(layer: HTMLElement, node: GraphNode | null): void {
  layer.replaceChildren()
  if (node === null) return

  box(layer, dimStyle(node.rect, { x: window.scrollX, y: window.scrollY }))
}

/**
 * The focus layer is created by `createLayers` (it is one of LAYERS, so the
 * toolbar can toggle it); it sits between the measurement layers and hover,
 * so the human keeps hover inspection while the spotlight is on.
 */
export function drawFocus(layer: HTMLElement, node: GraphNode | null): void {
  layer.replaceChildren()
  if (node === null) return

  box(layer, outlineStyle(node.rect, { x: window.scrollX, y: window.scrollY }))
}

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
