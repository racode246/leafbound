// Nesting for a flat table of contents, inferred from the numbers its labels start with (#66).
// Books converted from Kindle formats often list every entry at the top level even though
// the labels read "第1部 …", "14章 …", "14.2 …", "14.2.1 …". Kept free of epub.js and the
// DOM so it can be unit tested (tocInfer.test.ts).

/** The parts of an epub.js NavItem used here. */
interface Nestable<T> {
  label: string
  subitems?: T[]
}

type Heading =
  | { kind: 'part' }
  | { kind: 'chapter'; number: string }
  | { kind: 'section'; numbers: string[] }
  | null

const PART = /^(?:第\s*\d+\s*部|part\s+\d+(?!\d))/i
const CHAPTER = /^(?:第?\s*(\d+)\s*章|chapter\s+(\d+)(?!\d))/i
/** "14.2" or "14.2.1", followed by a space or nothing ("1.5x" is not a number). */
const SECTION = /^(\d+(?:\.\d+)+)\.?(?=\s|$)/

/** Full-width digits and periods as ASCII. */
function halfWidth(s: string): string {
  return s.replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
}

/** "01" and "1" are the same number. */
const num = (s: string) => String(Number(s))

function headingOf(label: string): Heading {
  const text = halfWidth(label.trim())
  if (PART.test(text)) return { kind: 'part' }
  const chapter = CHAPTER.exec(text)
  if (chapter) return { kind: 'chapter', number: num(chapter[1] ?? chapter[2]) }
  const section = SECTION.exec(text)
  if (section) return { kind: 'section', numbers: section[1].split('.').map(num) }
  return null
}

/** Whether `parent`'s number is a prefix of the section number (14章 and 14.2 of 14.2.1). */
function isPrefix(parent: Heading, numbers: readonly string[]): boolean {
  if (parent?.kind === 'chapter') return parent.number === numbers[0]
  if (parent?.kind === 'section')
    return (
      parent.numbers.length < numbers.length && parent.numbers.every((n, i) => n === numbers[i])
    )
  return false
}

interface Node<T> {
  item: T
  heading: Heading
  children: Node<T>[]
}

/**
 * The TOC with nesting inferred from label numbers, or `toc` itself when it already has
 * nesting or the numbers give only one level.
 *
 * Levels from the top: part (第N部, Part N) → chapter (第N章, N章, Chapter N) → dotted
 * numbers. A chapter goes under the open part. A dotted number goes under the closest open
 * entry whose number is its prefix; without one (an orphan), it takes the place of its missing
 * parent: under the open part, or at the top level. Unnumbered entries stay at the top level
 * and close the open branch, since the entries after them cannot nest above them.
 */
export function inferTocNesting<T extends Nestable<T>>(toc: T[]): T[] {
  if (toc.some((item) => item.subitems?.length)) return toc
  const roots: Node<T>[] = []
  // The open branch: stack[i] is the open entry at depth i.
  const stack: Node<T>[] = []
  let nested = false
  for (const item of toc) {
    const heading = headingOf(item.label)
    const node: Node<T> = { item, heading, children: [] }
    let depth = 0
    if (heading && heading.kind !== 'part') {
      const partOpen = stack[0]?.heading?.kind === 'part' ? 1 : 0
      depth = partOpen
      if (heading.kind === 'section') {
        for (let i = stack.length - 1; i >= partOpen; i--) {
          if (isPrefix(stack[i].heading, heading.numbers)) {
            depth = i + 1
            break
          }
        }
      }
    }
    stack.length = depth
    if (depth === 0) roots.push(node)
    else {
      stack[depth - 1].children.push(node)
      nested = true
    }
    if (heading) stack.push(node)
  }
  if (!nested) return toc
  const build = (node: Node<T>): T => ({ ...node.item, subitems: node.children.map(build) })
  return roots.map(build)
}
