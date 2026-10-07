import { useEffect, useState, type ReactNode } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isBrowserMode } from '../lib/api'

interface Props {
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
  bg: string
  fg: string
  border: string
}

const win = isBrowserMode ? null : getCurrentWindow()

/**
 * Chrome-style title bar drawn inside the webview. The native frame is
 * disabled in tauri.conf.json, so this bar provides dragging (via
 * data-tauri-drag-region), double-click to maximise, and window controls.
 */
export default function TitleBar({ left, center, right, bg, fg, border }: Props) {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!win) return
    let unlisten: (() => void) | undefined
    let disposed = false
    const refresh = () => void win.isMaximized().then((m) => !disposed && setMaximized(m))
    refresh()
    void win.onResized(refresh).then((un) => {
      if (disposed) un()
      else unlisten = un
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  return (
    <div className="titlebar" data-tauri-drag-region style={{ background: bg, color: fg, borderColor: border }}>
      <div className="titlebar-left">{left}</div>
      <div className="titlebar-center" data-tauri-drag-region>
        {center}
      </div>
      <div className="titlebar-right">{right}</div>
      {win && (
        <div className="window-controls">
          <button type="button" aria-label="最小化" title="最小化" onClick={() => void win.minimize()}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M0 5h10" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
          <button
            type="button"
            aria-label={maximized ? '元のサイズに戻す' : '最大化'}
            title={maximized ? '元のサイズに戻す' : '最大化'}
            onClick={() => void win.toggleMaximize()}
          >
            {maximized ? (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M2.5 0.5h7v7h-2" fill="none" stroke="currentColor" strokeWidth="1" />
                <rect x="0.5" y="2.5" width="7" height="7" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            )}
          </button>
          <button type="button" className="close" aria-label="閉じる" title="閉じる" onClick={() => void win.close()}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
