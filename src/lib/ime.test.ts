import { describe, expect, it } from 'vitest'
import { isImeEnter } from './ime'

describe('isImeEnter', () => {
  it('treats an Enter during composition as IME input (Chromium)', () => {
    expect(isImeEnter({ isComposing: true, keyCode: 229 })).toBe(true)
  })

  it('treats the Enter that confirms a conversion as IME input (WebKit)', () => {
    // WebKit fires compositionend first, so the keydown is no longer composing.
    expect(isImeEnter({ isComposing: false, keyCode: 229 })).toBe(true)
  })

  it('treats a plain Enter as a submit', () => {
    expect(isImeEnter({ isComposing: false, keyCode: 13 })).toBe(false)
  })
})
