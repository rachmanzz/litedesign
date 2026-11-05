import type { BridgeStatus } from './types.js'

/**
 * The popup next to the icon. It shows what the worker holds and lets the
 * human bind the tab on purpose: "watch this tab" is the only way the agent
 * learns which page to measure without asking.
 */

type Reply<T> = { ok: true; result: T } | { ok: false; error: string }

const pageLine = element<HTMLParagraphElement>('page')
const statusLine = element<HTMLParagraphElement>('status')
const watchButton = element<HTMLButtonElement>('watch')
const overlayButton = element<HTMLButtonElement>('overlay')

let tab: chrome.tabs.Tab | undefined

watchButton.addEventListener('click', () => void toggleWatch())
overlayButton.addEventListener('click', () => void toggleOverlay())
void init()

// The popup renders once and lives as long as it is open. Whatever was read
// at mount can be stale minutes later — after an extension reload the bridge
// line in particular is. Re-read whenever it becomes visible again.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void init()
})

async function init(): Promise<void> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true })
  tab = active

  pageLine.textContent = active?.url ?? 'no active tab'
  watchButton.disabled = active?.id === undefined
  overlayButton.disabled = active?.id === undefined

  await refresh()
}

/**
 * The button states the fact, not an offer: "Watching this tab" while the
 * worker holds this tab — clicking it releases the tab, overlay included.
 */
async function toggleWatch(): Promise<void> {
  if (tab?.id === undefined) return

  const status = await ask<BridgeStatus>({ type: 'status' })
  if (!status.ok) {
    setStatus(status.error, true)
    return
  }

  const watching = status.result.page?.tabId === tab.id
  const reply = await ask<{ url: string } | null>(
    watching ? { type: 'unwatch', tabId: tab.id } : { type: 'watch', tabId: tab.id },
  )

  if (!reply.ok) {
    setStatus(reply.error, true)
    return
  }

  if (!watching && reply.result !== null) pageLine.textContent = reply.result.url
  await refresh()
}

async function toggleOverlay(): Promise<void> {
  if (tab?.id === undefined) return

  const reply = await ask<unknown>({ type: 'overlay', tabId: tab.id })

  if (!reply.ok) {
    setStatus(reply.error, true)
    return
  }

  // The toolbar is on the page now; get out of its way.
  window.close()
}

async function refresh(): Promise<void> {
  const reply = await ask<BridgeStatus>({ type: 'status' })

  if (!reply.ok) {
    setStatus(reply.error, true)
    return
  }

  const status = reply.result
  const watching = tab?.id !== undefined && status.page?.tabId === tab.id

  watchButton.textContent = watching ? 'Unwatch this tab' : 'Watch this tab'
  watchButton.disabled = tab?.id === undefined

  setStatus(
    status.bridge
      ? `bridge online · port ${status.port}`
      : 'bridge offline · run: litedesign ws start',
    !status.bridge,
  )
}

function setStatus(text: string, bad = false): void {
  statusLine.textContent = text
  statusLine.classList.toggle('bad', bad)
}

async function ask<T>(message: unknown): Promise<Reply<T>> {
  try {
    return (await chrome.runtime.sendMessage(message)) as Reply<T>
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function element<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`missing element: ${id}`)
  return found as T
}
