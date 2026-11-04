# @rahmantech/litedesign

Grid, gap, and alignment on the real web page — plus an MCP bridge
so agents can read and fix layouts.

## Install

```bash
npm i -g @rahmantech/litedesign
litedesign setup
```

`setup` copies the extension into `~/.litedesign/extension` and prints the one
step you must do by hand: open `chrome://extensions`, enable Developer mode,
then **Load unpacked** into that folder.

Chrome does not allow programmatic extension installation. That is the only
manual step.

## Usage

```bash
litedesign extension path     # print the folder to load unpacked
litedesign extension update   # re-copy after an upgrade
litedesign doctor             # check node, extension, config, and port
litedesign ws start           # start the bridge in the background
litedesign ws stop            # stop the bridge
litedesign ws status          # show the bridge and connected pages
litedesign mcp                # MCP server (stdio)
```

## Register with an MCP client

```json
{
  "mcpServers": {
    "litedesign": {
      "command": "litedesign",
      "args": ["mcp"]
    }
  }
}
```

## Tools

| Tool                   | What it returns                                          |
| ---------------------- | -------------------------------------------------------- |
| `capabilities`         | version, drivers, mode, connected pages, valid rules     |
| `inspect`              | tree summary; opens the page; no image by default        |
| `await_page`           | wait for the page from `inspect` to connect              |
| `measure`              | box model, computed styles, gaps for one selector        |
| `find_issues`          | findings with kind, selector, actual, expected, severity |
| `screenshot`           | PNG of the viewport or one element                       |
| `screenshot_annotated` | PNG with grid, guides, gaps, and issue labels            |
| `overlay`              | shows or hides layers, spotlights one component          |
| `labels`               | names the human pinned in the toolbar, with selectors    |

Call `inspect` first. It opens the page and keeps it alive for the other tools.
It returns no image unless you pass `screenshot: true`; use the `screenshot` or
`screenshot_annotated` tools when you actually need to see the page.

`overflow` and `contrast` findings are measured facts (`kind: "violation"`);
spacing, alignment, and radius findings are heuristics (`kind: "candidate"`)
that can be false positives. Verify a candidate with `measure` before changing
code.

`overlay` also takes `focus`: the same selector `measure` returns. The rest of
the page dims, the target is outlined and scrolled into view; `focus: null`
clears it. Focusing scrolls the page, so a capture made afterwards records the
scrolled viewport.

`labels` returns the names the human pinned onto parts of the page through the
toolbar. When the human refers to a part by name, look it up there instead of
guessing a selector. Labels are read-only for the agent.

The server also serves its workflow as the MCP resource
`skill://litedesign/workflow` — an agent that supports resources can read the
flow (inspect first, resolve names through labels, spotlight edits with focus)
without a file in the repository.

## Drivers

The server prefers Playwright when `playwright-core` is installed. It launches
the Chrome you already use, so no browser download is required.

Without Playwright, `inspect` returns `awaiting_user` with copy-pasteable
instructions. Call `await_page` and the server waits for the extension to
connect. A timeout or a different URL comes back as a status, not an error.

The extension captures the visible viewport only. Full-page screenshots need
Playwright.

The hub is a standalone daemon (`litedesign ws start`), so the extension keeps
working when no MCP server is running. The MCP server starts the daemon by
itself when none is running, then connects to it as a client.

## Status

Both drivers are complete. Playwright opens pages by itself; the extension
drives the tab you already have open through the local WebSocket daemon. The
extension can measure, capture the viewport, crop one element, annotate with
the same overlay, and draw the layers on request.

## License

Apache License 2.0. See the `LICENSE` file in the repository.
