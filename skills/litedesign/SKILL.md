---
name: litedesign
description: Measure and fix a real web page with the litedesign MCP server. Use when inspecting, measuring, editing, or spotlighting parts of a live page through Chrome, especially in pair with a human who is looking at the same page.
---

# litedesign

litedesign overlays the page a human is already looking at in real Chrome, and
lets you read it, measure it, and aim the human's eyes at whatever you are
working on. This skill assumes the MCP server named `litedesign` is configured;
if the tool call fails with "no litedesign tools", set it up first (next
section), reload your client, and retry.

## Set up the MCP server (once)

1. Install the CLI. This copies the extension to `~/.litedesign/extension` and
   writes the config:

   ```bash
   npm i -g @rahmantech/litedesign
   litedesign setup
   ```

2. The extension is unpacked; loading it is the one manual step the human does:
   `chrome://extensions` → Developer mode → **Load unpacked** → pick
   `~/.litedesign/extension`. To print the folder again:
   `litedesign extension path`.

3. Register the server with your client.

   Generic MCP clients (Claude Desktop, etc.):

   ```json
   {
     "mcpServers": {
       "litedesign": { "command": "litedesign", "args": ["mcp"] }
     }
   }
   ```

   OpenCode:

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

   OpenCode watches its config — no restart needed. Clients that were running
   when litedesign was installed may need a reload of their MCP configuration.

4. Sanity checks, in order:

   ```bash
   litedesign ws status   # bridge up? which pages connected?
   litedesign doctor      # node, extension, config, port
   ```

The human binds their tab either from the popup ("Watch this tab") or simply
because you called `inspect` with the URL — then tell them if it flies. The MCP
server starts the bridge daemon by itself when none is running.

## What the tools give you, and when to reach for each

- `inspect` — call this first, always. It opens or re-binds the page, returns
  the DOM summary, the element tree, the resolved labels, and issues summary.
  No image by default; every number comes from the DOM.
- `await_page` — after `inspect` reported `awaiting_user` (the human must open
  the page or install the extension), call this to block until the page shows
  up, then `inspect` again.
- `measure <selector>` — box model, computed styles, and neighbour gaps for one
  element. This is the ground truth for anything you plan to change.
- `find_issues` — spacing-scale near misses, alignment, radius, overflow,
  contrast findings. `kind: "violation"` is a measured fact; `kind: "candidate"`
  is a heuristic that can be wrong — verify with `measure` before editing
  anything.
- `overlay` — show the grid/guide/gap/issue layers and optional focus. Pass
  `layers` once; the human owns those toggles from the toolbar, so never fight
  them mid-session.
- `focus` (overlay with `focus`) — spotlight one component; the human sees
  exactly what you are about to touch. Send it right before an edit and after
  the next one. `focus: null` clears.
- `screenshot`, `screenshot_annotated` — only when you need to see the page.
  They cost context; the DOM summary usually suffices.
- `labels <name>` — the human pinned names ("the login card") onto elements.
  Resolve names through `labels`, never by guessing selectors.

## The working loop

1. `inspect <url>` — read the tree, the labels, the issues summary.
2. `measure` what you intend to change. Decide from numbers, not vibes.
3. `overlay` with a `focus` on the target — the human now looks at the right
   spot. Then make the edit in the source file.
4. The page hot-reloads. When the overlay is live, the extension diffs the page
   content and spotlights the changed element **by itself** — matching by
   content, so image loading does not fool it. If you did not catch the change,
   an explicit `focus` on the edited selector always wins; send it.
5. Verify: `measure` the edited selector again and compare against step 2.

## Collaboration rules (they are hard rules)

- `layers` are the human's. Set them at most once, at session start, in
  `overlay`. After that only `focus`. If the human turned a layer off, that is
  their answer.
- Label badges are clickable overlay chrome. You read `labels`; you never
  create, rename, or remove them. If a name is missing, ask the human to pin it.
- The page belongs to the human. You measure it, you point at it; you never
  close tabs and never edit the DOM directly.
- Proof is a reading, not an assertion: after an edit or an overlay call, trust
  the values the tools report back, not what you believed you requested. When
  something reads `enabled: false` where you asked for on, say so instead of
  claiming success.

## When things go wrong

- **"no page is open. Call inspect with a url first"** — call `inspect` with
  the full URL before any other tool.
- **`status: awaiting_user`** — the human must open the page (or load the
  extension). Call `await_page` with a generous timeout, and hand the human the
  URL and why you need it. Then re-`inspect`.
- **`status: mismatch`** — the page that opened is not the URL you asked for.
  Re-check the URL; do not proceed on a half-matched page.
- **Popup says "bridge offline" while you measure fine** — trust the tools, not
  the popup: the popup re-reads status a second late by design. Only insist on
  `litedesign ws status` when tool calls actually fail.
- **The human reports the wrong element got spotlighted** — selectors are
  positional and can shift when the page changes. Re-`inspect`, re-`measure`,
  and re-send `focus` from the fresh graph instead of reusing an old selector.
- **Nothing connected, everything times out** — run `litedesign ws status`.
  If the bridge is down, the human runs `litedesign ws start`; if it is up and
  pages empty, the human either did not load the extension, their popup is
  unwatched, or the extension build is stale (`chrome://extensions` → Reload).
  Removing the extension would delete their pinned labels — advise Reload, not
  Remove.
