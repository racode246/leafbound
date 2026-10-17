import { getVersion } from '@tauri-apps/api/app'
import { Channel, convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { open } from '@tauri-apps/plugin-dialog'
import type {
  Annotation,
  ApiKeyStatus,
  AskEvent,
  AssistantHistory,
  AssistantStatus,
  Book,
  Exchange,
  ImportOutcome,
  InstallEvent,
  Library,
  PrepareEvent,
  Settings,
  UpdateInfo
} from '../types'
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

  async pickFiles(dialogTitle: string): Promise<string[]> {
    const selected = await open({
      multiple: true,
      title: dialogTitle,
      filters: [{ name: 'EPUB', extensions: ['epub'] }]
    })
    if (!selected) return []
    return Array.isArray(selected) ? selected : [selected]
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
  refreshCover: (id) => invoke<Book>('refresh_cover', { id }),
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
  coverUrl: (book) =>
    book.hasCover ? `${convertFileSrc(book.id, 'lbcover')}?v=${book.coverVersion}` : null,

  assistantStatus: (bookId) => invoke<AssistantStatus>('assistant_status', { bookId }),
  assistantPrepare(onEvent) {
    const channel = new Channel<PrepareEvent>()
    channel.onmessage = onEvent
    return invoke<void>('assistant_prepare', { onEvent: channel })
  },
  assistantIndexSection: (bookId, section, href, chapter, chunks) =>
    invoke<void>('assistant_index_section', { bookId, section, href, chapter, chunks }),
  setApiKey: (provider, key) => invoke<ApiKeyStatus>('assistant_set_api_key', { provider, key }),
  deleteApiKey: (provider) => invoke<ApiKeyStatus>('assistant_delete_api_key', { provider }),
  assistantHistory: (bookId) => invoke<AssistantHistory>('assistant_history', { bookId }),
  clearAssistantHistory: (bookId) => invoke<void>('assistant_clear_history', { bookId }),
  ask(request, onEvent) {
    const channel = new Channel<AskEvent>()
    channel.onmessage = onEvent
    return invoke<Exchange>('assistant_ask', { request, onEvent: channel })
  },
  cancelAsk: (requestId) => invoke<void>('assistant_cancel', { requestId }),

  appVersion: () => getVersion(),
  checkForUpdate: (automatic) => invoke<UpdateInfo | null>('update_check', { automatic }),
  installUpdate(onEvent) {
    const channel = new Channel<InstallEvent>()
    channel.onmessage = onEvent
    return invoke<void>('update_install', { onEvent: channel })
  }
}

const inTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const isBrowserMode = !inTauri

export const api: LeafboundApi = inTauri ? tauriApi : mockApi
