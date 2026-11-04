import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_GRID, defaultLayers, loadState, saveState } from '../src/store.js'

type Local = {
  get(key: string): Promise<Record<string, unknown>>
  set(items: Record<string, unknown>): Promise<void>
}

function stubStorage(local: Partial<Local>): void {
  vi.stubGlobal('chrome', { storage: { local } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('preferences', () => {
  it('returns defaults and off when chrome is absent', async () => {
    expect(await loadState()).toEqual({
      enabled: false,
      layers: defaultLayers(),
      focus: null,
      grid: DEFAULT_GRID,
    })
  })

  it('drops unknown layers and always keeps hover', async () => {
    stubStorage({
      get: async () => ({ litedesign: { enabled: true, layers: ['grid', 'nope'] } }),
    })
    expect(await loadState()).toEqual({
      enabled: true,
      layers: ['grid', 'hover'],
      focus: null,
      grid: DEFAULT_GRID,
    })
  })

  it('reads a value written before the enabled flag existed as off', async () => {
    stubStorage({ get: async () => ({ litedesign: { layers: ['gap'] } }) })
    expect(await loadState()).toEqual({
      enabled: false,
      layers: ['gap', 'hover'],
      focus: null,
      grid: DEFAULT_GRID,
    })
  })

  it('keeps a stored focus selector', async () => {
    stubStorage({
      get: async () => ({
        litedesign: { enabled: true, layers: ['grid'], focus: 'main > h1' },
      }),
    })
    expect(await loadState()).toEqual({
      enabled: true,
      layers: ['grid', 'hover'],
      focus: 'main > h1',
      grid: DEFAULT_GRID,
    })
  })

  it('drops a malformed focus selector', async () => {
    stubStorage({
      get: async () => ({ litedesign: { enabled: true, layers: ['grid'], focus: 7 } }),
    })
    expect(await loadState()).toEqual({
      enabled: true,
      layers: ['grid', 'hover'],
      focus: null,
      grid: DEFAULT_GRID,
    })
  })

  it('keeps the stored grid step and axis', async () => {
    stubStorage({
      get: async () => ({
        litedesign: {
          enabled: true,
          layers: ['grid'],
          grid: { step: 32, axis: 'horizontal' },
        },
      }),
    })
    expect(await loadState()).toEqual({
      enabled: true,
      layers: ['grid', 'hover'],
      focus: null,
      grid: { step: 32, axis: 'horizontal' },
    })
  })

  it('falls back to the default grid when the stored one is malformed', async () => {
    stubStorage({
      get: async () => ({
        litedesign: { enabled: true, layers: ['grid'], grid: { step: 7, axis: 'diagonal' } },
      }),
    })
    expect(await loadState()).toEqual({
      enabled: true,
      layers: ['grid', 'hover'],
      focus: null,
      grid: DEFAULT_GRID,
    })
  })

  it('falls back to defaults when the stored value is malformed', async () => {
    stubStorage({ get: async () => ({ litedesign: 'nope' }) })
    expect(await loadState()).toEqual({
      enabled: false,
      layers: defaultLayers(),
      focus: null,
      grid: DEFAULT_GRID,
    })
  })

  it('writes the whole state under one key', async () => {
    const set = vi.fn(async () => {})
    stubStorage({ set })

    await saveState({
      enabled: true,
      layers: ['grid', 'hover'],
      focus: 'main > h1',
      grid: { step: 24, axis: 'both' },
    })

    expect(set).toHaveBeenCalledWith({
      litedesign: {
        enabled: true,
        layers: ['grid', 'hover'],
        focus: 'main > h1',
        grid: { step: 24, axis: 'both' },
      },
    })
  })

  it('keeps working when storage rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubStorage({
      get: async () => {
        throw new Error('denied')
      },
    })

    expect(await loadState()).toEqual({
      enabled: false,
      layers: defaultLayers(),
      focus: null,
      grid: DEFAULT_GRID,
    })
    expect(warn).toHaveBeenCalled()
  })
})
