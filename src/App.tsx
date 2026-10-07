import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './lib/api'
import type { Book, ImportOutcome, Library, Settings } from './types'
import LibraryView from './components/LibraryView'
import Reader from './components/Reader'

type Route = { kind: 'library' } | { kind: 'reader'; bookId: string }

export default function App() {
  const [library, setLibrary] = useState<Library | null>(null)
  const [route, setRoute] = useState<Route>({ kind: 'library' })
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const libraryRef = useRef<Library | null>(null)
  libraryRef.current = library

  const applyOutcome = useCallback((outcome: ImportOutcome) => {
    if (outcome.added.length > 0) {
      setLibrary((prev) => {
        if (!prev) return prev
        const known = new Set(prev.books.map((b) => b.id))
        const fresh = outcome.added.filter((b) => !known.has(b.id))
        return fresh.length > 0 ? { ...prev, books: [...prev.books, ...fresh] } : prev
      })
    }
    const messages: string[] = []
    if (outcome.duplicates.length > 0) {
      messages.push(`すでに追加済みのためスキップしました: ${outcome.duplicates.join('、')}`)
    }
    if (outcome.failed.length > 0) {
      messages.push(`取り込めませんでした: ${outcome.failed.join('、')}`)
    }
    setNotice(messages.length > 0 ? messages.join('\n') : null)
  }, [])

  const importPaths = useCallback(
    async (paths: string[]) => {
      const epubs = paths.filter((p) => p.toLowerCase().endsWith('.epub'))
      if (epubs.length === 0) return
      setImporting(true)
      try {
        const outcome = await api.importPaths(epubs)
        applyOutcome(outcome)
        if (outcome.added.length === 1 && epubs.length === 1) {
          setRoute({ kind: 'reader', bookId: outcome.added[0].id })
        }
      } catch (err) {
        setError(String(err))
      } finally {
        setImporting(false)
      }
    },
    [applyOutcome]
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

    // Listeners register asynchronously; if the effect was already cleaned up
    // by the time they resolve (e.g. React StrictMode), drop them immediately
    // so a file drop is never handled twice.
    const keep = (un: () => void) => {
      if (disposed) un()
      else unlisteners.push(un)
    }
    void api.onOpenFiles((paths) => void importPaths(paths)).then(keep)
    void api.onDragDrop((paths) => void importPaths(paths)).then(keep)

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
      applyOutcome(await api.pickAndImport())
    } catch (err) {
      setError(String(err))
    } finally {
      setImporting(false)
    }
  }, [applyOutcome])

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
      notice={notice}
      onDismissError={() => setError(null)}
      onDismissNotice={() => setNotice(null)}
      onImport={handleImport}
      onOpen={(book) => setRoute({ kind: 'reader', bookId: book.id })}
      onSettings={updateSettings}
      onLibrary={setLibrary}
      onBook={replaceBook}
    />
  )
}
