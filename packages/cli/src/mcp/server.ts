import { VERSION } from '../version.js'

function handoffMessage(url: string): string {
  return [
    `Buka ${url} lalu klik ikon litedesign di toolbar Chrome.`,
    '',
    'Kalau ikonnya tidak ada:',
    '- pastikan extension sudah di-load unpacked di chrome://extensions',
    '- pastikan tab yang aktif adalah tab halaman tersebut',
    '',
    'Saya menunggu halaman itu terhubung.',
  ].join('\n')
}

async function detectPlaywright(): Promise<boolean> {
  // `playwright` membawa `playwright-core` sebagai dependensi, jadi memeriksa
  // yang kedua sudah cukup untuk mendeteksi keduanya.
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
      description: 'Versi server dan driver yang tersedia.',
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
        'Buka halaman dan kembalikan ringkasan tree + screenshot. Kalau tidak ada driver yang bisa membuka halaman, mengembalikan status awaiting_user berisi instruksi untuk manusia.',
      inputSchema: { url: z.string().url() },
    },
    async ({ url }) => {
      const playwright = await detectPlaywright()

      const payload = playwright
        ? {
            status: 'not_implemented',
            url,
            message:
              'Driver playwright terdeteksi, tetapi pengambilan graph belum diimplementasikan (M3).',
          }
        : { status: 'awaiting_user', url, message: handoffMessage(url) }

      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      }
    },
  )

  // stdout dipakai protokol. Semua log harus lewat stderr.
  await server.connect(new StdioServerTransport())
  console.error(`[litedesign] MCP server v${VERSION} siap (stdio)`)
}
