// `SettingsIcon` is Lucide's alias for `Settings`, which here is the app's settings type.
import { SettingsIcon, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useT, type Translate } from '../i18n'
import { api } from '../lib/api'
import { indexBookText, type IndexControl, type IndexProgress } from '../lib/bookText'
import {
  ASSISTANT_ERRORS,
  type AskRequest,
  type AskStage,
  type ApiKeyStatus,
  type AssistantSource,
  type Book,
  type Exchange,
  type Settings
} from '../types'
import AssistantSettingsView from './AssistantSettings'
import Icon from './Icon'

export type AskContext = Pick<
  AskRequest,
  'chapterTitle' | 'chapterText' | 'coveredSection' | 'percent'
>

interface Props {
  book: Book
  settings: Settings
  hidden: boolean
  onSettings: (patch: Partial<Settings>) => void
  /** Reads the current chapter around the reading position. */
  getContext: () => Promise<AskContext>
  chapterFor: (href: string) => string | null
  onNavigate: (cfi: string) => void
  onClose: () => void
}

type Phase =
  | { kind: 'checking' }
  | { kind: 'needsDownload'; size: number }
  | { kind: 'downloading'; done: number; total: number }
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string }

interface Pending {
  requestId: string
  question: string
  answer: string
  stage: AskStage | null
  sources: AssistantSource[]
}

function errorText(t: Translate, err: unknown): string {
  const code = String(err)
  if ((ASSISTANT_ERRORS as readonly string[]).includes(code)) {
    switch (code) {
      case 'NO_API_KEY':
        return t('ai.err.noKey')
      case 'MODEL_NOT_READY':
        return t('ai.err.modelNotReady')
      case 'REFUSED':
        return t('ai.err.refused')
    }
  }
  return t('ai.err.generic', { message: code })
}

const mb = (bytes: number) => Math.round(bytes / 1_000_000)

