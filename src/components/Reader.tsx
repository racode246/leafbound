import { useCallback, useEffect, useRef, useState } from 'react'
import ePub, { type Book as EpubBook, type Contents, type NavItem, type Rendition } from 'epubjs'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { applyReaderTheme, PALETTES } from '../lib/readerTheme'
import { searchBook, type SearchControl, type SearchProgress } from '../lib/search'
import {
  HIGHLIGHT_COLORS,
  MIN_SPREAD_WIDTH,
  type Annotation,
  type Book,
  type HighlightColor,
  type Progress,
  type SearchHit,
  type Settings
} from '../types'
import ReaderSettings from './ReaderSettings'
import TocPanel from './TocPanel'
import TitleBar from './TitleBar'
import SearchPanel from './SearchPanel'
import AnnotationsPanel from './AnnotationsPanel'
import SelectionMenu from './SelectionMenu'
import AnnotationEditor from './AnnotationEditor'

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

type Panel = 'none' | 'toc' | 'settings' | 'search' | 'annotations'

interface SelectionState {
  cfiRange: string
  text: string
  x: number
  y: number
}

interface EditingState {
  id: string
  x: number
  y: number
}

const SEARCH_HIT_CLASS = 'lb-search-hit'

/** Opt-in tracing for the rendition lifecycle: localStorage.lbDebug = '1'. */
function debug(...args: unknown[]): void {
  try {
    if (localStorage.getItem('lbDebug') === '1') console.log('[reader]', ...args)
  } catch {
    // storage unavailable
  }
}
const HIGHLIGHT_CLASS = 'lb-highlight'

function highlightStyle(color: HighlightColor): Record<string, string> {
  return { fill: HIGHLIGHT_COLORS[color], 'fill-opacity': '0.45', 'mix-blend-mode': 'multiply' }
}

