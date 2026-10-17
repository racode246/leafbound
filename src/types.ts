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
  coverVersion: number
  coverPath: string | null
}

export type LanguageSetting = 'system' | 'ja' | 'en'

export type LlmProvider = 'anthropic' | 'openai'

export interface AssistantSettings {
  provider: LlmProvider
  model: string
  /** Empty means the provider's official endpoint. */
  baseUrl: string
}

/** Model filled in when switching provider. OpenAI-compatible servers vary, so none is assumed. */
export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  anthropic: 'claude-sonnet-5-5',
  openai: ''
}

export const DEFAULT_BASE_URLS: Record<LlmProvider, string> = {
  anthropic: 'https://api.anthropic.com',
  openai: 'https://api.openai.com/v1'
}

export interface Settings {
  view: ViewMode
  flow: Flow
  spread: Spread
  theme: ThemeName
  fontFamily: string
  fontSize: number
  lineHeight: number
  language: LanguageSetting
  assistant: AssistantSettings
}

export interface Library {
  books: Book[]
  categories: string[]
  settings: Settings
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink'

export interface Annotation {
  id: string
  cfiRange: string
  text: string
  note: string
  color: HighlightColor
  createdAt: string
  updatedAt: string
}

export const HIGHLIGHT_COLORS: Record<HighlightColor, string> = {
  yellow: '#ffd84d',
  green: '#8fe08f',
  blue: '#8fcbff',
  pink: '#ffa8c5'
}

export interface SearchHit {
  cfi: string
  excerpt: string
  sectionIndex: number
  href: string
}

/** Context the assistant cited: a retrieved passage (#n) or a highlight (Hn). */
export interface AssistantSource {
  label: string
  kind: 'passage' | 'highlight'
  cfi: string
  excerpt: string
}

export interface Exchange {
  id: string
  sessionId: string
  question: string
  answer: string
  sources: AssistantSource[]
  createdAt: string
}

export interface ApiKeyStatus {
  anthropic: boolean
  openai: boolean
}

export interface AssistantStatus {
  modelDownloaded: boolean
  modelLoaded: boolean
  /** Bytes fetched on first use. */
  downloadSize: number
  /** Spine indexes whose text is already in the vector store. */
  indexedSections: number[]
  keys: ApiKeyStatus
}

export type PrepareEvent = { type: 'download'; done: number; total: number } | { type: 'loading' }

export type AskStage = 'highlights' | 'searching' | 'generating'

export type AskEvent =
  | { type: 'stage'; stage: AskStage }
  | { type: 'sources'; sources: AssistantSource[] }
  | { type: 'delta'; text: string }

export interface AskRequest {
  requestId: string
  bookId: string
  sessionId: string
  question: string
  chapterTitle: string | null
  /** Text around the reading position in the current chapter. */
  chapterText: string
  /** Spine index of the current chapter when chapterText covers all of it. */
  coveredSection: number | null
  percent: number
}

export interface IndexChunk {
  text: string
  cfi: string
}

export interface AssistantHistory {
  sessionId: string | null
  exchanges: Exchange[]
}

/** Error codes returned by the assistant commands. */
export const ASSISTANT_ERRORS = ['NO_API_KEY', 'MODEL_NOT_READY', 'REFUSED', 'CANCELLED'] as const

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
