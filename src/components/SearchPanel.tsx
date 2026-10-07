import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { MAX_HITS, type SearchProgress } from '../lib/search'
import type { SearchHit } from '../types'

interface Props {
  query: string
  running: boolean
  progress: SearchProgress | null
  hits: SearchHit[] | null
  truncated: boolean
  activeCfi: string | null
  chapterFor: (hit: SearchHit) => string | null
  onSearch: (query: string) => void
  onSelect: (hit: SearchHit) => void
  onClose: () => void
}

export default function SearchPanel({
  query,
  running,
  progress,
  hits,
  truncated,
  activeCfi,
  chapterFor,
  onSearch,
  onSelect,
  onClose
}: Props) {
  const t = useT()
  const [draft, setDraft] = useState(query)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  let lastChapter: string | null = null

  return (
    <aside className="panel search-panel" aria-label={t('search.title')}>
      <div className="panel-head">
        <span>{t('search.title')}</span>
        <button type="button" onClick={onClose} aria-label={t('close')}>
          ×
        </button>
      </div>
      <form
        className="inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (draft.trim()) onSearch(draft.trim())
        }}
      >
        <input
          ref={inputRef}
          type="search"
          value={draft}
          placeholder={t('search.placeholder')}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={running || !draft.trim()}>
          {t('reader.search')}
        </button>
      </form>

      {running && progress && (
        <p className="muted small">{t('search.searching', { done: progress.done, total: progress.total })}</p>
      )}
      {!running && hits && (
        <p className="muted small">
          {hits.length === 0 ? t('search.none') : t('search.results', { count: hits.length })}
          {truncated && ` ${t('search.tooMany', { max: MAX_HITS })}`}
        </p>
      )}

      {hits && hits.length > 0 && (
        <ul className="search-list">
          {hits.map((hit, i) => {
            const chapter = chapterFor(hit)
            const showChapter = chapter !== lastChapter
            lastChapter = chapter
            return (
              <li key={`${hit.cfi}-${i}`}>
                {showChapter && chapter && <div className="search-chapter">{chapter}</div>}
                <button
                  type="button"
                  className={`search-hit ${activeCfi === hit.cfi ? 'active' : ''}`}
                  onClick={() => onSelect(hit)}
                >
                  {hit.excerpt}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </aside>
  )
}
