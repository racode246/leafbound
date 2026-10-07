import type { Rendition } from 'epubjs'
import { PUBLISHER_FONT, type Settings, type ThemeName } from '../types'

export interface Palette {
  bg: string
  fg: string
  link: string
  chrome: string
  chromeFg: string
  border: string
}

export const PALETTES: Record<ThemeName, Palette> = {
  light: { bg: '#fdfbf7', fg: '#1f1d1a', link: '#2f5d50', chrome: '#f3eee4', chromeFg: '#2a2622', border: '#e2dacb' },
  sepia: { bg: '#f1e6cf', fg: '#3a2f22', link: '#5a4a1e', chrome: '#e7d9bb', chromeFg: '#3a2f22', border: '#d2c2a0' },
  dark: { bg: '#161616', fg: '#d8d4cc', link: '#9fc5b5', chrome: '#222222', chromeFg: '#d8d4cc', border: '#333333' }
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
    img: {
      'max-width': '100% !important',
      'max-height': '100vh !important',
      width: 'auto !important',
      height: 'auto !important',
      'object-fit': 'contain !important'
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
