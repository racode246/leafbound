// Footnotes and endnotes shown in a popup (issue #82): which links in a book are note references,
// and the text of the note they point to. Only plain DOM traversal, because a note in another
// section comes from a document parsed outside the page (and the tests run without a browser).

/** `explicit`: the book marks the link as a note reference; `marker`: it only looks like one. */
export type NoteRefKind = 'explicit' | 'marker'

/** A link inside the book: a spine href and the id in that section. */
export interface NoteLink {
  path: string
  fragment: string
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3
const CDATA_SECTION_NODE = 4

const LINK_BASE = 'https://book.invalid/'

// A number, a symbol or 注N, optionally in brackets: "1", "*", "†", "[1]", "(3)", "注1".
const MARKER =
  /^[[(（［〔【<〈]?(?:\p{Nd}{1,4}|[*＊†‡§¶※]{1,3}\p{Nd}{0,3}|注\s*[\p{Nd}一二三四五六七八九十]{0,4})[\])）］〕】>〉]?[.．]?$/u
const BACK_LINK_TEXT = /^(?:[↩↑↥⏎⤴^]︎?|\[?(?:back|return|戻る|本文へ(?:戻る)?)\]?)$/i
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
const CONTAINERS = new Set(['html', 'body', 'table', 'tbody', 'tr', 'ol', 'ul', 'dl', 'nav'])
const BLOCKS = new Set([
  ...HEADINGS,
  ...CONTAINERS,
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'div',
  'dt',
  'figcaption',
  'figure',
  'footer',
  'header',
  'li',
  'main',
  'p',
  'pre',
  'section',
  'td',
  'th'
])
const SKIPPED = new Set(['script', 'style', 'rp', 'rt'])
// A marker link is a guess, so a target this long is taken for ordinary text, not a note.
const MAX_MARKER_NOTE_LENGTH = 1000

function hasType(el: Element, type: string): boolean {
  return (el.getAttribute('epub:type') ?? '').split(/\s+/).includes(type)
}

function hasRole(el: Element, role: string): boolean {
  return el.getAttribute('role') === role
}

function parentElement(node: Node): Element | null {
  const parent = node.parentNode
  return parent?.nodeType === ELEMENT_NODE ? (parent as Element) : null
}

function hasAncestor(el: Element, tag: string): boolean {
  for (let p = parentElement(el); p; p = parentElement(p)) if (p.localName === tag) return true
  return false
}

/** Whether something is written before `node` in its block. A note's own number is not. */
function hasTextBefore(node: Node): boolean {
  for (let n: Node | null = node; n; n = n.parentNode) {
    if (n.nodeType === ELEMENT_NODE && BLOCKS.has((n as Element).localName)) return false
    for (let s = n.previousSibling; s; s = s.previousSibling) if (s.textContent?.trim()) return true
  }
  return false
}

/** Says whether a link in the book is a note reference, and how sure that is. */
export function noteRefKind(link: Element): NoteRefKind | null {
  if (!link.getAttribute('href')?.includes('#')) return null
  if (hasType(link, 'noteref') || hasRole(link, 'doc-noteref')) return 'explicit'
  if (hasType(link, 'backlink') || hasRole(link, 'doc-backlink')) return null
  if (hasAncestor(link, 'nav')) return null
  if (!MARKER.test(link.textContent?.trim() ?? '')) return null
  return hasTextBefore(link) ? 'marker' : null
}

/** Resolves an href written in the section at `sectionHref`; null unless it has a fragment in the book. */
export function resolveBookLink(href: string, sectionHref: string): NoteLink | null {
  try {
    const base = new URL(sectionHref, LINK_BASE)
    const url = new URL(href, base)
    if (url.origin !== base.origin || url.hash.length < 2) return null
    return {
      path: decodeURI(url.pathname.slice(1)),
      fragment: decodeURIComponent(url.hash.slice(1))
    }
  } catch {
    return null // malformed URL or escape in the book
  }
}

function findTarget(doc: Document, fragment: string): Element | null {
  const byId = doc.getElementById(fragment)
  if (byId) return byId
  return Array.from(doc.getElementsByTagName('a')).find(
    (a) => a.getAttribute('name') === fragment
  ) as Element | null
}

function enclosingBlock(el: Element): Element | null {
  for (let e: Element | null = el; e; e = parentElement(e)) {
    if (BLOCKS.has(e.localName)) return e
  }
  return null
}

function containsHeading(el: Element): boolean {
  for (let n = el.firstChild; n; n = n.nextSibling) {
    if (n.nodeType !== ELEMENT_NODE) continue
    if (HEADINGS.has((n as Element).localName) || containsHeading(n as Element)) return true
  }
  return false
}

/** The ids a back link can point to: the reference's, and those of the inline elements around it. */
function referenceIds(ref: Element | null): Set<string> {
  const ids = new Set<string>()
  for (let e = ref; e && !BLOCKS.has(e.localName); e = parentElement(e)) {
    const id = e.getAttribute('id')
    if (id) ids.add(id)
  }
  return ids
}

function isBackLink(el: Element, refIds: Set<string>): boolean {
  if (el.localName !== 'a') return false
  if (hasType(el, 'backlink') || hasRole(el, 'doc-backlink')) return true
  if (BACK_LINK_TEXT.test(el.textContent?.trim() ?? '')) return true
  const href = el.getAttribute('href') ?? ''
  const hash = href.indexOf('#')
  return hash >= 0 && refIds.has(href.slice(hash + 1))
}

/** Pushes the text under `node`, with a line break around each block. */
function collectText(node: Node, refIds: Set<string>, out: string[]): void {
  for (let n = node.firstChild; n; n = n.nextSibling) {
    if (n.nodeType === TEXT_NODE || n.nodeType === CDATA_SECTION_NODE) {
      out.push((n.nodeValue ?? '').replace(/\s+/g, ' '))
    } else if (n.nodeType === ELEMENT_NODE) {
      const el = n as Element
      if (el.localName === 'br') out.push('\n')
      else if (!SKIPPED.has(el.localName) && !isBackLink(el, refIds)) {
        const block = BLOCKS.has(el.localName)
        if (block) out.push('\n')
        collectText(el, refIds, out)
        if (block) out.push('\n')
      }
    }
  }
}

/**
 * The text of the note at `#fragment`, as paragraphs without its back link. Null if there is
 * no such note: the caller then treats the link as an ordinary one.
 */
export function extractNoteText(
  doc: Document,
  fragment: string,
  ref: Element | null,
  kind: NoteRefKind
): string[] | null {
  const target = findTarget(doc, fragment)
  const block = target && enclosingBlock(target)
  if (!target || !block || CONTAINERS.has(block.localName)) return null
  if (kind === 'marker') {
    if (hasType(target, 'pagebreak') || hasRole(target, 'doc-pagebreak')) return null
    if (HEADINGS.has(block.localName) || containsHeading(block)) return null
  }
  const parts: string[] = []
  collectText(block, referenceIds(ref), parts)
  const paragraphs = parts
    .join('')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (paragraphs.length === 0) return null
  // What follows a removed number at the start: the "." of "1. The note".
  paragraphs[0] = paragraphs[0].replace(/^[.．。:：,、)）\]］]+\s*/, '')
  const length = paragraphs.reduce((sum, p) => sum + p.length, 0)
  if (length === 0 || MARKER.test(paragraphs.join(''))) return null
  return kind === 'marker' && length > MAX_MARKER_NOTE_LENGTH ? null : paragraphs
}
