/**
 * Names the human pins onto parts of the page so the agent can address them
 * by name instead of guessing selectors. Labels belong to the human: the
 * agent reads them, it never writes them.
 */
export type Label = {
  id: string
  text: string
  selector: string
}

const STORE_KEY = 'litedesign-labels'

type Store = Record<string, Label[]>

/** Labels are per page: same name on another page is a different mark. */
export function pageKey(): string {
  return `${location.origin}${location.pathname}`
}

function hasStorage(): boolean {
  return typeof chrome !== 'undefined' && chrome.storage?.local !== undefined
}

function sanitize(value: unknown): Label[] {
  if (!Array.isArray(value)) return []

  const labels: Label[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id === '') continue
    if (typeof record.text !== 'string' || record.text.trim() === '') continue
    if (typeof record.selector !== 'string' || record.selector === '') continue

    labels.push({ id: record.id, text: record.text, selector: record.selector })
  }
  return labels
}

async function readStore(): Promise<Store> {
  if (!hasStorage()) return {}

  try {
    const stored = await chrome.storage.local.get(STORE_KEY)
    const pages = stored[STORE_KEY]
    return typeof pages === 'object' && pages !== null ? (pages as Store) : {}
  } catch (error) {
    // Labels are a convenience; a storage failure must not break the overlay.
    console.warn('[litedesign] could not read labels', error)
    return {}
  }
}

async function writeStore(store: Store): Promise<void> {
  if (!hasStorage()) return

  try {
    await chrome.storage.local.set({ [STORE_KEY]: store })
  } catch (error) {
    console.warn('[litedesign] could not save labels', error)
  }
}

export async function loadLabels(): Promise<Label[]> {
  const store = await readStore()
  return sanitize(store[pageKey()])
}

async function replaceOnPage(next: Label[]): Promise<Label[]> {
  const store = await readStore()
  store[pageKey()] = next
  await writeStore(store)
  return next
}

export async function addLabel(text: string, selector: string): Promise<Label[]> {
  const labels = await loadLabels()
  const label: Label = {
    id: crypto.randomUUID(),
    text: text.trim(),
    selector,
  }

  return replaceOnPage([...labels, label])
}

export async function removeLabel(id: string): Promise<Label[]> {
  const labels = await loadLabels()
  return replaceOnPage(labels.filter((label) => label.id !== id))
}

/** A rename keeps the id and the selector: the mark stays pinned where it was. */
export async function renameLabel(id: string, text: string): Promise<Label[]> {
  const labels = await loadLabels()
  return replaceOnPage(labels.map((label) => (label.id === id ? { ...label, text } : label)))
}
