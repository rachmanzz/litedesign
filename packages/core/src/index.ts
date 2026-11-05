export { EDGES, findGuides } from './align.js'
export * from './color.js'
export { GRID_STEP, MAX_MARKERS, MAX_NODES, OVERLAY_HOST_ID, SPACING_SCALE } from './constants.js'
export { findGaps, findSiblingGaps, findVisualGaps } from './gaps.js'
export * from './geometry.js'
export { buildGraph, resolveNode } from './graph.js'
export { LAYERS, type LayerName } from './render/layers.js'
export {
  type GridConfig,
  type MarkInput,
  type OverlayHandle,
  type OverlayOptions,
  render,
} from './render/overlay.js'
export { defaultRules, findIssues, RULE_IDS, type Rule } from './rules/index.js'
export * from './types.js'
export { pathOf } from './walk.js'

export const VERSION = '0.2.2'
