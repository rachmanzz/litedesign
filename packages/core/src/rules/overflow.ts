import type { Issue } from '../types.js'
import { defineRule, issue } from './rule.js'

/** Sub-pixel scroll noise is not an overflow. */
const SLACK = 1

/**
 * Content wider or taller than its own client box. Visible overflow and
 * clipped overflow both count: the first is a layout bug, the second is content
 * the user cannot reach.
 */
export const overflowClipped = defineRule('overflow', (graph) => {
  const issues: Issue[] = []

  for (const node of graph.nodes) {
    if (node.styles.display.startsWith('inline')) continue
    if (node.box.clientW === 0 && node.box.clientH === 0) continue

    if (node.box.scrollW > node.box.clientW + SLACK) {
      issues.push(
        issue({
          rule: 'overflow',
          selector: node.id,
          key: 'x',
          severity: 'P2',
          kind: 'violation',
          actual: `${node.box.scrollW}px content in ${node.box.clientW}px`,
          expected: 'content fits horizontally',
          autoFix: false,
        }),
      )
    }

    if (node.box.scrollH > node.box.clientH + SLACK) {
      issues.push(
        issue({
          rule: 'overflow',
          selector: node.id,
          key: 'y',
          severity: 'P2',
          kind: 'violation',
          actual: `${node.box.scrollH}px content in ${node.box.clientH}px`,
          expected: 'content fits vertically',
          autoFix: false,
        }),
      )
    }
  }

  return issues
})
