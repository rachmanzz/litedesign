import type { Graph, GraphNode } from './types.js'

/**
 * Cheap content signature per node. Rects and styles are left out on purpose:
 * one text edit shifts every measurement below it, and flagging all of those
 * as "changed" is noise, not signal.
 */
export function signatureOf(node: GraphNode): string {
  return `${node.tag}|${node.text}`
}

export function nodeSignatures(graph: Graph): string[] {
  return graph.nodes.map(signatureOf)
}

/**
 * Nodes whose content was not present before, in document order. Matching is
 * by content signature, never by position: images and JS-inserted elements
 * shift sibling indexes between passes, so a positional id changes even when
 * nothing visible changed. A node that only disappeared has no element left
 * to spotlight and is ignored; clearing the focus of a vanished target
 * already lives in boot.
 */
export function changedNodes(before: readonly string[], after: Graph): GraphNode[] {
  const counts = new Map<string, number>()
  for (const signature of before) counts.set(signature, (counts.get(signature) ?? 0) + 1)

  const changed: GraphNode[] = []
  for (const node of after.nodes) {
    const signature = signatureOf(node)
    const seen = counts.get(signature) ?? 0
    if (seen > 0) counts.set(signature, seen - 1)
    else changed.push(node)
  }
  return changed
}
