/**
 * In-browser stand-in for the Tauri backend.
 *
 * Used automatically when the app is opened in a plain browser (`npm run dev`
 * without Tauri), so the UI can be exercised without the native shell.
 * State lives in memory only; the sample book from /public is pre-loaded.
 */
import type {
  Annotation,
  ApiKeyStatus,
  Book,
  Exchange,
  Library,
  Settings,
  UpdateInfo
} from '../types'
import type { LeafboundApi } from './apiTypes'
import { isEpubFile, listenHtml5DragDrop } from './dragDrop'

const DEFAULT_SETTINGS: Settings = {
  view: 'grid',
  flow: 'paginated',
  spread: 'auto',
  theme: 'light',
  fontFamily: 'publisher',
  fontSize: 18,
  lineHeight: 1.7,
  language: 'system',
  assistant: { provider: 'anthropic', model: 'claude-sonnet-5-5', baseUrl: '' }
}

const now = () => new Date().toISOString()

const sample: Book = {
  id: 'sample',
  title: 'Leafbound サンプル',
  author: 'Leafbound Contributors',
  fileName: 'sample.epub',
  hasCover: false,
  addedAt: now(),
  lastOpenedAt: null,
  progress: null,
  categories: [],
  contentHash: null,
  coverVersion: 0,
  coverPath: null
}

const state: Library = { books: [sample], categories: [], settings: { ...DEFAULT_SETTINGS } }
const files = new Map<string, () => Promise<ArrayBuffer>>([
  ['sample', () => fetch('/sample.epub').then((r) => r.arrayBuffer())]
])

const annotations = new Map<string, Annotation[]>()

// Assistant: no model or LLM in the browser; answers are canned so the UI can be exercised.
const keys: ApiKeyStatus = { anthropic: false, openai: false }
const indexed = new Map<string, Set<number>>()
const exchanges = new Map<string, Exchange[]>()
let modelLoaded = false
const cancelled = new Set<string>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
/** Files chosen through the picker, keyed by the fake path handed back to the app. */
const pendingPicks = new Map<string, File>()

// Updates: none by default. Set localStorage.lbMockUpdate before the page loads to
// 'available' (an update that installs), 'badSignature' (one whose download is rejected)
// or 'checkError' (the update server cannot be reached).
const MOCK_VERSION = '0.0.0-mock'
const mockUpdateMode = () =>
  typeof localStorage === 'undefined' ? null : localStorage.getItem('lbMockUpdate')
const mockUpdate: UpdateInfo = {
  version: '9.9.9',
  currentVersion: MOCK_VERSION,
  notes:
    '## [9.9.9](https://github.com/racode246/leafbound/compare/v0.2.0...v9.9.9) (2026-10-18)\n\n' +
    '### Features\n\n* **reader:** a mock feature ([#99](https://github.com/racode246/leafbound/issues/99)) ([abc1234](https://github.com/racode246/leafbound/commit/abc1234))',
  date: '2026-10-18T00:00:00Z'
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const find = (id: string): Book => {
  const b = state.books.find((x) => x.id === id)
  if (!b) throw new Error(`unknown book: ${id}`)
  return b
}

function pickFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.epub'
    input.multiple = true
    input.onchange = () => resolve(Array.from(input.files ?? []))
    input.oncancel = () => resolve([])
    input.click()
  })
}

