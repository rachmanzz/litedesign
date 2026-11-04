import { type ToolResult, textResult } from '../result.js'
import { requirePage } from '../session.js'

/**
 * Reads the names the human pinned onto parts of the page. This is the bridge
 * between human language and tool language: when the human says "the login
 * card", the agent looks the name up here instead of guessing a selector.
 *
 * Labels are the human's marks. The agent reads them; it never writes them.
 */
export async function labelsTool(): Promise<ToolResult> {
  const driver = requirePage()
  const labels = await driver.labels()

  return textResult({
    labels,
    count: labels.length,
  })
}
