/** The parts of a DOM node the detection reads (plain objects in the tests). */
export interface DomNode {
  nodeType: number
  nodeValue: string | null
  parentNode: DomNode | null
  childNodes: ArrayLike<DomNode>
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3

/** Attribute the reader puts on images that sit inside a line of text (#79). */
export const INLINE_IMAGE_ATTR = 'data-lb-inline'

/**
 * Whether a computed `display` starts its own block. Inline-level and transparent boxes
 * do not; `none` counts as a block so the text inside it is not taken as part of the line.
 */
export function isBlockDisplay(display: string): boolean {
  return !/^(inline|contents|ruby)/.test(display)
}

/**
 * Whether an image is part of a line of text (inline math, symbols, gaiji): its nearest
 * block ancestor has non-whitespace text of its own, outside nested blocks such as a
 * caption. Images alone in their block (figures, covers) are not.
 */
export function isInlineImage(img: DomNode, display: (el: DomNode) => string): boolean {
  if (isBlockDisplay(display(img))) return false
  let block = img.parentNode
  while (block && block.nodeType === ELEMENT_NODE && !isBlockDisplay(display(block))) {
    block = block.parentNode
  }
  return block?.nodeType === ELEMENT_NODE && hasOwnText(block, display)
}

function hasOwnText(node: DomNode, display: (el: DomNode) => string): boolean {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      if (/\S/.test(child.nodeValue ?? '')) return true
    } else if (
      child.nodeType === ELEMENT_NODE &&
      !isBlockDisplay(display(child)) &&
      hasOwnText(child, display)
    ) {
      return true
    }
  }
  return false
}

/** Marks the inline images of a rendered section so the reader theme can size them to the text. */
export function markInlineImages(doc: Document): void {
  const view = doc.defaultView
  if (!view) return
  const display = (el: DomNode) => view.getComputedStyle(el as Element).display
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    if (isInlineImage(img, display)) img.setAttribute(INLINE_IMAGE_ATTR, '')
  }
}
