import { doctor } from './commands/doctor.js'
import { extensionCommand } from './commands/extension.js'
import { setup } from './commands/setup.js'
import { runMcpServer } from './mcp/server.js'
import { VERSION } from './version.js'

const HELP = `
  litedesign v${VERSION}

  Usage:
    litedesign setup              scaffold extension + config
    litedesign extension path     print the folder to load unpacked
    litedesign extension update   re-copy after an upgrade
    litedesign doctor             check node, extension, and port
    litedesign mcp                start the MCP server (stdio)

  Options:
    -h, --help                    show this help
    -v, --version                 show the version
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
      throw new Error(`unknown command: ${command}. Try: litedesign --help`)
  }
}
