import { describe, expect, it } from 'vitest'
import {
  type AnchorPlace,
  currentTocEntry,
  flattenToc,
  spineIndexOf,
  type TocNode
} from './tocCurrent'

const node = (label: string, href: string, subitems?: TocNode[]): TocNode => ({
  label,
  href,
  subitems
})

/** Label and key of the current entry, with anchors placed as given (others unknown). */
function current(
  toc: TocNode[],
  spine: string[],
  spineIndex: number,
  places: Record<string, AnchorPlace> = {}
) {
  const e = currentTocEntry(flattenToc(toc, spine), spineIndex, (f) => places[f] ?? 'unknown')
  return e && { label: e.label, key: e.key }
}

describe('flattenToc', () => {
  it('lists entries before their subitems with unique keys, spine indexes and anchors', () => {
    const toc = [
      node(' One ', 'Text/ch1.xhtml'),
      node('Two', 'Text/ch2.xhtml', [node('Two.1', 'Text/ch2.xhtml#s1')]),
      node('Elsewhere', 'http://example.com/')
    ]
    expect(flattenToc(toc, ['Text/ch1.xhtml', 'Text/ch2.xhtml'])).toEqual([
      { key: '0', label: 'One', depth: 0, spineIndex: 0, fragment: null },
      { key: '1', label: 'Two', depth: 0, spineIndex: 1, fragment: null },
      { key: '1.0', label: 'Two.1', depth: 1, spineIndex: 1, fragment: 's1' },
      { key: '2', label: 'Elsewhere', depth: 0, spineIndex: null, fragment: null }
    ])
  })
})

describe('spineIndexOf', () => {
  const spine = ['Text/ch1.xhtml', 'Text/ch11.xhtml', 'Text/a%20b.xhtml']
  it('matches the same file, a relative path, or an encoded name', () => {
    expect(spineIndexOf('Text/ch1.xhtml#x', spine)).toBe(0)
    expect(spineIndexOf('../Text/ch11.xhtml', spine)).toBe(1)
    expect(spineIndexOf('ch11.xhtml', spine)).toBe(1)
    expect(spineIndexOf('Text/a b.xhtml', spine)).toBe(2)
  })
  it('does not match part of a file name', () => {
    expect(spineIndexOf('1.xhtml', spine)).toBeNull()
    expect(spineIndexOf('#only-a-fragment', spine)).toBeNull()
  })
})

describe('currentTocEntry', () => {
  const spine = ['cover.xhtml', 'ch1.xhtml', 'ch2.xhtml', 'ch3.xhtml']

  describe('several entries in the same file', () => {
    const toc = [
      node('Chapter 1', 'ch1.xhtml'),
      node('Chapter 2', 'ch2.xhtml'),
      node('Section A', 'ch2.xhtml#a'),
      node('Section B', 'ch2.xhtml#b')
    ]
    it('picks the last entry whose anchor has been reached', () => {
      expect(current(toc, spine, 2, { a: 'reached', b: 'ahead' })?.label).toBe('Section A')
      expect(current(toc, spine, 2, { a: 'reached', b: 'reached' })?.label).toBe('Section B')
    })
    it('picks the entry for the start of the file before the first anchor', () => {
      expect(current(toc, spine, 2, { a: 'ahead', b: 'ahead' })?.label).toBe('Chapter 2')
    })
    it('picks the first entry for the file when anchors cannot be resolved', () => {
      expect(current(toc, spine, 2)?.label).toBe('Chapter 2')
      const onlyAnchors = [node('One', 'ch1.xhtml#one'), node('Two', 'ch1.xhtml#two')]
      expect(current(onlyAnchors, spine, 1)?.label).toBe('One')
      expect(current(onlyAnchors, spine, 1, { one: 'ahead', two: 'ahead' })?.label).toBe('One')
    })
  })

  describe('a spine item without its own entry', () => {
    const toc = [
      node('Chapter 1', 'ch1.xhtml'),
      node('Section 1', 'ch1.xhtml#s'),
      node('Chapter 3', 'ch3.xhtml')
    ]
    it('picks the closest earlier entry, past all of its anchors', () => {
      expect(current(toc, spine, 2, { s: 'ahead' })?.label).toBe('Section 1')
    })
    it('picks nothing before the first entry', () => {
      expect(current(toc, spine, 0)).toBeNull()
    })
  })

  describe('nested entries', () => {
    const toc = [
      node('Part I', 'ch1.xhtml', [
        node('Chapter 1', 'ch1.xhtml', [node('1.1', 'ch1.xhtml#p1'), node('1.2', 'ch1.xhtml#p2')])
      ]),
      node('Part II', 'ch2.xhtml', [node('Chapter 2', 'ch3.xhtml')])
    ]
    it('marks the deepest match', () => {
      expect(current(toc, spine, 1)).toEqual({ label: 'Chapter 1', key: '0.0' })
      expect(current(toc, spine, 1, { p1: 'reached', p2: 'ahead' })).toEqual({
        label: '1.1',
        key: '0.0.0'
      })
      expect(current(toc, spine, 2)).toEqual({ label: 'Part II', key: '1' })
      expect(current(toc, spine, 3)).toEqual({ label: 'Chapter 2', key: '1.0' })
    })
  })

  describe('duplicate labels', () => {
    const toc = [
      node('Part 1', 'ch1.xhtml', [node('Notes', 'ch2.xhtml')]),
      node('Part 2', 'ch3.xhtml', [node('Notes', 'ch3.xhtml#notes')])
    ]
    it('tells the entries apart by their place in the tree', () => {
      expect(current(toc, spine, 2)).toEqual({ label: 'Notes', key: '0.0' })
      expect(current(toc, spine, 3, { notes: 'reached' })).toEqual({ label: 'Notes', key: '1.0' })
      expect(current(toc, spine, 3, { notes: 'ahead' })).toEqual({ label: 'Part 2', key: '1' })
    })
  })
})
