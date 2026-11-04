/**
 * Model data inti. Sumber kebenaran konseptual ada di
 * `.knowledges/docs/architecture.md`.
 *
 * `GraphNode`, bukan `Node`: nama `Node` bentrok dengan DOM Node di file yang
 * memakai `lib: DOM`.
 */

export type Rect = { x: number; y: number; w: number; h: number }

export type Styles = {
  display: string
  position: string
  flexDirection: string
  gap: string
  margin: string
  padding: string
  borderRadius: string
  boxShadow: string
  color: string
  backgroundColor: string
  fontSize: string
  fontWeight: string
  lineHeight: string
  fontFamily: string
  zIndex: string
}

export type GraphNode = {
  id: string
  selector: string
  tag: string
  rect: Rect
  depth: number
  parent: string | null
  children: string[]
  styles: Styles
}

export type Gap = {
  a: string
  b: string
  axis: 'x' | 'y'
  distance: number
  kind: 'sibling' | 'visual'
}

export type Guide = {
  axis: 'x' | 'y'
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
}
