/**
 * The service worker is deliberately thin: injection only. It stores no state
 * and holds no connection. MV3 kills the worker after idle, so anything that
 * must live longer does not belong here.
 */

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['core.iife.js', 'content.js'],
    })
  } catch (error) {
    console.error('[litedesign] injection failed', error)
  }
})
