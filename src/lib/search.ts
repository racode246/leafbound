import type { Book as EpubBook } from 'epubjs'
import type { SearchHit } from '../types'

export const MAX_HITS = 300

interface SpineItemLike {
  index: number
  href: string
  load(request: unknown): Promise<unknown>
  find(query: string): { cfi: string; excerpt: string }[]
  unload(): void
}

export interface SearchProgress {
  done: number
  total: number
}

export interface SearchControl {
  cancelled: boolean
}

/**
 * Full-text search across every spine section. Sections are loaded one at a
 * time (parsed by epub.js, no rendering) and unloaded again, so memory stays
 * flat even for large books.
 */
export async function searchBook(
  book: EpubBook,
  query: string,
  control: SearchControl,
  onProgress?: (p: SearchProgress) => void
): Promise<{ hits: SearchHit[]; truncated: boolean }> {
  const q = query.trim()
  const spine = book.spine as unknown as { spineItems: SpineItemLike[] }
  const items = spine.spineItems
  const hits: SearchHit[] = []
  let truncated = false
  if (!q) return { hits, truncated }

  for (let i = 0; i < items.length; i++) {
    if (control.cancelled) break
    const item = items[i]
    try {
      await item.load(book.load.bind(book))
      for (const found of item.find(q)) {
        hits.push({ cfi: found.cfi, excerpt: found.excerpt, sectionIndex: item.index, href: item.href })
        if (hits.length >= MAX_HITS) {
          truncated = true
          break
        }
      }
    } catch (err) {
      console.warn('search: section failed', item.href, err)
    } finally {
      item.unload()
    }
    onProgress?.({ done: i + 1, total: items.length })
    if (truncated) break
  }
  return { hits, truncated }
}
