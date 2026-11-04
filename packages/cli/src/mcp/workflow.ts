export const WORKFLOW_URI = 'skill://litedesign/workflow'

/**
 * The workflow the agent should follow with this server, served as an MCP
 * resource so an agent that supports resources can discover it without a
 * file in the human's repository. One document, one flow: inspect first,
 * resolve human names through labels, spotlight edits with focus.
 */
export const WORKFLOW_TEXT = `# litedesign workflow

- Call \`inspect\` first, always. Its summary includes the labels the human pinned on the page.
- If the human refers to a part of the page by name ("the login button", "the altcha box"), call \`labels\` and use the pinned selector — never guess CSS selectors.
- Labels are read-only: you read them; the human creates, renames, and removes them.
- To show the human what you are editing, call \`overlay\` with \`focus\`. Set \`layers\` once at the start if needed; after that, send \`focus\` only — the human owns the layer toggles in the toolbar.
- Findings carry kind: "violation" is a measured fact; "candidate" is a heuristic that can be a false positive — verify it with \`measure\` before changing code.
`
