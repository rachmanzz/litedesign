import type { Graph, GraphNode, Issue } from '@litedesign/core/types'
import { describe, expect, it } from 'vitest'
import type { LabelMark } from '../src/drivers/types.js'
import { formatTree, issuePayload, labelsSummary, pngSize } from '../src/mcp/format.js'

function node(id: string, depth: number, overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    selector: id,
    tag: 'div',
    rect: { x: 0, y: 0, w: 100, h: 40 },
    box: { scrollW: 100, scrollH: 40, clientW: 100, clientH: 40 },
    text: '',
    depth,
    parent: null,
    children: [],
    styles: {
      display: 'block',
      borderRadius: '0px',
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      fontSize: '16px',
      fontWeight: '400',
      padding: '0px',
      margin: '0px',
      gap: 'normal',
    },
    ...overrides,
  }
}

function graph(nodes: GraphNode[]): Graph {
  return {
    url: 'https://example.test',
    viewport: { w: 1280, h: 800 },
    nodes,
    gaps: [],
    guides: [],
    issues: [],
    truncated: false,
  }
}

function issue(index: number): Issue {
  return {
    id: `spacing-scale:node-${index}`,
    selector: `node-${index}`,
    rule: 'spacing-scale',
    severity: 'P2',
    kind: 'candidate',
    actual: '10px',
    expected: '12px',
    autoFix: true,
  }
}

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(24)
  buffer.writeUInt8(0x89, 0)
  buffer.write('PNG', 1, 'ascii')
  buffer.writeUInt32BE(13, 8)
  buffer.write('IHDR', 12, 'ascii')
  buffer.writeUInt32BE(width, 16)
  buffer.writeUInt32BE(height, 20)
  return buffer
}

describe('formatTree', () => {
  it('renders tag, size, depth, and direct text', () => {
    const tree = formatTree(
      graph([
        node('body', 0, { tag: 'body', rect: { x: 0, y: 0, w: 1280, h: 800 } }),
        node('card', 1, { text: 'Alpha', rect: { x: 24, y: 24, w: 400, h: 120 } }),
      ]),
    )

    expect(tree.split('\n')).toEqual(['body 1280×800', '  div 400×120 Alpha'])
  })

  it('clips long text', () => {
    const tree = formatTree(graph([node('card', 0, { text: 'x'.repeat(80) })]))
    expect(tree).toContain('…')
    expect(tree.length).toBeLessThan(70)
  })

  it('caps the line count and reports the remainder', () => {
    const nodes = Array.from({ length: 5 }, (_, index) => node(`node-${index}`, 0))
    const tree = formatTree(graph(nodes), 3)

    expect(tree.split('\n')).toHaveLength(4)
    expect(tree).toContain('… 2 more nodes')
  })
})

describe('issuePayload', () => {
  it('limits the list and keeps the total', () => {
    const payload = issuePayload([issue(1), issue(2), issue(3)], 2)

    expect(payload.issues).toHaveLength(2)
    expect(payload.total).toBe(3)
    expect(payload.truncated).toBe(true)
    expect(payload.issues[0]).not.toHaveProperty('id')
  })

  it('marks an untruncated list', () => {
    expect(issuePayload([issue(1)], 50)).toEqual({
      issues: [
        {
          selector: 'node-1',
          rule: 'spacing-scale',
          severity: 'P2',
          kind: 'candidate',
          actual: '10px',
          expected: '12px',
          autoFix: true,
        },
      ],
      total: 1,
      truncated: false,
    })
  })
})

describe('labelsSummary', () => {
  it('counts every label and lists unique names in first-appearance order', () => {
    const marks: LabelMark[] = [
      { label: 'alcha', selector: '#a' },
      { label: 'login', selector: '#b' },
      { label: 'alcha', selector: '#c' },
    ]

    expect(labelsSummary(marks)).toEqual({ count: 3, names: ['alcha', 'login'] })
  })

  it('stays present and empty when the page has no labels', () => {
    expect(labelsSummary([])).toEqual({ count: 0, names: [] })
  })
})

describe('pngSize', () => {
  it('reads the IHDR dimensions', () => {
    expect(pngSize(png(1280, 800))).toEqual({ width: 1280, height: 800 })
  })

  it('returns zero for a non-PNG buffer', () => {
    expect(pngSize(Buffer.from('not an image'))).toEqual({ width: 0, height: 0 })
  })
})
