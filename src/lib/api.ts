import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open } from '@tauri-apps/plugin-dialog'
import type { Book, Library, Settings } from '../types'

export const api = {
  getLibrary: () => invoke<Library>('get_library'),

  async pickAndImport(): Promise<Book[]> {
    const selected = await open({
      multiple: true,
      title: 'EPUB を追加',
      filters: [{ name: 'EPUB', extensions: ['epub'] }]
    })
    if (!selected) return []
    const paths = Array.isArray(selected) ? selected : [selected]
    return invoke<Book[]>('import_books', { paths })
  },

  importPaths: (paths: string[]) => invoke<Book[]>('import_books', { paths }),
  readBook: (id: string) => invoke<ArrayBuffer>('read_book', { id }),
  saveProgress: (id: string, cfi: string, percent: number) =>
    invoke<void>('save_progress', { id, cfi, percent }),
  setBookCategories: (id: string, categories: string[]) =>
    invoke<Book>('set_book_categories', { id, categories }),
  deleteBook: (id: string) => invoke<void>('delete_book', { id }),
  addCategory: (name: string) => invoke<string[]>('add_category', { name }),
  renameCategory: (from: string, to: string) => invoke<Library>('rename_category', { from, to }),
  removeCategory: (name: string) => invoke<Library>('remove_category', { name }),
  saveSettings: (settings: Settings) => invoke<Settings>('save_settings', { settings }),
  takePendingOpenFiles: () => invoke<string[]>('take_pending_open_files'),

  onOpenFiles: (cb: (paths: string[]) => void): Promise<UnlistenFn> =>
    listen<string[]>('open-files', (event) => cb(event.payload)),

  onDragDrop: (cb: (paths: string[]) => void): Promise<UnlistenFn> =>
    getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === 'drop') cb(event.payload.paths)
    }),

  coverUrl: (book: Book): string | null => (book.coverPath ? convertFileSrc(book.coverPath) : null)
}
