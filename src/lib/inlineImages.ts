/** The parts of a DOM node the detection reads (plain objects in the tests). */
export interface DomNode {
  nodeType: number
  nodeValue: string | null
  parentNode: DomNode | null
  childNodes: ArrayLike<DomNode>
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3

/**
 * Attribute the reader puts on images that sit inside a line of text (#79). Its value
 * lists what the publisher's CSS decides for the image: `sized` (a width or height in
 * units of the text) and `aligned` (a vertical-align); the theme leaves those alone.
 */
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

/** A style declaration block (CSSStyleDeclaration, or a plain object in the tests). */
export interface Declarations {
  getPropertyValue(property: string): string
  getPropertyPriority(property: string): string
}

/** Selector specificity: ids, classes / attributes / pseudo-classes, types / pseudo-elements. */
export type Specificity = [number, number, number]

/** A publisher rule that matches the image, with the specificity of its matching selector. */
export interface MatchedRule {
  specificity: Specificity
  style: Declarations
}

/** Whether a CSS length is in units of the text (em, rem, ex, ch, cap, ic, lh), not px or %. */
export function isFontRelativeLength(value: string | undefined): boolean {
  return /(?:^|[^\w.-])[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?r?(?:em|ex|ch|cap|ic|lh)(?![\w-])/i.test(
    value ?? ''
  )
}

/** Splits a selector list at its top-level commas (not those in parentheses, brackets or strings). */
export function splitSelectorList(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') i++
      else if (ch === quote) quote = ''
    } else if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(text.slice(start).trim())
  return parts.filter(Boolean)
}

/**
 * The specificity of one complex selector. Close enough for the cascade of publisher CSS:
 * :where() counts nothing, and the arguments of :not() / :is() / :has() are counted as
 * if they were part of the selector.
 */
export function specificity(selector: string): Specificity {
  let ids = 0
  let classes = 0
  let types = 0
  let s = selector.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
  s = s.replace(/:where\((?:[^()]|\([^()]*\))*\)/gi, ' ')
  s = s.replace(/\[[^\]]*\]/g, () => {
    classes++
    return ' '
  })
  s = s.replace(/:(?:not|is|matches|has)\(/gi, ' ')
  s = s.replace(
    /::[\w-]+(?:\([^)]*\))?|:(?:before|after|first-line|first-letter)(?![\w-])/gi,
    () => {
      types++
      return ' '
    }
  )
  s = s.replace(/:[\w-]+(?:\([^)]*\))?/g, () => {
    classes++
    return ' '
  })
  s = s.replace(/#[\w-]+/g, () => {
    ids++
    return ' '
  })
  s = s.replace(/\.[\w-]+/g, () => {
    classes++
    return ' '
  })
  types += s.replace(/[()]/g, ' ').match(/[a-z_][\w-]*/gi)?.length ?? 0
  return [ids, classes, types]
}

function compareRank(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/**
 * The value of a property after the cascade of the publisher's CSS: !important first, then
 * the style attribute, then specificity, then the later rule. `rules` are in document order.
 */
function cascadedValue(
  property: string,
  rules: MatchedRule[],
  inline: Declarations | null
): string | undefined {
  let best: { rank: number[]; value: string } | undefined
  const consider = (style: Declarations, rank: number[]) => {
    const value = style.getPropertyValue(property).trim()
    if (!value) return
    const full = [style.getPropertyPriority(property) === 'important' ? 1 : 0, ...rank]
    if (!best || compareRank(full, best.rank) >= 0) best = { rank: full, value }
  }
  for (const rule of rules) consider(rule.style, [0, ...rule.specificity])
  if (inline) consider(inline, [1, 0, 0, 0])
  return best?.value
}

/**
 * What the publisher's CSS decides for an inline image: its size, when given in units of
 * the text (a gaiji at 1em, a fraction at 2em; px sizes from converters say nothing), and
 * its vertical position. `baseline` does not count: converters write it on every image.
 */
export function publisherStyle(
  rules: MatchedRule[],
  inline: Declarations | null
): { sized: boolean; aligned: boolean } {
  const sized = ['height', 'width'].some((p) =>
    isFontRelativeLength(cascadedValue(p, rules, inline))
  )
  const align = cascadedValue('vertical-align', rules, inline)
  const aligned = !!align && !/^(?:baseline|initial|unset|revert|revert-layer)$/i.test(align)
  return { sized, aligned }
}

/**
 * The publisher's style rules in a section, in document order, through @import and the
 * @media rules that apply. Leaves out the reader's own theme (epub.js's inserted styles).
 */
function publisherRules(doc: Document): CSSStyleRule[] {
  const view = doc.defaultView
  const out: CSSStyleRule[] = []
  const walk = (sheet: CSSStyleSheet | null) => {
    if (!sheet || sheet.disabled) return
    if ((sheet.ownerNode as Element | null)?.id?.startsWith('epubjs-inserted-css-')) return
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      return
    }
    walkRules(rules)
  }
  const walkRules = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if ('selectorText' in rule && 'style' in rule) out.push(rule as CSSStyleRule)
      else if ('styleSheet' in rule) walk((rule as CSSImportRule).styleSheet)
      else if ('cssRules' in rule) {
        const media = (rule as Partial<CSSMediaRule>).media?.mediaText
        if (media && view && !view.matchMedia(media).matches) continue
        walkRules((rule as CSSGroupingRule).cssRules)
      }
    }
  }
  for (const sheet of Array.from(doc.styleSheets)) walk(sheet)
  return out
}

/** The highest specificity among the selectors of `selectorText` that match the element. */
function matchedSpecificity(el: Element, selectorText: string): Specificity | null {
  let best: Specificity | null = null
  for (const selector of splitSelectorList(selectorText)) {
    let hit = false
    try {
      hit = el.matches(selector)
    } catch {
      // A selector the engine does not take (@page, vendor pseudo-classes).
    }
    const spec = hit ? specificity(selector) : null
    if (spec && (!best || compareRank(spec, best) > 0)) best = spec
  }
  return best
}

/** Marks the inline images of a rendered section so the reader theme can size them to the text. */
export function markInlineImages(doc: Document): void {
  const view = doc.defaultView
  if (!view) return
  const display = (el: DomNode) => view.getComputedStyle(el as Element).display
  let rules: CSSStyleRule[] | undefined
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    if (!isInlineImage(img, display)) continue
    rules ??= publisherRules(doc)
    const matched: MatchedRule[] = []
    for (const rule of rules) {
      const spec = matchedSpecificity(img, rule.selectorText)
      if (spec) matched.push({ specificity: spec, style: rule.style })
    }
    const { sized, aligned } = publisherStyle(matched, img.style)
    const flags = [sized && 'sized', aligned && 'aligned'].filter(Boolean)
    img.setAttribute(INLINE_IMAGE_ATTR, flags.join(' '))
  }
}
