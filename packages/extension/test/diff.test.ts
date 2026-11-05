import { describe, expect, it } from 'vitest'
import { changedNodes, nodeSignatures, signatureOf } from '../src/diff.js'
import type { Graph, GraphNode } from '../src/types.js'

function node(id: string, tag: string, text: string, depth = 2): GraphNode {
  return {
    id,
    selector: `${id}-selector`,
    tag,
    rect: { x: 0, y: 0, w: 10, h: 10 },
    box: { scrollW: 10, scrollH: 10, clientW: 10, clientH: 10 },
    text,
    depth,
    parent: null,
    children: [],
    styles: {
      display: 'block',
      borderRadius: '0px',
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgb(255, 255, 255)',
      fontSize: '16px',
      fontWeight: '400',
      padding: '0px',
      margin: '0px',
      gap: 'normal',
    },
  }
}

function graph(nodes: GraphNode[]): Graph {
  return {
    url: 'http://127.0.0.1:4173/test',
    viewport: { w: 1280, h: 800 },
    nodes,
    gaps: [],
    guides: [],
    issues: [],
    truncated: false,
  }
}

describe('signatureOf', () => {
  it('is the tag plus the direct text', () => {
    expect(signatureOf(node('a', 'h2', 'Hello'))).toBe('h2|Hello')
  })
})

describe('changedNodes', () => {
  it('flags added content', () => {
    const before = nodeSignatures(graph([node('a', 'div', 'Alpha')]))
    const after = graph([node('a', 'div', 'Alpha'), node('b', 'p', 'new', 3)])
    expect(changedNodes(before, after).map((n) => n.id)).toEqual(['b'])
  })

  it('flags text changes and keeps document order', () => {
    const before = nodeSignatures(graph([node('a', 'div', 'Alpha'), node('b', 'div', 'Gamma')]))
    const after = graph([node('a', 'div', 'Alpha'), node('b', 'div', 'Edited')])
    expect(changedNodes(before, after).map((n) => n.id)).toEqual(['b'])
  })

  it('ignores unchanged content', () => {
    const before = nodeSignatures(graph([node('a', 'div', 'Alpha')]))
    expect(changedNodes(before, graph([node('a', 'div', 'Alpha')]))).toEqual([])
  })

  it('ignores removed content — there is nothing left to spotlight', () => {
    const before = nodeSignatures(graph([node('a', 'div', 'Gone'), node('b', 'div', 'Kept')]))
    const after = graph([node('b', 'div', 'Kept')])
    expect(changedNodes(before, after)).toEqual([])
  })

  it('matches by content even when positions shift between passes', () => {
    // An image inserted before the span renames every positional id below it;
    // the content itself is untouched, so nothing may be flagged.
    const before = nodeSignatures(
      graph([node('span-1', 'span', 'Jelajah Bali'), node('p-1', 'p', 'Senja')]),
    )
    const after = graph([node('span-7', 'span', 'Jelajah Bali'), node('p-9', 'p', 'Senja', 8)])
    expect(changedNodes(before, after)).toEqual([])
  })

  it('still finds the real edit inside a positionally shifted page', () => {
    const before = nodeSignatures(
      graph([node('span-1', 'span', 'Jelajah Bali'), node('p-1', 'p', 'Senja di Pantai')]),
    )
    const after = graph([
      node('span-7', 'span', 'Jelajah Bali'),
      node('p-9', 'p', 'Senja di Tebing', 8),
    ])
    expect(changedNodes(before, after).map((n) => n.id)).toEqual(['p-9'])
  })

  it('handles duplicate content by count, not by identity', () => {
    const before = nodeSignatures(graph([node('a', 'div', 'Card'), node('b', 'div', 'Card')]))
    // One copy removed, one added elsewhere: net content is unchanged.
    const after = graph([node('x', 'div', 'Card'), node('y', 'div', 'Card')])
    expect(changedNodes(before, after)).toEqual([])
  })

  it('treats an empty before as everything added', () => {
    const after = graph([node('a', 'div', 'Alpha')])
    expect(changedNodes([], after).map((n) => n.id)).toEqual(['a'])
  })
})
