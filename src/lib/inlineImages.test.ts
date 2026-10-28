import { describe, expect, it } from 'vitest'
import { type DomNode, isBlockDisplay, isInlineImage } from './inlineImages'

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
