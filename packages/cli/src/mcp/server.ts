import { RULE_IDS } from '@litedesign/core'
import { readConfig } from '../config.js'
import { detectPlaywright } from '../drivers/index.js'
import { VERSION } from '../version.js'
import { ToolError } from './errors.js'
import { errorResult, type ToolResult, textResult } from './result.js'
import { closeSession } from './session.js'
import { findIssuesTool } from './tools/find-issues.js'
import { inspectTool } from './tools/inspect.js'
import { measureTool } from './tools/measure.js'
import { screenshotTool } from './tools/screenshot.js'
import { screenshotAnnotatedTool } from './tools/screenshot-annotated.js'

async function guard(run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof ToolError) return errorResult(error)

    // Keep the stack on stderr; the agent only gets the actionable message.
    console.error('[litedesign] unexpected tool error:', error)
    return errorResult(error)
  }
}

export async function runMcpServer(): Promise<void> {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const { z } = await import('zod')

  const server = new McpServer({ name: 'litedesign', version: VERSION })

  const viewport = z
    .object({
      w: z.number().int().positive().describe('Viewport width in CSS pixels'),
      h: z.number().int().positive().describe('Viewport height in CSS pixels'),
    })
    .optional()

  server.registerTool(
    'capabilities',
    {
      title: 'Capabilities',
      description: 'Server version, available drivers, active mode, and valid rule names.',
      inputSchema: {},
    },
    async () => {
      const [playwright, config] = await Promise.all([detectPlaywright(), readConfig()])

      return textResult({
        version: VERSION,
        drivers: { playwright, extension: false },
        mode: config.mode,
        port: config.port,
        rules: RULE_IDS,
      })
    },
  )

  server.registerTool(
    'inspect',
    {
      title: 'Inspect page',
      description:
        'Open a page and return a tree summary plus a screenshot. Call this before measure, find_issues, screenshot, or screenshot_annotated. Returns status "awaiting_user" when Playwright is unavailable.',
      inputSchema: {
        url: z.string().url(),
        viewport,
        screenshot: z.boolean().optional().describe('Set false to skip the image'),
      },
    },
    async (input) => guard(() => inspectTool(input)),
  )

  server.registerTool(
    'measure',
    {
      title: 'Measure element',
      description:
        'Return the box model, computed styles, and gaps to neighbours for one element. Accepts a CSS selector or a structural selector returned by find_issues. Call inspect first.',
      inputSchema: {
        selector: z
          .string()
          .min(1)
          .describe('CSS selector or a structural selector returned by find_issues'),
      },
    },
    async (input) => guard(() => measureTool(input)),
  )

  server.registerTool(
    'find_issues',
    {
      title: 'Find issues',
      description:
        'Run the rule engine on the open page and return violations with selector, actual, expected, severity, and autoFix. Call inspect first.',
      inputSchema: {
        rules: z
          .array(z.string())
          .optional()
          .describe(`Rules to run. Default: all. Valid: ${RULE_IDS.join(', ')}`),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Maximum issues to return (default 50)'),
      },
    },
    async (input) => guard(() => findIssuesTool(input)),
  )

  server.registerTool(
    'screenshot',
    {
      title: 'Screenshot',
      description: 'Capture a PNG of the viewport or of one element. Call inspect first.',
      inputSchema: {
        selector: z.string().min(1).optional().describe('Capture only this element'),
        fullPage: z
          .boolean()
          .optional()
          .describe('Capture the full scrollable page (ignored when selector is set)'),
      },
    },
    async (input) => guard(() => screenshotTool(input)),
  )

  server.registerTool(
    'screenshot_annotated',
    {
      title: 'Annotated screenshot',
      description:
        'Render the measurement overlay (grid, guides, gaps, issue boxes with severity and actual → expected labels) and capture a viewport PNG. Call inspect first.',
      inputSchema: {
        selector: z
          .string()
          .min(1)
          .optional()
          .describe('Scroll this element into view before capturing'),
        rules: z.array(z.string()).optional().describe('Annotate only these rules. Default: all'),
      },
    },
    async (input) => guard(() => screenshotAnnotatedTool(input)),
  )

  const shutdown = (): void => {
    void closeSession().finally(() => process.exit(0))
  }

  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  // The client closes stdin when the session ends; do not leave Chrome behind.
  process.stdin.once('end', shutdown)
  process.stdin.once('close', shutdown)

  // stdout carries the protocol. Every log must go to stderr.
  await server.connect(new StdioServerTransport())
  console.error(`[litedesign] MCP server v${VERSION} ready (stdio)`)
}
