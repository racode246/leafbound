import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './lib/api'
import type { Book, Library, Settings } from './types'
import LibraryView from './components/LibraryView'
import Reader from './components/Reader'

type Route = { kind: 'library' } | { kind: 'reader'; bookId: string }

export default function App() {
  const [library, setLibrary] = useState<Library | null>(null)
  const [route, setRoute] = useState<Route>({ kind: 'library' })
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const libraryRef = useRef<Library | null>(null)
  libraryRef.current = library

  const mergeBooks = useCallback((added: Book[]) => {
    if (added.length === 0) return
    setLibrary((prev) => (prev ? { ...prev, books: [...prev.books, ...added] } : prev))
  }, [])

  const importPaths = useCallback(
    async (paths: string[]) => {
      const epubs = paths.filter((p) => p.toLowerCase().endsWith('.epub'))
      if (epubs.length === 0) return
      setImporting(true)
      try {
        const added = await api.importPaths(epubs)
        mergeBooks(added)
        if (added.length === 1 && epubs.length === 1) {
          setRoute({ kind: 'reader', bookId: added[0].id })
        }
      } catch (err) {
        setError(String(err))
      } finally {
        setImporting(false)
      }
    },
    [mergeBooks]
  )

  useEffect(() => {
    let disposed = false
    const unlisteners: Array<() => void> = []

    void (async () => {
      try {
        const lib = await api.getLibrary()
        if (disposed) return
        setLibrary(lib)
        const pending = await api.takePendingOpenFiles()
        if (pending.length > 0) await importPaths(pending)
      } catch (err) {
        setError(String(err))
      }
    })()

    void api.onOpenFiles((paths) => void importPaths(paths)).then((un) => unlisteners.push(un))
    void api.onDragDrop((paths) => void importPaths(paths)).then((un) => unlisteners.push(un))

    return () => {
      disposed = true
      unlisteners.forEach((un) => un())
    }
  }, [importPaths])

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const current = libraryRef.current
    if (!current) return
    const next = { ...current.settings, ...patch }
    setLibrary({ ...current, settings: next })
    try {
      await api.saveSettings(next)
    } catch (err) {
      setError(String(err))
    }
  }, [])

  const handleImport = useCallback(async () => {
    setImporting(true)
    try {
      mergeBooks(await api.pickAndImport())
    } catch (err) {
      setError(String(err))
    } finally {
      setImporting(false)
    }
  }, [mergeBooks])

  const replaceBook = useCallback((book: Book) => {
    setLibrary((prev) =>
      prev ? { ...prev, books: prev.books.map((b) => (b.id === book.id ? book : b)) } : prev
    )
  }, [])

  if (!library) {
    return <div className="boot">{error ? <p className="error">{error}</p> : 'ライブラリを読み込み中…'}</div>
  }

  if (route.kind === 'reader') {
    const book = library.books.find((b) => b.id === route.bookId)
    if (book) {
      return (
        <Reader
          book={book}
          settings={library.settings}
          onSettings={updateSettings}
          onBack={() => setRoute({ kind: 'library' })}
          onProgress={(progress) => replaceBook({ ...book, progress, lastOpenedAt: progress.updatedAt })}
        />
      )
    }
  }

  return (
    <LibraryView
      library={library}
      importing={importing}
      error={error}
      onDismissError={() => setError(null)}
      onImport={handleImport}
      onOpen={(book) => setRoute({ kind: 'reader', bookId: book.id })}
      onSettings={updateSettings}
      onLibrary={setLibrary}
      onBook={replaceBook}
    />
  )
}
