import { describe, expect, it } from 'vitest'
import type { AssistantSource } from '../types'
import { citedSources, splitCitations } from './citations'

const source = (label: string): AssistantSource => ({
  label,
  kind: label.startsWith('H') ? 'highlight' : 'passage',
  cfi: `epubcfi(${label})`,
  excerpt: label
})
const sources = ['#1', '#2', '#3', 'H1', 'H2'].map(source)

describe('citedSources', () => {
  it('keeps only the sources the answer cites, in their original order', () => {
    const answer = 'The lamp turns [#3]. Your note says so too [H1][#3]. See also [#12] and [H].'
    expect(citedSources(answer, sources).map((s) => s.label)).toEqual(['#3', 'H1'])
  })

  it('is empty when nothing is cited', () => {
    expect(citedSources('No citations here.', sources)).toEqual([])
    expect(citedSources('', sources)).toEqual([])
  })
})

describe('splitCitations', () => {
  it('splits an answer into text and citation labels', () => {
    expect(splitCitations('a [#1] b [H2].')).toEqual([
      { text: 'a ' },
      { label: '#1' },
      { text: ' b ' },
      { label: 'H2' },
      { text: '.' }
    ])
    expect(splitCitations('plain')).toEqual([{ text: 'plain' }])
  })
})
