import type { Axis, Rect } from './types.js'

export function right(rect: Rect): number {
  return rect.x + rect.w
}

export function bottom(rect: Rect): number {
  return rect.y + rect.h
}

export function centerX(rect: Rect): number {
  return rect.x + rect.w / 2
}

export function centerY(rect: Rect): number {
  return rect.y + rect.h / 2
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a)
}

/**
 * Length of the shared projection of two rects along `axis`.
 *
 * `projectionOverlap(a, b, 'y')` is the vertical extent both rects share, which
 * is what horizontal adjacency cares about.
 */
export function projectionOverlap(a: Rect, b: Rect, axis: Axis): number {
  return axis === 'x'
    ? Math.max(0, Math.min(right(a), right(b)) - Math.max(a.x, b.x))
    : Math.max(0, Math.min(bottom(a), bottom(b)) - Math.max(a.y, b.y))
}

/** Signed distance from the far edge of `a` to the near edge of `b`. */
export function axisGap(a: Rect, b: Rect, axis: Axis): number {
  return axis === 'x' ? b.x - right(a) : b.y - bottom(a)
}

/**
 * True when the projections overlap along `axis` by at least `ratio` of the
 * smaller extent on that same axis. Used to decide whether two boxes share a
 * band: `'y'` for a row, `'x'` for a column.
 */
export function overlapsOn(a: Rect, b: Rect, axis: Axis, ratio = 0.5): boolean {
  const shared = projectionOverlap(a, b, axis)
  const smallest = axis === 'x' ? Math.min(a.w, b.w) : Math.min(a.h, b.h)
  return smallest > 0 && shared / smallest >= ratio
}

export function isClose(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance
}

export function round(value: number, precision = 2): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}
