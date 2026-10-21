import type { AssistantSource } from '../types'

/** A citation label as the model writes it: `#n` for a passage, `Hn` for a highlight. */
const LABEL = /\[(#\d+|H\d+)\]/g

export type AnswerPart = { text: string } | { label: string }

/** An answer split into plain text and the citation labels in it, in order. */
export function splitCitations(answer: string): AnswerPart[] {
  const parts: AnswerPart[] = []
  let last = 0
  for (const m of answer.matchAll(LABEL)) {
    if (m.index > last) parts.push({ text: answer.slice(last, m.index) })
    parts.push({ label: m[1] })
    last = m.index + m[0].length
  }
  if (last < answer.length || parts.length === 0) parts.push({ text: answer.slice(last) })
  return parts
}

/**
 * The sources an answer actually cites, in the order they were sent. The
 * model gets every retrieved passage but uses a few; listing the rest as
 * "referenced" misled readers about where an answer came from.
 */
export function citedSources(answer: string, sources: AssistantSource[]): AssistantSource[] {
  const cited = new Set<string>()
  for (const part of splitCitations(answer)) if ('label' in part) cited.add(part.label)
  return sources.filter((s) => cited.has(s.label))
}
