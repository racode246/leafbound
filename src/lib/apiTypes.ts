import type { Annotation, Book, ImportOutcome, Library, Settings } from '../types'

export type Unlisten = () => void

export type DragDropEvent =
  | { type: 'enter'; paths: string[] }
  | { type: 'over' }
  | { type: 'drop'; paths: string[] }
  | { type: 'leave' }

export interface LeafboundApi {
  getLibrary(): Promise<Library>
  pickAndImport(dialogTitle: string): Promise<ImportOutcome>
  importPaths(paths: string[]): Promise<ImportOutcome>
  readBook(id: string): Promise<ArrayBuffer>
  saveProgress(id: string, cfi: string, percent: number): Promise<void>
  setBookCategories(id: string, categories: string[]): Promise<Book>
  deleteBook(id: string): Promise<void>
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