export default function AssistantPanel({
  book,
  settings,
  hidden,
  onSettings,
  getContext,
  chapterFor,
  onNavigate,
  onClose
}: Props) {
  const t = useT()
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const [keys, setKeys] = useState<ApiKeyStatus | null>(null)
  /** Sections already in the vector store when the panel opened. */
  const [indexed, setIndexed] = useState<number[] | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' })
  const [indexProgress, setIndexProgress] = useState<IndexProgress | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID())
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const provider = settings.assistant.provider
  const needsKey = provider === 'anthropic' && keys !== null && !keys.anthropic

  // Status + last conversation.
  useEffect(() => {
    let disposed = false
    void Promise.all([api.assistantStatus(book.id), api.assistantHistory(book.id)])
      .then(([s, history]) => {
        if (disposed) return
        setKeys(s.keys)
        setIndexed(s.indexedSections)
        if (history.sessionId) {
          setSessionId(history.sessionId)
          setExchanges(history.exchanges)
        }
        if (s.modelLoaded) setPhase({ kind: 'ready' })
        else if (s.modelDownloaded) setPhase({ kind: 'loading' })
        else setPhase({ kind: 'needsDownload', size: s.downloadSize })
      })
      .catch((err) => !disposed && setPhase({ kind: 'failed', message: String(err) }))
    return () => {
      disposed = true
    }
  }, [book.id])

  // Load (and on first use download, once the user agreed) the embedding model.
  // The Loading event sets phase 'loading', which would start a second run below.
  const preparing = useRef(false)
  const prepare = useCallback(async () => {
    if (preparing.current) return
    preparing.current = true
    try {
      await api.assistantPrepare((event) => {
        if (event.type === 'download')
          setPhase({ kind: 'downloading', done: event.done, total: event.total })
        else setPhase({ kind: 'loading' })
      })
      setPhase({ kind: 'ready' })
    } catch (err) {
      setPhase({ kind: 'failed', message: String(err) })
    } finally {
      preparing.current = false
    }
  }, [])

  const autoLoad = phase.kind === 'loading'
  useEffect(() => {
    if (autoLoad) void prepare()
  }, [autoLoad, prepare])

  // Index the book's text once the model is ready. Runs while the panel is hidden too.
  const ready = phase.kind === 'ready'
  // biome-ignore lint/correctness/useExhaustiveDependencies: chapterFor changes identity with the TOC; indexing should not restart for it
  useEffect(() => {
    if (!ready || !indexed) return
    const control: IndexControl = { cancelled: false }
    setIndexError(null)
    void (async () => {
      try {
        const raw = await api.readBook(book.id)
        await indexBookText(
          raw,
          new Set(indexed),
          chapterFor,
          (section, href, chapter, chunks) =>
            api.assistantIndexSection(book.id, section, href, chapter, chunks),
          control,
          (p) => !control.cancelled && setIndexProgress(p)
        )
      } catch (err) {
        if (!control.cancelled) setIndexError(String(err))
      }
    })()
    return () => {
      control.cancelled = true
    }
  }, [ready, indexed, book.id])

  useEffect(() => {
    if (!hidden && view === 'chat') inputRef.current?.focus()
  }, [hidden, view])

  // biome-ignore lint/correctness/useExhaustiveDependencies: these are triggers, not inputs: keep the conversation scrolled to the bottom as it grows
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [exchanges, pending?.answer, pending?.stage, error])

  const send = async () => {
    const question = draft.trim()
    if (!question || pending || !ready) return
    const requestId = crypto.randomUUID()
    setError(null)
    setDraft('')
    setPending({ requestId, question, answer: '', stage: null, sources: [] })
    try {
      const context = await getContext()
      const exchange = await api.ask(
        { requestId, bookId: book.id, sessionId, question, ...context },
        (event) => {
          setPending((p) => {
            if (!p || p.requestId !== requestId) return p
            if (event.type === 'stage') return { ...p, stage: event.stage }
            if (event.type === 'sources') return { ...p, sources: event.sources }
            return { ...p, answer: p.answer + event.text }
          })
        }
      )
      setExchanges((list) => [...list, exchange])
    } catch (err) {
      if (String(err) !== 'CANCELLED') setError(errorText(t, err))
      setDraft((d) => d || question)
    } finally {
      setPending(null)
    }
  }

  const stop = () => {
    if (pending) void api.cancelAsk(pending.requestId)
  }

  const newConversation = () => {
    if (pending) return
    setSessionId(crypto.randomUUID())
    setExchanges([])
    setError(null)
    inputRef.current?.focus()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      void send()
    }
  }

  const renderAnswer = (text: string, sources: AssistantSource[]): ReactNode[] =>
    text.split(/(\[(?:#\d+|H\d+)\])/g).map((part, i) => {
      const label = /^\[(#\d+|H\d+)\]$/.exec(part)?.[1]
      const source = label ? sources.find((s) => s.label === label) : undefined
      if (!source?.cfi) return part
      return (
        <button
          type="button"
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts of one answer never reorder, and the same citation can appear twice
          key={i}
          className="ai-cite"
          title={source.excerpt}
          onClick={() => onNavigate(source.cfi)}
        >
          {label}
        </button>
      )
    })

  const renderSources = (sources: AssistantSource[]) =>
    sources.length > 0 && (
      <details className="ai-sources">
        <summary>{t('ai.sources', { count: sources.length })}</summary>
        <ul>
          {sources.map((s) => (
            <li key={s.label}>
              <button type="button" disabled={!s.cfi} onClick={() => onNavigate(s.cfi)}>
                <span className="ai-source-label">{s.label}</span> {s.excerpt}
              </button>
            </li>
          ))}
        </ul>
      </details>
    )

  const statusLine = (): ReactNode => {
    switch (phase.kind) {
      case 'checking':
        return <p className="muted small">{t('ai.checking')}</p>
      case 'needsDownload':
        return (
          <div className="ai-card">
            <p>{t('ai.download.intro', { size: mb(phase.size) })}</p>
            <p className="muted small">{t('ai.download.privacy')}</p>
            <button type="button" className="primary" onClick={() => void prepare()}>
              {t('ai.download.start')}
            </button>
          </div>
        )
      case 'downloading':
        return (
          <div className="ai-progress">
            <span>
              {t('ai.download.progress', { done: mb(phase.done), total: mb(phase.total) })}
            </span>
            <progress max={phase.total} value={phase.done} />
          </div>
        )
      case 'loading':
        return <p className="muted small">{t('ai.loadingModel')}</p>
      case 'failed':
        return (
          <div className="ai-card error">
            <p>{t('ai.prepareFailed')}</p>
            <pre>{phase.message}</pre>
            <button type="button" onClick={() => void prepare()}>
              {t('ai.retry')}
            </button>
          </div>
        )
      case 'ready':
        if (indexError)
          return <p className="ai-error small">{t('ai.index.failed', { message: indexError })}</p>
        if (indexProgress && indexProgress.done < indexProgress.total) {
          return (
            <div className="ai-progress">
              <span>
                {t('ai.index.progress', { done: indexProgress.done, total: indexProgress.total })}
              </span>
              <progress max={indexProgress.total} value={indexProgress.done} />
            </div>
          )
        }
        return null
    }
  }

  const stageText = (stage: AskStage | null) =>
    stage === 'highlights'
      ? t('ai.stage.highlights')
      : stage === 'generating'
        ? t('ai.stage.generating')
        : t('ai.stage.searching')

  return (
    <aside className="panel assistant-panel" aria-label={t('ai.title')} hidden={hidden}>
      <div className="panel-head assistant-head">
        <span>{view === 'chat' ? t('ai.title') : t('ai.settings.title')}</span>
        <div className="assistant-head-actions">
          {view === 'chat' && (
            <button
              type="button"
              onClick={newConversation}
              disabled={!!pending}
              title={t('ai.newConversation')}
            >
              {t('ai.new')}
            </button>
          )}
          <button
            type="button"
            className={view === 'settings' ? 'active' : ''}
            onClick={() => setView((v) => (v === 'chat' ? 'settings' : 'chat'))}
            title={t('ai.settings.title')}
            aria-label={t('ai.settings.title')}
          >
            <Icon icon={SettingsIcon} />
          </button>
          <button type="button" onClick={onClose} aria-label={t('close')}>
            <Icon icon={X} />
          </button>
        </div>
      </div>

      {view === 'settings' ? (
        <AssistantSettingsView
          bookId={book.id}
          settings={settings.assistant}
          keys={keys ?? { anthropic: false, openai: false }}
          onSettings={(assistant) => onSettings({ assistant })}
          onKeys={setKeys}
          onHistoryCleared={() => {
            setExchanges([])
            setSessionId(crypto.randomUUID())
          }}
          onDone={() => setView('chat')}
        />
      ) : (
        <>
          <div className="assistant-scroll" ref={scrollRef}>
            {statusLine()}
            {needsKey && (
              <div className="ai-card">
                <p>{t('ai.needKey')}</p>
                <button type="button" className="primary" onClick={() => setView('settings')}>
                  {t('ai.openSettings')}
                </button>
              </div>
            )}
            {exchanges.length === 0 && !pending && ready && !needsKey && (
              <p className="muted small">{t('ai.empty')}</p>
            )}
            {exchanges.map((e) => (
              <div key={e.id} className="ai-turn">
                <div className="ai-question">{e.question}</div>
                <div className="ai-answer">{renderAnswer(e.answer, e.sources)}</div>
                {renderSources(e.sources)}
              </div>
            ))}
            {pending && (
              <div className="ai-turn">
                <div className="ai-question">{pending.question}</div>
                <div className="ai-answer">
                  {pending.answer ? (
                    renderAnswer(pending.answer, pending.sources)
                  ) : (
                    <span className="muted">{stageText(pending.stage)}</span>
                  )}
                </div>
              </div>
            )}
            {error && <p className="ai-error small">{error}</p>}
          </div>

          <form
            className="assistant-input"
            onSubmit={(e) => {
              e.preventDefault()
              void send()
            }}
          >
            <textarea
              ref={inputRef}
              rows={3}
              value={draft}
              placeholder={ready ? t('ai.placeholder') : t('ai.placeholderWaiting')}
              disabled={!ready}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              aria-label={t('ai.placeholder')}
            />
            {pending ? (
              <button type="button" onClick={stop}>
                {t('ai.stop')}
              </button>
            ) : (
              <button type="submit" className="primary" disabled={!ready || !draft.trim()}>
                {t('ai.send')}
              </button>
            )}
          </form>
        </>
      )}
    </aside>
  )
}
