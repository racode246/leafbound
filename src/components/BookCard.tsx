import type { Book } from '../types'
import Cover from './Cover'

interface Props {
  book: Book
  onOpen: () => void
  onCategories: (anchor: HTMLElement) => void
  onDelete: () => void
}

export function progressLabel(book: Book): string {
  if (!book.progress) return '未読'
  const pct = Math.round(book.progress.percent * 100)
  return pct >= 100 ? '読了' : `${pct}%`
}

export default function BookCard({ book, onOpen, onCategories, onDelete }: Props) {
  const pct = book.progress ? Math.round(book.progress.percent * 100) : 0
  return (
    <article className="card">
      <button type="button" className="card-cover" onClick={onOpen} title={book.title}>
        <Cover book={book} />
        {book.progress && (
          <span className="card-progress" aria-label={`進捗 ${pct}%`}>
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
      </button>
      <div className="card-meta">
        <div className="card-title" title={book.title}>
          {book.title}
        </div>
        <div className="card-author" title={book.author}>
          {book.author || '著者不明'}
        </div>
        <div className="card-foot">
          <span className="card-status">{progressLabel(book)}</span>
          <span className="card-actions">
            <button type="button" title="カテゴリ" onClick={(e) => onCategories(e.currentTarget)}>
              ⌂
            </button>
            <button type="button" title="削除" onClick={onDelete}>
              🗑
            </button>
          </span>
        </div>
      </div>
    </article>
  )
}
