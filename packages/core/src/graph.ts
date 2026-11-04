import type { Graph, GraphNode, Styles } from './types.js'

function pathOf(el: Element): string {
  const parts: string[] = []
  let cur: Element | null = el

  while (cur !== null) {
    const parent: Element | null = cur.parentElement
    if (parent === null) break
    const index = Array.prototype.indexOf.call(parent.children, cur) + 1
    parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${index})`)
    cur = parent
  }

  return parts.join(' > ')
}

function readStyles(el: Element): Styles {
  const s = getComputedStyle(el)

  return {
    display: s.display,
    position: s.position,
    flexDirection: s.flexDirection,
    gap: s.gap,
    margin: s.margin,
    padding: s.padding,
    borderRadius: s.borderRadius,
    boxShadow: s.boxShadow,
    color: s.color,
    backgroundColor: s.backgroundColor,
    fontSize: s.fontSize,
    fontWeight: s.fontWeight,
    lineHeight: s.lineHeight,
    fontFamily: s.fontFamily,
    zIndex: s.zIndex,
  }
}

/**
 * v0: node + rect saja. Gap, alignment, dan rules menyusul di M1.
 */
export function buildGraph(root: Element | null = null): Graph {
  const nodes: GraphNode[] = []
  const byId = new Map<string, GraphNode>()
  const start = root ?? (typeof document === 'undefined' ? null : document.body)

  const visit = (el: Element, parentId: string | null, depth: number): void => {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) return

    const id = pathOf(el)
    const node: GraphNode = {
      id,
      selector: id,
      tag: el.tagName.toLowerCase(),
      rect: {
        x: rect.left + window.scrollX,
        y: rect.top + window.scrollY,
        w: rect.width,
        h: rect.height,
      },
      depth,
      parent: parentId,
      children: [],
      styles: readStyles(el),
    }

    nodes.push(node)
    byId.set(id, node)
    if (parentId) byId.get(parentId)?.children.push(id)

    for (const child of Array.from(el.children)) visit(child, id, depth + 1)
  }

  if (start) visit(start, null, 0)

  return {
    url: typeof location === 'undefined' ? '' : location.href,
    viewport: {
      w: typeof innerWidth === 'undefined' ? 0 : innerWidth,
      h: typeof innerHeight === 'undefined' ? 0 : innerHeight,
    },
    nodes,
    gaps: [],
    guides: [],
    issues: [],
  }
}
