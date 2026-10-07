import { useT, type Translate } from '../i18n'
import type { Book } from '../types'
import Cover from './Cover'

interface Props {
  book: Book
  onOpen: () => void
  onCategories: (anchor: HTMLElement) => void
  onRefreshCover: () => void
  onDelete: () => void
}

export function progressLabel(book: Book, t: Translate): string {
  if (!book.progress) return t('progress.unread')
  const pct = Math.round(book.progress.percent * 100)
  return pct >= 100 ? t('progress.done') : `${pct}%`
}

export default function BookCard({ book, onOpen, onCategories, onRefreshCover, onDelete }: Props) {
  const t = useT()
  const pct = book.progress ? Math.round(book.progress.percent * 100) : 0
  return (
    <article className="card">
      <button type="button" className="card-cover" onClick={onOpen} title={book.title}>
        <Cover book={book} />
        {book.progress && (
          <span className="card-progress" aria-label={t('progress.aria', { pct })}>
            <span style={{ width: `${pct}%` }} />
          </span>
        )}
      </button>
      <div className="card-meta">
        <div className="card-title" title={book.title}>
          {book.title}
        </div>
        <div className="card-author" title={book.author}>
          {book.author || t('card.unknownAuthor')}
        </div>
        <div className="card-foot">
          <span className="card-status">{progressLabel(book, t)}</span>
          <span className="card-actions">
            <button type="button" title={t('card.categories')} onClick={(e) => onCategories(e.currentTarget)}>
              ⌂
            </button>
            <button type="button" title={t('card.refreshCover')} onClick={onRefreshCover}>
              ↻
            </button>
            <button type="button" title={t('card.delete')} onClick={onDelete}>
              🗑
            </button>
          </span>
        </div>
      </div>
    </article>
  )
}
