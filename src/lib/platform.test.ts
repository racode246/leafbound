import { describe, expect, it } from 'vitest'
import { isMacUserAgent, shortcutLabel } from './platform'

const MAC_WKWEBVIEW =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)'
const WIN_WEBVIEW2 =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'

describe('isMacUserAgent', () => {
  it('detects WKWebView on macOS (Apple Silicon reports "Intel Mac OS X" too)', () => {
    expect(isMacUserAgent(MAC_WKWEBVIEW)).toBe(true)
  })

  it('is false for WebView2 on Windows and for an empty user agent', () => {
    expect(isMacUserAgent(WIN_WEBVIEW2)).toBe(false)
    expect(isMacUserAgent('')).toBe(false)
  })

  it('is false for iPhone and iPad user agents', () => {
    expect(
      isMacUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15')
    ).toBe(false)
  })
})

describe('shortcutLabel', () => {
  it('uses the Command symbol on macOS', () => {
    expect(shortcutLabel('F', true)).toBe('⌘F')
  })

  it('uses Ctrl+ elsewhere', () => {
    expect(shortcutLabel('G', false)).toBe('Ctrl+G')
  })
})
