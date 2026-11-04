import { VERSION } from '../version.js'

function handoffMessage(url: string): string {
  return [
    `Open ${url} and click the litedesign icon in the Chrome toolbar.`,
    '',
    'If the icon is missing:',
    '- make sure the extension is loaded unpacked at chrome://extensions',
    '- make sure the active tab is the page above',
    '',
    'I am waiting for that page to connect.',
  ].join('\n')
}

async function detectPlaywright(): Promise<boolean> {
  // `playwright` ships `playwright-core` as a dependency, so checking the
  // latter covers both.
  try {
    await import('playwright-core')
    return true
  } catch {
    return false
  }
}

export async function runMcpServer(): Promise<void> {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')
  const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js')
  const { z } = await import('zod')

  const server = new McpServer({ name: 'litedesign', version: VERSION })

  server.registerTool(
    'capabilities',
    {
      title: 'Capabilities',
      description: 'Server version and available drivers.',
      inputSchema: {},
    },
    async () => {
      const playwright = await detectPlaywright()
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                version: VERSION,
                drivers: { playwright, extension: true },
                defaultMode: 'auto',
              },
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  server.registerTool(
    'inspect',
    {
      title: 'Inspect page',
      description:
        'Open a page and return a tree summary plus a screenshot. When no driver can open the page, returns an awaiting_user status containing instructions for the human.',
      inputSchema: { url: z.string().url() },
    },
    async ({ url }) => {
      const playwright = await detectPlaywright()

      const payload = playwright
        ? {
            status: 'not_implemented',
            url,
            message:
              'Playwright driver detected, but graph extraction is not implemented yet (M3).',
          }
        : { status: 'awaiting_user', url, message: handoffMessage(url) }

      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      }
    },
  )

  // stdout carries the protocol. Every log must go to stderr.
  await server.connect(new StdioServerTransport())
  console.error(`[litedesign] MCP server v${VERSION} ready (stdio)`)
}
