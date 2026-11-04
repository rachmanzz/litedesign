import { RULE_IDS } from '@litedesign/core'
import { ToolError } from './errors.js'

/**
 * Validates rule names once, for both `find_issues` and
 * `screenshot_annotated`. An empty list means "all rules".
 */
export function validateRules(rules: string[]): string[] | undefined {
  const unknown = rules.filter((rule) => !RULE_IDS.includes(rule))

  if (unknown.length > 0) {
    const label = unknown.length === 1 ? 'rule' : 'rules'
    throw new ToolError(
      `unknown ${label}: ${unknown.join(', ')}. Valid rules: ${RULE_IDS.join(', ')}`,
    )
  }

  return rules.length === 0 ? undefined : rules
}
