import { DOMParser } from '@xmldom/xmldom'
import { describe, expect, it } from 'vitest'
import { extractNoteText, type NoteRefKind, noteRefKind, resolveBookLink } from './notes'

function parse(body: string): Document {
  return new DOMParser().parseFromString(
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body>${body}</body></html>`,
    'application/xhtml+xml'
  ) as unknown as Document
}

/** The reference is the element with id="ref" in the document. */
function kindOf(body: string): NoteRefKind | null {
  return noteRefKind(parse(body).getElementById('ref') as Element)
}

/** Extracts `#fragment` as the note of the element with id="ref" (the reference is optional). */
function extract(body: string, fragment = 'n1', kind: NoteRefKind = 'explicit'): string[] | null {
  const doc = parse(body)
  return extractNoteText(doc, fragment, doc.getElementById('ref'), kind)
}

describe('noteRefKind', () => {
  it('finds epub:type="noteref", also among other types', () => {
    expect(kindOf('<p><a id="ref" epub:type="noteref" href="#n1">a</a></p>')).toBe('explicit')
    expect(kindOf('<p><a id="ref" epub:type="biblioref noteref" href="#n1">a</a></p>')).toBe(
      'explicit'
    )
  })

  it('finds role="doc-noteref"', () => {
    expect(kindOf('<p><a id="ref" role="doc-noteref" href="n.xhtml#n1">a</a></p>')).toBe('explicit')
  })

  it.each([
    '1',
    '12',
    '１',
    '*',
    '＊',
    '†',
    '‡',
    '※',
    '[1]',
    '(3)',
    '（３）',
    '［2］',
    '注1',
    '注 12',
    '注一',
    '*1'
  ])('takes the short marker %s after some text for a reference', (marker) => {
    expect(kindOf(`<p>Text<sup><a id="ref" href="#n1">${marker}</a></sup> more.</p>`)).toBe(
      'marker'
    )
  })

  it('takes a marker whose <sup> is inside the link', () => {
    expect(kindOf('<p>Text<a id="ref" href="#n1"><sup>2</sup></a></p>')).toBe('marker')
  })

  it('does not take a chapter link or a "see Chapter 3" link', () => {
    expect(kindOf('<p>Next: <a id="ref" href="c3.xhtml">Chapter 3</a></p>')).toBeNull()
    expect(kindOf('<p>See <a id="ref" href="c3.xhtml#s1">see Chapter 3</a></p>')).toBeNull()
  })

  it('does not take a marker without a fragment', () => {
    expect(kindOf('<p>Chapter <a id="ref" href="c3.xhtml">3</a></p>')).toBeNull()
  })

  it('does not take a link that opens its block, like the number of the note itself', () => {
    expect(kindOf('<p><a id="ref" href="c1.xhtml#r1">1</a> The note.</p>')).toBeNull()
    expect(kindOf('<li><sup><a id="ref" href="#r1">[1]</a></sup> The note.</li>')).toBeNull()
  })

  it('does not take a back link', () => {
    expect(kindOf('<p>Text <a id="ref" epub:type="backlink" href="#r1">1</a></p>')).toBeNull()
    expect(kindOf('<p>Text <a id="ref" role="doc-backlink" href="#r1">1</a></p>')).toBeNull()
  })

  it('does not take a link in a table of contents', () => {
    expect(
      kindOf('<nav epub:type="toc"><ol><li>One <a id="ref" href="c1.xhtml#a">1</a></li></ol></nav>')
    ).toBeNull()
  })
})

describe('resolveBookLink', () => {
  it('resolves a link within the section', () => {
    expect(resolveBookLink('#n1', 'Text/c1.xhtml')).toEqual({
      path: 'Text/c1.xhtml',
      fragment: 'n1'
    })
  })

  it('resolves a link to another section', () => {
    expect(resolveBookLink('notes.xhtml#n1', 'Text/c1.xhtml')).toEqual({
      path: 'Text/notes.xhtml',
      fragment: 'n1'
    })
    expect(resolveBookLink('../Notes/n.xhtml#n1', 'Text/c1.xhtml')).toEqual({
      path: 'Notes/n.xhtml',
      fragment: 'n1'
    })
  })

  it('decodes the path and the fragment', () => {
    expect(resolveBookLink('my%20notes.xhtml#%E6%B3%A81', 'c1.xhtml')).toEqual({
      path: 'my notes.xhtml',
      fragment: '注1'
    })
  })

  it('returns null without a fragment, or for a link out of the book', () => {
    expect(resolveBookLink('c2.xhtml', 'c1.xhtml')).toBeNull()
    expect(resolveBookLink('#', 'c1.xhtml')).toBeNull()
    expect(resolveBookLink('https://example.com/a#b', 'c1.xhtml')).toBeNull()
    expect(resolveBookLink('mailto:a@example.com#b', 'c1.xhtml')).toBeNull()
  })
})

describe('extractNoteText', () => {
  it('reads an aside', () => {
    expect(extract('<aside id="n1" epub:type="footnote"><p>The note.</p></aside>')).toEqual([
      'The note.'
    ])
  })

  it('reads a list item', () => {
    expect(extract('<ol><li id="n1">First note.</li><li id="n2">Second.</li></ol>')).toEqual([
      'First note.'
    ])
  })

  it('reads a paragraph', () => {
    expect(extract('<p id="n1">A  note\n  on two lines.</p><p>Body.</p>')).toEqual([
      'A note on two lines.'
    ])
  })

  it('reads the block around an anchor or an inline target', () => {
    expect(extract('<p><a id="n1"></a>Anchored note.</p>')).toEqual(['Anchored note.'])
    expect(extract('<p><span id="n1">*</span> Starred note.</p>')).toEqual(['* Starred note.'])
    expect(extract('<p><a name="n1"></a>Named anchor.</p>')).toEqual(['Named anchor.'])
  })

  it('keeps the paragraphs of a note apart', () => {
    expect(extract('<aside id="n1"><p>One.</p><p>Two<br/>Three.</p></aside>')).toEqual([
      'One.',
      'Two',
      'Three.'
    ])
  })

  it('drops a back link marked with epub:type or role', () => {
    expect(
      extract('<aside id="n1"><p>Note. <a epub:type="backlink" href="#r">go back</a></p></aside>')
    ).toEqual(['Note.'])
    expect(
      extract('<aside id="n1"><p>Note. <a role="doc-backlink" href="#r">go back</a></p></aside>')
    ).toEqual(['Note.'])
  })

  it('drops a link back to the reference, by its id or the id around it', () => {
    expect(
      extract('<p>Text<a id="ref" href="#n1">1</a></p><p id="n1"><a href="#ref">1</a>. Note.</p>')
    ).toEqual(['Note.'])
    expect(
      extract(
        '<p>Text<sup id="r1"><a id="ref" href="#n1">1</a></sup></p><p id="n1">Note. <a href="c1.xhtml#r1">up</a></p>'
      )
    ).toEqual(['Note.'])
  })

  it.each(['↩', '↩︎', '↑', 'Back', '戻る'])('drops a link reading %s', (text) => {
    expect(extract(`<p id="n1">Note. <a href="#x">${text}</a></p>`)).toEqual(['Note.'])
  })

  it('keeps other links as text', () => {
    expect(extract('<p id="n1">See <a href="https://example.com/">the site</a>.</p>')).toEqual([
      'See the site.'
    ])
  })

  it('leaves out the readings of ruby, and scripts', () => {
    expect(
      extract(
        '<p id="n1"><ruby>注<rp>(</rp><rt>ちゅう</rt><rp>)</rp></ruby>です<script>x</script></p>'
      )
    ).toEqual(['注です'])
  })

  it('returns null when the target is missing, empty or only a marker', () => {
    expect(extract('<p>No note here.</p>')).toBeNull()
    expect(extract('<p id="n1"><a href="#ref" epub:type="backlink">1</a></p>')).toBeNull()
    expect(extract('<table><tr><td id="n1">1</td><td>Note.</td></tr></table>')).toBeNull()
    expect(extract('<a id="n1"></a><p>After the anchor.</p>')).toBeNull()
  })

  describe('for a marker reference', () => {
    const marker = (body: string) => extract(body, 'n1', 'marker')

    it('reads a short block', () => {
      expect(marker('<p id="n1">A short note.</p>')).toEqual(['A short note.'])
    })

    it('refuses a heading or a block with a heading', () => {
      expect(marker('<h2 id="n1">Chapter 3</h2>')).toBeNull()
      expect(marker('<section id="n1"><h2>Chapter 3</h2><p>Text.</p></section>')).toBeNull()
    })

    it('refuses a long block', () => {
      expect(marker(`<p id="n1">${'x'.repeat(1001)}</p>`)).toBeNull()
    })

    it('refuses a page break target', () => {
      expect(marker('<p><span id="n1" epub:type="pagebreak">12</span>Page text.</p>')).toBeNull()
      expect(marker('<p><span id="n1" role="doc-pagebreak">12</span>Page text.</p>')).toBeNull()
    })
  })

  it('reads a long block for an explicit reference', () => {
    const long = 'x'.repeat(5000)
    expect(extract(`<aside id="n1"><p>${long}</p></aside>`)).toEqual([long])
  })
})
