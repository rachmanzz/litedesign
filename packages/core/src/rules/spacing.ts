import { SPACING_SCALE } from '../constants.js'
import type { Issue } from '../types.js'
import { issue, type Rule } from './rule.js'

/**
 * Sibling gaps should sit on the spacing scale. Visual gaps are skipped: they
 * are an observation about two unrelated boxes, not a value anyone authored.
 */
export const spacingScale: Rule = (graph) => {
  const issues: Issue[] = []

  for (const gap of graph.gaps) {
    if (gap.kind !== 'sibling') continue

    const actual = Math.round(gap.distance)
    if (actual <= 0 || actual % SPACING_SCALE === 0) continue

    issues.push(
      issue({
        rule: 'spacing-scale',
        selector: gap.a,
        key: `${gap.axis}:${gap.b}`,
        severity: 'P2',
        actual: `${actual}px`,
        expected: `${Math.round(actual / SPACING_SCALE) * SPACING_SCALE}px`,
        autoFix: true,
      }),
    )
  }

  return issues
}
