/**
 * The service worker is deliberately thin: injection only. It stores no state
 * and holds no connection. MV3 kills the worker after idle, so anything that
 * must live longer does not belong here.
 */

const DEFAULT_TITLE = 'litedesign: toggle overlay'
const FAILURE_TITLE =
  'litedesign cannot run here. Open a normal http(s) page and click the icon again.'

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['core.iife.js', 'content.js'],
    })

    await clearFailure(tab.id)
  } catch (error) {
    console.error('[litedesign] injection failed', error)
    await showFailure(tab.id)
  }
})

async function showFailure(tabId: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: '!' })
    await chrome.action.setBadgeBackgroundColor({ tabId, color: '#dc2626' })
    await chrome.action.setTitle({ tabId, title: FAILURE_TITLE })
  } catch {
    // The tab can close between the click and the badge update.
  }
}

async function clearFailure(tabId: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: '' })
    await chrome.action.setTitle({ tabId, title: DEFAULT_TITLE })
  } catch {
    // The tab can close between the click and the badge update.
  }
}
