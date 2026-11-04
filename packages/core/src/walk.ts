import { MAX_NODES, OVERLAY_HOST_ID } from './constants.js'

export type WalkEntry = {
  el: Element
  /** Structural path, built from the parent path instead of re-walking the DOM. */
  id: string
  depth: number
  /** Index of the nearest included ancestor, or -1 for the root. */
  parent: number
}

const SKIP_TAGS = new Set([
  'script',
  'style',
  'link',
  'meta',
  'noscript',
  'template',
  'head',
  'title',
  'base',
])

const SHADOW_MARKER = ':host'

/**
 * Structural path, stable across renders as long as sibling order does not
 * change. Not a valid CSS selector across a shadow boundary, which is why the
 * boundary is marked explicitly instead of pretending it is one.
 */
export function pathOf(el: Element): string {
  const parts: string[] = []
  let cur: Element | null = el

  while (cur !== null) {
    const parent: Element | null = cur.parentElement

    if (parent !== null) {
      const index = Array.prototype.indexOf.call(parent.children, cur) + 1
      parts.unshift(`${cur.tagName.toLowerCase()}:nth-child(${index})`)
      cur = parent
      continue
    }

    const host = shadowHostOf(cur)
    if (host === null) break
    parts.unshift(SHADOW_MARKER)
    cur = host
  }

  return parts.length > 0 ? parts.join(' > ') : el.tagName.toLowerCase()
}

function shadowHostOf(el: Element): Element | null {
  const root = el.getRootNode() as { host?: Element }
  return root.host ?? null
}

/**
 * Depth-first walk that returns the elements worth measuring.
 *
 * Elements without a box are not measured, but their children still are: an
 * absolutely positioned child of a zero-height wrapper is real layout. The same
 * applies to `display: contents`. Paths still include the skipped element, so
 * they stay unique.
 */
export function collectElements(root: Element, maxNodes = MAX_NODES): WalkEntry[] {
  const entries: WalkEntry[] = []
  const rootPath = pathOf(root)

  const visit = (
    el: Element,
    parent: number,
    depth: number,
    index: number,
    boundary: boolean,
    parentPath: string | null,
  ): void => {
    if (entries.length >= maxNodes) return
    if (el.id === OVERLAY_HOST_ID) return

    const tag = el.tagName.toLowerCase()
    if (SKIP_TAGS.has(tag)) return
    if (!isVisible(el)) return

    const marker = boundary ? ` ${SHADOW_MARKER} > ` : ' > '
    const id = parentPath === null ? rootPath : `${parentPath}${marker}${tag}:nth-child(${index})`

    let self = parent

    const rect = el.getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) {
      entries.push({ el, id, depth, parent })
      self = entries.length - 1
    }

    const children = Array.from(el.children)
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      if (child !== undefined) visit(child, self, depth + 1, i + 1, false, id)
    }

    const shadow = el.shadowRoot
    if (shadow !== null) {
      const shadowChildren = Array.from(shadow.children)
      for (let i = 0; i < shadowChildren.length; i++) {
        const child = shadowChildren[i]
        if (child !== undefined) visit(child, self, depth + 1, i + 1, true, id)
      }
    }
  }

  visit(root, -1, 0, 0, false, null)
  return entries
}

/**
 * `checkVisibility` skips `display: none` without building a
 * CSSStyleDeclaration, which halves the style reads per node. Elements with
 * `visibility: hidden` still occupy layout, so they stay measured.
 */
function isVisible(el: Element): boolean {
  if (typeof el.checkVisibility === 'function') return el.checkVisibility()
  return getComputedStyle(el).display !== 'none'
}
