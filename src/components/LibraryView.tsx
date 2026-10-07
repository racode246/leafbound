import { useMemo, useState } from 'react'
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
    const byText = (a: string, b: string) => a.localeCompare(b, 'ja')
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
  }, [library.books, selected, query, sort])

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
    if (!window.confirm(`「${book.title}」をライブラリから削除しますか？\nファイルのコピーも削除されます。`)) return
    await api.deleteBook(book.id)
    onLibrary({ ...library, books: library.books.filter((b) => b.id !== book.id) })
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
    if (!window.confirm(`カテゴリ「${name}」を削除しますか？\n本は削除されません。`)) return
    onLibrary(await api.removeCategory(name))
    if (selected === name) setSelected(ALL_BOOKS)
  }

  const openPicker = (book: Book, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    setPicker({ book, x: rect.left, y: rect.bottom + 4 })
  }

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
        onSelect={setSelected}
        onAdd={handleAddCategory}
        onRename={handleRenameCategory}
        onRemove={handleRemoveCategory}
      />

      <main className="library-main">
        <header className="library-toolbar">
          <h1 className="library-heading">
            {selected === ALL_BOOKS ? 'すべての本' : selected === UNCATEGORIZED ? '未分類' : selected}
          </h1>
          <input
            type="search"
            className="search"
            placeholder="タイトル・著者で検索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select className="select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} title="並び順">
            <option value="recent">最近読んだ順</option>
            <option value="added">追加順</option>
            <option value="title">タイトル順</option>
            <option value="author">著者順</option>
          </select>
          <div className="segmented" role="group" aria-label="表示切替">
            <button
              type="button"
              className={view === 'grid' ? 'active' : ''}
              onClick={() => onSettings({ view: 'grid' })}
              title="表紙表示"
            >
              ▦
            </button>
            <button
              type="button"
              className={view === 'list' ? 'active' : ''}
              onClick={() => onSettings({ view: 'list' })}
              title="リスト表示"
            >
              ☰
            </button>
          </div>
          <button type="button" className="primary" onClick={onImport} disabled={importing}>
            {importing ? '追加中…' : '＋ EPUB を追加'}
          </button>
        </header>

        {error && (
          <div className="banner error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={onDismissError}>
              閉じる
            </button>
          </div>
        )}
        {notice && (
          <div className="banner notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={onDismissNotice}>
              閉じる
            </button>
          </div>
        )}

        {library.books.length === 0 ? (
          <div className="empty">
            <p className="empty-mark" aria-hidden="true">
              ❦
            </p>
            <p>まだ本がありません。</p>
            <p>EPUB ファイルをここにドラッグ＆ドロップするか、「EPUB を追加」から取り込みます。</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <p>該当する本がありません。</p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid">
            {visible.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                onOpen={() => onOpen(book)}
                onCategories={(el) => openPicker(book, el)}
                onDelete={() => void handleDelete(book)}
              />
            ))}
          </div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th className="col-cover" />
                <th>タイトル</th>
                <th>著者</th>
                <th>カテゴリ</th>
                <th className="col-progress">進捗</th>
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