export default function Reader({ book, settings, onSettings, onBack, onProgress }: Props) {
  const t = useT()
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

  // Annotations
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const annotationsRef = useRef<Annotation[]>([])
  annotationsRef.current = annotations
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [editing, setEditing] = useState<EditingState | null>(null)

  // Search
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(null)
  const [hits, setHits] = useState<SearchHit[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [activeHit, setActiveHit] = useState<string | null>(null)
  const searchControl = useRef<SearchControl | null>(null)
  const searchHitRef = useRef<string | null>(null)

  const palette = PALETTES[settings.theme]
  const flow = settings.flow
  const spread = flow === 'paginated' ? settings.spread : 'none'

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

  // ---- helpers for highlights -------------------------------------------

  const iframeFor = useCallback((doc: Document): HTMLIFrameElement | undefined => {
    const frames = containerRef.current?.querySelectorAll('iframe') ?? []
    return Array.from(frames).find((f) => f.contentDocument === doc)
  }, [])

  const openEditorAt = useCallback(
    (id: string, clientX: number, clientY: number) => {
      setSelection(null)
      setEditing({ id, x: clientX, y: clientY })
    },
    []
  )

  const addHighlight = useCallback(
    (rendition: Rendition, a: Annotation) => {
      rendition.annotations.highlight(
        a.cfiRange,
        { id: a.id },
        (e: MouseEvent) => {
          const target = e.target as Element | null
          const frame = target ? iframeFor(target.ownerDocument) : undefined
          const rect = frame?.getBoundingClientRect()
          openEditorAt(a.id, (rect?.left ?? 0) + e.clientX, (rect?.top ?? 0) + e.clientY)
        },
        HIGHLIGHT_CLASS,
        highlightStyle(a.color)
      )
    },
    [iframeFor, openEditorAt]
  )

  const removeHighlight = (rendition: Rendition, a: Annotation) => {
    try {
      rendition.annotations.remove(a.cfiRange, 'highlight')
    } catch {
      // already gone
    }
  }

  const saveAnnotations = useCallback(
    (next: Annotation[]) => {
      annotationsRef.current = next
      setAnnotations(next)
      void api.saveAnnotations(book.id, next).catch((err) => console.error('saveAnnotations', err))
    },
    [book.id]
  )

  const clearIframeSelection = () => {
    // epub.js types declare a single Contents, but the runtime returns an array.
    const contents = renditionRef.current?.getContents() as unknown as Contents[] | undefined
    contents?.forEach((c) => c.window.getSelection()?.removeAllRanges())
  }

  const createAnnotation = useCallback(
    (color: HighlightColor, withNote: boolean) => {
      const r = renditionRef.current
      if (!r || !selection) return
      const now = new Date().toISOString()
      const a: Annotation = {
        id: crypto.randomUUID(),
        cfiRange: selection.cfiRange,
        text: selection.text,
        note: '',
        color,
        createdAt: now,
        updatedAt: now
      }
      saveAnnotations([...annotationsRef.current, a])
      addHighlight(r, a)
      clearIframeSelection()
      setSelection(null)
      if (withNote) setEditing({ id: a.id, x: selection.x, y: selection.y })
    },
    [selection, saveAnnotations, addHighlight]
  )

  const updateAnnotation = useCallback(
    (id: string, patch: Partial<Pick<Annotation, 'note' | 'color'>>) => {
      const r = renditionRef.current
      const current = annotationsRef.current.find((a) => a.id === id)
      if (!current) return
      const updated: Annotation = { ...current, ...patch, updatedAt: new Date().toISOString() }
      saveAnnotations(annotationsRef.current.map((a) => (a.id === id ? updated : a)))
      if (r && patch.color && patch.color !== current.color) {
        removeHighlight(r, current)
        addHighlight(r, updated)
      }
    },
    [saveAnnotations, addHighlight]
  )

  const deleteAnnotation = useCallback(
    (id: string) => {
      const r = renditionRef.current
      const current = annotationsRef.current.find((a) => a.id === id)
      if (!current) return
      if (r) removeHighlight(r, current)
      saveAnnotations(annotationsRef.current.filter((a) => a.id !== id))
      setEditing((e) => (e?.id === id ? null : e))
    },
    [saveAnnotations]
  )

  // Load stored annotations once per book.
  useEffect(() => {
    let disposed = false
    void Promise.resolve()
      .then(() => api.getAnnotations(book.id))
      .then((list) => {
        if (disposed) return
        annotationsRef.current = list
        setAnnotations(list)
        const r = renditionRef.current
        if (r) list.forEach((a) => addHighlight(r, a))
      })
      .catch((err) => console.error('getAnnotations', err))
    return () => {
      disposed = true
    }
  }, [book.id, addHighlight])

  // ---- rendition lifecycle ----------------------------------------------

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    let disposed = false
    let epubBook: EpubBook | null = null

    setStatus('loading')
    setSelection(null)
    setEditing(null)
    searchHitRef.current = null

    void (async () => {
      try {
        debug('readBook start', book.id)
        const raw = await api.readBook(book.id)
        debug('readBook done', raw.byteLength, 'disposed', disposed)
        if (disposed) return
        epubBook = ePub(raw)
        bookRef.current = epubBook

        const rendition = epubBook.renderTo(container, {
          width: '100%',
          height: '100%',
          flow: flow === 'scrolled' ? 'scrolled' : 'paginated',
          manager: flow === 'scrolled' ? 'continuous' : 'default',
          spread,
          minSpreadWidth: MIN_SPREAD_WIDTH,
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

        rendition.on('selected', (cfiRange: string, contents: Contents) => {
          const sel = contents.window.getSelection()
          const text = sel?.toString().trim() ?? ''
          if (!sel || !text || sel.rangeCount === 0) return
          const rect = sel.getRangeAt(0).getBoundingClientRect()
          const frame = iframeFor(contents.document)?.getBoundingClientRect()
          setEditing(null)
          setSelection({
            cfiRange,
            text,
            x: (frame?.left ?? 0) + rect.left + rect.width / 2,
            y: (frame?.top ?? 0) + rect.top
          })
        })

        rendition.hooks.content.register((contents: Contents) => {
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
          contents.document.addEventListener('mousedown', () => {
            setSelection(null)
            setEditing(null)
          })
        })

        debug('display', lastCfiRef.current)
        await rendition.display(lastCfiRef.current ?? undefined)
        debug('displayed, disposed', disposed)
        if (disposed) return
        annotationsRef.current.forEach((a) => addHighlight(rendition, a))
        setStatus('ready')

        const nav = await epubBook.loaded.navigation
        if (disposed) return
        tocRef.current = nav.toc
        setToc(nav.toc)
        await reportRef.current?.()

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
      debug('cleanup', book.id)
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
  }, [book.id, flow, spread])

  useEffect(() => {
    const r = renditionRef.current
    if (r) applyReaderTheme(r, settings)
  }, [settings.fontFamily, settings.fontSize, settings.lineHeight, settings.theme, settings])

  const next = useCallback(() => void renditionRef.current?.next(), [])
  const prev = useCallback(() => void renditionRef.current?.prev(), [])

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        if (e.key === 'Escape') (e.target as HTMLElement).blur()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setPanel('search')
        return
      }
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
          setSelection(null)
          setEditing(null)
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
    const onDown = (e: MouseEvent) => {
      const el = e.target as Element | null
      if (el?.closest('.selection-menu, .annotation-editor, .panel')) return
      setSelection(null)
      setEditing(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      if (searchControl.current) searchControl.current.cancelled = true
    }
  }, [])

  // ---- navigation ---------------------------------------------------------

  const goTo = async (target: string) => {
    const r = renditionRef.current
    if (!r) return
    try {
      await r.display(target)
      await reportRef.current?.()
    } catch (err) {
      console.error('navigation failed', target, err)
    }
  }

  const runSearch = (q: string) => {
    const b = bookRef.current
    if (!b) return
    if (searchControl.current) searchControl.current.cancelled = true
    const control: SearchControl = { cancelled: false }
    searchControl.current = control
    setQuery(q)
    setSearching(true)
    setHits(null)
    setTruncated(false)
    setSearchProgress({ done: 0, total: 0 })
    void searchBook(b, q, control, (p) => !control.cancelled && setSearchProgress(p))
      .then((result) => {
        if (control.cancelled) return
        setHits(result.hits)
        setTruncated(result.truncated)
      })
      .catch((err) => console.error('search failed', err))
      .finally(() => {
        if (!control.cancelled) setSearching(false)
      })
  }

  const showHit = async (hit: SearchHit) => {
    const r = renditionRef.current
    if (!r) return
    if (searchHitRef.current) {
      try {
        r.annotations.remove(searchHitRef.current, 'highlight')
      } catch {
        // ignore
      }
    }
    setActiveHit(hit.cfi)
    await goTo(hit.cfi)
    try {
      r.annotations.highlight(hit.cfi, {}, undefined, SEARCH_HIT_CLASS, {
        fill: '#ff8a00',
        'fill-opacity': '0.5',
        'mix-blend-mode': 'multiply'
      })
      searchHitRef.current = hit.cfi
    } catch {
      searchHitRef.current = null
    }
  }

  const chapterForHit = (hit: SearchHit): string | null => tocLabelForHref(tocRef.current, hit.href)

  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? 'none' : p))

  const editingAnnotation = editing ? annotations.find((a) => a.id === editing.id) ?? null : null

  return (
    <div className="reader" style={{ background: palette.bg, color: palette.chromeFg }} data-theme={settings.theme}>
      <TitleBar
        bg={palette.chrome}
        fg={palette.chromeFg}
        border={palette.border}
        left={
          <button type="button" className="bar-button" onClick={onBack} title={t('reader.backTitle')}>
            {t('reader.back')}
          </button>
        }
        center={
          <div className="reader-title" data-tauri-drag-region>
            <strong data-tauri-drag-region>{book.title}</strong>
            {chapter && (
              <span className="reader-chapter" data-tauri-drag-region>
                {' '}
                — {chapter}
              </span>
            )}
          </div>
        }
        right={
          <>
            <button type="button" className={`bar-button ${panel === 'toc' ? 'active' : ''}`} onClick={() => togglePanel('toc')}>
              {t('reader.toc')}
            </button>
            <button
              type="button"
              className={`bar-button ${panel === 'search' ? 'active' : ''}`}
              onClick={() => togglePanel('search')}
              title="Ctrl+F"
            >
              {t('reader.search')}
            </button>
            <button
              type="button"
              className={`bar-button ${panel === 'annotations' ? 'active' : ''}`}
              onClick={() => togglePanel('annotations')}
            >
              {t('reader.highlights')}
              {annotations.length > 0 && <span className="bar-badge">{annotations.length}</span>}
            </button>
            <button
              type="button"
              className={`bar-button ${panel === 'settings' ? 'active' : ''}`}
              onClick={() => togglePanel('settings')}
            >
              {t('reader.display')}
            </button>
          </>
        }
      />

      <div className="reader-body">
        {flow === 'paginated' && (
          <button type="button" className="edge edge-left" onClick={prev} aria-label={t('reader.prev')}>
            ‹
          </button>
        )}
        <div className="reader-view" ref={containerRef} />
        {flow === 'paginated' && (
          <button type="button" className="edge edge-right" onClick={next} aria-label={t('reader.next')}>
            ›
          </button>
        )}

        {status === 'loading' && <div className="reader-overlay">{t('reader.loading')}</div>}
        {status === 'error' && (
          <div className="reader-overlay error">
            <p>{t('reader.openFailed')}</p>
            <pre>{errorText}</pre>
          </div>
        )}

        {panel === 'toc' && (
          <TocPanel
            toc={toc}
            onNavigate={(href) => {
              setPanel('none')
              void goTo(href)
            }}
            onClose={() => setPanel('none')}
          />
        )}
        {panel === 'settings' && (
          <ReaderSettings settings={settings} onChange={onSettings} onClose={() => setPanel('none')} />
        )}
        {panel === 'search' && (
          <SearchPanel
            query={query}
            running={searching}
            progress={searchProgress}
            hits={hits}
            truncated={truncated}
            activeCfi={activeHit}
            chapterFor={chapterForHit}
            onSearch={runSearch}
            onSelect={(hit) => void showHit(hit)}
            onClose={() => setPanel('none')}
          />
        )}
        {panel === 'annotations' && (
          <AnnotationsPanel
            annotations={annotations}
            onSelect={(a) => void goTo(a.cfiRange)}
            onEdit={(a, anchor) => {
              const rect = anchor.getBoundingClientRect()
              setEditing({ id: a.id, x: rect.left - 160, y: rect.bottom })
            }}
            onDelete={(a) => deleteAnnotation(a.id)}
            onClose={() => setPanel('none')}
          />
        )}

        {selection && (
          <SelectionMenu
            x={selection.x}
            y={selection.y}
            onHighlight={(color) => createAnnotation(color, false)}
            onNote={() => createAnnotation('yellow', true)}
          />
        )}
        {editing && editingAnnotation && (
          <AnnotationEditor
            annotation={editingAnnotation}
            x={editing.x}
            y={editing.y}
            onColor={(color) => updateAnnotation(editingAnnotation.id, { color })}
            onNote={(note) => {
              updateAnnotation(editingAnnotation.id, { note })
              setEditing(null)
            }}
            onDelete={() => deleteAnnotation(editingAnnotation.id)}
            onClose={() => setEditing(null)}
          />
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

function tocLabelForHref(toc: NavItem[], href: string): string | null {
  const base = href.split('#')[0]
  const walk = (items: NavItem[]): string | null => {
    for (const item of items) {
      if (item.href.split('#')[0].endsWith(base)) return item.label.trim()
      if (item.subitems) {
        const found = walk(item.subitems)
        if (found) return found
      }
    }
    return null
  }
  return walk(toc)
}

function findTocItem(book: EpubBook | null, toc: NavItem[], cfi: string): string | null {
  if (!book || toc.length === 0) return null
  const spineItem = (book.spine as unknown as { get(target: string): { href: string } | null }).get(cfi)
  if (!spineItem) return null
  return tocLabelForHref(toc, spineItem.href)
}
