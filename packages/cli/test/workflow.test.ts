import { describe, expect, it } from 'vitest'
import { WORKFLOW_TEXT, WORKFLOW_URI } from '../src/mcp/workflow.js'

describe('workflow resource', () => {
  it('serves the agreed URI', () => {
    expect(WORKFLOW_URI).toBe('skill://litedesign/workflow')
  })

  it('covers the flow the agent must follow', () => {
    for (const word of ['inspect', 'labels', 'read-only', 'overlay', 'focus', 'measure']) {
      expect(WORKFLOW_TEXT).toContain(word)
    }
  })
})
