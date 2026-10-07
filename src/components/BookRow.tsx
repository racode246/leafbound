import { useT } from '../i18n'
import type { Book } from '../types'
import Cover from './Cover'
import { progressLabel } from './BookCard'

interface Props {
  book: Book
  onOpen: () => void
  onCategories: (anchor: HTMLElement) => void
  onRefreshCover: () => void
  onDelete: () => void
}

export default function BookRow({ book, onOpen, onCategories, onRefreshCover, onDelete }: Props) {
  const t = useT()
  const pct = book.progress ? Math.round(book.progress.percent * 100) : 0
  const label = progressLabel(book, t)
  return (
    <tr className="row">
      <td className="col-cover">
        <button type="button" className="row-cover" onClick={onOpen}>
          <Cover book={book} className="cover-small" />
        </button>
      </td>
      <td>
        <button type="button" className="row-title" onClick={onOpen}>
          {book.title}
        </button>
      </td>
      <td className="row-author">{book.author || '—'}</td>
      <td className="row-cats">
        {book.categories.length === 0 ? (
          <span className="muted">{t('lib.uncategorized')}</span>
        ) : (
          book.categories.map((c) => (
            <span key={c} className="chip">
              {c}
            </span>
          ))
        )}
      </td>
      <td className="col-progress">
        <div className="row-progress" title={label}>
          <span className="bar">
            <span style={{ width: `${pct}%` }} />
          </span>
          <span className="pct">{label}</span>
        </div>
      </td>
      <td className="col-actions">
        <button type="button" title={t('card.categories')} onClick={(e) => onCategories(e.currentTarget)}>
          ⌂
        </button>
        <button type="button" title={t('card.refreshCover')} onClick={onRefreshCover}>
          ↻
        </button>
        <button type="button" title={t('card.delete')} onClick={onDelete}>
          🗑
        </button>
      </td>
    </tr>
  )
}
