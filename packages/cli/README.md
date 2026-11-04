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

## Without Playwright

The server runs with two drivers. When `playwright-core` is not installed, the
agent asks you to open the page and activate the extension. That is not an
error — it is the normal path.

## Status

v0.1.0 — scaffold. The measurement core is still node + rect; gaps, alignment,
and the rule engine arrive in M1.
