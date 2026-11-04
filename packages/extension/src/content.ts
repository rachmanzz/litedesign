import { boot } from './boot.js'
import type { Core } from './types.js'

const core: Core | undefined = window.__litedesign

if (core === undefined) {
  console.warn('[litedesign] core not found; core.iife.js must be injected first')
} else {
  void boot(core)
}
