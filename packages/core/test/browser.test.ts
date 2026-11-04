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

  it('resolves a measured element by its structural path', async () => {
    if (browser === undefined) throw new Error('browser not started')

    const page = await browser.newPage()
    await page.goto(`file://${path.join(root, 'fixtures', 'three-column.html')}`)
    await page.addScriptTag({ path: dist })

    const result = await page.evaluate(() => {
      const core = (
        window as unknown as {
          __litedesign: {
            buildGraph: (root: Element) => {
              nodes: Array<{ id: string; styles: { padding: string; margin: string; gap: string } }>
            }
            pathOf: (el: Element) => string
          }
        }
      ).__litedesign

      const graph = core.buildGraph(document.body)
      const row = document.querySelector('.row')
      const card = document.querySelector('.row > div')
      if (row === null || card === null) return null

      const rowNode = graph.nodes.find((node) => node.id === core.pathOf(row))
      const cardNode = graph.nodes.find((node) => node.id === core.pathOf(card))

      return {
        rowFound: rowNode !== undefined,
        cardFound: cardNode !== undefined,
        gap: rowNode?.styles.gap,
        padding: cardNode?.styles.padding,
        margin: cardNode?.styles.margin,
      }
    })

    await page.close()

    expect(result).toEqual({
      rowFound: true,
      cardFound: true,
      gap: '8px',
      padding: '16px',
      margin: '0px',
    })
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

  it('focuses a node, survives a stale focus, and never shifts layout', async () => {
    if (browser === undefined) throw new Error('browser not started')

    const page = await browser.newPage()
    await page.goto(`file://${path.join(root, 'fixtures', 'three-column.html')}`)
    await page.addScriptTag({ path: dist })

    const result = await page.evaluate(() => {
      type Node = { id: string; parent: string | null }
      type Handle = {
        setFocus(id: string | null): void
        update(graph: unknown): void
        destroy(): void
      }
      const core = (
        window as unknown as {
          __litedesign: {
            buildGraph: (root: Element) => { nodes: Node[] }
            render: (graph: unknown) => Handle
          }
        }
      ).__litedesign

      const size = () => ({
        w: document.documentElement.scrollWidth,
        h: document.documentElement.scrollHeight,
      })
      const before = size()

      const graph = core.buildGraph(document.body)
      const target = graph.nodes.find((node) => node.parent !== null)
      if (target === undefined) return null

      const handle = core.render(graph)
      handle.setFocus(target.id)
      const focused = size()

      // The edit that removed the focused node must release the focus.
      const reduced = { ...graph, nodes: graph.nodes.filter((node) => node.id !== target.id) }
      handle.update(reduced)
      handle.setFocus(null)
      const after = size()
      handle.destroy()

      return {
        focused: focused.w === before.w && focused.h === before.h,
        stable: after.w === before.w && after.h === before.h,
      }
    })

    await page.close()

    expect(result).toEqual({ focused: true, stable: true })
  })
})
