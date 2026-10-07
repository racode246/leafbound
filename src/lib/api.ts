import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open } from '@tauri-apps/plugin-dialog'
import type { Book, ImportOutcome, Library, Settings } from '../types'
import type { LeafboundApi } from './apiTypes'
import { mockApi } from './mockApi'

const NOTHING: ImportOutcome = { added: [], duplicates: [], failed: [] }

const tauriApi: LeafboundApi = {
  getLibrary: () => invoke<Library>('get_library'),

  async pickAndImport(): Promise<ImportOutcome> {
    const selected = await open({
      multiple: true,
      title: 'EPUB を追加',
      filters: [{ name: 'EPUB', extensions: ['epub'] }]
    })
    if (!selected) return NOTHING
    const paths = Array.isArray(selected) ? selected : [selected]
    return invoke<ImportOutcome>('import_books', { paths })
  },

  importPaths: (paths) => invoke<ImportOutcome>('import_books', { paths }),
  readBook: (id) => invoke<ArrayBuffer>('read_book', { id }),
  saveProgress: (id, cfi, percent) => invoke<void>('save_progress', { id, cfi, percent }),
  setBookCategories: (id, categories) => invoke<Book>('set_book_categories', { id, categories }),
  deleteBook: (id) => invoke<void>('delete_book', { id }),
  addCategory: (name) => invoke<string[]>('add_category', { name }),
  renameCategory: (from, to) => invoke<Library>('rename_category', { from, to }),
  removeCategory: (name) => invoke<Library>('remove_category', { name }),
  saveSettings: (settings: Settings) => invoke<Settings>('save_settings', { settings }),
  takePendingOpenFiles: () => invoke<string[]>('take_pending_open_files'),

  onOpenFiles: (cb) => listen<string[]>('open-files', (event) => cb(event.payload)),

  onDragDrop: (cb) =>
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') cb(event.payload.paths)
    }),

  coverUrl: (book) => (book.coverPath ? convertFileSrc(book.coverPath) : null)
}

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const isBrowserMode = !inTauri

export const api: LeafboundApi = inTauri ? tauriApi : mockApi
