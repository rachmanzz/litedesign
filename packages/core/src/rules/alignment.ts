import { EDGES } from '../align.js'
import type { Issue } from '../types.js'
import { issue, type Rule } from './rule.js'

/** Anything within this is already a guide, not a problem. */
const TOLERANCE = 2
/** Anything within this but beyond TOLERANCE is a near miss worth reporting. */
const WINDOW = 4

/**
 * Edges that almost line up. `findGuides` keeps clusters inside 2px; this rule
 * looks at the band just outside that, where the eye still reads the elements
 * as one column but the numbers disagree.
 *
 * The root node is skipped: the page container has no sibling to align with,
 * and its center is just half the document.
 */
export const alignmentNearMiss: Rule = (graph) => {
  const issues: Issue[] = []

  for (const spec of EDGES) {
    const items = graph.nodes
      .filter((node) => node.parent !== null)
      .map((node) => ({ node, value: spec.value(node.rect) }))
      .sort((a, b) => a.value - b.value)

    let start = 0

    for (let i = 1; i <= items.length; i++) {
      const previous = items[i - 1]
      const current = items[i]
      const breaks =
        current === undefined || previous === undefined || current.value - previous.value > WINDOW
      if (!breaks) continue

      const cluster = items.slice(start, i)
      start = i

      if (cluster.length < 2) continue

      const first = cluster[0]
      const last = cluster[cluster.length - 1]
      if (first === undefined || last === undefined) continue
      if (last.value - first.value <= TOLERANCE) continue

      const target = cluster[Math.floor(cluster.length / 2)]
      if (target === undefined) continue

      let worst = cluster[0]
      if (worst === undefined) continue

      for (const item of cluster) {
        if (Math.abs(item.value - target.value) > Math.abs(worst.value - target.value)) worst = item
      }

      issues.push(
        issue({
          rule: 'alignment-near-miss',
          selector: worst.node.id,
          key: spec.edge,
          severity: 'P2',
          actual: `${Math.round(worst.value * 10) / 10}px`,
          expected: `${Math.round(target.value * 10) / 10}px`,
          autoFix: false,
        }),
      )
    }
  }

  return issues
}
