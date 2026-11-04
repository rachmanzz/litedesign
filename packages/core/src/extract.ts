import type { Box, GraphNode, Styles } from './types.js'

const MAX_TEXT = 80

export function extractNode(
  el: Element,
  id: string,
  parentId: string | null,
  depth: number,
): GraphNode {
  const rect = el.getBoundingClientRect()

  return {
    id,
    selector: id,
    tag: el.tagName.toLowerCase(),
    rect: {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      w: rect.width,
      h: rect.height,
    },
    box: readBox(el),
    text: readText(el),
    depth,
    parent: parentId,
    children: [],
    styles: readStyles(el),
  }
}

function readBox(el: Element): Box {
  return {
    scrollW: el.scrollWidth,
    scrollH: el.scrollHeight,
    clientW: el.clientWidth,
    clientH: el.clientHeight,
  }
}

function readText(el: Element): string {
  let text = ''

  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) text += node.textContent ?? ''
  }

  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT)
}

function readStyles(el: Element): Styles {
  const style = getComputedStyle(el)

  return {
    display: style.display,
    borderRadius: style.borderRadius,
    color: style.color,
    backgroundColor: style.backgroundColor,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    padding: style.padding,
    margin: style.margin,
    gap: style.gap,
  }
}
