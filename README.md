# litedesign

Grid, gap, and alignment on the real web page — plus an MCP bridge
so an agent can read the live DOM and fix it.

![litedesign measuring a live page: an 8px grid, alignment guides, and gap labels drawn over the real content](img/example.png)

Every number in the image above comes from the page as it is right now: the grid
is 8px, the spacing scale is 4px, and the radius is one token. Nothing is
exported, imported, or redrawn in a canvas. The overlay is injected into the
page you already have open, lives in a closed shadow root, and never touches
layout.

The server also serves its workflow as an MCP resource,
`skill://litedesign/workflow` — an agent that supports resources can read
it and learn the flow without a file in the repository.

## What you get

- **Overlay layers** — `grid` (8px, two axes), `guide` (alignment edges and
  centers), `gap` (distance labels between neighbours), `issue` (rule
  violations), `dim` (dims everything around the focused element), `focus`
  (outline and radius arcs of the focused element), `hover` (box model of the
  element under the cursor). Every layer is a toggle in the toolbar.
- **Grid controls** — pick vertical, horizontal, or both directions by icon,
  and step the spacing from 8px to 128px. Your choice survives page reloads.
- **Labels** — pin a name onto any part of the page from the toolbar; the
  badge stays through hot reloads, and the agent reads it back by name instead
  of guessing selectors.
- **Rules** — `spacing-scale`, `alignment-near-miss`, `radius-consistency`,
  `overflow`, `contrast`. Each rule is one file and one reason to change.
- **MCP tools** — an agent can open the page, measure a selector, list issues,
  capture the viewport, annotate it, draw the overlay, and read your labels
  without asking you to click anything.

## Requirements

- Node.js 20 or newer.
- Chrome or Chromium. The extension is unpacked, so it is loaded from a folder
  instead of the Web Store.
- Optional: `playwright-core` in the MCP server's environment. With it, the
  agent can open pages by itself instead of using the tab you have open.

## Install

```bash
npm i -g @rahmantech/litedesign
litedesign setup
```

`setup` copies the extension into `~/.litedesign/extension`, writes
`~/.litedesign/config.json` (`{ "port": 8787, "mode": "auto" }` the first time),
and prints the next section of this README.

Check everything at once:

```bash
litedesign doctor
```

## Load the extension into Chrome

Chrome forbids installing an extension programmatically, so this is the one
manual step, and you only do it once:

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the folder litedesign prints —
   `~/.litedesign/extension`.

To print the folder again:

```bash
litedesign extension path
```

After upgrading the package, refresh the loaded copy with:

```bash
litedesign extension update   # re-copies the folder
```

then press **Reload** on the litedesign card in `chrome://extensions`.

## Use it on a page

Open any `http(s)` page, then click the litedesign icon. The popup shows the
bridge status and two actions:

| Action           | What it does                                             |
| ---------------- | -------------------------------------------------------- |
| Watch this tab   | binds this tab as the page the agent measures            |
| Toggle overlay   | turns the grid, guides, gap labels, and issues on or off |

The overlay state (on/off, layers, focus, grid settings, labels) is stored in
the extension, so a page reload no longer clears it.

While the overlay is on, the toolbar in the page gives you the controls:

| Control       | What it does                                                     |
| ------------- | ---------------------------------------------------------------- |
| Layer buttons | turn each layer on or off — the agent never touches these        |
| `label`       | mark a part of the page with a name the agent can read           |
| Grid icons    | vertical, horizontal, or both directions; `-`/`+` sets the spacing |

Clicking `label` and then an element opens a small popup next to that element:
type a name and press Enter to pin it. With label mode on, clicking a pinned
badge — or the labeled element itself — opens the same popup prefilled:
press Enter to rename, click the × in the popup to remove it, Escape cancels.

The bridge is a standalone daemon, not a child of the agent session:

```bash
litedesign ws start     # start it in the background
litedesign ws status    # is it up, on which port, which pages
litedesign ws stop      # stop it
```

The MCP server starts the daemon on its own when none is running, so these
commands are for checking and for running the bridge before the agent does.

## Connect an MCP client

The server speaks MCP over stdio:

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

OpenCode uses a different shape:

```json
{
  "mcp": {
    "servers": {
      "litedesign": {
        "type": "local",
        "command": ["litedesign", "mcp"]
      }
    }
  }
}
```

