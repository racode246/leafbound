import type { Annotation, Book, ImportOutcome, Library, Settings } from '../types'

export type Unlisten = () => void

export type DragDropEvent =
  | { type: 'enter' }
  | { type: 'over' }
  | { type: 'drop'; files: File[] }
  | { type: 'leave' }

export interface LeafboundApi {
  getLibrary(): Promise<Library>
  pickAndImport(dialogTitle: string): Promise<ImportOutcome>
  importPaths(paths: string[]): Promise<ImportOutcome>
  /** Imports dropped files by content (HTML5 drag and drop has no OS paths). */
  importFiles(files: File[]): Promise<ImportOutcome>
  readBook(id: string): Promise<ArrayBuffer>
  saveProgress(id: string, cfi: string, percent: number): Promise<void>
  setBookCategories(id: string, categories: string[]): Promise<Book>
  deleteBook(id: string): Promise<void>
  /** Re-extracts the cover with the current heuristics. */
  refreshCover(id: string): Promise<Book>
  addCategory(name: string): Promise<string[]>
  renameCategory(from: string, to: string): Promise<Library>
  removeCategory(name: string): Promise<Library>
  saveSettings(settings: Settings): Promise<Settings>
  getAnnotations(id: string): Promise<Annotation[]>
  saveAnnotations(id: string, annotations: Annotation[]): Promise<void>
  takePendingOpenFiles(): Promise<string[]>
  onOpenFiles(cb: (paths: string[]) => void): Promise<Unlisten>
  onDragDrop(cb: (event: DragDropEvent) => void): Promise<Unlisten>
  coverUrl(book: Book): string | null
}
