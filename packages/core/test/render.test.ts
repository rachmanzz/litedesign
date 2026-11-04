import { describe, expect, it } from 'vitest'
import {
  dimStyle,
  focusedGuides,
  gridBackground,
  outlineStyle,
  parseRadius,
  radiusGeometry,
} from '../src/render/layers.js'
import type { Graph } from '../src/types.js'

function graphWith(guides: Graph['guides']): Graph {
  return { nodes: [], gaps: [], guides, issues: [], truncated: false } as unknown as Graph
}

describe('gridBackground', () => {
  it('draws vertical lines from a left-to-right gradient at the step distance', () => {
    const css = gridBackground(24, 'vertical')

    expect(css).toContain('to right')
    expect(css).toContain('24px')
    expect(css).not.toContain('to bottom')
  })

  it('draws horizontal lines from a top-to-bottom gradient', () => {
    const css = gridBackground(32, 'horizontal')

    expect(css).toContain('to bottom')
    expect(css).toContain('32px')
    expect(css).not.toContain('to right')
  })

  it('layers both gradients for the full grid', () => {
    const css = gridBackground(8, 'both')

    expect(css).toContain('to right')
    expect(css).toContain('to bottom')
  })
})

describe('dimStyle and outlineStyle', () => {
  const rect = { x: 120, y: 340, w: 200, h: 80 }
  const scroll = { x: 20, y: 300 }

  it('places both holes at the same position so the layers never drift', () => {
    const dim = dimStyle(rect, scroll)
    const outline = outlineStyle(rect, scroll)

    for (const part of ['left:100px', 'top:40px', 'width:200px', 'height:80px']) {
      expect(dim).toContain(part)
      expect(outline).toContain(part)
    }
  })

  it('dims everything around the hole with a single box-shadow, no border', () => {
    const dim = dimStyle(rect, scroll)

    expect(dim).toContain('box-shadow:0 0 0 9999px rgba(15, 23, 42, 0.55)')
    expect(dim).not.toContain('border')
  })

  it('outlines the target with a border, no dim', () => {
    const outline = outlineStyle(rect, scroll)

    expect(outline).toContain('border:2px solid #3b82f6')
    expect(outline).not.toContain('box-shadow')
  })
})

describe('focusedGuides', () => {
  const graph = graphWith([
    { axis: 'x', edge: 'left', value: 10, members: ['a', 'b'] },
    { axis: 'x', edge: 'right', value: 210, members: ['c'] },
    { axis: 'y', edge: 'top', value: 40, members: ['a', 'c'] },
  ])
  const focused = { id: 'a' } as unknown as Graph['nodes'][number]

  it('draws every guide when nothing is focused', () => {
    expect(focusedGuides(graph, null)).toHaveLength(3)
  })

  it('draws only the groups the focused node belongs to', () => {
    const guides = focusedGuides(graph, focused)

    expect(guides).toHaveLength(2)
    expect(guides.every((guide) => guide.members.includes('a'))).toBe(true)
  })

  it('draws nothing for a node outside every alignment group', () => {
    const loner = { id: 'zz' } as unknown as Graph['nodes'][number]

    expect(focusedGuides(graph, loner)).toEqual([])
  })
})

describe('parseRadius', () => {
  const box = { w: 100, h: 100 }

  it('reads one value into four corners', () => {
    expect(parseRadius('24px', box)).toEqual({ tl: 24, tr: 24, br: 24, bl: 24 })
  })

  it('maps the CSS shorthand order tl tr br bl', () => {
    expect(parseRadius('8px 16px 24px 32px', box)).toEqual({
      tl: 8,
      tr: 16,
      br: 24,
      bl: 32,
    })
  })

  it('mirrors two and three value shorthands', () => {
    expect(parseRadius('8px 16px', box)).toEqual({ tl: 8, tr: 16, br: 8, bl: 16 })
    // Three values: the middle one serves both tr and bl.
    expect(parseRadius('8px 16px 24px', box)).toEqual({ tl: 8, tr: 16, br: 24, bl: 16 })
  })

  it('resolves percent from the box so a pill reads as its real radius', () => {
    expect(parseRadius('50%', box)).toEqual({ tl: 50, tr: 50, br: 50, bl: 50 })
  })

  it('clamps a radius larger than half the shorter side, like the browser', () => {
    expect(parseRadius('80px', { w: 100, h: 40 })).toEqual({ tl: 20, tr: 20, br: 20, bl: 20 })
  })

  it('allows a zero corner next to rounded ones', () => {
    expect(parseRadius('8px 0', box)).toEqual({ tl: 8, tr: 0, br: 8, bl: 0 })
  })

  it('rejects empty, elliptical, and non-length values', () => {
    expect(parseRadius('', box)).toBeNull()
    expect(parseRadius('8px / 16px', box)).toBeNull()
    expect(parseRadius('var(--r)', box)).toBeNull()
    expect(parseRadius('auto', box)).toBeNull()
  })
})

describe('radiusGeometry', () => {
  const rect = { x: 0, y: 0, w: 100, h: 100 }
  const even = { tl: 8, tr: 8, br: 8, bl: 8 }

  it('draws each corner arc from its horizontal tangent to its vertical one', () => {
    const marks = radiusGeometry(rect, even)

    expect(marks.map((mark) => mark.arc)).toEqual([
      'M 8 0 A 8 8 0 0 0 0 8',
      'M 92 0 A 8 8 0 0 1 100 8',
      'M 92 100 A 8 8 0 0 0 100 92',
      'M 8 100 A 8 8 0 0 1 0 92',
    ])
  })

  it('runs each tangent from the sharp corner to the tangent point', () => {
    const marks = radiusGeometry(rect, even)

    expect(marks[0]?.tangents).toEqual([
      [0, 0, 8, 0],
      [0, 0, 0, 8],
    ])
  })

  it('reports the effective radius per corner', () => {
    const marks = radiusGeometry(rect, { tl: 8, tr: 16, br: 8, bl: 16 })

    expect(marks.map((mark) => mark.radius)).toEqual([8, 16, 8, 16])
    expect(marks.map((mark) => mark.corner)).toEqual(['tl', 'tr', 'br', 'bl'])
  })

  it('skips corners below the drawable minimum', () => {
    const marks = radiusGeometry(rect, { tl: 2, tr: 8, br: 2, bl: 8 })

    expect(marks.map((mark) => mark.corner)).toEqual(['tr', 'bl'])
  })

  it('draws nothing when every corner is square', () => {
    expect(radiusGeometry(rect, { tl: 0, tr: 0, br: 0, bl: 0 })).toEqual([])
  })
})
