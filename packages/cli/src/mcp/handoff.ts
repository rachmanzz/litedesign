/** Copy-pasteable instructions for the human who has to open the page. */
export function handoffMessage(url: string): string {
  return [
    `Open ${url} in Chrome and keep it in the active tab.`,
    '',
    'The extension attaches by itself, so there is nothing to click.',
    'If nothing connects:',
    '- make sure the extension is loaded unpacked at chrome://extensions',
    '- make sure Chrome is running',
    '',
    'I am waiting for that page to connect.',
  ].join('\n')
}

/** The right page never connected; a different one did. */
export function mismatchMessage(expected: string, actual: string): string {
  return [
    `The active tab is ${actual}, but I am waiting for ${expected}.`,
    '',
    `Switch to ${expected} and call await_page,`,
    'or call inspect again with the URL you actually have open.',
  ].join('\n')
}
