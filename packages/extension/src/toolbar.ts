import {
  GRID_STEPS,
  type GridConfig,
  type LayerName,
  TOGGLE_LAYERS,
  type ToggleLayer,
} from './types.js'

export type ToolbarOptions = {
  layers: LayerName[]
  grid: GridConfig
  onToggle(layer: ToggleLayer, enabled: boolean): void
  /** The label button was clicked; the caller owns the marking mode. */
  onLabelToggle(): void
  /** The human changed the grid: which lines it draws or how far apart. */
  onGrid(config: GridConfig): void
  onClose(): void
}

export type Toolbar = {
  element: HTMLElement
  setStats(nodes: number, issues: number, truncated: boolean): void
  setLayers(layers: LayerName[]): void
  setGrid(grid: GridConfig): void
  /** Highlights the label button and hides its popup when marking ends. */
  setLabelMode(on: boolean): void
  /**
   * Shows the popup near the element being named. A non-empty `initial`
   * prefills and selects the text (rename mode); a `remove` callback shows
   * the × button (delete lives in the same popup).
   */
  askLabel(
    rect: { left: number; top: number; right: number; bottom: number },
    initial: string,
    commit: (text: string) => void,
    remove?: () => void,
  ): void
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
  .grid-group {
    display: flex;
    align-items: center;
    gap: 2px;
    padding-left: 6px;
    margin-left: 2px;
    border-left: 1px solid #404040;
  }
  .grid-group button {
    padding: 4px 5px;
    display: inline-flex;
    align-items: center;
  }
  .grid-group svg {
    display: block;
  }
  .grid-step {
    padding: 0 3px;
    color: #a3a3a3;
    font-variant-numeric: tabular-nums;
    min-width: 22px;
    text-align: center;
  }
  .label-popup {
    position: fixed;
    box-sizing: border-box;
    width: 164px;
    padding: 4px;
    border: 1px solid #d97706;
    border-radius: 8px;
    background: rgba(17, 17, 17, 0.96);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
    pointer-events: auto;
    align-items: center;
    gap: 4px;
    display: none;
  }
  .label-popup input {
    box-sizing: border-box;
    flex: 1;
    min-width: 0;
    padding: 4px 6px;
    border: 0;
    border-radius: 5px;
    background: #111111;
    color: #e5e5e5;
    font: inherit;
  }
  .label-popup button {
    padding: 4px 7px;
    border: 0;
    border-radius: 5px;
    background: #262626;
    color: #d4d4d4;
    font: inherit;
    cursor: pointer;
  }
  .label-popup button:hover {
    background: #7f1d1d;
    color: #ffffff;
  }
`

/** Box size of the label popup; placement math needs numbers, not the DOM. */
export const LABEL_INPUT = { width: 164, height: 34 }

/**
 * Where the label popup sits next to the element being named: above it when
 * there is room, otherwise below; horizontally clamped to the viewport, so an
 * element near the right edge opens its popup to the left.
 */
export function placeInput(
  rect: { left: number; top: number; right: number; bottom: number },
  viewport: { width: number; height: number },
): { left: number; top: number; above: boolean } {
  const margin = 8
  const gap = 8

  const left = Math.min(
    Math.max(rect.left, margin),
    Math.max(margin, viewport.width - LABEL_INPUT.width - margin),
  )
  const above = rect.top > LABEL_INPUT.height + gap * 2

  return { left, top: above ? rect.top - gap : rect.bottom + gap, above }
}

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

  const labelButton = document.createElement('button')
  labelButton.type = 'button'
  labelButton.dataset.action = 'label'
  labelButton.textContent = 'label'
  labelButton.title = 'Mark a part of the page with a name the agent can read'
  labelButton.addEventListener('click', () => options.onLabelToggle())

  // The popup lives outside the bar: it belongs to the element being named,
  // not to the toolbar. It holds the input and, in rename mode, the × that
  // removes the label.
  const popup = document.createElement('div')
  popup.className = 'label-popup'

  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = 'label name'

  const removeButton = document.createElement('button')
  removeButton.type = 'button'
  removeButton.textContent = '×'
  removeButton.title = 'Remove this label'
  removeButton.hidden = true

  let committing = false
  let commit: ((text: string) => void) | undefined
  let remove: (() => void) | undefined

  const closeInput = (): void => {
    popup.style.display = 'none'
  }

  // Preventing mousedown keeps the input focused, so the click lands on a
  // visible button instead of dying behind a popup hidden by its own blur.
  removeButton.addEventListener('mousedown', (event) => event.preventDefault())
  removeButton.addEventListener('click', () => {
    committing = true
    closeInput()
    remove?.()
  })

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      committing = true
      const value = input.value
      closeInput()
      commit?.(value)
    } else if (event.key === 'Escape') {
      closeInput()
    }
  })
  input.addEventListener('blur', () => {
    if (!committing) closeInput()
    committing = false
  })

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

  let grid: GridConfig = options.grid
  const gridButtons = new Map<GridConfig['axis'], HTMLButtonElement>()

  const line = (d: string): string =>
    `<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="${d}"/></svg>`

  const axes: Array<[GridConfig['axis'], string, string]> = [
    ['vertical', 'M3 1v10M9 1v10', 'Grid: vertical lines only'],
    ['horizontal', 'M1 3h10M1 9h10', 'Grid: horizontal lines only'],
    ['both', 'M3 1v10M9 1v10M1 3h10M1 9h10', 'Grid: both directions'],
  ]

  const gridGroup = document.createElement('span')
  gridGroup.className = 'grid-group'

  for (const [axis, path, title] of axes) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.axis = axis
    button.title = title
    button.innerHTML = line(path)
    button.addEventListener('click', () => {
      // The toolbar owns its own display state; the caller echoes it back
      // through setGrid when the change sticks.
      grid = { ...grid, axis }
      setGrid(grid)
      options.onGrid(grid)
    })

    gridButtons.set(axis, button)
    gridGroup.append(button)
  }

  const stepLabel = document.createElement('span')
  stepLabel.className = 'grid-step'

  const stepDown = document.createElement('button')
  stepDown.type = 'button'
  stepDown.dataset.axis = 'step-down'
  stepDown.textContent = '−'
  stepDown.title = 'Smaller grid spacing'
  stepDown.addEventListener('click', () => {
    const index = GRID_STEPS.indexOf(grid.step)
    if (index > 0) {
      grid = { ...grid, step: GRID_STEPS[index - 1] ?? grid.step }
      setGrid(grid)
      options.onGrid(grid)
    }
  })

  const stepUp = document.createElement('button')
  stepUp.type = 'button'
  stepUp.dataset.axis = 'step-up'
  stepUp.textContent = '+'
  stepUp.title = 'Larger grid spacing'
  stepUp.addEventListener('click', () => {
    const index = GRID_STEPS.indexOf(grid.step)
    if (index !== -1 && index < GRID_STEPS.length - 1) {
      grid = { ...grid, step: GRID_STEPS[index + 1] ?? grid.step }
      setGrid(grid)
      options.onGrid(grid)
    }
  })

  gridGroup.append(stepDown, stepLabel, stepUp)
  bar.append(labelButton, gridGroup)

  const close = document.createElement('button')
  close.type = 'button'
  close.dataset.action = 'close'
  close.textContent = '×'
  close.title = 'Close litedesign'
  close.setAttribute('aria-label', 'Close litedesign')
  close.addEventListener('click', () => options.onClose())

  bar.append(close)
  popup.append(input, removeButton)
  root.append(style, bar, popup)

  const setLayers = (layers: LayerName[]): void => {
    enabled = new Set(layers)

    for (const [layer, button] of buttons) {
      const on = enabled.has(layer)
      button.setAttribute('aria-pressed', String(on))
      button.classList.toggle('on', on)
    }
  }

  const setGrid = (next: GridConfig): void => {
    grid = next

    for (const [axis, button] of gridButtons) {
      const on = axis === grid.axis
      button.setAttribute('aria-pressed', String(on))
      button.classList.toggle('on', on)
    }

    stepLabel.textContent = String(grid.step)
  }

  setLayers(options.layers)
  setGrid(grid)

  return {
    element: root,
    setStats(nodes: number, issues: number, truncated: boolean): void {
      stats.textContent = `${nodes} nodes · ${issues} issues${truncated ? ' · truncated' : ''}`
    },
    setLayers,
    setGrid,
    setLabelMode(on: boolean): void {
      labelButton.classList.toggle('on', on)
      labelButton.setAttribute('aria-pressed', String(on))
      if (!on) closeInput()
    },
    askLabel(
      rect: { left: number; top: number; right: number; bottom: number },
      initial: string,
      fn: (text: string) => void,
      onRemove?: () => void,
    ): void {
      commit = fn
      remove = onRemove
      committing = false

      const placement = placeInput(rect, { width: window.innerWidth, height: window.innerHeight })

      popup.style.left = `${placement.left}px`
      popup.style.top = `${placement.top}px`
      popup.style.transform = placement.above ? 'translateY(-100%)' : 'none'
      removeButton.hidden = onRemove === undefined
      popup.style.display = 'flex'
      input.value = initial
      input.focus()
      if (initial !== '') input.select()
    },
  }
}
