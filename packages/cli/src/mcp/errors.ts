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
    super(`the page ${url} is not connected. Open it and click the litedesign icon.`)
    this.name = 'AwaitingUserError'
    this.url = url
  }
}
