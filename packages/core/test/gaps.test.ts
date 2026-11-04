import { describe, expect, it } from 'vitest'
import { findGaps, findSiblingGaps, findVisualGaps } from '../src/gaps.js'
import { node } from './factory.js'

function row() {
  return [
    node('a', { x: 0, y: 0, w: 100, h: 50 }, { parent: 'p' }),
    node('b', { x: 108, y: 0, w: 100, h: 50 }, { parent: 'p' }),
    node('c', { x: 216, y: 0, w: 100, h: 50 }, { parent: 'p' }),
  ]
}

describe('findSiblingGaps', () => {
  it('finds the gap between consecutive flex children', () => {
    const gaps = findSiblingGaps(row()).filter((gap) => gap.axis === 'x')

    expect(gaps).toHaveLength(2)
    expect(gaps.map((gap) => gap.distance)).toEqual([8, 8])
    expect(gaps.every((gap) => gap.kind === 'sibling')).toBe(true)
  })

  it('finds vertical gaps in a stack', () => {
    const nodes = [
      node('a', { x: 0, y: 0, w: 100, h: 50 }, { parent: 'p' }),
      node('b', { x: 0, y: 58, w: 100, h: 50 }, { parent: 'p' }),
    ]

    const gaps = findSiblingGaps(nodes).filter((gap) => gap.axis === 'y')

    expect(gaps).toHaveLength(1)
    expect(gaps[0]?.distance).toBe(8)
  })

  it('ignores children that do not share a band', () => {
    const nodes = [
      node('a', { x: 0, y: 0, w: 100, h: 50 }, { parent: 'p' }),
      node('b', { x: 108, y: 200, w: 100, h: 50 }, { parent: 'p' }),
    ]

    expect(findSiblingGaps(nodes)).toEqual([])
  })
})

describe('findVisualGaps', () => {
  it('finds a gap between nodes that are not siblings', () => {
    const nodes = [
      node('a', { x: 0, y: 0, w: 100, h: 50 }, { parent: 'left' }),
      node('b', { x: 124, y: 0, w: 100, h: 50 }, { parent: 'right' }),
    ]

    const gaps = findVisualGaps(nodes)

    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ a: 'a', b: 'b', axis: 'x', distance: 24, kind: 'visual' })
  })

  it('picks the nearest neighbour, not every neighbour', () => {
    const nodes = [
      node('a', { x: 0, y: 0, w: 100, h: 50 }),
      node('b', { x: 120, y: 0, w: 100, h: 50 }),
      node('c', { x: 300, y: 0, w: 100, h: 50 }),
    ]

    const gaps = findVisualGaps(nodes).filter((gap) => gap.axis === 'x')

    expect(gaps.map((gap) => `${gap.a}-${gap.b}`)).toEqual(['a-b', 'b-c'])
  })

  it('reports each pair once', () => {
    const nodes = [
      node('a', { x: 0, y: 0, w: 100, h: 50 }),
      node('b', { x: 120, y: 0, w: 100, h: 50 }),
    ]

    expect(findVisualGaps(nodes)).toHaveLength(1)
  })
})

describe('findGaps', () => {
  it('does not duplicate a sibling pair as a visual gap', () => {
    const gaps = findGaps(row())

    expect(gaps).toHaveLength(2)
    expect(gaps.every((gap) => gap.kind === 'sibling')).toBe(true)
  })
})
