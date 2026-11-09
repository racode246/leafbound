import { describe, expect, it } from 'vitest'
import {
  type Declarations,
  type DomNode,
  isBlockDisplay,
  isFontRelativeLength,
  isInlineImage,
  publisherStyle,
  specificity,
  splitSelectorList
} from './inlineImages'

// A tiny stand-in for the DOM: elements carry their computed display.
interface TestNode extends DomNode {
  display: string
  childNodes: TestNode[]
  parentNode: TestNode | null
}

function el(display: string, ...children: TestNode[]): TestNode {
  const node: TestNode = { nodeType: 1, nodeValue: null, display, parentNode: null, childNodes: [] }
  for (const child of children) {
    child.parentNode = node
    node.childNodes.push(child)
  }
  return node
}

const text = (value: string): TestNode => ({
  nodeType: 3,
  nodeValue: value,
  display: '',
  parentNode: null,
  childNodes: []
})

const img = () => el('inline')
const displayOf = (node: DomNode) => (node as TestNode).display

describe('isInlineImage', () => {
  it('is true for an image in a paragraph with text', () => {
    const image = img()
    el('block', el('block', text('The function has '), image, text(' combinations.')))
    expect(isInlineImage(image, displayOf)).toBe(true)
  })

  it('counts text in inline elements of the same paragraph', () => {
    const image = img()
    el('block', image, el('inline', el('inline', text('Figure 1-3'))))
    expect(isInlineImage(image, displayOf)).toBe(true)
  })

  it('looks through inline wrappers to the nearest block', () => {
    const image = img()
    el('block', text('as in '), el('inline', el('inline', image)), text(' above'))
    expect(isInlineImage(image, displayOf)).toBe(true)
  })

  it('is false for an image alone in a paragraph or a div', () => {
    const inP = img()
    el('block', el('block', inP))
    expect(isInlineImage(inP, displayOf)).toBe(false)
    const inDiv = img()
    el('block', inDiv)
    expect(isInlineImage(inDiv, displayOf)).toBe(false)
  })

  it('ignores whitespace, including no-break and ideographic spaces', () => {
    const image = img()
    el('block', text('\n  '), image, text('  　 '))
    expect(isInlineImage(image, displayOf)).toBe(false)
  })

  it('is false for an image wrapped in a link or span without text', () => {
    const image = img()
    el('block', el('inline', el('inline', image)), text(' '))
    expect(isInlineImage(image, displayOf)).toBe(false)
  })

  it('does not count text in a nested block such as a caption', () => {
    const image = img()
    el('block', image, el('block', text('Figure 1-3 A truth table')))
    expect(isInlineImage(image, displayOf)).toBe(false)
  })

  it('does not count hidden text', () => {
    const image = img()
    el('block', image, el('none', text('hidden')))
    expect(isInlineImage(image, displayOf)).toBe(false)
  })

  it('is false for an image that is itself displayed as a block', () => {
    const image = el('block')
    el('block', text('Before '), image, text(' after'))
    expect(isInlineImage(image, displayOf)).toBe(false)
  })

  it('is false for an image without a parent', () => {
    expect(isInlineImage(img(), displayOf)).toBe(false)
  })
})

describe('isBlockDisplay', () => {
  it('treats inline-level and transparent displays as inline', () => {
    for (const d of ['inline', 'inline-block', 'inline-flex', 'contents', 'ruby', 'ruby-text']) {
      expect(isBlockDisplay(d), d).toBe(false)
    }
  })

  it('treats everything else as a block', () => {
    for (const d of ['block', 'list-item', 'table-cell', 'flex', 'flow-root', 'none']) {
      expect(isBlockDisplay(d), d).toBe(true)
    }
  })
})

describe('isFontRelativeLength', () => {
  it('is true for lengths in units of the text', () => {
    for (const v of [
      '1em',
      '1.2em',
      '.8em',
      '-0.5em',
      '2rem',
      '1ex',
      '3ch',
      '1lh',
      '1cap',
      '1ic',
      '1.5EM'
    ]) {
      expect(isFontRelativeLength(v), v).toBe(true)
    }
    expect(isFontRelativeLength('calc(1em + 2px)')).toBe(true)
  })

  it('is false for pixels, percentages, keywords and nothing', () => {
    for (const v of ['525px', '50%', 'auto', '0', '10vh', '1in', 'inherit', '', undefined]) {
      expect(isFontRelativeLength(v), String(v)).toBe(false)
    }
  })
})

