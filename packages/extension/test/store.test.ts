import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultLayers, loadLayers, saveLayers } from '../src/store.js'

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
  it('returns defaults when chrome is absent', async () => {
    expect(await loadLayers()).toEqual(defaultLayers())
  })

  it('drops unknown layers and always keeps hover', async () => {
    stubStorage({
      get: async () => ({ litedesign: { layers: ['grid', 'nope'] } }),
    })
    expect(await loadLayers()).toEqual(['grid', 'hover'])
  })

  it('falls back to defaults when the stored value is malformed', async () => {
    stubStorage({ get: async () => ({ litedesign: 'nope' }) })
    expect(await loadLayers()).toEqual(defaultLayers())
  })

  it('writes the layer list under one key', async () => {
    const set = vi.fn(async () => {})
    stubStorage({ set })

    await saveLayers(['grid', 'hover'])

    expect(set).toHaveBeenCalledWith({ litedesign: { layers: ['grid', 'hover'] } })
  })

  it('keeps working when storage rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubStorage({
      get: async () => {
        throw new Error('denied')
      },
    })

    expect(await loadLayers()).toEqual(defaultLayers())
    expect(warn).toHaveBeenCalled()
  })
})