If a client was already running when you upgraded litedesign, its MCP connection
still points at the old process. Reload the client configuration (in OpenCode:
`opencode reload`) or restart the client.

### Tools

| Tool                   | What it returns                                             |
| ---------------------- | ----------------------------------------------------------- |
| `capabilities`         | version, drivers, mode, connected pages, valid rule names   |
| `inspect`              | tree summary; opens and keeps the page; no image by default |
| `await_page`           | waits for the page from `inspect` to connect                |
| `measure`              | box model, computed styles, and gaps for one selector       |
| `find_issues`          | findings with kind, selector, actual, expected, severity    |
| `screenshot`           | PNG of the viewport, or of one element                      |
| `screenshot_annotated` | PNG with grid, guides, gaps, and issue labels               |
| `overlay`              | shows or hides layers, spotlights one component             |
| `labels`               | names you pinned in the toolbar, each mapped to a selector  |

Call `inspect` first. It opens the page and keeps it alive for the other tools.

`inspect` returns no image by default: every number comes from the DOM, so the
agent can measure and fix without one. Ask for a picture only when you need to
see the page — `inspect` with `screenshot: true`, or the `screenshot` and
`screenshot_annotated` tools.

Findings are honest about their own trustworthiness. `overflow` and `contrast`
are measured facts (`kind: "violation"`); the spacing, alignment, and radius
rules are heuristics (`kind: "candidate"`) that can be false positives. Verify
a candidate with `measure` on the same selector before changing code.

`overlay` can also spotlight one component: pass `focus` with the same selector
`measure` returns and the rest of the page dims while the target is outlined
and scrolled into view — the human sees exactly what the agent is editing.
`focus: null` clears it. Focusing scrolls the page, so a capture made afterwards
records the scrolled viewport.

Labels close the naming gap between you and the agent. When you say "the login
card", the agent calls `labels`, finds the selector you pinned under that name,
and focuses or measures exactly that element — no guessed selectors. Labels are
yours: the agent reads them and cannot create or remove them.

## Drivers

The MCP server picks a driver automatically:

| Driver       | Who opens the page | Needs                                     |
| ------------ | ------------------ | ----------------------------------------- |
| `playwright` | the agent          | `playwright-core` installed               |
| `extension`  | you                | Chrome open with the extension loaded     |

With the extension driver nothing is launched: the agent measures the tab you
are looking at. Full-page screenshots need the Playwright driver; the extension
captures the visible viewport.

## Configuration

`~/.litedesign/config.json`:

```json
{
  "port": 8787,
  "mode": "auto"
}
```

- `port` — the WebSocket port shared by the daemon and the extension. The
  extension reads the same value from its own `config.json`, which `setup`
  writes.
- `mode` — `auto` (prefer Playwright, fall back to the extension),
  `playwright`, or `extension`.
- Bridge state is per port: `~/.litedesign/ws-<port>.json` holds the pid, so
  stopping a bridge on one port never disturbs another.

## Commands

```bash
litedesign setup              # scaffold extension + config
litedesign extension path     # print the folder to load unpacked
litedesign extension update   # re-copy the extension after an upgrade
litedesign doctor             # check node, extension, config, and port
litedesign ws start           # start the bridge in the background
litedesign ws stop            # stop the bridge
litedesign ws status          # show the bridge and connected pages
litedesign mcp                # start the MCP server (stdio)
```

## Development

```bash
pnpm install
pnpm build          # core, extension, cli
pnpm test           # build + vitest
pnpm typecheck
pnpm lint
pnpm fixtures       # dev server on http://127.0.0.1:4173
```

Open <http://127.0.0.1:4173/fixtures/design.html>. The fixture server injects a
small mtime poller into every HTML it serves, so saving a fixture reloads the
page in Chrome without a manual refresh. Only the fixture server does this;
pages you visit yourself are never injected.

The repository is a pnpm workspace with three packages:

| Package                | Responsibility                                       |
| ---------------------- | ---------------------------------------------------- |
| `packages/core`        | measures the DOM: graph, gaps, rules, overlay render |
| `packages/extension`   | injects the overlay, owns the tab, talks to the hub  |
| `packages/cli`         | installs the extension and exposes the MCP server    |

`core` measures and never stores or renders other people's pages. `extension`
injects and displays and never edits source. `cli` installs and exposes and
never owns measurement logic.

## License

Apache License 2.0. See [LICENSE](LICENSE).
