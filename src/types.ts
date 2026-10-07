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

export interface Settings {
  view: ViewMode
  flow: Flow
  spread: Spread
  theme: ThemeName
  fontFamily: string
  fontSize: number
  lineHeight: number
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

export const FONT_PRESETS: { label: string; value: string }[] = [
  { label: '出版社の指定', value: PUBLISHER_FONT },
  { label: '明朝 (serif)', value: 'serif' },
  { label: 'ゴシック (sans-serif)', value: 'sans-serif' },
  { label: '游明朝', value: '"Yu Mincho", YuMincho, serif' },
  { label: '游ゴシック', value: '"Yu Gothic", YuGothic, sans-serif' },
  { label: 'メイリオ', value: 'Meiryo, sans-serif' },
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
