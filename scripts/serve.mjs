import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

/**
 * Static server for the fixtures, so the extension can be tested over http
 * instead of `file://` (which needs the "Allow access to file URLs" toggle).
 *
 *   pnpm fixtures            -> http://127.0.0.1:4173/fixtures/demo.html
 *   PORT=5000 pnpm fixtures
 */

const ROOT = process.cwd()
const PORT = Number(process.env.PORT ?? 4173)

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')
  const relative = decodeURIComponent(url.pathname)
  const file = path.join(ROOT, relative)

  // Never serve anything outside the repository.
  if (!file.startsWith(ROOT)) {
    response.writeHead(403).end('forbidden')
    return
  }

  const info = await stat(file).catch(() => null)

  if (info === null || !info.isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end(`not found: ${relative}`)
    return
  }

  response.writeHead(200, {
    'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  })
  createReadStream(file).pipe(response)
}).listen(PORT, '127.0.0.1', () => {
  console.log(`fixtures on http://127.0.0.1:${PORT}/fixtures/demo.html`)
})
