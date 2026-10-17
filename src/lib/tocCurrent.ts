// Choosing the table-of-contents entry for the reading position. Kept free of epub.js
// and the DOM so it can be unit tested (tocCurrent.test.ts); Reader.tsx supplies the
// spine and tells whether an anchor has been reached.

/** The parts of an epub.js NavItem used here. */
export interface TocNode {
  href: string
  label: string
  subitems?: TocNode[]
}

export interface TocEntry {
  /** Path in the tree ("2.0" = first child of the third entry); unique even when labels repeat. */
  key: string
  label: string
  depth: number
  /** Spine item the entry points into, or null when its file is not in the spine. */
  spineIndex: number | null
  /** The "#id" part of the href, without the "#". */
  fragment: string | null
}

/** Whether an anchor is on screen or before it ("reached"), after it, or could not be found. */
export type AnchorPlace = 'reached' | 'ahead' | 'unknown'

/** Key of the TocPanel item for a path in the tree (see TocEntry.key). */
export function tocKey(path: readonly number[]): string {
  return path.join('.')
}

function cleanPath(href: string): string {
  let path = href.split('#')[0].split('?')[0]
  try {
    path = decodeURI(path)
  } catch {
    // keep it as written
  }
  return path.replace(/^(\.{1,2}\/)+/, '').replace(/^\//, '')
}

/** Spine index of the file an href points to: the same path, or one ending with the other. */
export function spineIndexOf(href: string, spineHrefs: readonly string[]): number | null {
  const path = cleanPath(href)
  if (!path) return null
  const spine = spineHrefs.map(cleanPath)
  const exact = spine.indexOf(path)
  if (exact >= 0) return exact
  const suffix = spine.findIndex((s) => s.endsWith(`/${path}`) || path.endsWith(`/${s}`))
  return suffix >= 0 ? suffix : null
}

/** The entries in reading order (each entry before its subitems). */
export function flattenToc(toc: readonly TocNode[], spineHrefs: readonly string[]): TocEntry[] {
  const out: TocEntry[] = []
  const walk = (items: readonly TocNode[], path: number[]) => {
    items.forEach((item, i) => {
      const at = [...path, i]
      const hash = item.href.indexOf('#')
      out.push({
        key: tocKey(at),
        label: item.label.trim(),
        depth: path.length,
        spineIndex: spineIndexOf(item.href, spineHrefs),
        fragment: hash >= 0 && hash < item.href.length - 1 ? item.href.slice(hash + 1) : null
      })
      if (item.subitems?.length) walk(item.subitems, at)
    })
  }
  walk(toc, [])
  return out
}

/**
 * The entry for a reading position in spine item `spineIndex`.
 *
 * - Entries for that file: the last one whose anchor has been reached. An entry without an
 *   anchor starts the file, so it is reached but comes before any reached anchor. When no
 *   anchor has been reached (or none can be found), the first entry for the file.
 * - A file without entries: the last entry of the closest earlier file that has some.
 * - Nested entries come after their parent, so the deepest match wins.
 */
export function currentTocEntry(
  entries: readonly TocEntry[],
  spineIndex: number,
  place: (fragment: string) => AnchorPlace
): TocEntry | null {
  let file = -1
  for (const e of entries) {
    if (e.spineIndex !== null && e.spineIndex <= spineIndex && e.spineIndex > file)
      file = e.spineIndex
  }
  if (file < 0) return null
  const inFile = entries.filter((e) => e.spineIndex === file)
  // Every anchor in an earlier file has been passed.
  const reached = (e: TocEntry) =>
    e.fragment === null || file < spineIndex || place(e.fragment) === 'reached'
  const anchored = inFile.filter((e) => e.fragment !== null && reached(e))
  if (anchored.length > 0) return anchored[anchored.length - 1]
  const starts = inFile.filter((e) => e.fragment === null)
  if (starts.length > 0) return starts[starts.length - 1]
  return inFile[0]
}
