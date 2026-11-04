type Handle = {
  update(graph: unknown): void
  destroy(): void
}

type Core = {
  buildGraph(root?: Element | null): unknown
  render(graph: unknown): Handle
  VERSION: string
}

declare global {
  interface Window {
    __litedesign?: Core
    __litedesign_active__?: boolean
    __litedesign_handle__?: Handle
    __litedesign_onresize__?: () => void
  }
}

const ACTIVE = '__litedesign_active__'

/**
 * State lives on `window`, not in this module. Chrome may inject the script
 * again into the same tab, and a fresh module scope would forget the handle
 * while the overlay stays mounted.
 */
function unmount(): void {
  const onResize = window.__litedesign_onresize__
  if (onResize !== undefined) window.removeEventListener('resize', onResize)

  window.__litedesign_handle__?.destroy()
  window.__litedesign_handle__ = undefined
  window.__litedesign_onresize__ = undefined
  window[ACTIVE] = false
}

function mount(core: Core): void {
  const build = (): unknown => core.buildGraph(document.body)
  const handle = core.render(build())
  const onResize = (): void => handle.update(build())

  window.__litedesign_handle__ = handle
  window.__litedesign_onresize__ = onResize
  window.addEventListener('resize', onResize)
  window[ACTIVE] = true
}

const core = window.__litedesign

if (core === undefined) {
  console.warn('[litedesign] core not found; core.iife.js must be injected first')
} else if (window[ACTIVE]) {
  unmount()
} else {
  mount(core)
}

export {}
