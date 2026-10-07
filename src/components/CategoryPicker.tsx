import { useEffect, useRef, useState } from 'react'
import type { Book } from '../types'

interface Props {
  book: Book
  categories: string[]
  x: number
  y: number
  onClose: () => void
  onCreate: (name: string) => Promise<string[]>
  onChange: (categories: string[]) => Promise<void>
}

export default function CategoryPicker({ book, categories, x, y, onClose, onCreate, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const toggle = (name: string) => {
    const next = book.categories.includes(name)
      ? book.categories.filter((c) => c !== name)
      : [...book.categories, name]
    void onChange(next)
  }

  const create = async () => {
    const name = draft.trim()
    if (!name) return
    await onCreate(name)
    await onChange([...book.categories, name])
    setDraft('')
  }

  const left = Math.min(x, window.innerWidth - 260)
  const top = Math.min(y, window.innerHeight - 320)

  return (
    <div className="popover" ref={ref} style={{ left, top }} role="dialog" aria-label="カテゴリを設定">
      <div className="popover-title">カテゴリ</div>
      {categories.length === 0 && <p className="muted small">カテゴリがまだありません。</p>}
      <ul className="popover-list">
        {categories.map((c) => (
          <li key={c}>
            <label>
              <input type="checkbox" checked={book.categories.includes(c)} onChange={() => toggle(c)} />
              <span>{c}</span>
            </label>
          </li>
        ))}
      </ul>
      <form
        className="popover-add"
        onSubmit={(e) => {
          e.preventDefault()
          void create()
        }}
      >
        <input value={draft} placeholder="新規カテゴリ" onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" disabled={!draft.trim()}>
          作成
        </button>
      </form>
    </div>
  )
}
