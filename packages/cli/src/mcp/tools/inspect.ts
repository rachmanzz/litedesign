import { readConfig } from '../../config.js'
import type { Viewport } from '../../drivers/types.js'
import { AwaitingUserError } from '../errors.js'
import { formatTree } from '../format.js'
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

    throw error
  }

  const graph = await driver.graph()
  const payload = {
    status: 'ready',
    url: graph.url,
    viewport: graph.viewport,
    summary: {
      nodes: graph.nodes.length,
      issues: graph.issues.length,
      truncated: graph.truncated,
    },
    tree: formatTree(graph),
  }

  if (input.screenshot === false) return textResult(payload)

  const image = await driver.screenshot()
  return imageResult(payload, image)
}
