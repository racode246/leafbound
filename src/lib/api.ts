import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import type { Annotation, Book, ImportOutcome, Library, Settings } from '../types'
import type { LeafboundApi } from './apiTypes'
import { isEpubFile, listenHtml5DragDrop } from './dragDrop'
import { mockApi } from './mockApi'

const NOTHING: ImportOutcome = { added: [], duplicates: [], failed: [] }

function mergeOutcome(into: ImportOutcome, from: ImportOutcome): ImportOutcome {
  return {
    added: [...into.added, ...from.added],
    duplicates: [...into.duplicates, ...from.duplicates],
    failed: [...into.failed, ...from.failed]
  }
}

const tauriApi: LeafboundApi = {
  getLibrary: () => invoke<Library>('get_library'),

  async pickAndImport(dialogTitle: string): Promise<ImportOutcome> {
    const selected = await open({
      multiple: true,
      title: dialogTitle,
      filters: [{ name: 'EPUB', extensions: ['epub'] }]
    })
    if (!selected) return NOTHING
    const paths = Array.isArray(selected) ? selected : [selected]
    return invoke<ImportOutcome>('import_books', { paths })
  },

  importPaths: (paths) => invoke<ImportOutcome>('import_books', { paths }),

  async importFiles(files) {
    let outcome = NOTHING
    for (const file of files) {
      if (!isEpubFile(file)) continue
      try {
        const bytes = await file.arrayBuffer()
        const one = await invoke<ImportOutcome>('import_book_bytes', bytes, {
          headers: { 'x-file-name': encodeURIComponent(file.name) }
        })
        outcome = mergeOutcome(outcome, one)
      } catch (err) {
        console.error('importFiles', file.name, err)
        outcome = mergeOutcome(outcome, { added: [], duplicates: [], failed: [file.name] })
      }
    }
    return outcome
  },
  readBook: (id) => invoke<ArrayBuffer>('read_book', { id }),
  saveProgress: (id, cfi, percent) => invoke<void>('save_progress', { id, cfi, percent }),
  setBookCategories: (id, categories) => invoke<Book>('set_book_categories', { id, categories }),
  deleteBook: (id) => invoke<void>('delete_book', { id }),
  addCategory: (name) => invoke<string[]>('add_category', { name }),
  renameCategory: (from, to) => invoke<Library>('rename_category', { from, to }),
  removeCategory: (name) => invoke<Library>('remove_category', { name }),
  saveSettings: (settings: Settings) => invoke<Settings>('save_settings', { settings }),
  getAnnotations: (id) => invoke<Annotation[]>('get_annotations', { id }),
  saveAnnotations: (id, annotations) => invoke<void>('save_annotations', { id, annotations }),
  takePendingOpenFiles: () => invoke<string[]>('take_pending_open_files'),

  onOpenFiles: (cb) => listen<string[]>('open-files', (event) => cb(event.payload)),

  onDragDrop: async (cb) => listenHtml5DragDrop(cb),

  // Served by the lbcover:// scheme registered in src-tauri/src/covers_protocol.rs
  coverUrl: (book) => (book.hasCover ? convertFileSrc(book.id, 'lbcover') : null)
}

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const isBrowserMode = !inTauri

export const api: LeafboundApi = inTauri ? tauriApi : mockApi
