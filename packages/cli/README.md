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
| `capabilities`         | version, drivers, mode, valid rule names                  |
| `inspect`              | tree summary + screenshot; opens the page                 |
| `measure`              | box model, computed styles, gaps for one selector         |
| `find_issues`          | rule violations with selector, actual, expected, severity |
| `screenshot`           | PNG of the viewport or one element                        |
| `screenshot_annotated` | PNG with grid, guides, gaps, and issue labels             |

Call `inspect` first. It opens the page and keeps it alive for the other tools.

## Drivers

The server prefers Playwright when `playwright-core` is installed. It launches
the Chrome you already use, so no browser download is required.

Without Playwright, `inspect` returns `awaiting_user` with copy-pasteable
instructions. The extension bridge (`await_page`) is the next milestone.

## Status

M3a — the Playwright path is complete: inspect, measure, find issues, plain
screenshots, and annotated screenshots. The WebSocket hub and the extension
driver follow in M3b.
