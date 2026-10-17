import { describe, expect, it } from 'vitest'
import { CHUNK_OVERLAP, CHUNK_SIZE, chunkRanges } from './chunk'

const ja = (n: number) =>
  Array.from({ length: n }, (_, i) => `ミケは三毛猫で、古本屋の店先で暮らしている（${i}）。`).join(
    ''
  )
const en = (n: number) =>
  Array.from({ length: n }, (_, i) => `The lamp turns every fifteen seconds (${i}). `).join('')

describe('chunkRanges', () => {
  it('returns one chunk for short text', () => {
    expect(chunkRanges('短い文。')).toEqual([[0, 4]])
    expect(chunkRanges('')).toEqual([])
  })

  for (const [name, text] of [
    ['Japanese', ja(80)],
    ['English', en(80)]
  ] as const) {
    describe(name, () => {
      const ranges = chunkRanges(text)

      it('covers the whole text without gaps', () => {
        expect(ranges[0][0]).toBe(0)
        expect(ranges.at(-1)![1]).toBe(text.length)
        for (let i = 1; i < ranges.length; i++)
          expect(ranges[i][0]).toBeLessThanOrEqual(ranges[i - 1][1])
      })

      it('keeps chunks within the size and overlapping by at most the overlap', () => {
        for (const [start, end] of ranges) expect(end - start).toBeLessThanOrEqual(CHUNK_SIZE)
        for (let i = 1; i < ranges.length; i++)
          expect(ranges[i - 1][1] - ranges[i][0]).toBeLessThanOrEqual(CHUNK_OVERLAP)
      })

      it('ends chunks at sentence ends and starts them at sentence starts', () => {
        for (const [, end] of ranges.slice(0, -1)) expect(text.slice(end - 1, end)).toMatch(/[。.]/)
        for (const [start] of ranges.slice(1)) expect(text.slice(start - 1, start)).toMatch(/[。 ]/)
      })
    })
  }

  it('always makes progress on text without sentence boundaries', () => {
    const text = 'あ'.repeat(2000)
    const ranges = chunkRanges(text)
    expect(ranges.at(-1)![1]).toBe(2000)
    for (let i = 1; i < ranges.length; i++) expect(ranges[i][0]).toBeGreaterThan(ranges[i - 1][0])
  })
})