export const mockApi: LeafboundApi = {
  getLibrary: async () => clone(state),

  // The browser cannot hand out OS paths, so the picker returns fake ones that
  // importPaths resolves back to the chosen File objects.
  async pickFiles() {
    const picked = await pickFiles()
    return picked.map((file) => {
      const key = `mock://${crypto.randomUUID()}/${file.name}`
      pendingPicks.set(key, file)
      return key
    })
  },

  async importPaths(paths) {
    const files: File[] = []
    for (const p of paths) {
      const file = pendingPicks.get(p)
      if (file) {
        pendingPicks.delete(p)
        files.push(file)
      }
    }
    return mockApi.importFiles(files)
  },

  async importFiles(picked) {
    const added: Book[] = []
    const duplicates: string[] = []
    for (const file of picked) {
      if (!isEpubFile(file)) continue
      if (state.books.some((b) => b.fileName === file.name)) {
        duplicates.push(file.name)
        continue
      }
      const id = crypto.randomUUID()
      files.set(id, () => file.arrayBuffer())
      const book: Book = {
        ...sample,
        id,
        title: file.name.replace(/\.epub$/i, ''),
        author: '',
        fileName: file.name,
        addedAt: now()
      }
      state.books.push(book)
      added.push(clone(book))
    }
    return { added, duplicates, failed: [] }
  },
  readBook: (id) => {
    const loader = files.get(id)
    if (!loader) return Promise.reject(new Error(`unknown book: ${id}`))
    return loader()
  },
  saveProgress: async (id, cfi, percent) => {
    const b = find(id)
    b.progress = { cfi, percent, updatedAt: now() }
    b.lastOpenedAt = b.progress.updatedAt
  },
  setBookCategories: async (id, categories) => {
    const b = find(id)
    b.categories = categories.filter((c) => state.categories.includes(c))
    return clone(b)
  },
  deleteBook: async (id) => {
    state.books = state.books.filter((b) => b.id !== id)
  },
  refreshCover: async (id) => {
    const b = find(id)
    b.coverVersion += 1
    return clone(b)
  },
  addCategory: async (name) => {
    const clean = name.trim()
    if (clean && !state.categories.includes(clean)) state.categories.push(clean)
    return [...state.categories]
  },
  renameCategory: async (from, to) => {
    const idx = state.categories.indexOf(from)
    if (idx >= 0 && to.trim() && !state.categories.includes(to.trim())) {
      state.categories[idx] = to.trim()
      for (const b of state.books)
        b.categories = b.categories.map((c) => (c === from ? to.trim() : c))
    }
    return clone(state)
  },
  removeCategory: async (name) => {
    state.categories = state.categories.filter((c) => c !== name)
    for (const b of state.books) b.categories = b.categories.filter((c) => c !== name)
    return clone(state)
  },
  saveSettings: async (settings) => {
    state.settings = { ...settings }
    return clone(state.settings)
  },
  getAnnotations: async (id) => clone(annotations.get(id) ?? []),
  saveAnnotations: async (id, list) => {
    annotations.set(id, clone(list))
  },
  takePendingOpenFiles: async () => [],
  onOpenFiles: async () => () => {},
  onDragDrop: async (cb) => listenHtml5DragDrop(cb),
  coverUrl: () => null,

  assistantStatus: async (bookId) => ({
    modelDownloaded: modelLoaded,
    modelLoaded,
    downloadSize: 135_392_183,
    indexedSections: [...(indexed.get(bookId) ?? [])],
    keys: { ...keys }
  }),
  async assistantPrepare(onEvent) {
    if (modelLoaded) return
    const total = 135_392_183
    for (let i = 1; i <= 5; i++) {
      await sleep(150)
      onEvent({ type: 'download', done: (total * i) / 5, total })
    }
    onEvent({ type: 'loading' })
    await sleep(200)
    modelLoaded = true
  },
  async assistantIndexSection(bookId, section) {
    await sleep(30)
    const set = indexed.get(bookId) ?? new Set<number>()
    set.add(section)
    indexed.set(bookId, set)
  },
  setApiKey: async (provider, key) => {
    keys[provider] = key.trim().length > 0
    return { ...keys }
  },
  deleteApiKey: async (provider) => {
    keys[provider] = false
    return { ...keys }
  },
  assistantHistory: async (bookId) => {
    const list = exchanges.get(bookId) ?? []
    const sessionId = list.at(-1)?.sessionId ?? null
    return { sessionId, exchanges: clone(list.filter((e) => e.sessionId === sessionId)) }
  },
  clearAssistantHistory: async (bookId) => {
    exchanges.delete(bookId)
  },
  async ask(request, onEvent) {
    if (state.settings.assistant.provider === 'anthropic' && !keys.anthropic) throw 'NO_API_KEY'
    onEvent({ type: 'stage', stage: 'searching' })
    await sleep(200)
    onEvent({ type: 'stage', stage: 'generating' })
    const answer =
      `(mock) 「${request.question}」への回答例です。現在の章の本文 ${request.chapterText.length} 文字を参照しました。` +
      'ブラウザ版では LLM は呼ばれません。'
    for (const piece of answer.match(/.{1,6}/gsu) ?? []) {
      if (cancelled.delete(request.requestId)) throw 'CANCELLED'
      await sleep(40)
      onEvent({ type: 'delta', text: piece })
    }
    const exchange: Exchange = {
      id: crypto.randomUUID(),
      sessionId: request.sessionId,
      question: request.question,
      answer,
      sources: [],
      createdAt: now()
    }
    exchanges.set(request.bookId, [...(exchanges.get(request.bookId) ?? []), exchange])
    return clone(exchange)
  },
  cancelAsk: async (requestId) => {
    cancelled.add(requestId)
  },

  appVersion: async () => MOCK_VERSION,
  async checkForUpdate(automatic) {
    await sleep(150)
    const mode = mockUpdateMode()
    if (mode === 'checkError') {
      // Like the backend: the automatic check only logs its errors.
      const error = 'error sending request for url (https://example.invalid/latest.json)'
      if (automatic) {
        console.warn('update: check failed:', error)
        return null
      }
      throw error
    }
    return mode === 'available' || mode === 'badSignature' ? clone(mockUpdate) : null
  },
  async installUpdate(onEvent) {
    const total = 31_457_280
    for (let i = 1; i <= 5; i++) {
      await sleep(100)
      onEvent({ type: 'progress', downloaded: (total * i) / 5, total })
    }
    onEvent({ type: 'installing' })
    if (mockUpdateMode() === 'badSignature') {
      await sleep(100)
      throw 'The signature verification failed'
    }
    // The real app exits here and the installer restarts it.
    await new Promise(() => {})
  }
}
