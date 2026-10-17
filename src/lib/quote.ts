/** Longest selection quoted into an Ask AI question, in characters (code points). */
export const MAX_QUOTE = 500

/**
 * The selected text as it goes into the question: line breaks and runs of spaces become one
 * space, and a selection longer than `max` is cut with "…". Cut by code points, so a
 * surrogate pair is never split.
 */
export function quoteText(selection: string, max = MAX_QUOTE): string {
  const text = selection.replace(/\s+/g, ' ').trim()
  const chars = Array.from(text)
  if (chars.length <= max) return text
  return `${chars.slice(0, max).join('').trimEnd()}…`
}
