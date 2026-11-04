import { describe, expect, it } from 'vitest'
import { backoffDelay, RECONNECT_MAX, RECONNECT_MIN } from '../src/backoff.js'

describe('reconnect policy', () => {
  it('doubles the delay from the minimum', () => {
    expect(backoffDelay(1)).toBe(RECONNECT_MIN)
    expect(backoffDelay(2)).toBe(2000)
    expect(backoffDelay(3)).toBe(4000)
    expect(backoffDelay(4)).toBe(8000)
  })

  it('caps the delay instead of growing without bound', () => {
    expect(backoffDelay(10)).toBe(RECONNECT_MAX)
    expect(backoffDelay(100)).toBe(RECONNECT_MAX)
  })

  it('treats a fresh counter as the first attempt', () => {
    expect(backoffDelay(0)).toBe(RECONNECT_MIN)
  })
})
