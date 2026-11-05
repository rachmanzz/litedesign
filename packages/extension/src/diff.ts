import type { Graph } from './types.js'

/**
 * Cheap content signature per node. Rects and styles are left out on purpose:
 * one text edit shifts every measurement below it, and flagging all of those
 * as "changed" is noise, not signal.
 */
export function signatures(graph: Graph): Map<string, string> {
  const map = new Map<string, string>()
  for (const node of graph.nodes) map.set(node.id, `${node.tag}|${node.text}`)
  return map
}

/**
 * Ids whose content appeared or changed, in document order. A node that only
 * disappeared has no element left to spotlight, so it is ignored here; the
 * focus-clearing rule for a vanished focus target already lives in boot.
 */
export function changedIds(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): string[] {
  const changed: string[] = []
  for (const [id, signature] of after) {
    if (before.get(id) !== signature) changed.push(id)
  }
  return changed
}
