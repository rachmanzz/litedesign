/** Copy-pasteable instructions for the human who has to open the page. */
export function handoffMessage(url: string): string {
  return [
    `Open ${url} and click the litedesign icon in the Chrome toolbar.`,
    '',
    'If the icon is missing:',
    '- make sure the extension is loaded unpacked at chrome://extensions',
    '- make sure the active tab is the page above',
    '',
    'I am waiting for that page to connect.',
  ].join('\n')
}
