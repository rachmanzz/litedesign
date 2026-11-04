import { describe, expect, it } from 'vitest'
import { resolveNode } from '../src/graph.js'
import { graph, node } from './factory.js'

describe('resolveNode', () => {
  it('matches a structural path returned by find_issues', () => {
    const body = node('body:nth-child(1)', { x: 0, y: 0, w: 1280, h: 800 })
    const card = node('body:nth-child(1) > div:nth-child(1)', { x: 24, y: 24, w: 400, h: 120 })

    expect(resolveNode(graph([body, card]), card.id)).toBe(card)
  })

  it('returns null when nothing matches', () => {
    expect(
      resolveNode(graph([node('body:nth-child(1)', { x: 0, y: 0, w: 10, h: 10 })]), '.missing'),
    ).toBeNull()
  })

  it('returns null for an invalid CSS selector outside a browser', () => {
    expect(resolveNode(graph([]), '###')).toBeNull()
  })
})
