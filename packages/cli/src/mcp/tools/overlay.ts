import { LAYERS, type LayerName } from '@litedesign/core'
import { ToolError } from '../errors.js'
import { type ToolResult, textResult } from '../result.js'
import { requirePage } from '../session.js'

export type OverlayInput = {
  enabled?: boolean
  layers?: string[]
  focus?: string | null
}

/**
 * Shows or hides the measurement overlay in the page the human is looking at.
 * This is how the agent puts the grid on screen without asking for a click.
 *
 * The answer comes from the page, not from the request: the tool reports the
 * state the page says it is in, so `shown` cannot be true while the grid is
 * not on screen.
 */
export async function overlayTool(input: OverlayInput): Promise<ToolResult> {
  const driver = requirePage()
  const enabled = input.enabled !== false
  const layers = parseLayers(input.layers)

  const result = await driver.overlay({ enabled, layers, focus: input.focus })

  return textResult({
    status: result.enabled ? 'shown' : 'hidden',
    layers: result.layers,
    focus: result.focus,
  })
}

function parseLayers(requested: string[] | undefined): LayerName[] | undefined {
  if (requested === undefined || requested.length === 0) return undefined

  const valid = new Set<string>(LAYERS)
  const unknown = requested.filter((name) => !valid.has(name))

  if (unknown.length > 0) {
    throw new ToolError(`unknown layer: ${unknown.join(', ')}. Valid layers: ${LAYERS.join(', ')}`)
  }

  return requested as LayerName[]
}
