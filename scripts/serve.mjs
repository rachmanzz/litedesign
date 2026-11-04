import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'

/**
 * Static server for the fixtures, so the extension can be tested over http
 * instead of `file://` (which needs the "Allow access to file URLs" toggle).
 *
 *   pnpm fixtures            -> http://127.0.0.1:4173/fixtures/demo.html
 *   PORT=5000 pnpm fixtures
 *
 * HTML is served with a small script that polls the file's mtime and reloads
 * when it changes, so an edit shows up without a manual refresh.
 */

const ROOT = process.cwd()
const PORT = Number(process.env.PORT ?? 4173)
const RELOAD_POLL_MS = 400

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

/**
 * Reloads the page when the file's mtime differs from the one this response was
 * built from. Baking the value in means a save during the first poll is still
 * noticed, instead of being taken as the starting point.
 */
function reloadScript(mtime) {
  return `
<script>
  (() => {
    const target = location.pathname + location.search
    let seen = ${mtime}

    setInterval(async () => {
      try {
        const response = await fetch('/__mtime?path=' + encodeURIComponent(target), {
          cache: 'no-store',
        })
        if (!response.ok) return

        const { mtime } = await response.json()
        if (mtime !== seen) location.reload()
      } catch {
        // The server is restarting; the next tick tries again.
      }
    }, ${RELOAD_POLL_MS})
  })()
</script>
`
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1')

  if (url.pathname === '/__mtime') {
    await sendMtime(url.searchParams.get('path') ?? '/', response)
    return
  }

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

  const type = TYPES[path.extname(file)] ?? 'application/octet-stream'
  response.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' })

  if (!type.startsWith('text/html')) {
    createReadStream(file).pipe(response)
    return
  }

  response.end(withReload(await readFile(file, 'utf8'), info.mtimeMs))
}).listen(PORT, '127.0.0.1', () => {
  console.log(`fixtures on http://127.0.0.1:${PORT}/fixtures/demo.html`)
})

async function sendMtime(target, response) {
  const file = path.join(ROOT, decodeURIComponent(target))

  if (!file.startsWith(ROOT)) {
    response.writeHead(403).end('forbidden')
    return
  }

  const info = await stat(file).catch(() => null)

  response.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify({ mtime: info?.mtimeMs ?? 0 }))
}

/** Adds the reload script just before `</body>`, or at the end when there is none. */
function withReload(html, mtime) {
  const script = reloadScript(mtime)
  const index = html.toLowerCase().lastIndexOf('</body>')

  if (index === -1) return html + script
  return html.slice(0, index) + script + html.slice(index)
}
