import { readConfig } from '../../config.js'
import type { Viewport } from '../../drivers/types.js'
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
  const driver = await openPage(config.mode, input.url, input.viewport)

  if (driver === null) {
    return textResult({
      status: 'awaiting_user',
      url: input.url,
      message: handoffMessage(input.url),
    })
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
