import type { Book } from 'epubjs'
import { describe, expect, it } from 'vitest'
import { edgeTurns, isRtlBook, pageTurnForKey } from './pageKeys'

describe('pageTurnForKey', () => {
  it('turns forward with → and back with ← in a left-to-right book', () => {
    expect(pageTurnForKey('ArrowRight', false)).toBe('next')
    expect(pageTurnForKey('ArrowLeft', false)).toBe('prev')
  })

  it('turns forward with ← and back with → in a right-to-left book', () => {
    expect(pageTurnForKey('ArrowLeft', true)).toBe('next')
    expect(pageTurnForKey('ArrowRight', true)).toBe('prev')
  })

  it('keeps PageDown and Space forward and PageUp back in either direction', () => {
    for (const rtl of [false, true]) {
      expect(pageTurnForKey('PageDown', rtl)).toBe('next')
      expect(pageTurnForKey(' ', rtl)).toBe('next')
      expect(pageTurnForKey('PageUp', rtl)).toBe('prev')
    }
  })

  it('ignores other keys', () => {
    expect(pageTurnForKey('ArrowUp', false)).toBeNull()
    expect(pageTurnForKey('Enter', true)).toBeNull()
  })
})

describe('edgeTurns', () => {
  it('puts the next page on the right edge of a left-to-right book', () => {
    expect(edgeTurns(false)).toEqual({ left: 'prev', right: 'next' })
  })

  it('puts the next page on the left edge of a right-to-left book', () => {
    expect(edgeTurns(true)).toEqual({ left: 'next', right: 'prev' })
  })
})

describe('isRtlBook', () => {
  const book = (direction?: string | null) =>
    ({ packaging: { metadata: { direction } } }) as unknown as Book

  it('reads the spine direction epub.js puts in the package metadata', () => {
    expect(isRtlBook(book('rtl'))).toBe(true)
    expect(isRtlBook(book('ltr'))).toBe(false)
    expect(isRtlBook(book(null))).toBe(false)
    expect(isRtlBook({} as Book)).toBe(false)
  })
})
