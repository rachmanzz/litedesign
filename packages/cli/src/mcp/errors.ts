import { mismatchMessage } from './handoff.js'

/** An error whose message is safe and useful to show to the agent. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolError'
  }
}

/**
 * The page is not connected yet. This is not a failure: the agent should tell
 * the human what to do and then wait with `await_page`.
 */
export class AwaitingUserError extends ToolError {
  readonly url: string

  constructor(url: string) {
    super(`the page ${url} is not connected. Open it and keep it in the active tab.`)
    this.name = 'AwaitingUserError'
    this.url = url
  }
}

/** The extension attached to a tab, but it is not the page we asked for. */
export class MismatchError extends ToolError {
  readonly expected: string
  readonly actual: string

  constructor(expected: string, actual: string) {
    super(mismatchMessage(expected, actual))
    this.name = 'MismatchError'
    this.expected = expected
    this.actual = actual
  }
}
