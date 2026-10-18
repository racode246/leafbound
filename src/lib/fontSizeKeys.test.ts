import { describe, expect, it } from 'vitest'
import { FONT_SIZE_DEFAULT, FONT_SIZE_MAX, FONT_SIZE_MIN } from '../types'
import { fontSizeForKey } from './fontSizeKeys'

const ctrl = (key: string) => ({ key, ctrlKey: true, metaKey: false, altKey: false })
const cmd = (key: string) => ({ key, ctrlKey: false, metaKey: true, altKey: false })

describe('fontSizeForKey', () => {
  it('makes the text larger with Ctrl+= and Ctrl++ (also numpad +)', () => {
    expect(fontSizeForKey(ctrl('='), 18)).toBe(19)
    expect(fontSizeForKey(ctrl('+'), 18)).toBe(19)
  })

  it('makes the text smaller with Ctrl+- (also numpad -)', () => {
    expect(fontSizeForKey(ctrl('-'), 18)).toBe(17)
  })

  it('resets to the default size with Ctrl+0', () => {
    expect(fontSizeForKey(ctrl('0'), 25)).toBe(FONT_SIZE_DEFAULT)
    expect(FONT_SIZE_DEFAULT).toBe(18)
  })

  it('takes ⌘ as well as Ctrl', () => {
    expect(fontSizeForKey(cmd('='), 18)).toBe(19)
    expect(fontSizeForKey(cmd('-'), 18)).toBe(17)
    expect(fontSizeForKey(cmd('0'), 20)).toBe(18)
  })

  it('stays within FONT_SIZE_MIN..FONT_SIZE_MAX', () => {
    expect(fontSizeForKey(ctrl('='), FONT_SIZE_MAX)).toBe(FONT_SIZE_MAX)
    expect(fontSizeForKey(ctrl('-'), FONT_SIZE_MIN)).toBe(FONT_SIZE_MIN)
  })

  it('ignores the keys without Ctrl / ⌘, with Alt, and other keys', () => {
    expect(fontSizeForKey({ key: '=', ctrlKey: false, metaKey: false, altKey: false }, 18)).toBe(
      null
    )
    // Ctrl+Alt is AltGr on some layouts, so it types a character instead.
    expect(fontSizeForKey({ key: '=', ctrlKey: true, metaKey: false, altKey: true }, 18)).toBe(null)
    expect(fontSizeForKey(ctrl('f'), 18)).toBe(null)
    expect(fontSizeForKey(ctrl('1'), 18)).toBe(null)
  })
})
