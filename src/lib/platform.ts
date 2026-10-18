// The OS the app runs on, for the few places the UI differs (window controls,
// shortcut labels, where the API key is kept). Only Windows and macOS are built.

/** True for WKWebView on macOS. iOS user agents also mention "Mac OS X", but not "Macintosh". */
export function isMacUserAgent(ua: string): boolean {
  return ua.includes('Macintosh')
}

export const isMac = isMacUserAgent(typeof navigator !== 'undefined' ? navigator.userAgent : '')

/** A Ctrl/Command shortcut as people on this OS write it: "⌘F" or "Ctrl+F". */
export function shortcutLabel(key: string, mac: boolean = isMac): string {
  return mac ? `⌘${key}` : `Ctrl+${key}`
}
