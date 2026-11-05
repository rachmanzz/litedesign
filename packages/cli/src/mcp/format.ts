import type { Graph, Issue } from '@litedesign/core/types'
import type { LabelMark } from '../drivers/types.js'

const MAX_TREE_LINES = 200
const MAX_DEPTH_INDENT = 12
const MAX_TEXT = 48

export type IssuePayload = {
  issues: Array<
    Pick<Issue, 'selector' | 'rule' | 'severity' | 'kind' | 'actual' | 'expected' | 'autoFix'>
  >
  total: number
  truncated: boolean
}

/**
 * Indented, human-readable tree. Not JSON: the agent reads this to decide what
 * to measure next, and a full graph would blow the token budget.
 */
export function formatTree(graph: Graph, maxLines = MAX_TREE_LINES): string {
  const lines: string[] = []

  for (const node of graph.nodes) {
    if (lines.length >= maxLines) break

    const indent = '  '.repeat(Math.min(node.depth, MAX_DEPTH_INDENT))
    const size = `${Math.round(node.rect.w)}×${Math.round(node.rect.h)}`
    const text = node.text === '' ? '' : ` ${clip(node.text)}`

    lines.push(`${indent}${node.tag} ${size}${text}`)
  }

  if (graph.nodes.length > maxLines) {
    lines.push(`… ${graph.nodes.length - maxLines} more nodes`)
  }

  return lines.join('\n')
}

export type LabelsSummary = { count: number; names: string[] }

/**
 * Count of the pinned labels plus their unique names, in order of first
 * appearance. `inspect` carries this so an agent that never sees the labels
 * tool in its tool list still learns the page has labels. `null` means the
 * driver cannot see the toolbar at all (headless): an unknown, not a zero.
 */
export function labelsSummary(marks: LabelMark[] | null): LabelsSummary | null {
  if (marks === null) return null

  const names: string[] = []

  for (const mark of marks) {
    if (!names.includes(mark.label)) names.push(mark.label)
  }

  return { count: marks.length, names }
}

export function issuePayload(issues: Issue[], limit: number): IssuePayload {
  return {
    issues: issues.slice(0, limit).map((issue) => ({
      selector: issue.selector,
      rule: issue.rule,
      severity: issue.severity,
      kind: issue.kind,
      actual: issue.actual,
      expected: issue.expected,
      autoFix: issue.autoFix,
    })),
    total: issues.length,
    truncated: issues.length > limit,
  }
}

/** PNG dimensions live in the IHDR chunk, so no image library is needed. */
export function pngSize(buffer: Buffer): { width: number; height: number } {
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
    return { width: 0, height: 0 }
  }

  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

function clip(text: string): string {
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text
}
