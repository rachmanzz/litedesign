import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import path from 'node:path'
import { CONFIG, DEFAULT_PORT, EXT_DIR } from '../paths.js'
import { VERSION } from '../version.js'

type Status = 'ok' | 'warn' | 'fail'

function line(status: Status, label: string, detail: string): void {
  const mark = status === 'ok' ? 'ok  ' : status === 'warn' ? 'warn' : 'fail'
  console.log(`  ${mark}  ${label.padEnd(12)} ${detail}`)
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

export async function doctor(): Promise<void> {
  console.log(`\n  litedesign doctor · v${VERSION}\n`)

  const major = Number(process.versions.node.split('.')[0])
  line(major >= 20 ? 'ok' : 'fail', 'node', `v${process.versions.node} (butuh >= 20)`)

  const manifestPath = path.join(EXT_DIR, 'manifest.json')
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { version?: string }
    line('ok', 'extension', `${EXT_DIR} (v${manifest.version ?? '?'})`)
  } else {
    line('fail', 'extension', `tidak ada di ${EXT_DIR} — jalankan: litedesign setup`)
  }

  let port = DEFAULT_PORT
  let mode = 'auto'

  if (existsSync(CONFIG)) {
    const config = JSON.parse(await readFile(CONFIG, 'utf8')) as { port?: number; mode?: string }
    port = config.port ?? port
    mode = config.mode ?? mode
    line('ok', 'config', `port ${port}, mode ${mode}`)
  } else {
    line('warn', 'config', 'belum ada — jalankan: litedesign setup')
  }

  const free = await portFree(port)
  line(free ? 'ok' : 'warn', 'port', free ? `${port} bebas` : `${port} sedang dipakai`)

  console.log('')
}
