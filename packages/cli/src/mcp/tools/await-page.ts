import { handoffMessage, mismatchMessage } from '../handoff.js'
import { type ToolResult, textResult } from '../result.js'
import { waitForPage } from '../session.js'

export type AwaitPageInput = {
  timeoutMs?: number
}

const DEFAULT_TIMEOUT = 120000
const MAX_TIMEOUT = 600000

export async function awaitPageTool(input: AwaitPageInput): Promise<ToolResult> {
  const timeoutMs = Math.min(
    Math.max(Math.round(input.timeoutMs ?? DEFAULT_TIMEOUT), 1000),
    MAX_TIMEOUT,
  )
  const result = await waitForPage(timeoutMs)

  if (result.status === 'ready') {
    return textResult({
      status: 'ready',
      url: result.url,
      message: 'The page is connected. Call inspect to read it.',
    })
  }

  if (result.status === 'timeout') {
    return textResult({
      status: 'timeout',
      url: result.expected,
      message: handoffMessage(result.expected),
    })
  }

  return textResult({
    status: 'mismatch',
    expected: result.expected,
    actual: result.url,
    message: mismatchMessage(result.expected, result.url),
  })
}