describe('splitSelectorList', () => {
  it('splits at top-level commas only', () => {
    expect(splitSelectorList('img.a, p > img , :is(a, b) img')).toEqual([
      'img.a',
      'p > img',
      ':is(a, b) img'
    ])
    expect(splitSelectorList('img[alt="a,b"]')).toEqual(['img[alt="a,b"]'])
  })
})

describe('specificity', () => {
  it('counts ids, classes / attributes / pseudo-classes, and types', () => {
    expect(specificity('img')).toEqual([0, 0, 1])
    expect(specificity('.calibre_57')).toEqual([0, 1, 0])
    expect(specificity('img.gaiji')).toEqual([0, 1, 1])
    expect(specificity('p > img[alt="x"]:first-child')).toEqual([0, 2, 2])
    expect(specificity('#f1 img')).toEqual([1, 0, 1])
    expect(specificity('*')).toEqual([0, 0, 0])
    expect(specificity('p img::before')).toEqual([0, 0, 3])
    expect(specificity(':where(.a) img')).toEqual([0, 0, 1])
    expect(specificity('img:not(.big)')).toEqual([0, 1, 1])
  })
})

/** Declarations from a plain object; a trailing ' !important' marks the priority. */
function decl(values: Record<string, string>): Declarations {
  const parsed = (p: string) => /^(.*?)(\s*!important)?$/.exec(values[p] ?? '') as RegExpExecArray
  return {
    getPropertyValue: (p) => parsed(p)[1],
    getPropertyPriority: (p) => (parsed(p)[2] ? 'important' : '')
  }
}

const rule = (spec: [number, number, number], values: Record<string, string>) => ({
  specificity: spec,
  style: decl(values)
})

describe('publisherStyle', () => {
  it("takes a size in units of the text as the publisher's", () => {
    expect(publisherStyle([rule([0, 1, 1], { height: '1.2em' })], null).sized).toBe(true)
    expect(publisherStyle([rule([0, 1, 0], { width: '3em' })], null).sized).toBe(true)
  })

  it('leaves images sized in pixels, percentages or not at all to the reader', () => {
    expect(publisherStyle([rule([0, 1, 0], { height: '367px', width: '525px' })], null).sized).toBe(
      false
    )
    expect(publisherStyle([rule([0, 0, 1], { 'max-width': '100%' })], null).sized).toBe(false)
    expect(publisherStyle([], null).sized).toBe(false)
  })

  it('uses the declaration that wins the cascade', () => {
    // More specific wins, whatever the order.
    expect(
      publisherStyle(
        [rule([0, 1, 1], { height: '1em' }), rule([0, 0, 1], { height: 'auto' })],
        null
      ).sized
    ).toBe(true)
    // Same specificity: the later one.
    expect(
      publisherStyle(
        [rule([0, 1, 0], { height: '1em' }), rule([0, 1, 0], { height: '367px' })],
        null
      ).sized
    ).toBe(false)
    // !important beats specificity.
    expect(
      publisherStyle(
        [rule([0, 0, 1], { height: '1em !important' }), rule([1, 0, 0], { height: '40px' })],
        null
      ).sized
    ).toBe(true)
    // The style attribute beats rules, but not !important ones.
    expect(
      publisherStyle([rule([1, 0, 0], { height: '40px' })], decl({ height: '2em' })).sized
    ).toBe(true)
    expect(
      publisherStyle([rule([0, 0, 1], { height: '40px !important' })], decl({ height: '2em' }))
        .sized
    ).toBe(false)
  })

  it('notes a vertical-align the publisher set, other than the default baseline', () => {
    expect(publisherStyle([rule([0, 1, 0], { 'vertical-align': '-0.3em' })], null).aligned).toBe(
      true
    )
    expect(publisherStyle([], decl({ 'vertical-align': 'middle' })).aligned).toBe(true)
    // Converters write baseline on every image; it is not a choice about inline images.
    expect(publisherStyle([rule([0, 1, 0], { 'vertical-align': 'baseline' })], null).aligned).toBe(
      false
    )
    expect(publisherStyle([], null).aligned).toBe(false)
  })
})
