import type { Rendition } from 'epubjs'
import { PUBLISHER_FONT, type Settings, type ThemeName } from '../types'
import { INLINE_IMAGE_ATTR } from './inlineImages'

/**
 * Largest height of an image inside a line of text, in em of the surrounding text: the
 * em box of a character. Converters scale each image by a different factor, so only a
 * fixed cap is possible; at 1.3em formulas without white space around them (x · y)
 * looked half again as tall as the kanji next to them.
 */
export const INLINE_IMAGE_MAX_EM = 1

/** Inline images whose size the publisher gave in units of the text (see inlineImages.ts). */
const SIZED = `[${INLINE_IMAGE_ATTR}~="sized"]`

export interface Palette {
  bg: string
  fg: string
  link: string
  chrome: string
  chromeFg: string
  border: string
}

export const PALETTES: Record<ThemeName, Palette> = {
  light: {
    bg: '#fdfbf7',
    fg: '#1f1d1a',
    link: '#2f5d50',
    chrome: '#f3eee4',
    chromeFg: '#2a2622',
    border: '#e2dacb'
  },
  sepia: {
    bg: '#f1e6cf',
    fg: '#3a2f22',
    link: '#5a4a1e',
    chrome: '#e7d9bb',
    chromeFg: '#3a2f22',
    border: '#d2c2a0'
  },
  dark: {
    bg: '#161616',
    fg: '#d8d4cc',
    link: '#9fc5b5',
    chrome: '#222222',
    chromeFg: '#d8d4cc',
    border: '#333333'
  }
}

const THEME_NAME = 'leafbound'

/**
 * Pushes the current reader settings into the epub.js rendition as a theme.
 * Rules use !important so they win over publisher stylesheets.
 */
export function applyReaderTheme(rendition: Rendition, settings: Settings): void {
  const palette = PALETTES[settings.theme]
  const useFont = settings.fontFamily && settings.fontFamily !== PUBLISHER_FONT
  const overrideColor = settings.theme !== 'light'

  const body: Record<string, string> = {
    'background-color': `${palette.bg} !important`,
    color: `${palette.fg} !important`,
    'font-size': `${settings.fontSize}px !important`,
    'line-height': `${settings.lineHeight} !important`
  }
  if (useFont) body['font-family'] = `${settings.fontFamily} !important`

  const descendants: Record<string, string> = {
    'line-height': 'inherit !important'
  }
  if (useFont) descendants['font-family'] = 'inherit !important'
  if (overrideColor) descendants.color = 'inherit !important'

  const rules: Record<string, Record<string, string>> = {
    html: { 'background-color': `${palette.bg} !important` },
    body,
    'body *:not(img):not(svg):not(code):not(pre):not(kbd):not(samp)': descendants,
    a: { color: `${palette.link} !important` },
    // Keep images (covers in particular) inside one page without distorting
    // them: publishers often set width/height to 100%, which stretches.
    [`img:not(${SIZED})`]: {
      'max-width': '100% !important',
      'max-height': '100vh !important',
      width: 'auto !important',
      height: 'auto !important',
      'object-fit': 'contain !important'
    },
    // An inline image the publisher sized in units of the text (gaiji at 1em, a
    // fraction at 2em) keeps that size; it only has to fit the page.
    [`img${SIZED}`]: {
      'max-width': '100% !important',
      'object-fit': 'contain !important'
    },
    // Other images inside a line of text (inline math, gaiji) follow the font size:
    // converters often scale them all to one width, so their pixel size says nothing
    // (#79). A cap rather than a height, so small gaiji are not enlarged; block size,
    // for vertical text.
    [`img[${INLINE_IMAGE_ATTR}]:not(${SIZED})`]: {
      'max-block-size': `${INLINE_IMAGE_MAX_EM}em !important`
    },
    [`img[${INLINE_IMAGE_ATTR}]:not([${INLINE_IMAGE_ATTR}~="aligned"])`]: {
      'vertical-align': 'middle !important'
    },
    svg: {
      'max-width': '100% !important',
      'max-height': '100vh !important'
    },
    'svg image': {
      'object-fit': 'contain'
    }
  }

  rendition.themes.register(THEME_NAME, rules)
  rendition.themes.select(THEME_NAME)
}
