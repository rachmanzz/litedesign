type GraphSummary = { nodes: unknown[] }

declare global {
  interface Window {
    __litedesign?: {
      buildGraph: (root?: Element | null) => GraphSummary
      VERSION: string
    }
    __litedesign_active__?: boolean
  }
}

const HOST_ID = '__litedesign_host__'
const ACTIVE = '__litedesign_active__'

function unmount(): void {
  document.getElementById(HOST_ID)?.remove()
  window[ACTIVE] = false
}

function mount(core: NonNullable<Window['__litedesign']>): void {
  const host = document.createElement('div')
  host.id = HOST_ID
  host.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:2147483647;contain:strict'

  const shadow = host.attachShadow({ mode: 'closed' })
  const badge = document.createElement('div')
  badge.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:16px',
    'padding:6px 10px',
    'border-radius:999px',
    'background:#111',
    'color:#fff',
    'font:12px/1.4 ui-monospace,monospace',
    'box-shadow:0 2px 8px rgba(0,0,0,.25)',
  ].join(';')

  shadow.append(badge)
  document.documentElement.append(host)

  const graph = core.buildGraph(document.body)
  badge.textContent = `litedesign · ${graph.nodes.length} node`
  window[ACTIVE] = true
}

const core = window.__litedesign

if (!core) {
  console.warn('[litedesign] core not found; core.iife.js must be injected first')
} else if (window[ACTIVE]) {
  unmount()
} else {
  mount(core)
}

export {}
