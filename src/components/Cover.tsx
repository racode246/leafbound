import { api } from '../lib/api'
import type { Book } from '../types'

export default function Cover({ book, className = '' }: { book: Book; className?: string }) {
  const url = api.coverUrl(book)
  if (url) {
    return <img className={`cover ${className}`} src={url} alt="" loading="lazy" draggable={false} />
  }
  return (
    <div className={`cover cover-placeholder ${className}`} aria-hidden="true">
      <span>{book.title}</span>
    </div>
  )
}
