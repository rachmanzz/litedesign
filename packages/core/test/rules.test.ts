import { describe, expect, it } from 'vitest'
import { alignmentNearMiss } from '../src/rules/alignment.js'
import { contrastMinimum } from '../src/rules/contrast.js'
import { overflowClipped } from '../src/rules/overflow.js'
import { radiusConsistency } from '../src/rules/radius.js'
import { spacingScale } from '../src/rules/spacing.js'
import type { Gap } from '../src/types.js'
import { graph, node } from './factory.js'

function gap(overrides: Partial<Gap> = {}): Gap {
  return { a: 'a', b: 'b', axis: 'x', distance: 10, kind: 'sibling', ...overrides }
}

describe('spacingScale', () => {
  it('reports a sibling gap that is off the 4px scale', () => {
    const issues = spacingScale(graph([], { gaps: [gap({ distance: 10 })] }))

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      rule: 'spacing-scale',
      actual: '10px',
      expected: '12px',
      autoFix: true,
    })
  })

  it('accepts gaps on the scale', () => {
    expect(spacingScale(graph([], { gaps: [gap({ distance: 8 })] }))).toEqual([])
  })

  it('ignores visual gaps', () => {
    expect(spacingScale(graph([], { gaps: [gap({ distance: 10, kind: 'visual' })] }))).toEqual([])
  })
})

describe('alignmentNearMiss', () => {
  it('reports edges that almost line up', () => {
    const nodes = [
      node('a', { x: 10, y: 0, w: 100, h: 50 }, { parent: 'root' }),
      node('b', { x: 13, y: 60, w: 100, h: 50 }, { parent: 'root' }),
    ]

    const issues = alignmentNearMiss(graph(nodes))

    expect(issues.some((item) => item.rule === 'alignment-near-miss')).toBe(true)
  })

  it('stays quiet when edges are already aligned', () => {
    const nodes = [
      node('a', { x: 10, y: 0, w: 100, h: 50 }, { parent: 'root' }),
      node('b', { x: 10, y: 60, w: 100, h: 50 }, { parent: 'root' }),
    ]

    expect(alignmentNearMiss(graph(nodes))).toEqual([])
  })
})

describe('radiusConsistency', () => {
  it('reports the value that is not the majority', () => {
    const nodes = [
      node('a', { x: 0, y: 0, w: 100, h: 100 }, { styles: { borderRadius: '8px' } }),
      node('b', { x: 0, y: 0, w: 100, h: 100 }, { styles: { borderRadius: '8px' } }),
      node('c', { x: 0, y: 0, w: 100, h: 100 }, { styles: { borderRadius: '8px' } }),
      node('d', { x: 0, y: 0, w: 100, h: 100 }, { styles: { borderRadius: '12px' } }),
    ]

    const issues = radiusConsistency(graph(nodes))

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({
      selector: 'd',
      actual: '12px',
      expected: '8px',
      severity: 'P3',
    })
  })

  it('skips pills', () => {
    const nodes = [
      node('a', { x: 0, y: 0, w: 100, h: 40 }, { styles: { borderRadius: '8px' } }),
      node('b', { x: 0, y: 0, w: 100, h: 40 }, { styles: { borderRadius: '8px' } }),
      node('c', { x: 0, y: 0, w: 100, h: 40 }, { styles: { borderRadius: '8px' } }),
      node('d', { x: 0, y: 0, w: 100, h: 40 }, { styles: { borderRadius: '20px' } }),
    ]

    expect(radiusConsistency(graph(nodes))).toEqual([])
  })
})

describe('overflowClipped', () => {
  it('reports content wider than the client box', () => {
    const nodes = [node('a', { x: 0, y: 0, w: 100, h: 50 }, { box: { scrollW: 200 } })]

    const issues = overflowClipped(graph(nodes))

    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ rule: 'overflow', actual: '200px content in 100px' })
  })

  it('ignores sub-pixel noise', () => {
    const nodes = [node('a', { x: 0, y: 0, w: 100, h: 50 }, { box: { scrollW: 100.5 } })]

    expect(overflowClipped(graph(nodes))).toEqual([])
  })

  it('ignores inline elements', () => {
    const nodes = [
      node(
        'a',
        { x: 0, y: 0, w: 100, h: 50 },
        {
          box: { scrollW: 200 },
          styles: { display: 'inline' },
        },
      ),
    ]

    expect(overflowClipped(graph(nodes))).toEqual([])
  })
})

describe('contrastMinimum', () => {
  it('accepts black on white', () => {
    const nodes = [
      node(
        'a',
        { x: 0, y: 0, w: 100, h: 50 },
        {
          text: 'Hello',
          styles: { color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)' },
        },
      ),
    ]

    expect(contrastMinimum(graph(nodes))).toEqual([])
  })

  it('reports grey text on white', () => {
    const nodes = [
      node(
        'a',
        { x: 0, y: 0, w: 100, h: 50 },
        {
          text: 'Hello',
          styles: { color: 'rgb(153, 153, 153)', backgroundColor: 'rgb(255, 255, 255)' },
        },
      ),
    ]

    const issues = contrastMinimum(graph(nodes))

    expect(issues).toHaveLength(1)
    expect(issues[0]?.rule).toBe('contrast')
    expect(issues[0]?.severity).toBe('P1')
  })

  it('resolves the background from an ancestor', () => {
    const nodes = [
      node(
        'parent',
        { x: 0, y: 0, w: 200, h: 100 },
        {
          styles: { backgroundColor: 'rgb(0, 0, 0)' },
        },
      ),
      node(
        'child',
        { x: 0, y: 0, w: 100, h: 50 },
        {
          parent: 'parent',
          depth: 2,
          text: 'Hello',
          styles: { color: 'rgb(0, 0, 0)' },
        },
      ),
    ]

    const issues = contrastMinimum(graph(nodes))

    expect(issues).toHaveLength(1)
    expect(issues[0]?.selector).toBe('child')
  })

  it('ignores elements without text', () => {
    const nodes = [
      node(
        'a',
        { x: 0, y: 0, w: 100, h: 50 },
        {
          styles: { color: 'rgb(200, 200, 200)' },
        },
      ),
    ]

    expect(contrastMinimum(graph(nodes))).toEqual([])
  })
})
