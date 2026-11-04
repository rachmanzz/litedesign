import { axisGap, bottom, overlapsOn, right, round } from './geometry.js'
import type { Axis, Gap, GraphNode } from './types.js'

/**
 * Gaps between consecutive siblings.
 *
 * The axis is decided by geometry, not by `flex-direction`: sort the siblings
 * on an axis and keep consecutive pairs that overlap enough on the cross axis.
 * A column stack therefore produces only vertical gaps, and a row only
 * horizontal ones.
 */
export function findSiblingGaps(nodes: GraphNode[]): Gap[] {
  const byParent = new Map<string | null, GraphNode[]>()

  for (const node of nodes) {
    const siblings = byParent.get(node.parent)
    if (siblings) siblings.push(node)
    else byParent.set(node.parent, [node])
  }

  const gaps: Gap[] = []

  for (const siblings of byParent.values()) {
    gaps.push(...axisGaps(siblings, 'x'), ...axisGaps(siblings, 'y'))
  }

  return gaps
}

function axisGaps(siblings: GraphNode[], axis: Axis): Gap[] {
  const sorted = [...siblings].sort((a, b) =>
    axis === 'x' ? a.rect.x - b.rect.x : a.rect.y - b.rect.y,
  )

  const gaps: Gap[] = []

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (a === undefined || b === undefined) continue

    const distance = axisGap(a.rect, b.rect, axis)
    if (distance < 0.5) continue

    const cross: Axis = axis === 'x' ? 'y' : 'x'
    if (!overlapsOn(a.rect, b.rect, cross)) continue

    gaps.push({ a: a.id, b: b.id, axis, distance: round(distance), kind: 'sibling' })
  }

  return gaps
}

/**
 * Nearest neighbour in each direction, even when it is not a sibling.
 *
 * A candidate must share at least half of the smaller rect on the cross axis,
 * so a box does not report a gap to something diagonally adjacent. `a` is
 * always the left/top node and `b` the right/bottom one.
 *
 * Each direction keeps its own sorted index, so the scan starts at the first
 * candidate that could be a neighbour instead of walking the whole list.
 */
export function findVisualGaps(nodes: GraphNode[]): Gap[] {
  const seen = new Set<string>()
  const gaps: Gap[] = []

  const push = (a: GraphNode, b: GraphNode, axis: Axis, distance: number): void => {
    const key = pairKey(a.id, b.id, axis)
    if (seen.has(key)) return
    seen.add(key)
    gaps.push({ a: a.id, b: b.id, axis, distance: round(distance), kind: 'visual' })
  }

  const byX = [...nodes].sort((a, b) => a.rect.x - b.rect.x)
  const byRight = [...nodes].sort((a, b) => right(a.rect) - right(b.rect))
  const byY = [...nodes].sort((a, b) => a.rect.y - b.rect.y)
  const byBottom = [...nodes].sort((a, b) => bottom(a.rect) - bottom(b.rect))

  for (const a of nodes) {
    for (let j = firstAtLeast(byX, right(a.rect) - 0.5, (n) => n.rect.x); j < byX.length; j++) {
      const b = byX[j]
      if (b === undefined) continue
      if (!overlapsOn(a.rect, b.rect, 'y')) continue
      push(a, b, 'x', b.rect.x - right(a.rect))
      break
    }

    for (let j = lastAtMost(byRight, a.rect.x + 0.5, (n) => right(n.rect)); j >= 0; j--) {
      const b = byRight[j]
      if (b === undefined) continue
      if (!overlapsOn(a.rect, b.rect, 'y')) continue
      push(b, a, 'x', a.rect.x - right(b.rect))
      break
    }

    for (let j = firstAtLeast(byY, bottom(a.rect) - 0.5, (n) => n.rect.y); j < byY.length; j++) {
      const b = byY[j]
      if (b === undefined) continue
      if (!overlapsOn(a.rect, b.rect, 'x')) continue
      push(a, b, 'y', b.rect.y - bottom(a.rect))
      break
    }

    for (let j = lastAtMost(byBottom, a.rect.y + 0.5, (n) => bottom(n.rect)); j >= 0; j--) {
      const b = byBottom[j]
      if (b === undefined) continue
      if (!overlapsOn(a.rect, b.rect, 'x')) continue
      push(b, a, 'y', a.rect.y - bottom(b.rect))
      break
    }
  }

  return gaps
}

/** Sibling gaps win over the visual gap for the same pair and axis. */
export function findGaps(nodes: GraphNode[]): Gap[] {
  const siblings = findSiblingGaps(nodes)
  const claimed = new Set(siblings.map((gap) => pairKey(gap.a, gap.b, gap.axis)))
  const visual = findVisualGaps(nodes).filter(
    (gap) => !claimed.has(pairKey(gap.a, gap.b, gap.axis)),
  )

  return [...siblings, ...visual]
}

function pairKey(a: string, b: string, axis: Axis): string {
  return a < b ? `${a}|${b}|${axis}` : `${b}|${a}|${axis}`
}

/** First index whose value is >= target. */
function firstAtLeast<T>(list: T[], target: number, value: (item: T) => number): number {
  let low = 0
  let high = list.length

  while (low < high) {
    const middle = (low + high) >> 1
    const item = list[middle]
    if (item !== undefined && value(item) < target) low = middle + 1
    else high = middle
  }

  return low
}

/** Last index whose value is <= target, or -1. */
function lastAtMost<T>(list: T[], target: number, value: (item: T) => number): number {
  let low = 0
  let high = list.length

  while (low < high) {
    const middle = (low + high) >> 1
    const item = list[middle]
    if (item !== undefined && value(item) <= target) low = middle + 1
    else high = middle
  }

  return low - 1
}
