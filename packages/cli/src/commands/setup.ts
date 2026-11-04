import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { BUNDLED_EXTENSION, CONFIG, DEFAULT_PORT, EXT_DIR, HOME } from '../paths.js'

export async function setup(): Promise<void> {
  const source = fileURLToPath(BUNDLED_EXTENSION)

  if (!existsSync(source)) {
    throw new Error(
      'extension assets missing from the package. Reinstall: npm i -g @rahmantech/litedesign',
    )
  }

  await mkdir(HOME, { recursive: true })
  await cp(source, EXT_DIR, { recursive: true, force: true })

  let configCreated = false
  if (!existsSync(CONFIG)) {
    await writeFile(
      CONFIG,
      `${JSON.stringify({ port: DEFAULT_PORT, mode: 'auto' }, null, 2)}\n`,
      'utf8',
    )
    configCreated = true
  }

  const config = JSON.parse(await readFile(CONFIG, 'utf8')) as { port?: number; mode?: string }

  console.log(`
  litedesign setup

  [1/3] extension   -> ${EXT_DIR}
  [2/3] config      -> ${CONFIG}${configCreated ? '' : ' (already exists)'}
  [3/3] done

  One manual step:

    1. open chrome://extensions
    2. enable Developer mode
    3. Load unpacked -> ${EXT_DIR}

  Register with your MCP client:

  {
    "mcpServers": {
      "litedesign": {
        "command": "litedesign",
        "args": ["mcp"]
      }
    }
  }

  port ${config.port ?? DEFAULT_PORT} · mode ${config.mode ?? 'auto'}
`)
}
