import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultLayers, loadState, saveState } from '../src/store.js'

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
    expect(await loadState()).toEqual({ enabled: false, layers: defaultLayers() })
  })

  it('drops unknown layers and always keeps hover', async () => {
    stubStorage({
      get: async () => ({ litedesign: { enabled: true, layers: ['grid', 'nope'] } }),
    })
    expect(await loadState()).toEqual({ enabled: true, layers: ['grid', 'hover'] })
  })

  it('reads a value written before the enabled flag existed as off', async () => {
    stubStorage({ get: async () => ({ litedesign: { layers: ['gap'] } }) })
    expect(await loadState()).toEqual({ enabled: false, layers: ['gap', 'hover'] })
  })

  it('falls back to defaults when the stored value is malformed', async () => {
    stubStorage({ get: async () => ({ litedesign: 'nope' }) })
    expect(await loadState()).toEqual({ enabled: false, layers: defaultLayers() })
  })

  it('writes the whole state under one key', async () => {
    const set = vi.fn(async () => {})
    stubStorage({ set })

    await saveState({ enabled: true, layers: ['grid', 'hover'] })

    expect(set).toHaveBeenCalledWith({ litedesign: { enabled: true, layers: ['grid', 'hover'] } })
  })

  it('keeps working when storage rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubStorage({
      get: async () => {
        throw new Error('denied')
      },
    })

    expect(await loadState()).toEqual({ enabled: false, layers: defaultLayers() })
    expect(warn).toHaveBeenCalled()
  })
})
