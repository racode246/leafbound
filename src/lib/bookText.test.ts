import { describe, expect, it } from 'vitest'
import { CHAPTER_CONTEXT_CHARS, chapterWindow } from './bookText'

const chapter = (n: number) =>
  Array.from({ length: n / 10 }, (_, i) => `${String(i).padStart(9, '0')}\n`).join('')

describe('chapterWindow', () => {
  it('sends a chapter that fits the budget whole', () => {
    const text = chapter(CHAPTER_CONTEXT_CHARS)
    expect(chapterWindow(text, 30_000)).toEqual({ text, omitted: null })
    expect(chapterWindow('短い章。', 0)).toEqual({ text: '短い章。', omitted: null })
  })

  it('cuts a longer chapter to the budget around the reading position and says what is left out', () => {
    const text = chapter(100_000)
    const mid = chapterWindow(text, 50_000)
    expect(mid.text).toHaveLength(CHAPTER_CONTEXT_CHARS)
    expect(mid.omitted).toEqual({ before: 35_000, after: 5_000 })
    expect(text.indexOf(mid.text)).toBe(35_000)

    const start = chapterWindow(text, 0)
    expect(start.text).toBe(text.slice(0, CHAPTER_CONTEXT_CHARS))
    expect(start.omitted).toEqual({ before: 0, after: 40_000 })

    const end = chapterWindow(text, 99_000)
    expect(end.text).toBe(text.slice(40_000))
    expect(end.omitted).toEqual({ before: 40_000, after: 0 })
  })
})
