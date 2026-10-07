export type ViewMode = 'grid' | 'list'
export type Flow = 'paginated' | 'scrolled'
export type Spread = 'none' | 'auto' | 'always'
export type ThemeName = 'light' | 'sepia' | 'dark'

export interface Progress {
  cfi: string
  percent: number
  updatedAt: string
}

export interface Book {
  id: string
  title: string
  author: string
  fileName: string
  hasCover: boolean
  addedAt: string
  lastOpenedAt: string | null
  progress: Progress | null
  categories: string[]
  contentHash: string | null
  coverPath: string | null
}

export type LanguageSetting = 'system' | 'ja' | 'en'

export interface Settings {
  view: ViewMode
  flow: Flow
  spread: Spread
  theme: ThemeName
  fontFamily: string
  fontSize: number
  lineHeight: number
  language: LanguageSetting
}

export interface Library {
  books: Book[]
  categories: string[]
  settings: Settings
}

export interface ImportOutcome {
  added: Book[]
  /** File names that were skipped because the same book is already in the library. */
  duplicates: string[]
  /** File names that could not be imported. */
  failed: string[]
}

/** Width (CSS px) above which "auto" spread shows two pages. */
export const MIN_SPREAD_WIDTH = 900

export const PUBLISHER_FONT = 'publisher'

/**
 * Font presets. `labelKey` entries are translated; `label` entries are
 * proper names shown as-is.
 */
export type FontPreset = { value: string } & (
  | { labelKey: 'font.publisher' | 'font.serif' | 'font.sans' }
  | { label: string }
)

export const FONT_PRESETS: FontPreset[] = [
  { labelKey: 'font.publisher', value: PUBLISHER_FONT },
  { labelKey: 'font.serif', value: 'serif' },
  { labelKey: 'font.sans', value: 'sans-serif' },
  { label: '游明朝 / Yu Mincho', value: '"Yu Mincho", YuMincho, serif' },
  { label: '游ゴシック / Yu Gothic', value: '"Yu Gothic", YuGothic, sans-serif' },
  { label: 'メイリオ / Meiryo', value: 'Meiryo, sans-serif' },
  { label: 'BIZ UDP明朝', value: '"BIZ UDPMincho", serif' },
  { label: 'BIZ UDPゴシック', value: '"BIZ UDPGothic", sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Segoe UI', value: '"Segoe UI", sans-serif' }
]

export const FONT_SIZE_MIN = 12
export const FONT_SIZE_MAX = 36
export const LINE_HEIGHT_MIN = 1.2
export const LINE_HEIGHT_MAX = 2.6

export const ALL_BOOKS = '__all__'
export const UNCATEGORIZED = '__uncategorized__'
