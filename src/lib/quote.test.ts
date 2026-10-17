import { describe, expect, it } from 'vitest'
import { MAX_QUOTE, quoteText } from './quote'

describe('quoteText', () => {
  it('joins lines and collapses spaces', () => {
    expect(quoteText('  It was a truth\n  universally\r\n\tacknowledged.  ')).toBe(
      'It was a truth universally acknowledged.'
    )
    expect(quoteText('ミケは\n三毛猫。')).toBe('ミケは 三毛猫。')
  })

  it('keeps a selection up to the limit as it is', () => {
    const text = 'あ'.repeat(MAX_QUOTE)
    expect(quoteText(text)).toBe(text)
  })

  it('cuts a longer selection and marks the cut', () => {
    expect(quoteText('あ'.repeat(MAX_QUOTE + 1))).toBe(`${'あ'.repeat(MAX_QUOTE)}…`)
    expect(quoteText('one two three', 8)).toBe('one two…')
  })

  it('does not split a surrogate pair', () => {
    expect(quoteText('𠮷'.repeat(5), 3)).toBe('𠮷𠮷𠮷…')
  })
})
