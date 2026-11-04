import type { Box, Graph, GraphNode, Rect, Styles } from '../src/types.js'

const BASE_STYLES: Styles = {
  display: 'block',
  borderRadius: '0px',
  color: 'rgb(0, 0, 0)',
  backgroundColor: 'rgba(0, 0, 0, 0)',
  fontSize: '16px',
  fontWeight: '400',
  padding: '0px',
  margin: '0px',
  gap: 'normal',
}

export type NodeOverrides = Omit<Partial<GraphNode>, 'styles' | 'box'> & {
  styles?: Partial<Styles>
  box?: Partial<Box>
}

export function node(id: string, rect: Rect, overrides: NodeOverrides = {}): GraphNode {
  const { styles, box, ...rest } = overrides

  return {
    id,
    selector: id,
    tag: 'div',
    rect,
    box: {
      scrollW: rect.w,
      scrollH: rect.h,
      clientW: rect.w,
      clientH: rect.h,
      ...box,
    },
    text: '',
    depth: 1,
    parent: null,
    children: [],
    styles: { ...BASE_STYLES, ...styles },
    ...rest,
  }
}

export function graph(nodes: GraphNode[], overrides: Partial<Graph> = {}): Graph {
  return {
    url: 'https://example.test',
    viewport: { w: 1280, h: 720 },
    nodes,
    gaps: [],
    guides: [],
    issues: [],
    truncated: false,
    ...overrides,
  }
}
