import ePub, { type Book as EpubBook, type Contents, type Rendition } from 'epubjs'
import type { IndexChunk } from '../types'
import { chunkRanges } from './chunk'

/** Current-chapter text handed to the LLM. */
const CHAPTER_CONTEXT_CHARS = 6000
const CONTEXT_BEFORE_POSITION = 1500

const BLOCK_SELECTOR =
  'p,div,li,h1,h2,h3,h4,h5,h6,blockquote,section,article,td,th,dt,dd,pre,figcaption'
const SKIP_SELECTOR = 'script,style,rt,rp,noscript'

interface TextNodeSpan {
  node: Text
  /** Offset of this node's text in the collected string. */
  start: number
  length: number
}

interface CollectedText {
  text: string
  spans: TextNodeSpan[]
}

/**
 * Visible text of a document with whitespace collapsed and a newline between
 * blocks, plus where each DOM text node landed in the string. Ruby readings
 * (<rt>) are skipped so 漢字(かんじ) doesn't turn into 漢字かんじ.
 */
function collectText(doc: Document): CollectedText {
  const body = doc.body ?? doc.documentElement
  const spans: TextNodeSpan[] = []
  let text = ''
  let lastBlock: Element | null = null
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text
    const parent = node.parentElement
    if (!parent || parent.closest(SKIP_SELECTOR)) continue
    const piece = (node.data ?? '').replace(/\s+/g, ' ')
    if (!piece.trim()) continue
    const block = parent.closest(BLOCK_SELECTOR)
    if (text && block !== lastBlock) text = `${text.replace(/ $/, '')}\n`
    lastBlock = block
    spans.push({ node, start: text.length, length: piece.length })
    text += piece
  }
  return { text, spans }
}

/** DOM position of a character offset in collected text (approximate inside collapsed whitespace). */
function domPoint(spans: TextNodeSpan[], offset: number): { node: Text; offset: number } | null {
  if (spans.length === 0) return null
  let lo = 0
  let hi = spans.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (spans[mid].start <= offset) lo = mid
    else hi = mid - 1
  }
  const span = spans[lo]
  const local = Math.max(0, Math.min(offset - span.start, span.node.length))
  return { node: span.node, offset: local }
}

interface SectionLike {
  index: number
  href: string
  document?: Document
  load(request: unknown): Promise<unknown>
  unload(): void
  cfiFromRange(range: Range): string
}

function sectionChunks(section: SectionLike): IndexChunk[] {
  const doc = section.document
  if (!doc) return []
  const { text, spans } = collectText(doc)
  if (text.trim().length < 20) return []
  const chunks: IndexChunk[] = []
  for (const [start, end] of chunkRanges(text)) {
    const body = text.slice(start, end).trim()
    if (body.length < 10) continue
    const a = domPoint(spans, start)
    const b = domPoint(spans, end)
    let cfi = ''
    if (a && b) {
      try {
        const range = doc.createRange()
        range.setStart(a.node, a.offset)
        range.setEnd(b.node, b.offset)
        cfi = section.cfiFromRange(range)
      } catch {
        cfi = ''
      }
    }
    chunks.push({ text: body, cfi })
  }
  return chunks
}

export interface IndexProgress {
  done: number
  total: number
}

export interface IndexControl {
  cancelled: boolean
}

/**
 * Splits every not-yet-indexed spine section into chunks and hands them to
 * `store`. Uses its own epub.js instance so the reader's rendition (which is
 * rebuilt on layout changes) is never touched.
 */
export async function indexBookText(
  raw: ArrayBuffer,
  alreadyIndexed: Set<number>,
  chapterFor: (href: string) => string | null,
  store: (section: number, href: string, chapter: string, chunks: IndexChunk[]) => Promise<void>,
  control: IndexControl,
  onProgress: (p: IndexProgress) => void
): Promise<void> {
  const book: EpubBook = ePub(raw)
  try {
    await book.opened
    // epub.js loads navigation in the background without a catch; destroying the
    // book before it settles surfaces as an unhandled rejection.
    await book.loaded.navigation
    const items = (book.spine as unknown as { spineItems: SectionLike[] }).spineItems
    let done = items.filter((s) => alreadyIndexed.has(s.index)).length
    onProgress({ done, total: items.length })
    for (const item of items) {
      if (control.cancelled) return
      if (alreadyIndexed.has(item.index)) continue
      let chunks: IndexChunk[] = []
      try {
        await item.load(book.load.bind(book))
        chunks = sectionChunks(item)
      } catch (err) {
        console.warn('index: section failed', item.href, err)
      } finally {
        item.unload()
      }
      if (control.cancelled) return
      await store(item.index, item.href, chapterFor(item.href) ?? '', chunks)
      done += 1
      onProgress({ done, total: items.length })
    }
  } finally {
    try {
      book.destroy()
    } catch {
      // ignore teardown errors
    }
  }
}

export interface ChapterContext {
  text: string
  sectionIndex: number | null
  /** The whole chapter fit into `text`. */
  complete: boolean
}

/** Text of the displayed chapter around `cfi`, trimmed to CHAPTER_CONTEXT_CHARS. */
export function chapterContext(
  rendition: Rendition,
  cfi: string | null,
  sectionIndex: number | null
): ChapterContext {
  // epub.js types declare a single Contents, but the runtime returns an array.
  const all = rendition.getContents() as unknown as (Contents & { sectionIndex: number })[]
  const contents = all.find((c) => c.sectionIndex === sectionIndex) ?? all[0]
  if (!contents) return { text: '', sectionIndex: null, complete: false }
  const { text, spans } = collectText(contents.document)
  if (text.length <= CHAPTER_CONTEXT_CHARS) {
    return { text, sectionIndex: contents.sectionIndex, complete: true }
  }
  let position = 0
  if (cfi) {
    try {
      const range = contents.range(cfi)
      const hit = spans.find((s) => range.comparePoint(s.node, s.node.length) >= 0)
      if (hit) position = hit.start
    } catch {
      position = 0
    }
  }
  const start = Math.max(
    0,
    Math.min(position - CONTEXT_BEFORE_POSITION, text.length - CHAPTER_CONTEXT_CHARS)
  )
  return {
    text: text.slice(start, start + CHAPTER_CONTEXT_CHARS),
    sectionIndex: contents.sectionIndex,
    complete: false
  }
}
