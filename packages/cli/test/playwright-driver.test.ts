import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PlaywrightDriver } from '../src/drivers/playwright.js'
import { pngSize } from '../src/mcp/format.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../../..')
const corePath = path.join(root, 'packages/core/dist/core.iife.js')

const fixture = (name: string): string => pathToFileURL(path.join(root, 'fixtures', name)).href

const candidates = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter((value): value is string => Boolean(value))

const systemChrome = candidates.find((candidate) => existsSync(candidate))
const bundledChrome = chromium.executablePath()
const available = (systemChrome !== undefined || existsSync(bundledChrome)) && existsSync(corePath)

const suite = available ? describe : describe.skip

suite('Playwright driver', () => {
  let driver: PlaywrightDriver | undefined

  function current(): PlaywrightDriver {
    if (driver === undefined) throw new Error('driver not started')
    return driver
  }

  beforeAll(async () => {
    const playwright = await import('playwright-core')
    driver = new PlaywrightDriver(playwright, { corePath })
  })

  afterAll(async () => {
    await driver?.close()
  })

  it('builds a graph from the live page', async () => {
    await current().open(fixture('three-column.html'), { w: 1280, h: 800 })
    const graph = await current().graph()

    expect(graph.viewport).toEqual({ w: 1280, h: 800 })
    expect(graph.nodes.length).toBeGreaterThan(3)
    expect(
      graph.gaps.some((gap) => gap.kind === 'sibling' && Math.abs(gap.distance - 8) <= 1),
    ).toBe(true)
  })

  it('measures by CSS selector and by structural selector', async () => {
    await current().open(fixture('three-column.html'))
    const measured = await current().measure('.row > div')

    expect(measured.tag).toBe('div')
    expect(measured.styles.padding).toBe('16px')
    expect(measured.gaps.length).toBeGreaterThan(0)

    const byId = await current().measure(measured.id)
    expect(byId.id).toBe(measured.id)
  })

  it('filters issues by rule', async () => {
    await current().open(fixture('misaligned.html'))

    const all = await current().issues()
    expect(all.length).toBeGreaterThan(0)

    const alignment = await current().issues(['alignment-near-miss'])
    expect(alignment.length).toBeGreaterThan(0)
    expect(alignment.every((issue) => issue.rule === 'alignment-near-miss')).toBe(true)

    const spacing = await current().issues(['spacing-scale'])
    expect(spacing).toEqual([])
  })

  it('captures plain and annotated screenshots', async () => {
    await current().open(fixture('misaligned.html'))

    const plain = await current().screenshot()
    expect(plain.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')

    const annotated = await current().annotate({ rules: ['alignment-near-miss'] })
    expect(annotated.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(pngSize(annotated)).toEqual(pngSize(plain))
  })

  it('reports an actionable error for an unknown selector', async () => {
    await current().open(fixture('three-column.html'))
    await expect(current().measure('.does-not-exist')).rejects.toThrow(/did not match/)
  })
})
