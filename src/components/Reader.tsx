import { useCallback, useEffect, useRef, useState } from 'react'
import ePub, { type Book as EpubBook, type NavItem, type Rendition } from 'epubjs'
import { api } from '../lib/api'
import { applyReaderTheme, PALETTES } from '../lib/readerTheme'
import type { Book, Progress, Settings } from '../types'
import ReaderSettings from './ReaderSettings'
import TocPanel from './TocPanel'

interface Props {
  book: Book
  settings: Settings
  onSettings: (patch: Partial<Settings>) => void
  onBack: () => void
  onProgress: (progress: Progress) => void
}

interface Location {
  start: { cfi: string; index: number; percentage?: number; displayed?: { page: number; total: number } }
}

type Panel = 'none' | 'toc' | 'settings'

export default function Reader({ book, settings, onSettings, onBack, onProgress }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renditionRef = useRef<Rendition | null>(null)
  const bookRef = useRef<EpubBook | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const reportRef = useRef<(() => Promise<void>) | null>(null)
  const lastCfiRef = useRef<string | null>(book.progress?.cfi ?? null)
  const saveTimer = useRef<number | null>(null)

  const [toc, setToc] = useState<NavItem[]>([])
  const tocRef = useRef<NavItem[]>([])
  tocRef.current = toc
  const [panel, setPanel] = useState<Panel>('none')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [errorText, setErrorText] = useState('')
  const [percent, setPercent] = useState(book.progress?.percent ?? 0)
  const [chapter, setChapter] = useState('')

  const palette = PALETTES[settings.theme]
  const flow = settings.flow

  const persist = useCallback(
    (cfi: string, pct: number) => {
      lastCfiRef.current = cfi
      setPercent(pct)
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      saveTimer.current = window.setTimeout(() => {
        void api.saveProgress(book.id, cfi, pct).then(() =>
          onProgress({ cfi, percent: pct, updatedAt: new Date().toISOString() })
        )
      }, 400)
    },
    [book.id, onProgress]
  )

  // Create the book + rendition. Re-created when the flow changes because
  // epub.js cannot switch managers on a live rendition reliably.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false
    let epubBook: EpubBook | null = null

    setStatus('loading')

    void (async () => {
      try {
        const raw = await api.readBook(book.id)
        if (disposed) return
        epubBook = ePub(raw)
        bookRef.current = epubBook

        const rendition = epubBook.renderTo(container, {
          width: '100%',
          height: '100%',
          flow: flow === 'scrolled' ? 'scrolled' : 'paginated',
          manager: flow === 'scrolled' ? 'continuous' : 'default',
          spread: 'none',
          allowScriptedContent: false
        })
        renditionRef.current = rendition
        applyReaderTheme(rendition, settingsRef.current)

        const report = (loc: Location | undefined | null) => {
          if (!loc || !loc.start || !epubBook) return
          const cfi = loc.start.cfi
          let pct: number
          if (epubBook.locations.length() > 0) {
            pct = epubBook.locations.percentageFromCfi(cfi)
          } else if (typeof loc.start.percentage === 'number' && loc.start.percentage > 0) {
            pct = loc.start.percentage
          } else {
            const total = (epubBook.spine as unknown as { length?: number })?.length ?? 1
            pct = loc.start.index / Math.max(1, total)
          }
          if (!Number.isFinite(pct)) pct = 0
          persist(cfi, Math.min(1, Math.max(0, pct)))
          const item = findTocItem(epubBook, tocRef.current, cfi)
          if (item) setChapter(item)
        }
        reportRef.current = async () => {
          const r = renditionRef.current
          if (!r) return
          report((await Promise.resolve(r.currentLocation() as unknown)) as Location)
        }

        rendition.on('relocated', report)

        rendition.on('keydown', handleKey)

        // Mouse wheel turns pages in paginated mode.
        rendition.hooks.content.register((contents: { document: Document }) => {
          let lastWheel = 0
          contents.document.addEventListener(
            'wheel',
            (e: WheelEvent) => {
              if (settingsRef.current.flow !== 'paginated') return
              const now = Date.now()
              if (now - lastWheel < 250) return
              lastWheel = now
              if (e.deltaY > 0 || e.deltaX > 0) void rendition.next()
              else if (e.deltaY < 0 || e.deltaX < 0) void rendition.prev()
            },
            { passive: true }
          )
        })

        await rendition.display(lastCfiRef.current ?? undefined)
        if (disposed) return
        setStatus('ready')

        const nav = await epubBook.loaded.navigation
        if (disposed) return
        tocRef.current = nav.toc
        setToc(nav.toc)
        await reportRef.current?.()

        // Build locations in the background for accurate percentages.
        await epubBook.ready
        await epubBook.locations.generate(1200)
        if (!disposed && lastCfiRef.current) {
          const pct = epubBook.locations.percentageFromCfi(lastCfiRef.current)
          if (Number.isFinite(pct)) setPercent(pct)
        }
      } catch (err) {
        console.error(err)
        if (!disposed) {
          setErrorText(String(err))
          setStatus('error')
        }
      }
    })()

    return () => {
      disposed = true
      renditionRef.current = null
      reportRef.current = null
      bookRef.current = null
      try {
        epubBook?.destroy()
      } catch {
        // ignore teardown errors
      }
      container.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, flow])

  // Re-apply theme when typography/colour settings change.
  useEffect(() => {
    const r = renditionRef.current
    if (r) applyReaderTheme(r, settings)
  }, [settings.fontFamily, settings.fontSize, settings.lineHeight, settings.theme, settings])

  const next = useCallback(() => void renditionRef.current?.next(), [])
  const prev = useCallback(() => void renditionRef.current?.prev(), [])

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault()
          next()
          break
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault()
          prev()
          break
        case 'Escape':
          setPanel('none')
          break
      }
    },
    [next, prev]
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [handleKey])

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
    }
  }, [])

  const goTo = async (href: string) => {
    setPanel('none')
    const r = renditionRef.current
    if (!r) return
    try {
      await r.display(href)
      await reportRef.current?.()
    } catch (err) {
      console.error('navigation failed', href, err)
    }
  }

  return (
    <div className="reader" style={{ background: palette.bg, color: palette.chromeFg }} data-theme={settings.theme}>
      <header className="reader-bar" style={{ background: palette.chrome, borderColor: palette.border }}>
        <button type="button" onClick={onBack} title="ライブラリへ戻る">
          ← ライブラリ
        </button>
        <div className="reader-title">
          <strong>{book.title}</strong>
          {chapter && <span className="reader-chapter"> — {chapter}</span>}
        </div>
        <button type="button" className={panel === 'toc' ? 'active' : ''} onClick={() => setPanel(panel === 'toc' ? 'none' : 'toc')}>
          目次
        </button>
        <button
          type="button"
          className={panel === 'settings' ? 'active' : ''}
          onClick={() => setPanel(panel === 'settings' ? 'none' : 'settings')}
        >
          Aa 表示
        </button>
      </header>

      <div className="reader-body">
        {flow === 'paginated' && (
          <button type="button" className="edge edge-left" onClick={prev} aria-label="前のページ">
            ‹
          </button>
        )}
        <div className="reader-view" ref={containerRef} />
        {flow === 'paginated' && (
          <button type="button" className="edge edge-right" onClick={next} aria-label="次のページ">
            ›
          </button>
        )}

        {status === 'loading' && <div className="reader-overlay">読み込み中…</div>}
        {status === 'error' && (
          <div className="reader-overlay error">
            <p>この本を開けませんでした。</p>
            <pre>{errorText}</pre>
          </div>
        )}

        {panel === 'toc' && <TocPanel toc={toc} onNavigate={(href) => void goTo(href)} onClose={() => setPanel('none')} />}
        {panel === 'settings' && (
          <ReaderSettings settings={settings} onChange={onSettings} onClose={() => setPanel('none')} />
        )}
      </div>

      <footer className="reader-foot" style={{ background: palette.chrome, borderColor: palette.border }}>
        <span className="bar">
          <span style={{ width: `${Math.round(percent * 100)}%` }} />
        </span>
        <span className="pct">{Math.round(percent * 100)}%</span>
      </footer>
    </div>
  )
}

function findTocItem(book: EpubBook | null, toc: NavItem[], cfi: string): string | null {
  if (!book || toc.length === 0) return null
  const spineItem = (book.spine as unknown as { get(target: string): { href: string } | null }).get(cfi)
  if (!spineItem) return null
  const href = spineItem.href.split('#')[0]
  const walk = (items: NavItem[]): string | null => {
    for (const item of items) {
      if (item.href.split('#')[0].endsWith(href)) return item.label.trim()
      if (item.subitems) {
        const found = walk(item.subitems)
        if (found) return found
      }
    }
    return null
  }
  return walk(toc)
}
