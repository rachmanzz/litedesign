# @rahmantech/litedesign

Figma-style grid, gap, and alignment on the real web page — plus an MCP bridge
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
litedesign doctor             # check node, extension, and port
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

| Tool                   | What it returns                                           |
| ---------------------- | --------------------------------------------------------- |
| `capabilities`         | version, drivers, mode, connected pages, valid rules      |
| `inspect`              | tree summary + screenshot; opens the page                 |
| `await_page`           | wait for the page from `inspect` to connect               |
| `measure`              | box model, computed styles, gaps for one selector         |
| `find_issues`          | rule violations with selector, actual, expected, severity |
| `screenshot`           | PNG of the viewport or one element                        |
| `screenshot_annotated` | PNG with grid, guides, gaps, and issue labels             |

Call `inspect` first. It opens the page and keeps it alive for the other tools.

## Drivers

The server prefers Playwright when `playwright-core` is installed. It launches
the Chrome you already use, so no browser download is required.

Without Playwright, `inspect` returns `awaiting_user` with copy-pasteable
instructions. Call `await_page` and the server waits for the extension to
connect. A timeout or a different URL comes back as a status, not an error.

The extension captures the visible viewport only. Full-page screenshots need
Playwright.

The hub lives inside the MCP server, so a missing server is normal. The
extension stops retrying after five attempts and puts a `!` badge on the icon;
hovering it tells you to run `litedesign mcp`. Click the icon to retry.

## Status

M3b — both drivers are complete. Playwright opens pages by itself; the
extension drives the tab you already have open through a local WebSocket hub.
The extension can measure, capture the viewport, crop one element, and annotate
with the same overlay.
