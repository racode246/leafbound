import type { Book, Library, Settings } from '../types'

export type Unlisten = () => void

export interface LeafboundApi {
  getLibrary(): Promise<Library>
  pickAndImport(): Promise<Book[]>
  importPaths(paths: string[]): Promise<Book[]>
  readBook(id: string): Promise<ArrayBuffer>
  saveProgress(id: string, cfi: string, percent: number): Promise<void>
  setBookCategories(id: string, categories: string[]): Promise<Book>
  deleteBook(id: string): Promise<void>
  addCategory(name: string): Promise<string[]>
  renameCategory(from: string, to: string): Promise<Library>
  removeCategory(name: string): Promise<Library>
  saveSettings(settings: Settings): Promise<Settings>
  takePendingOpenFiles(): Promise<string[]>
  onOpenFiles(cb: (paths: string[]) => void): Promise<Unlisten>
  onDragDrop(cb: (paths: string[]) => void): Promise<Unlisten>
  coverUrl(book: Book): string | null
}
