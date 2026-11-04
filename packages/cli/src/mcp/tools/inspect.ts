import { readConfig } from '../../config.js'
import type { Viewport } from '../../drivers/types.js'
import { AwaitingUserError, MismatchError } from '../errors.js'
import { formatTree, labelsSummary } from '../format.js'
import { handoffMessage } from '../handoff.js'
import { imageResult, type ToolResult, textResult } from '../result.js'
import { openPage } from '../session.js'

export type InspectInput = {
  url: string
  viewport?: Viewport
  screenshot?: boolean
}

export async function inspectTool(input: InspectInput): Promise<ToolResult> {
  const config = await readConfig()

  let driver: Awaited<ReturnType<typeof openPage>>

  try {
    driver = await openPage(config.mode, input.url, input.viewport)
  } catch (error) {
    if (error instanceof AwaitingUserError) {
      return textResult({
        status: 'awaiting_user',
        url: input.url,
        next: 'await_page',
        message: handoffMessage(input.url),
      })
    }

    if (error instanceof MismatchError) {
      return textResult({
        status: 'mismatch',
        expected: error.expected,
        actual: error.actual,
        next: 'await_page',
        message: error.message,
      })
    }

    throw error
  }

  const graph = await driver.graph()
  const labels = labelsSummary(await driver.labels())
  const payload = {
    status: 'ready',
    url: graph.url,
    viewport: graph.viewport,
    summary: {
      nodes: graph.nodes.length,
      issues: graph.issues.length,
      truncated: graph.truncated,
      labels,
    },
    tree: formatTree(graph),
  }

  // The image costs the agent a lot of context, so it is off unless asked for.
  // Everything the agent needs to judge spacing and alignment is already in
  // `payload`, measured from the DOM.
  if (input.screenshot !== true) return textResult(payload)

  const image = await driver.screenshot()
  return imageResult(payload, image)
}
