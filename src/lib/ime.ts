/**
 * Whether a keydown belongs to IME input rather than to the text field, e.g. the
 * Enter that confirms a conversion. Chromium (WebView2) marks that keydown as
 * composing; WebKit (WKWebView) fires compositionend first, so it only reports
 * keyCode 229 ("processed by the IME").
 */
export function isImeEnter(e: Pick<KeyboardEvent, 'isComposing' | 'keyCode'>): boolean {
  return e.isComposing || e.keyCode === 229
}
