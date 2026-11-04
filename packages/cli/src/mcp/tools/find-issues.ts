import { issuePayload } from '../format.js'
import { type ToolResult, textResult } from '../result.js'
import { validateRules } from '../rules.js'
import { requirePage } from '../session.js'

export type FindIssuesInput = {
  rules?: string[]
  limit?: number
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export async function findIssuesTool(input: FindIssuesInput): Promise<ToolResult> {
  const rules = validateRules(input.rules ?? [])
  const limit = clamp(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT)
  const issues = await requirePage().issues(rules)

  return textResult(issuePayload(issues, limit))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.round(value), min), max)
}
