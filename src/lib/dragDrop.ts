import type { DragDropEvent, Unlisten } from './apiTypes'

/**
 * HTML5 drag and drop on the window. Used in both the Tauri shell and plain
 * browsers: Tauri's native drop handler is disabled (`dragDropEnabled: false`)
 * so WebView2 delivers standard DOM events, and dropped files are imported
 * from their contents.
 */
export function listenHtml5DragDrop(cb: (event: DragDropEvent) => void): Unlisten {
  let depth = 0

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')

  const enter = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth++
    if (depth === 1) cb({ type: 'enter' })
  }
  const over = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    cb({ type: 'over' })
  }
  const leave = (e: DragEvent) => {
    if (!hasFiles(e)) return
    depth = Math.max(0, depth - 1)
    if (depth === 0) cb({ type: 'leave' })
  }
  const drop = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    depth = 0
    const files = Array.from(e.dataTransfer?.files ?? [])
    cb({ type: 'drop', files })
  }

  window.addEventListener('dragenter', enter)
  window.addEventListener('dragover', over)
  window.addEventListener('dragleave', leave)
  window.addEventListener('drop', drop)
  return () => {
    window.removeEventListener('dragenter', enter)
    window.removeEventListener('dragover', over)
    window.removeEventListener('dragleave', leave)
    window.removeEventListener('drop', drop)
  }
}

export function isEpubFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.epub')
}
