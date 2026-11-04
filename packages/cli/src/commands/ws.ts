import { readConfig } from '../config.js'
import { runDaemon, startDaemon, stopDaemon, wsStatus } from '../ws.js'

const HELP = `
  Usage:
    litedesign ws start      start the bridge in the background
    litedesign ws stop       stop the bridge
    litedesign ws status     show whether it runs and what is connected
    litedesign ws run        run it in the foreground (used by start)
`

export async function wsCommand(argv: string[]): Promise<void> {
  const [action, ...rest] = argv
  const port = portFrom(rest) ?? (await readConfig()).port

  switch (action) {
    case undefined:
    case 'help':
    case '--help':
      console.log(HELP)
      return
    case 'run':
      await runDaemon(port)
      return
    case 'start': {
      const state = await startDaemon(port)
      const pid = state.pid > 0 ? ` · pid ${state.pid}` : ''
      console.log(`  bridge running · ws://127.0.0.1:${state.port}${pid}`)
      return
    }
    case 'stop': {
      const stopped = await stopDaemon()
      console.log(stopped ? '  bridge stopped' : '  bridge was not running')
      return
    }
    case 'status':
      await printStatus(port)
      return
    default:
      throw new Error(`unknown ws command: ${action}. Try: litedesign ws --help`)
  }
}

async function printStatus(port: number): Promise<void> {
  const status = await wsStatus(port)

  if (!status.running) {
    console.log(`  bridge stopped · port ${port}`)
    return
  }

  const pid = status.pid === undefined ? '' : ` · pid ${status.pid}`
  const extensions = status.extensions ?? 0
  const pages = status.pages?.length ?? 0

  console.log(
    `  bridge running · ws://127.0.0.1:${status.port}${pid} · ${extensions} extension(s) · ${pages} page(s)`,
  )

  for (const page of status.pages ?? []) {
    console.log(`    tab ${page.tabId}  ${page.url}`)
  }
}

function portFrom(args: string[]): number | undefined {
  const index = args.indexOf('--port')
  if (index === -1) return undefined

  const value = Number(args[index + 1])
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : undefined
}
