/**
 * Development-only shim, active when the page is opened with `?rafShim=1`.
 *
 * epub.js drives its work queue with requestAnimationFrame, which browsers
 * stop firing for hidden tabs. Automated checks that run the app in a hidden
 * browser pane would hang forever, so this swaps in a timer-based fallback.
 * It must be imported before epub.js is evaluated (see main.tsx).
 */
if (import.meta.env.DEV && new URLSearchParams(window.location.search).get('rafShim') === '1') {
  window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    window.setTimeout(() => cb(performance.now()), 16)
  window.cancelAnimationFrame = (id: number): void => window.clearTimeout(id)
}

export {}
