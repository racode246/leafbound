// A book whose pages turn from right to left (spine page-progression-direction="rtl", such as
// a vertical Japanese novel) moves forward with ← and the left edge. epub.js already treats
// next() as the next page in reading order, so only the keys and edges swap.
import type { Book } from 'epubjs'

export type PageTurn = 'next' | 'prev'

/** Whether the book's spine says its pages turn from right to left. */
export function isRtlBook(book: Book): boolean {
  // epub.js reads it from the spine's page-progression-direction; its types leave it out.
  const metadata = book.packaging?.metadata as { direction?: string | null } | undefined
  return metadata?.direction === 'rtl'
}

/**
 * The page turn a key asks for, or null when the key is not one. PageDown and Space always go
 * to the next page and PageUp to the previous one; ← and → follow the book's direction.
 */
export function pageTurnForKey(key: string, rtl: boolean): PageTurn | null {
  switch (key) {
    case 'PageDown':
    case ' ':
      return 'next'
    case 'PageUp':
      return 'prev'
    case 'ArrowRight':
      return rtl ? 'prev' : 'next'
    case 'ArrowLeft':
      return rtl ? 'next' : 'prev'
    default:
      return null
  }
}

/** What the left and right edge buttons do. */
export function edgeTurns(rtl: boolean): { left: PageTurn; right: PageTurn } {
  return rtl ? { left: 'next', right: 'prev' } : { left: 'prev', right: 'next' }
}
