/**
 * Service worker sengaja tipis: hanya injeksi. Tidak menyimpan state, tidak
 * memegang koneksi. MV3 mematikan worker setelah idle, jadi apa pun yang perlu
 * hidup lama tidak boleh tinggal di sini.
 */

chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id === undefined) return

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['core.iife.js', 'content.js'],
    })
  } catch (error) {
    console.error('[litedesign] injeksi gagal', error)
  }
})
