import { doctor } from './commands/doctor.js'
import { extensionCommand } from './commands/extension.js'
import { setup } from './commands/setup.js'
import { runMcpServer } from './mcp/server.js'
import { VERSION } from './version.js'

const HELP = `
  litedesign v${VERSION}

  Pemakaian:
    litedesign setup              siapkan extension + config
    litedesign extension path     cetak folder untuk Load unpacked
    litedesign extension update   salin ulang setelah upgrade
    litedesign doctor             cek node, extension, dan port
    litedesign mcp                jalankan MCP server (stdio)

  Opsi:
    -h, --help                    tampilkan bantuan
    -v, --version                 tampilkan versi
`

export async function run(argv: string[]): Promise<void> {
  const [command, ...rest] = argv

  switch (command) {
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      console.log(HELP)
      return
    case '-v':
    case '--version':
      console.log(VERSION)
      return
    case 'setup':
      await setup()
      return
    case 'extension':
      await extensionCommand(rest)
      return
    case 'doctor':
      await doctor()
      return
    case 'mcp':
      await runMcpServer()
      return
    default:
      throw new Error(`perintah tidak dikenal: ${command}. Coba: litedesign --help`)
  }
}
