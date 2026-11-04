import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { readConfig } from '../config.js'
import { CONFIG, EXT_DIR } from '../paths.js'
import { VERSION } from '../version.js'
import { wsStatus } from '../ws.js'

type Status = 'ok' | 'warn' | 'fail'

function line(status: Status, label: string, detail: string): void {
  const mark = status === 'ok' ? 'ok  ' : status === 'warn' ? 'warn' : 'fail'
  console.log(`  ${mark}  ${label.padEnd(12)} ${detail}`)
}

export async function doctor(): Promise<void> {
  console.log(`\n  litedesign doctor · v${VERSION}\n`)

  const major = Number(process.versions.node.split('.')[0])
  line(major >= 20 ? 'ok' : 'fail', 'node', `v${process.versions.node} (requires >= 20)`)

  const manifestPath = path.join(EXT_DIR, 'manifest.json')
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { version?: string }
    line('ok', 'extension', `${EXT_DIR} (v${manifest.version ?? '?'})`)
  } else {
    line('fail', 'extension', `missing at ${EXT_DIR} — run: litedesign setup`)
  }

  const { port, mode } = await readConfig()

  if (existsSync(CONFIG)) {
    line('ok', 'config', `port ${port}, mode ${mode}`)
  } else {
    line('warn', 'config', 'missing — run: litedesign setup')
  }

  const status = await wsStatus(port)
  line(
    status.running ? 'ok' : 'warn',
    'bridge',
    status.running
      ? `running on ${port} · ${status.extensions ?? 0} extension(s) · ${status.pages?.length ?? 0} page(s)`
      : `stopped — run: litedesign ws start`,
  )

  console.log('')
}
