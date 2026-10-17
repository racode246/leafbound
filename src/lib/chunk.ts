// Splitting book text into passages for the embedding model. Kept free of
// epub.js and the DOM so it can be unit tested (chunk.test.ts).
//
// Changing how chunks are made? Bump CHUNK_INDEX in src-tauri/src/assistant/mod.rs so
// already indexed books are indexed again.

/** Characters per chunk sent to the embedding model (~512 tokens at most for Japanese). */
export const CHUNK_SIZE = 500
export const CHUNK_OVERLAP = 100

const BOUNDARY = /[。．！？!?\n]|\.\s/g

/** [start, end) ranges of roughly CHUNK_SIZE characters that prefer to end at a sentence. */
export function chunkRanges(
  text: string,
  size = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP
): [number, number][] {
  const out: [number, number][] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(text.length, start + size)
    if (end < text.length) {
      const from = start + Math.floor(size * 0.6)
      BOUNDARY.lastIndex = from
      let cut = -1
      for (let m = BOUNDARY.exec(text); m && m.index < end; m = BOUNDARY.exec(text))
        cut = m.index + 1
      if (cut > from) end = cut
    }
    out.push([start, end])
    if (end >= text.length) break
    // Begin the overlap at a sentence start when there is one early in it.
    let next = end - overlap
    BOUNDARY.lastIndex = next
    const m = BOUNDARY.exec(text)
    if (m && m.index + m[0].length < end - overlap / 3) next = m.index + m[0].length
    start = Math.max(start + 1, next)
  }
  return out
}
