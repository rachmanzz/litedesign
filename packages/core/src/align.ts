import { bottom, centerX, centerY, right, round } from './geometry.js'
import type { Axis, GraphNode, Guide, Rect } from './types.js'

const TOLERANCE = 2

type EdgeSpec = {
  axis: Axis
  edge: Guide['edge']
  value: (rect: Rect) => number
}

export const EDGES: EdgeSpec[] = [
  { axis: 'x', edge: 'left', value: (rect) => rect.x },
  { axis: 'x', edge: 'right', value: right },
  { axis: 'x', edge: 'center', value: centerX },
  { axis: 'y', edge: 'top', value: (rect) => rect.y },
  { axis: 'y', edge: 'bottom', value: bottom },
  { axis: 'y', edge: 'center', value: centerY },
]

/**
 * Cluster edges with a 2px tolerance. A cluster of two or more nodes becomes a
 * guide. Guides whose members form a single ancestor chain are dropped: a
 * container and its only child share an edge because they are nested, not
 * because anyone aligned them.
 */
export function findGuides(nodes: GraphNode[], tolerance = TOLERANCE): Guide[] {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const guides: Guide[] = []

  for (const spec of EDGES) {
    const items = nodes
      .map((node) => ({ node, value: spec.value(node.rect) }))
      .sort((a, b) => a.value - b.value)

    let start = 0

    for (let i = 1; i <= items.length; i++) {
      const previous = items[i - 1]
      const current = items[i]
      const breaks =
        current === undefined ||
        previous === undefined ||
        current.value - previous.value > tolerance
      if (!breaks) continue

      const cluster = items.slice(start, i)
      start = i

      if (cluster.length < 2) continue

      const members = cluster.map((item) => item.node)
      if (isAncestorChain(members, byId)) continue

      const total = cluster.reduce((sum, item) => sum + item.value, 0)

      guides.push({
        axis: spec.axis,
        edge: spec.edge,
        value: round(total / cluster.length),
        members: members.map((node) => node.id),
      })
    }
  }

  return guides
}

function isAncestorChain(members: GraphNode[], byId: Map<string, GraphNode>): boolean {
  if (members.length < 2) return false

  const ids = new Set(members.map((node) => node.id))
  let deepest = members[0]

  for (const node of members) {
    if (deepest === undefined || node.depth > deepest.depth) deepest = node
  }

  if (deepest === undefined) return false

  let hits = 0
  let current = deepest.parent === null ? undefined : byId.get(deepest.parent)

  while (current !== undefined) {
    if (ids.has(current.id)) hits++
    current = current.parent === null ? undefined : byId.get(current.parent)
  }

  return hits === members.length - 1
}
