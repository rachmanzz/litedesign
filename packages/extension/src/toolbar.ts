import { type LayerName, TOGGLE_LAYERS, type ToggleLayer } from './types.js'

export type ToolbarOptions = {
  layers: LayerName[]
  onToggle(layer: ToggleLayer, enabled: boolean): void
  onClose(): void
}

export type Toolbar = {
  element: HTMLElement
  setStats(nodes: number, issues: number, truncated: boolean): void
  setLayers(layers: LayerName[]): void
}

const STYLE = `
  .bar {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-radius: 10px;
    background: rgba(17, 17, 17, 0.94);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
    color: #e5e5e5;
    font: 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
    pointer-events: auto;
    user-select: none;
  }
  .brand {
    padding: 0 2px;
    color: #ffffff;
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .stats {
    padding: 0 4px;
    color: #a3a3a3;
    white-space: nowrap;
  }
  button {
    padding: 5px 8px;
    border: 0;
    border-radius: 6px;
    background: #262626;
    color: #d4d4d4;
    font: inherit;
    cursor: pointer;
  }
  button:hover {
    background: #404040;
  }
  button.on {
    background: #3b82f6;
    color: #ffffff;
  }
  button[data-action='close'] {
    padding: 5px 7px;
    background: transparent;
    color: #a3a3a3;
    font-size: 14px;
  }
  button[data-action='close']:hover {
    background: #404040;
    color: #ffffff;
  }
`

export function createToolbar(options: ToolbarOptions): Toolbar {
  const root = document.createElement('div')
  root.dataset.litedesignUi = ''

  const style = document.createElement('style')
  style.textContent = STYLE

  const bar = document.createElement('div')
  bar.className = 'bar'

  const brand = document.createElement('span')
  brand.className = 'brand'
  brand.textContent = 'litedesign'

  const stats = document.createElement('span')
  stats.className = 'stats'
  stats.textContent = 'measuring…'

  let enabled = new Set<LayerName>(options.layers)
  const isEnabled = (layer: ToggleLayer): boolean => enabled.has(layer)

  bar.append(brand, stats)

  const buttons = new Map<ToggleLayer, HTMLButtonElement>()

  for (const layer of TOGGLE_LAYERS) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.layer = layer
    button.textContent = layer
    button.title = `Toggle ${layer} layer`
    button.addEventListener('click', () => options.onToggle(layer, !isEnabled(layer)))

    buttons.set(layer, button)
    bar.append(button)
  }

  const close = document.createElement('button')
  close.type = 'button'
  close.dataset.action = 'close'
  close.textContent = '×'
  close.title = 'Close litedesign'
  close.setAttribute('aria-label', 'Close litedesign')
  close.addEventListener('click', () => options.onClose())

  bar.append(close)
  root.append(style, bar)

  const setLayers = (layers: LayerName[]): void => {
    enabled = new Set(layers)

    for (const [layer, button] of buttons) {
      const on = enabled.has(layer)
      button.setAttribute('aria-pressed', String(on))
      button.classList.toggle('on', on)
    }
  }

  setLayers(options.layers)

  return {
    element: root,
    setStats(nodes: number, issues: number, truncated: boolean): void {
      stats.textContent = `${nodes} nodes · ${issues} issues${truncated ? ' · truncated' : ''}`
    },
    setLayers,
  }
}
