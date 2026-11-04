import { findGuides } from './align.js'
import { MAX_NODES } from './constants.js'
import { extractNode } from './extract.js'
import { findGaps } from './gaps.js'
import { findIssues } from './rules/index.js'
import type { Graph, GraphNode } from './types.js'
import { collectElements } from './walk.js'

/**
 * Turns the live page into a measurement graph.
 *
 * Everything after `collectElements` is pure data, which is why the rules can
 * be tested in Node without a DOM.
 */
export function buildGraph(root: Element | null = null): Graph {
  const start = root ?? (typeof document === 'undefined' ? null : document.body)

  if (start === null) return emptyGraph()

  const entries = collectElements(start)
  const nodes: GraphNode[] = []
  const byId = new Map<string, GraphNode>()
  const ids: string[] = []

  for (const entry of entries) {
    const parentId = entry.parent >= 0 ? (ids[entry.parent] ?? null) : null
    const node = extractNode(entry.el, entry.id, parentId, entry.depth)

    ids.push(node.id)
    nodes.push(node)
    byId.set(node.id, node)
    if (parentId !== null) byId.get(parentId)?.children.push(node.id)
  }

  const graph: Graph = {
    url: typeof location === 'undefined' ? '' : location.href,
    viewport: {
      w: typeof innerWidth === 'undefined' ? 0 : innerWidth,
      h: typeof innerHeight === 'undefined' ? 0 : innerHeight,
    },
    nodes,
    gaps: findGaps(nodes),
    guides: findGuides(nodes),
    issues: [],
    truncated: entries.length >= MAX_NODES,
  }

  graph.issues = findIssues(graph)

  return graph
}

function emptyGraph(): Graph {
  return {
    url: '',
    viewport: { w: 0, h: 0 },
    nodes: [],
    gaps: [],
    guides: [],
    issues: [],
    truncated: false,
  }
}
