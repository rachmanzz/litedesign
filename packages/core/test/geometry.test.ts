import { describe, expect, it } from 'vitest'
import {
  axisGap,
  bottom,
  centerX,
  centerY,
  isClose,
  overlaps,
  overlapsOn,
  projectionOverlap,
  right,
  round,
} from '../src/geometry.js'

const a = { x: 0, y: 0, w: 100, h: 50 }
const b = { x: 120, y: 10, w: 100, h: 50 }

describe('edges', () => {
  it('derives right, bottom and centers', () => {
    expect(right(a)).toBe(100)
    expect(bottom(a)).toBe(50)
    expect(centerX(a)).toBe(50)
    expect(centerY(a)).toBe(25)
  })
})

describe('overlaps', () => {
  it('is false for separated rects', () => {
    expect(overlaps(a, b)).toBe(false)
  })

  it('is true for intersecting rects', () => {
    expect(overlaps(a, { x: 50, y: 25, w: 100, h: 50 })).toBe(true)
  })

  it('is false when rects only touch', () => {
    expect(overlaps(a, { x: 100, y: 0, w: 50, h: 50 })).toBe(false)
  })
})

describe('projectionOverlap', () => {
  it('measures the shared vertical band', () => {
    expect(projectionOverlap(a, b, 'y')).toBe(40)
  })

  it('is zero when the bands miss each other', () => {
    expect(projectionOverlap(a, { x: 0, y: 60, w: 10, h: 10 }, 'y')).toBe(0)
  })
})

describe('axisGap', () => {
  it('is signed', () => {
    expect(axisGap(a, b, 'x')).toBe(20)
    expect(axisGap(b, a, 'x')).toBe(-220)
  })
})

describe('overlapsOn', () => {
  it('requires half of the smaller rect by default', () => {
    expect(overlapsOn(a, b, 'y')).toBe(true)
    expect(overlapsOn(a, { x: 120, y: 45, w: 100, h: 50 }, 'y')).toBe(false)
  })

  it('accepts a custom ratio', () => {
    const sliver = { x: 120, y: 45, w: 100, h: 50 }
    expect(overlapsOn(a, sliver, 'y', 0.1)).toBe(true)
  })
})

describe('helpers', () => {
  it('compares with tolerance', () => {
    expect(isClose(10, 11.5, 2)).toBe(true)
    expect(isClose(10, 13, 2)).toBe(false)
  })

  it('rounds to a precision', () => {
    expect(round(8.126)).toBe(8.13)
    expect(round(8.126, 1)).toBe(8.1)
  })
})
