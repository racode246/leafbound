import { describe, expect, it } from 'vitest'
import { isJumpBackKey, jumpBackShortcut } from './jumpBack'

const key = (
  k: string,
  mods: Partial<Record<'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey', boolean>> = {}
) => ({
  key: k,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...mods
})

describe('isJumpBackKey', () => {
  it('is Alt+Left on Windows', () => {
    expect(isJumpBackKey(key('ArrowLeft', { altKey: true }), false)).toBe(true)
    expect(isJumpBackKey(key('[', { metaKey: true }), false)).toBe(false)
  })

  it('is Command+[ on macOS', () => {
    expect(isJumpBackKey(key('[', { metaKey: true }), true)).toBe(true)
    expect(isJumpBackKey(key('ArrowLeft', { altKey: true }), true)).toBe(false)
  })

  it('leaves plain and other modified arrow keys to page turning', () => {
    expect(isJumpBackKey(key('ArrowLeft'), false)).toBe(false)
    expect(isJumpBackKey(key('ArrowLeft', { altKey: true, shiftKey: true }), false)).toBe(false)
    expect(isJumpBackKey(key('ArrowLeft', { altKey: true, ctrlKey: true }), false)).toBe(false)
    expect(isJumpBackKey(key('[', { metaKey: true, shiftKey: true }), true)).toBe(false)
    expect(isJumpBackKey(key('[', { metaKey: true, altKey: true }), true)).toBe(false)
  })
})

describe('jumpBackShortcut', () => {
  it('names the shortcut as people on each OS write it', () => {
    expect(jumpBackShortcut(false)).toBe('Alt+←')
    expect(jumpBackShortcut(true)).toBe('⌘[')
  })
})
