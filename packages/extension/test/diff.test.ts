import { describe, expect, it } from 'vitest'
import { changedIds, signatures } from '../src/diff.js'
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

describe('signatures', () => {
  it('keys content by node id as tag plus direct text', () => {
    const map = signatures(graph([node('a', 'h2', 'Hello')]))
    expect([...map.entries()]).toEqual([['a', 'h2|Hello']])
  })
})

describe('changedIds', () => {
  it('flags added nodes', () => {
    const before = signatures(graph([node('a', 'div', 'Alpha')]))
    const after = signatures(graph([node('a', 'div', 'Alpha'), node('b', 'p', 'new', 3)]))
    expect(changedIds(before, after)).toEqual(['b'])
  })

  it('flags text changes and keeps document order', () => {
    const before = signatures(graph([node('a', 'div', 'Alpha'), node('b', 'div', 'Gamma')]))
    const after = signatures(graph([node('a', 'div', 'Gamma'), node('b', 'div', 'New')]))
    expect(changedIds(before, after)).toEqual(['a', 'b'])
  })

  it('ignores unchanged nodes', () => {
    const before = signatures(graph([node('a', 'div', 'Alpha')]))
    const after = signatures(graph([node('a', 'div', 'Alpha')]))
    expect(changedIds(before, after)).toEqual([])
  })

  it('ignores removed nodes — there is nothing left to spotlight', () => {
    const before = signatures(graph([node('a', 'div', 'Gone'), node('b', 'div', 'Kept')]))
    const after = signatures(graph([node('b', 'div', 'Kept')]))
    expect(changedIds(before, after)).toEqual([])
  })

  it('treats an empty before as everything added', () => {
    const after = signatures(graph([node('a', 'div', 'Alpha')]))
    expect(changedIds(new Map(), after)).toEqual(['a'])
  })
})
