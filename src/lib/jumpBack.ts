// "Back to where you were" (issue #63): a jump through the reader's own navigation (Contents,
// search, highlights, AI citations, Go to page) remembers the reading position in one slot,
// and Back returns there once. A new jump overwrites the slot; turning pages keeps it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { isMac } from './platform'

/** Where the reader was before a jump. */
export interface JumpOrigin {
  cfi: string
  /** The page number shown there, or null if page numbers were not ready yet. */
  page: number | null
}

type KeyLike = Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>

/** Alt+← on Windows, ⌘[ on macOS (the browsers' Back shortcuts). */
export function isJumpBackKey(e: KeyLike, mac: boolean = isMac): boolean {
  if (e.shiftKey || e.ctrlKey) return false
  return mac
    ? e.metaKey && !e.altKey && e.key === '['
    : e.altKey && !e.metaKey && e.key === 'ArrowLeft'
}

/** The shortcut as people on this OS write it. */
export function jumpBackShortcut(mac: boolean = isMac): string {
  return mac ? '⌘[' : 'Alt+←'
}

/**
 * The single Back slot of a reader. `take` empties it and returns what was there; the ref
 * lets a key handler registered once with epub.js read the current slot. Another book
 * starts with an empty slot.
 */
export function useJumpBack(bookId: string) {
  const [origin, setOrigin] = useState<JumpOrigin | null>(null)
  const originRef = useRef<JumpOrigin | null>(null)

  const remember = useCallback((next: JumpOrigin) => {
    originRef.current = next
    setOrigin(next)
  }, [])

  const take = useCallback((): JumpOrigin | null => {
    const current = originRef.current
    originRef.current = null
    setOrigin(null)
    return current
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: the slot is emptied whenever the book changes
  useEffect(() => {
    return () => {
      originRef.current = null
      setOrigin(null)
    }
  }, [bookId])

  return { origin, remember, take }
}
