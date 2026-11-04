import type { Graph, Issue, Severity } from '../types.js'

/**
 * A rule reads a graph and returns issues. No DOM, no async, no I/O.
 *
 * The `id` lives on the function so the MCP bridge can list and validate rule
 * names without keeping a second hand-written list in sync.
 */
export type Rule = ((graph: Graph) => Issue[]) & { id: string }

export function defineRule(id: string, run: (graph: Graph) => Issue[]): Rule {
  return Object.assign(run, { id })
}

type IssueInput = {
  rule: string
  selector: string
  severity: Severity
  actual: string
  expected: string
  autoFix: boolean
  /** Disambiguates several issues of the same rule on the same element. */
  key?: string
}

export function issue(input: IssueInput): Issue {
  const suffix = input.key === undefined ? '' : `:${input.key}`

  return {
    id: `${input.rule}:${input.selector}${suffix}`,
    selector: input.selector,
    rule: input.rule,
    severity: input.severity,
    actual: input.actual,
    expected: input.expected,
    autoFix: input.autoFix,
  }
}
