import type { GraphNode, Issue } from '../types.js'
import { defineRule, issue } from './rule.js'

/** Below this sample size the majority is not a signal. */
const MIN_SAMPLES = 4

/**
 * Radius should be a token, not a mood. The most common radius wins; every
 * other value is reported once per node. Pills and circles are skipped: their
 * radius is derived from size, so it is not part of the same scale.
 */
export const radiusConsistency = defineRule('radius-consistency', (graph) => {
  const groups = new Map<string, GraphNode[]>()

  for (const node of graph.nodes) {
    const radius = normalizeRadius(node.styles.borderRadius)
    if (radius === null) continue

    const group = groups.get(radius)
    if (group) group.push(node)
    else groups.set(radius, [node])
  }

  if (groups.size < 2) return []

  const total = [...groups.values()].reduce((sum, group) => sum + group.length, 0)
  if (total < MIN_SAMPLES) return []

  const ranked = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)
  const expected = ranked[0]
  if (expected === undefined) return []

  const [expectedValue, expectedNodes] = expected
  const issues: Issue[] = []

  for (const [value, nodes] of ranked.slice(1)) {
    if (nodes.length >= expectedNodes.length) continue

    for (const node of nodes) {
      if (isPill(node)) continue

      issues.push(
        issue({
          rule: 'radius-consistency',
          selector: node.id,
          severity: 'P3',
          actual: value,
          expected: expectedValue,
          autoFix: true,
        }),
      )
    }
  }

  return issues
})

function normalizeRadius(value: string): string | null {
  const text = value.trim()
  if (text === '' || text === '0px' || text === '0') return null

  const parts = text.split(/\s+/)
  const unique = [...new Set(parts)]

  if (unique.length === 1) return unique[0] ?? null

  return parts.join(' ')
}

function isPill(node: GraphNode): boolean {
  const text = node.styles.borderRadius
  if (text.includes('%')) return true

  const radius = Number.parseFloat(text)
  if (!Number.isFinite(radius)) return false

  return radius >= Math.min(node.rect.w, node.rect.h) / 2
}
