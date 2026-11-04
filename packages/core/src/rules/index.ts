import type { Graph, Issue } from '../types.js'
import { alignmentNearMiss } from './alignment.js'
import { contrastMinimum } from './contrast.js'
import { overflowClipped } from './overflow.js'
import { radiusConsistency } from './radius.js'
import type { Rule } from './rule.js'
import { spacingScale } from './spacing.js'

export const defaultRules: Rule[] = [
  spacingScale,
  alignmentNearMiss,
  radiusConsistency,
  overflowClipped,
  contrastMinimum,
]

/** Stable names accepted by `find_issues` and `screenshot_annotated`. */
export const RULE_IDS: string[] = defaultRules.map((rule) => rule.id)

export function findIssues(graph: Graph, rules: Rule[] = defaultRules): Issue[] {
  return rules.flatMap((rule) => rule(graph))
}

export type { Rule }
