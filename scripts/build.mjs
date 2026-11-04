import { chmod, cp, rm } from 'node:fs/promises'
import path from 'node:path'
import { build } from 'esbuild'

const root = process.cwd()
const at = (...segments) => path.join(root, ...segments)

const shared = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
}

async function clean() {
  for (const dir of ['packages/core/dist', 'packages/extension/dist', 'packages/cli/dist']) {
    await rm(at(dir), { recursive: true, force: true })
  }
}

async function buildCore() {
  await build({
    ...shared,
    entryPoints: [at('packages/core/src/index.ts')],
    format: 'iife',
    globalName: '__litedesign',
    target: 'chrome120',
    outfile: at('packages/core/dist/core.iife.js'),
  })

  await build({
    ...shared,
    entryPoints: [at('packages/core/src/index.ts')],
    format: 'esm',
    target: 'es2022',
    outfile: at('packages/core/dist/core.js'),
  })
}

async function buildExtension() {
  await build({
    ...shared,
    entryPoints: [at('packages/extension/src/sw.ts')],
    format: 'esm',
    target: 'chrome120',
    outfile: at('packages/extension/dist/sw.js'),
  })

  await build({
    ...shared,
    entryPoints: [at('packages/extension/src/content.ts')],
    format: 'iife',
    target: 'chrome120',
    outfile: at('packages/extension/dist/content.js'),
  })

  await build({
    ...shared,
    entryPoints: [at('packages/extension/src/popup.ts')],
    format: 'iife',
    target: 'chrome120',
    outfile: at('packages/extension/dist/popup.js'),
  })

  await cp(
    at('packages/extension/public/manifest.json'),
    at('packages/extension/dist/manifest.json'),
  )
  await cp(at('packages/extension/public/config.json'), at('packages/extension/dist/config.json'))
  await cp(at('packages/extension/public/popup.html'), at('packages/extension/dist/popup.html'))
  await cp(at('packages/core/dist/core.iife.js'), at('packages/extension/dist/core.iife.js'))
}

async function buildCli() {
  await build({
    ...shared,
    entryPoints: [at('packages/cli/src/index.ts')],
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: at('packages/cli/dist/index.js'),
    external: [
      '@modelcontextprotocol/sdk',
      '@modelcontextprotocol/sdk/*',
      'playwright',
      'playwright-core',
      'ws',
      'zod',
    ],
  })

  await chmod(at('packages/cli/dist/index.js'), 0o755)
  await cp(at('packages/extension/dist'), at('packages/cli/dist/extension'), { recursive: true })
}

await clean()
await buildCore()
await buildExtension()
await buildCli()

console.log('\nbuild done')
