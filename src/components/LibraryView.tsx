import { useMemo, useState } from 'react'
import { useI18n } from '../i18n'
import { api } from '../lib/api'
import { ALL_BOOKS, UNCATEGORIZED, type Book, type Library, type Settings } from '../types'
import Sidebar from './Sidebar'
import BookCard from './BookCard'
import BookRow from './BookRow'
import CategoryPicker from './CategoryPicker'
import TitleBar from './TitleBar'

interface Props {
  library: Library
  importing: boolean
  error: string | null
  notice: string | null
  onDismissError: () => void
  onDismissNotice: () => void
  onImport: () => void
  onOpen: (book: Book) => void
  onSettings: (patch: Partial<Settings>) => void
  onLibrary: (library: Library) => void
  onBook: (book: Book) => void
}

type SortKey = 'recent' | 'added' | 'title' | 'author'

export default function LibraryView({
  library,
  importing,
  error,
  notice,
  onDismissError,
  onDismissNotice,
  onImport,
  onOpen,
  onSettings,
  onLibrary,
  onBook
}: Props) {
  const { t, lang } = useI18n()
  const [selected, setSelected] = useState<string>(ALL_BOOKS)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortKey>('recent')
  const [picker, setPicker] = useState<{ book: Book; x: number; y: number } | null>(null)

  const view = library.settings.view

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = library.books.filter((b) => {
      if (selected === UNCATEGORIZED && b.categories.length > 0) return false
      if (selected !== ALL_BOOKS && selected !== UNCATEGORIZED && !b.categories.includes(selected)) return false
      if (q && !`${b.title} ${b.author}`.toLowerCase().includes(q)) return false
      return true
    })
    const byText = (a: string, b: string) => a.localeCompare(b, lang)
    switch (sort) {
      case 'title':
        return list.sort((a, b) => byText(a.title, b.title))
      case 'author':
        return list.sort((a, b) => byText(a.author, b.author) || byText(a.title, b.title))
      case 'added':
        return list.sort((a, b) => b.addedAt.localeCompare(a.addedAt))
      default:
        return list.sort((a, b) => (b.lastOpenedAt ?? b.addedAt).localeCompare(a.lastOpenedAt ?? a.addedAt))
    }
  }, [library.books, selected, query, sort, lang])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    let uncategorized = 0
    for (const b of library.books) {
      if (b.categories.length === 0) uncategorized++
      for (const c of b.categories) map.set(c, (map.get(c) ?? 0) + 1)
    }
    return { map, uncategorized }
  }, [library.books])

  const handleDelete = async (book: Book) => {
    if (!window.confirm(t('confirm.deleteBook', { title: book.title }))) return
    await api.deleteBook(book.id)
    onLibrary({ ...library, books: library.books.filter((b) => b.id !== book.id) })
  }

  const handleRefreshCover = async (book: Book) => {
    try {
      onBook(await api.refreshCover(book.id))
    } catch (err) {
      console.error('refreshCover', err)
    }
  }

  const handleAddCategory = async (name: string) => {
    const categories = await api.addCategory(name)
    onLibrary({ ...library, categories })
    return categories
  }

  const handleRenameCategory = async (from: string, to: string) => {
    onLibrary(await api.renameCategory(from, to))
    if (selected === from) setSelected(to)
  }

  const handleRemoveCategory = async (name: string) => {
    if (!window.confirm(t('confirm.deleteCategory', { name }))) return
    onLibrary(await api.removeCategory(name))
    if (selected === name) setSelected(ALL_BOOKS)
  }

  const openPicker = (book: Book, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    setPicker({ book, x: rect.left, y: rect.bottom + 4 })
  }

  const heading =
    selected === ALL_BOOKS ? t('lib.all') : selected === UNCATEGORIZED ? t('lib.uncategorized') : selected

  return (
    <div className="library">
      <TitleBar
        bg="var(--paper-2)"
        fg="var(--ink)"
        border="var(--line)"
        left={
          <span className="brand" data-tauri-drag-region>
            <span className="brand-mark" aria-hidden="true">
              ❦
            </span>
            Leafbound
          </span>
        }
      />
      <div className="library-body">
        <Sidebar
          categories={library.categories}
          counts={counts.map}
          total={library.books.length}
          uncategorized={counts.uncategorized}
          selected={selected}
          language={library.settings.language}
          onSelect={setSelected}
          onAdd={handleAddCategory}
          onRename={handleRenameCategory}
          onRemove={handleRemoveCategory}
          onLanguage={(language) => onSettings({ language })}
        />

        <main className="library-main">
          <header className="library-toolbar">
            <h1 className="library-heading">{heading}</h1>
            <input
              type="search"
              className="search"
              placeholder={t('lib.search')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              className="select"
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              title={t('lib.sort')}
              aria-label={t('lib.sort')}
            >
              <option value="recent">{t('sort.recent')}</option>
              <option value="added">{t('sort.added')}</option>
              <option value="title">{t('sort.title')}</option>
              <option value="author">{t('sort.author')}</option>
            </select>
            <div className="segmented" role="group" aria-label={t('view.label')}>
              <button
                type="button"
                className={view === 'grid' ? 'active' : ''}
                onClick={() => onSettings({ view: 'grid' })}
                title={t('view.grid')}
                aria-label={t('view.grid')}
              >
                ▦
              </button>
              <button
                type="button"
                className={view === 'list' ? 'active' : ''}
                onClick={() => onSettings({ view: 'list' })}
                title={t('view.list')}
                aria-label={t('view.list')}
              >
                ☰
              </button>
            </div>
            <button type="button" className="primary" onClick={onImport} disabled={importing}>
              {importing ? t('lib.importing') : t('lib.import')}
            </button>
          </header>

          {error && (
            <div className="banner error" role="alert">
              <span>{error}</span>
              <button type="button" onClick={onDismissError}>
                {t('close')}
              </button>
            </div>
          )}
          {notice && (
            <div className="banner notice" role="status">
              <span>{notice}</span>
              <button type="button" onClick={onDismissNotice}>
                {t('close')}
              </button>
            </div>
          )}

          {library.books.length === 0 ? (
            <div className="empty">
              <p className="empty-mark" aria-hidden="true">
                ❦
              </p>
              <p>{t('lib.emptyTitle')}</p>
              <p>{t('lib.emptyHint')}</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty">
              <p>{t('lib.noMatch')}</p>
            </div>
          ) : view === 'grid' ? (
            <div className="grid">
              {visible.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onOpen={() => onOpen(book)}
                  onCategories={(el) => openPicker(book, el)}
                  onRefreshCover={() => void handleRefreshCover(book)}
                  onDelete={() => void handleDelete(book)}
                />
              ))}
            </div>
          ) : (
            <table className="list">
              <thead>
                <tr>
                  <th className="col-cover" />
                  <th>{t('table.title')}</th>
                  <th>{t('table.author')}</th>
                  <th>{t('table.categories')}</th>
                  <th className="col-progress">{t('table.progress')}</th>
                  <th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {visible.map((book) => (
                  <BookRow
                    key={book.id}
                    book={book}
                    onOpen={() => onOpen(book)}
                    onCategories={(el) => openPicker(book, el)}
                    onRefreshCover={() => void handleRefreshCover(book)}
                    onDelete={() => void handleDelete(book)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </main>
      </div>

      {picker && (
        <CategoryPicker
          book={picker.book}
          categories={library.categories}
          x={picker.x}
          y={picker.y}
          onClose={() => setPicker(null)}
          onCreate={handleAddCategory}
          onChange={async (categories) => {
            const updated = await api.setBookCategories(picker.book.id, categories)
            onBook(updated)
            setPicker({ ...picker, book: updated })
          }}
        />
      )}
    </div>
  )
}
