/**
 * Core data model. The conceptual source of truth lives in
 * `.knowledges/docs/architecture.md`.
 *
 * `GraphNode`, not `Node`: the name `Node` collides with the DOM Node in files
 * that use `lib: DOM`.
 */

export type Axis = 'x' | 'y'

export type Rect = { x: number; y: number; w: number; h: number }

/** Scroll and client box, used by the overflow rule. */
export type Box = {
  scrollW: number
  scrollH: number
  clientW: number
  clientH: number
}

/**
 * Only the properties a consumer reads. The rules use the visual ones; the
 * hover inspector reads the box-model values.
 */
export type Styles = {
  display: string
  borderRadius: string
  color: string
  backgroundColor: string
  fontSize: string
  fontWeight: string
  padding: string
  margin: string
  gap: string
}

export type GraphNode = {
  id: string
  selector: string
  tag: string
  rect: Rect
  box: Box
  /** Direct text of this element, collapsed and truncated. Empty for containers. */
  text: string
  depth: number
  parent: string | null
  children: string[]
  styles: Styles
}

export type Gap = {
  a: string
  b: string
  axis: Axis
  distance: number
  kind: 'sibling' | 'visual'
}

export type Guide = {
  axis: Axis
  edge: 'left' | 'right' | 'center' | 'top' | 'bottom'
  value: number
  members: string[]
}

export type Severity = 'P0' | 'P1' | 'P2' | 'P3'

export type Patch = {
  id: string
  origin: 'agent' | 'human'
  mode: 'probe' | 'preview' | 'commit'
  ops: Array<{ selector: string; prop: string; from?: string; to: string }>
}

export type Issue = {
  id: string
  selector: string
  rule: string
  severity: Severity
  actual: string
  expected: string
  autoFix: boolean
  patch?: Patch
}

export type Graph = {
  url: string
  viewport: { w: number; h: number }
  nodes: GraphNode[]
  gaps: Gap[]
  guides: Guide[]
  issues: Issue[]
  /** True when the walk hit MAX_NODES and stopped early. */
  truncated: boolean
}
