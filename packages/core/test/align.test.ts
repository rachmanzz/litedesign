import { describe, expect, it } from 'vitest'
import { findGuides } from '../src/align.js'
import { node } from './factory.js'

describe('findGuides', () => {
  it('clusters edges within 2px into one guide', () => {
    const nodes = [
      node('a', { x: 10, y: 0, w: 100, h: 50 }),
      node('b', { x: 10, y: 60, w: 100, h: 50 }),
      node('c', { x: 11, y: 120, w: 100, h: 50 }),
    ]

    const left = findGuides(nodes).filter((guide) => guide.axis === 'x' && guide.edge === 'left')

    expect(left).toHaveLength(1)
    expect(left[0]?.members).toHaveLength(3)
  })

  it('does not cluster edges further apart than the tolerance', () => {
    const nodes = [
      node('a', { x: 10, y: 0, w: 100, h: 50 }),
      node('b', { x: 14, y: 60, w: 100, h: 50 }),
    ]

    const left = findGuides(nodes).filter((guide) => guide.axis === 'x' && guide.edge === 'left')

    expect(left).toEqual([])
  })

  it('drops guides that are only an ancestor chain', () => {
    const nodes = [
      node('parent', { x: 0, y: 0, w: 200, h: 100 }, { depth: 1 }),
      node('child', { x: 0, y: 0, w: 100, h: 50 }, { depth: 2, parent: 'parent' }),
    ]

    const left = findGuides(nodes).filter((guide) => guide.axis === 'x' && guide.edge === 'left')

    expect(left).toEqual([])
  })
})
