export type TextContent = { type: 'text'; text: string }

export type ImageContent = { type: 'image'; data: string; mimeType: string }

export type ToolResult = {
  content: Array<TextContent | ImageContent>
  isError?: boolean
}

export function textResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

export function imageResult(value: unknown, image: Buffer): ToolResult {
  return {
    content: [
      { type: 'text', text: JSON.stringify(value, null, 2) },
      { type: 'image', data: image.toString('base64'), mimeType: 'image/png' },
    ],
  }
}

/**
 * Never forwards a stack trace. Unexpected errors are logged to stderr by the
 * caller, so the agent only sees the message it can act on.
 */
export function errorResult(error: unknown): ToolResult {
  const message =
    error instanceof Error && error.message !== ''
      ? error.message
      : typeof error === 'string' && error !== ''
        ? error
        : 'unexpected error'

  return { isError: true, content: [{ type: 'text', text: message }] }
}
