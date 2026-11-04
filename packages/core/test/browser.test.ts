import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const dist = path.join(root, 'packages/core/dist/core.iife.js')

const candidates = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((value): value is string => Boolean(value))

const executable = candidates.find((candidate) => existsSync(candidate))
const available = executable !== undefined && existsSync(dist)

const suite = available ? describe : describe.skip

type Measured = {
  nodes: Array<{ id: string; text: string }>
  gaps: Array<{ distance: number; kind: string; axis: string }>
  issues: Array<{ rule: string; selector: string }>
}

suite('browser geometry', () => {
  let browser: Browser | undefined

  beforeAll(async () => {
    browser = await chromium.launch({
      executablePath: executable,
      args: ['--no-sandbox'],
    })
  })

  afterAll(async () => {
    await browser?.close()
  })

  async function measure(name: string): Promise<Measured> {
    if (browser === undefined) throw new Error('browser not started')

    const page = await browser.newPage()
    await page.goto(`file://${path.join(root, 'fixtures', name)}`)
    await page.addScriptTag({ path: dist })

    const result = await page.evaluate(() => {
      const core = (
        window as unknown as { __litedesign: { buildGraph: (root: Element) => unknown } }
      ).__litedesign

      return core.buildGraph(document.body)
    })

    await page.close()
    return result as Measured
  }

  it('measures an 8px flex gap within 1px', async () => {
    const measured = await measure('three-column.html')

    const matching = measured.gaps.filter(
      (gap) => gap.kind === 'sibling' && Math.abs(gap.distance - 8) <= 1,
    )

    expect(matching.length).toBeGreaterThanOrEqual(2)
  })

  it('reports the near miss in a misaligned layout', async () => {
    const measured = await measure('misaligned.html')

    expect(measured.issues.some((item) => item.rule === 'alignment-near-miss')).toBe(true)
  })

  it('does not shift layout when the overlay mounts', async () => {
    if (browser === undefined) throw new Error('browser not started')

    const page = await browser.newPage()
    await page.goto(`file://${path.join(root, 'fixtures', 'three-column.html')}`)
    await page.addScriptTag({ path: dist })

    const size = () =>
      page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      }))

    const before = await size()

    await page.evaluate(() => {
      const core = (
        window as unknown as {
          __litedesign: {
            buildGraph: (root: Element) => unknown
            render: (graph: unknown) => unknown
          }
        }
      ).__litedesign

      core.render(core.buildGraph(document.body))
    })

    const after = await size()
    await page.close()

    expect(after).toEqual(before)
  })
})
