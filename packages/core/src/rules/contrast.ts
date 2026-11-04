import { blend, contrastRatio, parseColor, type Rgba } from '../color.js'
import type { GraphNode, Issue } from '../types.js'
import { defineRule, issue } from './rule.js'

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 }

const NORMAL_MINIMUM = 4.5
const LARGE_MINIMUM = 3

/**
 * WCAG contrast for every element that owns text. The background is resolved by
 * walking the parent chain in the graph, so the rule never touches the DOM.
 */
export const contrastMinimum = defineRule('contrast', (graph) => {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const issues: Issue[] = []

  for (const node of graph.nodes) {
    if (node.text === '') continue

    const foreground = parseColor(node.styles.color)
    if (foreground === null) continue

    const background = backgroundOf(node, byId)
    const ratio = contrastRatio(blend(foreground, background), background)
    const minimum = isLargeText(node) ? LARGE_MINIMUM : NORMAL_MINIMUM

    if (ratio >= minimum) continue

    issues.push(
      issue({
        rule: 'contrast',
        selector: node.id,
        severity: 'P1',
        kind: 'violation',
        actual: `${Math.round(ratio * 100) / 100}:1`,
        expected: `>= ${minimum}:1`,
        autoFix: false,
      }),
    )
  }

  return issues
})

function isLargeText(node: GraphNode): boolean {
  const size = Number.parseFloat(node.styles.fontSize)
  const weight = Number.parseInt(node.styles.fontWeight, 10)

  if (!Number.isFinite(size)) return false

  return size >= 24 || (size >= 18.66 && weight >= 700)
}

/**
 * Composite every background from the nearest ancestor up to the first opaque
 * one, then fall back to white.
 */
function backgroundOf(node: GraphNode, byId: Map<string, GraphNode>): Rgba {
  const layers: Rgba[] = []
  let current: GraphNode | undefined = node

  while (current !== undefined) {
    const color = parseColor(current.styles.backgroundColor)

    if (color !== null && color.a > 0) {
      layers.push(color)
      if (color.a === 1) break
    }

    current = current.parent === null ? undefined : byId.get(current.parent)
  }

  let background = WHITE

  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i]
    if (layer === undefined) continue
    background = blend(layer, background)
  }

  return background
}
