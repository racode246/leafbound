import { useCallback, useEffect, useRef, useState } from 'react'
import { I18nProvider, resolveLang, useT } from './i18n'
import { api } from './lib/api'
import type { Book, ImportOutcome, Library, Settings } from './types'
import LibraryView from './components/LibraryView'
import Reader from './components/Reader'

type Route = { kind: 'library' } | { kind: 'reader'; bookId: string }

/** One unit of work for the import queue. */
type ImportItem = { kind: 'path'; path: string } | { kind: 'file'; file: File }

export interface ImportProgress {
  done: number
  total: number
}

interface NoticeState {
  duplicates: string[]
  failed: string[]
}

export default function App() {
  const [library, setLibrary] = useState<Library | null>(null)
  const lang = resolveLang(library?.settings.language)
  return (
    <I18nProvider lang={lang}>
      <Shell library={library} setLibrary={setLibrary} />
    </I18nProvider>
  )
}

interface ShellProps {
  library: Library | null
  setLibrary: React.Dispatch<React.SetStateAction<Library | null>>
}

function Shell({ library, setLibrary }: ShellProps) {
  const t = useT()
  const [route, setRoute] = useState<Route>({ kind: 'library' })
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [noticeState, setNoticeState] = useState<NoticeState>({ duplicates: [], failed: [] })
  const [dragging, setDragging] = useState(false)
  const libraryRef = useRef<Library | null>(null)
  libraryRef.current = library

  // Import queue. Every source (dialog, drag and drop, file association)
  // enqueues here; one runner imports items one at a time so books appear
  // as soon as each is done and concurrent requests never interleave.
  const queueRef = useRef<ImportItem[]>([])
  const runningRef = useRef(false)
  const runStatsRef = useRef({ done: 0, total: 0, added: [] as Book[] })

  const mergeAdded = useCallback(
    (added: Book[]) => {
      if (added.length === 0) return
      setLibrary((prev) => {
        if (!prev) return prev
        const known = new Set(prev.books.map((b) => b.id))
        const fresh = added.filter((b) => !known.has(b.id))
        return fresh.length > 0 ? { ...prev, books: [...prev.books, ...fresh] } : prev
      })
    },
    [setLibrary]
  )

  const recordOutcome = useCallback(
    (outcome: ImportOutcome) => {
      mergeAdded(outcome.added)
      runStatsRef.current.added.push(...outcome.added)
      if (outcome.duplicates.length > 0 || outcome.failed.length > 0) {
        setNoticeState((prev) => ({
          duplicates: [...prev.duplicates, ...outcome.duplicates],
          failed: [...prev.failed, ...outcome.failed]
        }))
      }
    },
    [mergeAdded]
  )

  const runQueue = useCallback(async () => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const item = queueRef.current.shift() as ImportItem
        try {
          const outcome =
            item.kind === 'path' ? await api.importPaths([item.path]) : await api.importFiles([item.file])
          recordOutcome(outcome)
        } catch (err) {
          setError(String(err))
        }
        runStatsRef.current.done += 1
        setProgress({ done: runStatsRef.current.done, total: runStatsRef.current.total })
      }
    } finally {
      runningRef.current = false
      const stats = runStatsRef.current
      // A single dropped/opened book is opened right away.
      if (stats.total === 1 && stats.added.length === 1) {
        const book = stats.added[0]
        setRoute({ kind: 'reader', bookId: book.id })
      }
      runStatsRef.current = { done: 0, total: 0, added: [] }
      setProgress(null)
    }
  }, [recordOutcome])

  const enqueue = useCallback(
    (items: ImportItem[]) => {
      if (items.length === 0) return
      queueRef.current.push(...items)
      runStatsRef.current.total += items.length
      setProgress({ done: runStatsRef.current.done, total: runStatsRef.current.total })
      void runQueue()
    },
    [runQueue]
  )

  const importPaths = useCallback(
    (paths: string[]) => {
      enqueue(paths.filter((p) => p.toLowerCase().endsWith('.epub')).map((path) => ({ kind: 'path', path })))
    },
    [enqueue]
  )

  const importFiles = useCallback(
    (files: File[]) => {
      enqueue(files.filter((f) => f.name.toLowerCase().endsWith('.epub')).map((file) => ({ kind: 'file', file })))
    },
    [enqueue]
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
        if (pending.length > 0) importPaths(pending)
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
    const failed = (what: string) => (err: unknown) => setError(`${what}: ${String(err)}`)
    void api
      .onOpenFiles((paths) => importPaths(paths))
      .then(keep)
      .catch(failed('open-files listener'))
    void api
      .onDragDrop((event) => {
        if (event.type === 'enter' || event.type === 'over') setDragging(true)
        else setDragging(false)
        if (event.type === 'drop') importFiles(event.files)
      })
      .then(keep)
      .catch(failed('drag-drop listener'))

    return () => {
      disposed = true
      unlisteners.forEach((un) => un())
    }
  }, [importPaths, importFiles, setLibrary])

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const current = libraryRef.current
      if (!current) return
      const next = { ...current.settings, ...patch }
      setLibrary({ ...current, settings: next })
      try {
        await api.saveSettings(next)
      } catch (err) {
        setError(String(err))
      }
    },
    [setLibrary]
  )

  const handleImport = useCallback(async () => {
    try {
      const paths = await api.pickFiles(t('dialog.addEpub'))
      importPaths(paths)
    } catch (err) {
      setError(String(err))
    }
  }, [importPaths, t])

  const replaceBook = useCallback(
    (book: Book) => {
      setLibrary((prev) =>
        prev ? { ...prev, books: prev.books.map((b) => (b.id === book.id ? book : b)) } : prev
      )
    },
    [setLibrary]
  )

  if (!library) {
    return <div className="boot">{error ? <p className="error">{error}</p> : t('boot.loading')}</div>
  }

  const noticeLines: string[] = []
  if (noticeState.duplicates.length > 0) {
    noticeLines.push(t('notice.duplicates', { names: noticeState.duplicates.join(', ') }))
  }
  if (noticeState.failed.length > 0) {
    noticeLines.push(t('notice.failed', { names: noticeState.failed.join(', ') }))
  }
  const notice = noticeLines.length > 0 ? noticeLines.join('\n') : null

  const dropOverlay = dragging && (
    <div className="drop-overlay" aria-hidden="true">
      <div className="drop-overlay-card">
        <span className="drop-overlay-mark">❦</span>
        {t('drop.hint')}
      </div>
    </div>
  )

  if (route.kind === 'reader') {
    const book = library.books.find((b) => b.id === route.bookId)
    if (book) {
      return (
        <>
          <Reader
            book={book}
            settings={library.settings}
            onSettings={updateSettings}
            onBack={() => setRoute({ kind: 'library' })}
            onProgress={(p) => replaceBook({ ...book, progress: p, lastOpenedAt: p.updatedAt })}
          />
          {dropOverlay}
        </>
      )
    }
  }

  return (
    <>
      <LibraryView
        library={library}
        importProgress={progress}
        error={error}
        notice={notice}
        onDismissError={() => setError(null)}
        onDismissNotice={() => setNoticeState({ duplicates: [], failed: [] })}
        onImport={handleImport}
        onOpen={(book) => setRoute({ kind: 'reader', bookId: book.id })}
        onSettings={updateSettings}
        onLibrary={setLibrary}
        onBook={replaceBook}
      />
      {dropOverlay}
    </>
  )
}
