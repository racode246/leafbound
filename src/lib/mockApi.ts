/**
 * In-browser stand-in for the Tauri backend.
 *
 * Used automatically when the app is opened in a plain browser (`npm run dev`
 * without Tauri), so the UI can be exercised without the native shell.
 * State lives in memory only; the sample book from /public is pre-loaded.
 */
import type { Annotation, Book, Library, Settings } from '../types'
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
  language: 'system'
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

  async pickAndImport() {
    const picked = await pickFiles()
    const added: Book[] = []
    const duplicates: string[] = []
    for (const file of picked) {
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

  importPaths: async () => ({ added: [], duplicates: [], failed: [] }),

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
      const book: Book = { ...sample, id, title: file.name.replace(/\.epub$/i, ''), author: '', fileName: file.name, addedAt: now() }
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
      for (const b of state.books) b.categories = b.categories.map((c) => (c === from ? to.trim() : c))
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
  coverUrl: () => null
}
